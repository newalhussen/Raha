import { Injectable } from '@nestjs/common';
import type { CapacityPost } from '../../database/entities';

/**
 * Reference pricing. Carriers (or their broker) set the real price; these numbers produce the default
 * offer and the "x% below a dedicated truck" comparison. Calibrated so that 800 kg Addis→Hawassa (275 km)
 * is ETB 6,400 shared vs ~ETB 10,400 for a dedicated pickup truck.
 */
const SHARED_ETB_PER_KG_KM = 0.029;
const MIN_SHARED_CHARGE_ETB = 1500;
const MIN_DEDICATED_CHARGE_ETB = 3000;
const BROKER_FEE_RATE = 0.09;

/** [max load kg, ETB per km] — a dedicated truck sized for the load. */
const DEDICATED_PER_KM: Array<[number, number]> = [
  [3_000, 38],
  [5_000, 46],
  [10_000, 62],
  [15_000, 85],
  [Number.POSITIVE_INFINITY, 105],
];

const round50 = (n: number) => Math.round(n / 50) * 50;

@Injectable()
export class PricingService {
  sharedPrice(weightKg: number, km: number): number {
    return Math.max(MIN_SHARED_CHARGE_ETB, round50(weightKg * km * SHARED_ETB_PER_KG_KM));
  }

  /** What a truck dedicated to this load would cost: smallest class that carries it. */
  dedicatedReference(weightKg: number, km: number): number {
    const [, perKm] = DEDICATED_PER_KM.find(([cap]) => weightKg <= cap)!;
    return Math.max(MIN_DEDICATED_CHARGE_ETB, round50(perKm * km));
  }

  dedicatedForTruck(maxLoadKg: number, km: number): number {
    const [, perKm] = DEDICATED_PER_KM.find(([cap]) => maxLoadKg <= cap)!;
    return Math.max(MIN_DEDICATED_CHARGE_ETB, round50(perKm * km));
  }

  /**
   * Offer price for putting `weightKg` on `post` over `km` of the route.
   *  - dedicated posts: the whole truck is the product → dedicated tariff,
   *  - carrier-set rate per tonne wins when present,
   *  - otherwise the shared reference price (+ broker margin when a broker manages the truck).
   */
  priceFor(post: Pick<CapacityPost, 'kind' | 'askingPerTonneEtb' | 'brokerOrgId' | 'totalCapacityKg'>, weightKg: number, km: number): { priceEtb: number; brokerFeeEtb: number } {
    let base: number;
    if (post.kind === 'dedicated') base = this.dedicatedForTruck(post.totalCapacityKg, km);
    else if (post.askingPerTonneEtb) base = Math.max(MIN_SHARED_CHARGE_ETB, round50((post.askingPerTonneEtb * weightKg) / 1000));
    else base = this.sharedPrice(weightKg, km);

    if (!post.brokerOrgId) return { priceEtb: base, brokerFeeEtb: 0 };
    const fee = round50(base * BROKER_FEE_RATE);
    return { priceEtb: base + fee, brokerFeeEtb: fee };
  }

  /** Broker's cut on a price that already includes it. */
  brokerFeeOn(priceEtb: number): number {
    return round50((priceEtb * BROKER_FEE_RATE) / (1 + BROKER_FEE_RATE));
  }

  savingsPct(priceEtb: number, weightKg: number, km: number): number | null {
    const ref = this.dedicatedReference(weightKg, km);
    if (ref <= 0 || priceEtb >= ref) return null;
    return Math.floor((1 - priceEtb / ref) * 100);
  }
}
