import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MessageDto } from '@raha/contracts';
import { conflict } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { ShipmentMessage } from '../../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { TripsService } from '../trips/trips.service';
import { ShipmentsService } from './shipments.service';

/** The thread on a shipment page: shipper staff, the driver (by app or SMS) and Raha Ops. */
@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(ShipmentMessage) private readonly repo: Repository<ShipmentMessage>,
    private readonly shipments: ShipmentsService,
    private readonly trips: TripsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(ctx: RequestContext, shipmentId: string): Promise<MessageDto[]> {
    await this.shipments.get(ctx, shipmentId);
    const rows = await this.repo.find({ where: { shipmentId }, order: { createdAt: 'ASC' }, take: 200 });
    return rows.map((m) => ({
      id: m.id,
      senderName: m.senderName,
      senderLabel: m.senderLabel,
      mine: m.senderUserId === ctx.userId,
      channel: m.channel,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async post(ctx: RequestContext, shipmentId: string, body: string): Promise<MessageDto> {
    const shipment = await this.shipments.get(ctx, shipmentId);
    if (['delivered', 'cancelled'].includes(shipment.status) && !ctx.isStaff) throw conflict('thread_closed', 'This shipment is closed');
    const label = ctx.isStaff ? 'Raha Ops' : ctx.org?.name ?? 'Driver';
    const saved = await this.repo.save(
      this.repo.create({ shipmentId, senderUserId: ctx.userId, senderName: ctx.fullName || ctx.phone, senderLabel: label, channel: 'app', body: body.trim() }),
    );

    // Nudge the other side: the carrier hears by Telegram/SMS (often on the road), the shipper in the app.
    const trip = shipment.tripId ? await this.trips.loadTrip(shipment.tripId).catch(() => null) : null;
    const shipperSide = await this.trips.orgUserIds(shipment.shipperOrgId, ['owner', 'manager', 'staff']);
    const carrierSide = trip ? [trip.driverId, ...(await this.trips.orgUserIds(trip.fleetOrgId, ['owner', 'manager']))] : [];
    const fromShipper = shipperSide.includes(ctx.userId);
    const recipients = (fromShipper ? carrierSide : shipperSide).filter((u) => u !== ctx.userId);
    await this.notifications.notifyMany(recipients, (userId) => ({
      userId,
      type: 'message.new',
      title: `${shipment.ref}: message from ${label}`,
      body: body.trim().slice(0, 140),
      sms: `RAHA ${shipment.ref}: ${label}: ${body.trim().slice(0, 120)}`,
      via: { telegram: true, sms: userId === trip?.driverId },
      data: { shipmentId },
    }));

    return { id: saved.id, senderName: saved.senderName, senderLabel: saved.senderLabel, mine: true, channel: 'app', body: saved.body, createdAt: saved.createdAt.toISOString() };
  }
}
