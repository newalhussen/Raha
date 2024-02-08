import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PAYMENT_METHODS, type PaymentDto, type PaymentMethod } from '@raha/contracts';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { Payment, Shipment } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { T } from '../notifications/templates';
import { TripsService } from '../trips/trips.service';

export class MarkPaidDto {
  @IsIn(PAYMENT_METHODS) method: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  /** Defaults to the agreed amount; use for part payments agreed outside Raha. */
  @IsOptional() @IsNumber() @Min(0) amountEtb?: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class DisputePaymentDto {
  @IsString() @MaxLength(300) reason: string;
}

const RELATIONS = { shipment: { pickupPlace: true, dropoffPlace: true }, payerOrg: true, payeeOrg: true } as const;

/**
 * Raha records who owes whom and whether it has been paid. Money itself moves outside Raha
 * (Telebirr, CBE, cash) — there is no wallet and no escrow.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly trips: TripsService,
  ) {}

  /** Payments visible to the caller's organization (as payer, payee, or the broker that logged the load). */
  async list(ctx: RequestContext, opts: { status?: 'pending' | 'paid' | 'all' } = {}): Promise<PaymentDto[]> {
    const org = ctx.org;
    if (!org && !ctx.isStaff) throw forbidden('Select an organization first', 'org_required');
    const qb = this.payments.createQueryBuilder('p').leftJoinAndSelect('p.shipment', 's').leftJoinAndSelect('s.pickupPlace', 'pp').leftJoinAndSelect('s.dropoffPlace', 'dp').leftJoinAndSelect('p.payerOrg', 'po').leftJoinAndSelect('p.payeeOrg', 'ao');
    if (!ctx.isStaff) {
      qb.where('(p.payer_org_id = :org OR p.payee_org_id = :org OR s.logged_by_org_id = :org)', { org: org!.id });
    }
    if (opts.status && opts.status !== 'all') qb.andWhere('p.status = :st', { st: opts.status });
    qb.orderBy('p.createdAt', 'DESC').limit(300);
    return (await qb.getMany()).map((p) => this.toDto(p));
  }

  async forShipment(shipmentId: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { shipmentId }, relations: RELATIONS, order: { createdAt: 'DESC' } });
  }

  async markPaid(ctx: RequestContext, id: string, dto: MarkPaidDto): Promise<PaymentDto> {
    const p = await this.payments.findOne({ where: { id }, relations: RELATIONS });
    if (!p) throw notFound('Payment');
    const orgId = ctx.org?.id;
    const isParty = orgId && (orgId === p.payerOrgId || orgId === p.payeeOrgId || orgId === p.shipment.loggedByOrgId);
    if (!isParty && !(ctx.isStaff && ctx.permissions.includes('ops:finance'))) throw forbidden('This payment is not yours to record', 'not_a_party');
    if (p.status === 'paid') throw conflict('already_paid', 'This payment is already marked paid');
    if (p.status === 'cancelled') throw conflict('payment_cancelled', 'This payment was cancelled');

    const amount = dto.amountEtb ?? p.amountEtb;
    if (amount <= 0) throw badRequest('invalid_amount', 'Amount must be more than zero');
    await this.payments.update(p.id, {
      status: 'paid',
      method: dto.method,
      reference: dto.reference ?? null,
      amountEtb: amount,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      recordedBy: ctx.userId,
      notes: dto.notes ?? p.notes,
    });
    await this.audit.record({ actor: ctx, action: 'payment.paid', entityType: 'payment', entityId: p.id, data: { method: dto.method, amount } });

    const trip = p.tripId ? await this.trips.loadTrip(p.tripId).catch(() => null) : null;
    const recipients = [trip?.driverId, ...(await this.trips.orgUserIds(p.payeeOrgId, ['owner', 'manager']))];
    await this.notifications.notifyMany(recipients, (userId) => ({
      userId,
      type: 'payment.recorded',
      ...T.paymentRecorded('en', { ref: p.shipment.ref, amountEtb: amount, payer: ctx.org?.name ?? p.payerOrg.name }),
      via: { sms: true, telegram: true },
      data: { shipmentId: p.shipmentId, paymentId: p.id },
      dedupeKey: `paid:${p.id}:${userId}`,
    }));
    return this.toDto((await this.payments.findOne({ where: { id }, relations: RELATIONS }))!);
  }

  async dispute(ctx: RequestContext, id: string, reason: string): Promise<PaymentDto> {
    const p = await this.payments.findOne({ where: { id }, relations: RELATIONS });
    if (!p) throw notFound('Payment');
    if (ctx.org?.id !== p.payerOrgId && ctx.org?.id !== p.payeeOrgId && !ctx.isStaff) throw forbidden('This payment is not yours', 'not_a_party');
    if (p.status === 'paid') throw conflict('already_paid', 'A paid payment cannot be disputed here');
    await this.payments.update(p.id, { status: 'disputed', notes: reason });
    await this.audit.record({ actor: ctx, action: 'payment.dispute', entityType: 'payment', entityId: p.id, data: { reason } });
    return this.toDto((await this.payments.findOne({ where: { id }, relations: RELATIONS }))!);
  }

  /** Total owed to / by an org in a period — used by the console headers. */
  async totals(orgId: string, since: Date): Promise<{ recordedEtb: number; pendingEtb: number }> {
    const rows = await this.payments
      .createQueryBuilder('p')
      .select("COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount_etb END),0)", 'recorded')
      .addSelect("COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.amount_etb END),0)", 'pending')
      .where('(p.payee_org_id = :org OR p.payer_org_id = :org) AND p.created_at >= :since', { org: orgId, since })
      .getRawOne<{ recorded: string; pending: string }>();
    return { recordedEtb: Number(rows?.recorded ?? 0), pendingEtb: Number(rows?.pending ?? 0) };
  }

  async byIds(ids: string[]): Promise<Payment[]> {
    return ids.length ? this.payments.find({ where: { id: In(ids) }, relations: RELATIONS }) : [];
  }

  toDto(p: Payment): PaymentDto {
    return {
      id: p.id,
      shipmentId: p.shipmentId,
      shipmentRef: p.shipment.ref,
      route: `${p.shipment.pickupPlace.name} → ${p.shipment.dropoffPlace.name}`,
      payerName: p.payerOrg.name,
      payeeName: p.payeeOrg.name,
      amountEtb: p.amountEtb,
      method: p.method,
      reference: p.reference,
      status: p.status,
      dueAt: p.dueAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
