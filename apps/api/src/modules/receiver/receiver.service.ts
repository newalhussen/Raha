import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { DELIVERY_CONDITIONS, formatKg, formatTime, formatWhen, piecesLabel, type DeliveryCondition, type ReceiverPageDto } from '@raha/contracts';
import { decryptString } from '../../common/crypto';
import { conflict, notFound } from '../../common/errors';
import { loadEnv } from '../../config/env';
import { Shipment } from '../../database/entities';
import { buildStrip } from '../trips/strip';
import { TripsService } from '../trips/trips.service';
import { cargoLabel } from '../shipments/shipment-view.service';

export class ReceiverConfirmDto {
  @IsIn(DELIVERY_CONDITIONS) condition: DeliveryCondition;
  @IsOptional() @IsInt() @Min(0) receivedCount?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export const RECEIVER_CODE_RE = /^[A-Z2-9]{10}$/;
export class ReceiverCodeParam {
  @Matches(RECEIVER_CODE_RE) code: string;
}

/**
 * The page behind `raha.et/r/<code>`: no account, no app, ~40 KB. The unguessable code in the SMS is the credential,
 * which is why the page may show the delivery PIN — and why it is only shown while the truck is on the road.
 */
@Injectable()
export class ReceiverService {
  private readonly env = loadEnv();

  constructor(
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    private readonly trips: TripsService,
  ) {}

  private async byCode(code: string): Promise<Shipment> {
    if (!RECEIVER_CODE_RE.test(code)) throw notFound('Shipment');
    const s = await this.shipments
      .createQueryBuilder('s')
      .addSelect('s.pinEnc')
      .leftJoinAndSelect('s.shipperOrg', 'org')
      .leftJoinAndSelect('s.pickupPlace', 'pp')
      .leftJoinAndSelect('s.dropoffPlace', 'dp')
      .where('s.receiver_code = :code', { code })
      .getOne();
    if (!s) throw notFound('Shipment');
    return s;
  }

  async page(code: string): Promise<ReceiverPageDto> {
    const s = await this.byCode(code);
    const trip = s.tripId ? await this.trips.loadTrip(s.tripId) : null;
    const checkins = trip ? await this.trips.checkinsOf(trip.id) : [];

    let strip = null;
    if (trip) {
      const route = await this.trips.routeFor(trip);
      strip = buildStrip({
        corridorName: trip.corridor?.name ?? route.corridorName,
        direction: route.direction,
        routeKm: route.routeKm,
        stops: route.stops,
        checkins: checkins.map((c) => ({ placeId: c.placeId, at: c.checkedInAt, channel: c.channel })),
        status: trip.status,
        departedAt: trip.departedAt,
        plannedDepartureAt: trip.plannedDepartureAt,
        completedAt: trip.completedAt,
        etaAt: trip.etaAt,
      });
    }

    const cargoWord = (cargoLabel(s.cargoType).split(',')[0] ?? 'cargo').toLowerCase();
    const eta = trip?.etaAt ?? null;
    let headline: string;
    switch (s.status) {
      case 'in_transit': {
        const mins = eta ? Math.round((eta.getTime() - Date.now()) / 60_000) : null;
        headline =
          mins === null ? `Your ${cargoWord} is on the road`
          : mins <= 0 ? `Your ${cargoWord} should be arriving now`
          : mins < 90 ? `Your ${cargoWord} is ${mins} minutes away`
          : `Your ${cargoWord} arrives about ${formatWhen(eta!)}`;
        break;
      }
      case 'delivered':
        headline = `Your ${cargoWord} was delivered${s.deliveredAt ? ` at ${formatTime(s.deliveredAt)}` : ''}`;
        break;
      case 'cancelled':
        headline = 'This shipment was cancelled';
        break;
      case 'matched':
        headline = `Your ${cargoWord} is booked and will leave soon`;
        break;
      default:
        headline = `${s.shipperOrg.name} is arranging transport for your ${cargoWord}`;
    }

    const delivery = s.status === 'delivered' ? await this.shipments.manager.query<Array<{ confirmed_by: string }>>(`SELECT confirmed_by FROM deliveries WHERE shipment_id = $1`, [s.id]) : [];
    const onRoad = s.status === 'in_transit';
    return {
      code: s.receiverCode,
      receiverName: s.receiverName,
      shipperName: s.shipperOrg.name,
      cargoSummary: `${piecesLabel(s.cargoType, s.pieces).replace(/^[^,]+,\s*/, '') || cargoLabel(s.cargoType)} · ${formatKg(s.weightKg)}`,
      status: s.status,
      headline,
      ref: s.ref,
      driverFirstName: onRoad && trip ? trip.driver.fullName.split(' ')[0] ?? null : null,
      driverPhone: onRoad && trip ? trip.driver.phone : null,
      plate: trip?.vehicle.plate ?? null,
      pin: onRoad && s.pinEnc ? decryptString(this.env.pinEncKey, s.pinEnc) : null,
      strip,
      etaAt: eta?.toISOString() ?? null,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      confirmedBy: delivery[0]?.confirmed_by ?? null,
      canConfirm: onRoad,
      pickup: { id: s.pickupPlace.id, code: s.pickupPlace.code, name: s.pickupPlace.name, nameAm: s.pickupPlace.nameAm, lat: s.pickupPlace.location.coordinates[1], lng: s.pickupPlace.location.coordinates[0] },
      dropoff: { id: s.dropoffPlace.id, code: s.dropoffPlace.code, name: s.dropoffPlace.name, nameAm: s.dropoffPlace.nameAm, lat: s.dropoffPlace.location.coordinates[1], lng: s.dropoffPlace.location.coordinates[0] },
    };
  }

  /** "I've received it — confirm here": the receiver closes the shipment themselves, no PIN needed. */
  async confirm(code: string, dto: ReceiverConfirmDto): Promise<ReceiverPageDto> {
    const s = await this.byCode(code);
    if (s.status === 'delivered') return this.page(code);
    if (s.status !== 'in_transit') throw conflict('not_on_the_road', 'This shipment has not left yet, so it cannot be confirmed.');
    const load = await this.trips.loadForShipment(s.id);
    if (!load) throw conflict('no_trip', 'This shipment has no truck yet');
    await this.trips.finalizeDelivery({
      tripId: load.tripId,
      loadId: load.id,
      confirmedBy: 'receiver_link',
      pinVerified: false,
      condition: dto.condition,
      receivedCount: dto.receivedCount ?? null,
      at: new Date(),
      notes: dto.note ?? `Confirmed by ${s.receiverName} on the receiver page`,
    });
    return this.page(code);
  }
}
