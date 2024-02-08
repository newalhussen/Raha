import { Injectable, Logger } from '@nestjs/common';
import { loadEnv } from '../../config/env';

export interface OutboxEntry {
  at: string;
  channel: 'sms' | 'telegram';
  to: string;
  body: string;
}

/**
 * Outbound SMS + Telegram.
 *  - `SMS_PROVIDER=console` (default): messages are logged and kept in a small in-memory outbox that
 *    the dev-only `GET /dev/outbox` endpoint exposes (handy for OTP codes and receiver PINs).
 *  - A real gateway (Ethio Telecom / Africa's Talking / Twilio) plugs in by implementing `deliverSms`.
 *  - Telegram uses the Bot API when TELEGRAM_BOT_TOKEN is set, otherwise it behaves like the console provider.
 */
@Injectable()
export class MessagingService {
  private readonly log = new Logger('Messaging');
  private readonly env = loadEnv();
  private readonly outbox: OutboxEntry[] = [];

  recent(limit = 50): OutboxEntry[] {
    return this.outbox.slice(-limit).reverse();
  }

  async sendSms(to: string, body: string): Promise<void> {
    this.remember({ channel: 'sms', to, body });
    if (this.env.smsProvider === 'console') {
      this.log.log(`SMS -> ${to}: ${body.replace(/\n/g, ' ⏎ ')}`);
      return;
    }
    if (this.env.smsProvider === 'none') return;
    throw new Error(`SMS provider "${this.env.smsProvider}" is not implemented`);
  }

  async sendTelegram(chatId: string, body: string): Promise<void> {
    this.remember({ channel: 'telegram', to: chatId, body });
    const token = this.env.telegramBotToken;
    if (!token) {
      this.log.log(`TELEGRAM -> ${chatId}: ${body.replace(/\n/g, ' ⏎ ')}`);
      return;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: body }),
    });
    if (!res.ok) throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
  }

  private remember(entry: Omit<OutboxEntry, 'at'>): void {
    this.outbox.push({ at: new Date().toISOString(), ...entry });
    if (this.outbox.length > 200) this.outbox.shift();
  }
}
