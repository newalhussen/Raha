import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import type { NotificationChannel, NotificationDto } from '@raha/contracts';
import { DeviceToken, Notification, User } from '../../database/entities';
import { MessagingService } from '../messaging/messaging.service';

export interface NotifyInput {
  /** Registered user… */
  userId?: string | null;
  /** …or a bare phone number (receivers have no account). */
  phone?: string | null;
  type: string;
  title: string;
  body: string;
  /** Text for SMS / Telegram when it should differ from `body`. */
  sms?: string;
  data?: Record<string, unknown>;
  /** Which channels to use besides the in-app inbox. User preferences still apply. */
  via?: { sms?: boolean; telegram?: boolean; push?: boolean };
  /** Prevents sending the same event twice (e.g. retried requests). */
  dedupeKey?: string;
}

const TONE_BY_PREFIX: Array<[string, NotificationDto['tone']]> = [
  ['load.', 'amber'],
  ['match.', 'amber'],
  ['trip.', 'lapis'],
  ['delivery.', 'green'],
  ['payment.', 'green'],
];

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  private working = false;

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DeviceToken) private readonly devices: Repository<DeviceToken>,
    private readonly db: DataSource,
    private readonly messaging: MessagingService,
  ) {}

  /** Never throws: a failed notification must not fail the business action that triggered it. */
  async notify(input: NotifyInput): Promise<void> {
    try {
      const user = input.userId ? await this.users.findOne({ where: { id: input.userId } }) : null;
      const rows: Array<Partial<Notification>> = [];
      const base = { type: input.type, title: input.title, body: input.body, data: input.data ?? {} };
      const dk = (channel: NotificationChannel) => (input.dedupeKey ? `${input.dedupeKey}:${channel}` : null);
      const alsoSent: string[] = [];

      if (user) {
        if (input.via?.telegram && user.notifyTelegram && user.telegramChatId) alsoSent.push('Telegram');
        if (input.via?.sms && user.notifySms) alsoSent.push('SMS');
        rows.push({ ...base, data: { ...base.data, alsoSent }, userId: user.id, channel: 'in_app', status: 'sent', sentAt: new Date(), dedupeKey: dk('in_app') });

        if (input.via?.push !== false && (await this.devices.exist({ where: { userId: user.id } }))) {
          rows.push({ ...base, userId: user.id, channel: 'push', dedupeKey: dk('push') });
        }
        if (input.via?.telegram && user.notifyTelegram && user.telegramChatId) {
          rows.push({ ...base, body: input.sms ?? input.body, userId: user.id, recipientPhone: user.telegramChatId, channel: 'telegram', dedupeKey: dk('telegram') });
        }
        if (input.via?.sms && user.notifySms) {
          rows.push({ ...base, body: input.sms ?? input.body, userId: user.id, recipientPhone: user.phone, channel: 'sms', dedupeKey: dk('sms') });
        }
      } else if (input.phone) {
        rows.push({ ...base, body: input.sms ?? input.body, recipientPhone: input.phone, channel: 'sms', dedupeKey: dk('sms') });
      } else {
        return;
      }

      if (rows.length) await this.repo.createQueryBuilder().insert().values(rows as never).orIgnore().execute();
    } catch (err) {
      this.log.error(`notify(${input.type}) failed: ${(err as Error).message}`);
    }
  }

  async notifyMany(userIds: Array<string | null | undefined>, make: (userId: string) => NotifyInput): Promise<void> {
    const unique = [...new Set(userIds.filter((x): x is string => !!x))];
    await Promise.all(unique.map((id) => this.notify(make(id))));
  }

  // ───────────────────────── inbox ─────────────────────────

  async inbox(userId: string, limit = 50): Promise<NotificationDto[]> {
    const rows = await this.repo.find({ where: { userId, channel: 'in_app' }, order: { createdAt: 'DESC' }, take: limit });
    return rows.map((n) => this.toDto(n));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, channel: 'in_app', readAt: IsNull() } });
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    const qb = this.repo
      .createQueryBuilder()
      .update()
      .set({ readAt: () => 'now()', status: 'read' })
      .where('user_id = :userId AND channel = :ch AND read_at IS NULL', { userId, ch: 'in_app' });
    if (ids?.length) qb.andWhere('id IN (:...ids)', { ids });
    await qb.execute();
  }

  private toDto(n: Notification): NotificationDto {
    const tone = TONE_BY_PREFIX.find(([p]) => n.type.startsWith(p))?.[1] ?? 'neutral';
    const also = (n.data as { alsoSent?: string[] }).alsoSent ?? [];
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      tone,
      footnote: also.length ? `also sent by ${also.join(' and ')}` : null,
      createdAt: n.createdAt.toISOString(),
      read: !!n.readAt,
      data: n.data,
    };
  }

  // ───────────────────────── delivery worker ─────────────────────────

  /** Drains queued SMS / Telegram / push rows. Safe to run on several instances (SKIP LOCKED). */
  @Interval(5000)
  async drain(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      const batch = await this.db.transaction(async (tx) => {
        const rows = await tx.query<Array<{ id: string }>>(
          `SELECT id FROM notifications
            WHERE status = 'queued' AND send_after <= now() AND channel <> 'in_app'
            ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED`,
        );
        if (!rows.length) return [];
        const ids = rows.map((r) => r.id);
        await tx.query(`UPDATE notifications SET attempts = attempts + 1 WHERE id = ANY($1::uuid[])`, [ids]);
        return tx.getRepository(Notification).find({ where: { id: In(ids) } });
      });

      for (const n of batch) {
        try {
          if (n.channel === 'sms' && n.recipientPhone) await this.messaging.sendSms(n.recipientPhone, n.body);
          else if (n.channel === 'telegram' && n.recipientPhone) await this.messaging.sendTelegram(n.recipientPhone, n.body);
          else if (n.channel === 'push') this.log.debug(`push to ${n.userId} skipped: no FCM credentials configured`);
          await this.repo.update(n.id, { status: n.channel === 'push' ? 'skipped' : 'sent', sentAt: new Date(), error: null });
        } catch (err) {
          const failed = n.attempts >= 3;
          await this.repo.update(n.id, {
            status: failed ? 'failed' : 'queued',
            error: (err as Error).message.slice(0, 500),
            sendAfter: new Date(Date.now() + 30_000 * n.attempts),
          });
        }
      }
    } catch (err) {
      this.log.error(`drain failed: ${(err as Error).message}`);
    } finally {
      this.working = false;
    }
  }
}
