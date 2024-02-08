import type { PaymentMethod } from '@raha/contracts';
import type { Organization, User, Vehicle } from '../entities';
import type { World, Person } from './cast';
import { AVG_SPEED_KMH, Kit } from './kit';

const CARGO_BY_SHIPPER: Record<string, string[]> = {
  'Sheba Agro PLC': ['coffee'],
  'Habesha Cement PLC': ['cement'],
  'Tana Pharma PLC': ['medical'],
  'Awash Mills PLC': ['cereals'],
  'Messebo Cement': ['cement'],
  'Akaki Building Supplies': ['building'],
  'Mojo Foods PLC': ['packaged_food'],
  'Buna Bank Facilities': ['furniture'],
  'Gojjam Agro Union': ['cereals'],
  'Dugda Flour Mills': ['cereals'],
  'Piassa Coffee Traders': ['coffee'],
};

const RECEIVERS = [
  ['Dawit Alemu', '+251916552090'], ['Almaz Tesfaye', '+251911661201'], ['Henok Girma', '+251911661202'], ['Tigist Mamo', '+251911661203'],
  ['Bereket Wolde', '+251911661204'], ['Genet Assefa', '+251911661205'], ['Mesfin Kassa', '+251911661206'], ['Aster Dubale', '+251911661207'],
] as const;

/** Lanes each truck usually runs (both directions are generated). */
function lanesFor(p: Person): Array<[string, string]> {
  const plate = p.vehicle?.plate ?? '';
  const map: Record<string, Array<[string, string]>> = {
    '3-48213 AA': [['ADD', 'HWS'], ['ADD', 'DIR'], ['ADD', 'ADA']],
    '3-50917 AA': [['ADD', 'DJI'], ['ADA', 'DIR']],
    '3-50922 AA': [['ADD', 'DIR'], ['ADD', 'DJI']],
    '3-41108 AA': [['ADD', 'BDR'], ['ADD', 'ADA']],
    '3-41115 AA': [['ADD', 'ADA'], ['ADD', 'JIM']],
    '3-66042 AA': [['ADD', 'HWS'], ['ADD', 'SHA']],
    '3-22874 AA': [['ADD', 'HWS'], ['ADD', 'ADA']],
    '3-30457 AA': [['ADD', 'HWS'], ['ADD', 'MOJ']],
    '3-71820 AA': [['ADD', 'DIR'], ['ADD', 'DJI']],
    '3-19944 AM': [['ADD', 'BDR'], ['ADD', 'DEM']],
    '3-80031 SD': [['ADD', 'HWS']],
    '3-40298 DD': [['ADD', 'DIR'], ['ADA', 'DIR']],
    '3-66710 OR': [['ADD', 'JIM']],
    '3-55102 AA': [['ADD', 'ADA'], ['ADD', 'DIR']],
    '3-61190 OR': [['ADD', 'HWS'], ['ADD', 'SHA']],
  };
  return map[plate] ?? [['ADD', 'ADA']];
}

interface TripPlan {
  fleet: Organization;
  driver: User;
  vehicle: Vehicle;
  from: string;
  to: string;
  hoursAgo: number;
}

/** Eight weeks of completed trips — fuels earnings, spend, load-factor and the performance bars. */
export async function buildHistory(k: Kit, w: World): Promise<{ trips: number; shipments: number }> {
  let trips = 0;
  let shipments = 0;
  const shippers: Array<{ org: Organization; weight: number }> = [
    { org: w.sheba, weight: 5 },
    { org: w.habesha, weight: 3 },
    { org: w.awashMills, weight: 2 },
    { org: w.messebo, weight: 2 },
    { org: w.akaki, weight: 2 },
    { org: w.mojoFoods, weight: 2 },
    { org: w.tana, weight: 1 },
    { org: w.buna, weight: 1 },
    ...w.shipperPool.slice(5).map((org) => ({ org, weight: 1 })),
  ];
  const bag = shippers.flatMap((s) => Array.from({ length: s.weight }, () => s.org));

  const plans: TripPlan[] = [];
  for (const { fleet, person } of w.fleetTrucks) {
    if (!person.vehicle) continue;
    const lanes = lanesFor(person);
    const isAbebe = person.user.id === w.abebe.user.id;
    const spacingDays = isAbebe ? 1.9 : fleet.id === w.kebede.id ? 3.2 : 4.2;
    const horizonDays = isAbebe ? 56 : fleet.id === w.kebede.id ? 56 : 42;
    let day = 1.0 + k.between(0, 0.8);
    let flip = false;
    let i = 0;
    while (day < horizonDays) {
      const lane = lanes[i % lanes.length]!;
      flip = !flip;
      plans.push({ fleet, driver: person.user, vehicle: person.vehicle, from: flip ? lane[0] : lane[1], to: flip ? lane[1] : lane[0], hoursAgo: day * 24 });
      day += (isAbebe && day > 27 ? 3.5 : spacingDays) * k.between(0.8, 1.25);
      i++;
    }
  }

  for (const plan of plans) {
    const route = await k.route(plan.from, plan.to);
    const driveHours = route.routeKm / AVG_SPEED_KMH;
    // never let a finished trip end less than 3 h ago
    const hoursAgo = Math.max(plan.hoursAgo, driveHours + 4);
    const departedAt = k.hrs(-hoursAgo);
    const completedAt = new Date(departedAt.getTime() + (driveHours + 0.8) * 3_600_000);
    const total = plan.vehicle.maxLoadKg;

    // the owner's own contract (a full-ish truck of a heavy commodity) …
    const ownKg = k.rand() < 0.62 ? Math.round((total * k.between(0.5, 0.88)) / 100) * 100 : 0;
    // … plus up to two Raha matches in the remaining space
    const matchCount = k.rand() < 0.7 ? (k.rand() < 0.3 ? 2 : 1) : 0;
    const matches: Array<{ org: Organization; kg: number }> = [];
    let free = total - ownKg;
    for (let m = 0; m < matchCount; m++) {
      const kg = Math.min(Math.round(k.between(300, 1800) / 50) * 50, Math.floor(free / 50) * 50);
      if (kg < 300) break;
      matches.push({ org: k.pick(bag), kg });
      free -= kg;
    }
    if (ownKg === 0 && matches.length === 0) matches.push({ org: k.pick(bag), kg: Math.round(k.between(400, 1500) / 50) * 50 });

    const returnLeg = plan.from !== 'ADD' && ownKg === 0;
    const post = await k.post(plan.vehicle, plan.driver, plan.fleet, {
      from: plan.from,
      to: plan.to,
      departsInHours: -hoursAgo,
      committedKg: ownKg,
      kind: returnLeg ? 'return_leg' : ownKg > 0 ? 'on_route' : 'dedicated',
      status: 'departed',
    });
    const trip = await k.trip(post, plan.driver, plan.vehicle, 'completed', { departedAt, completedAt, lastPlace: plan.to, lastAt: completedAt });
    await k.autoCheckins(trip, route, departedAt, route.routeKm);
    trips++;

    const payer = async (org: Organization) => org.id;
    const paidFor = (deliveredAt: Date): { method: PaymentMethod; at: Date } | null => {
      const ageDays = (k.now.getTime() - deliveredAt.getTime()) / 86_400_000;
      const p = ageDays > 6 ? 0.93 : ageDays > 2 ? 0.62 : 0.15;
      if (k.rand() > p) return null;
      const r = k.rand();
      const method: PaymentMethod = r < 0.5 ? 'telebirr' : r < 0.85 ? 'cbe' : r < 0.95 ? 'cash' : 'bank';
      const at = new Date(Math.min(k.now.getTime() - 3_600_000, deliveredAt.getTime() + k.between(0.3, 4.5) * 86_400_000));
      return { method, at };
    };

    let order = 1;
    const dropoff = plan.to;
    if (ownKg > 0) {
      const shipper = k.pick([w.habesha, w.messebo, w.awashMills, w.akaki]);
      const cargo = k.pick(CARGO_BY_SHIPPER[shipper.name] ?? ['building']);
      const price = k.round50(ownKg * route.routeKm * 0.0098);
      const recv = k.pick(RECEIVERS);
      const sh = await k.shipment({
        shipper, source: 'fleet', loggedBy: null, from: plan.from, to: dropoff, pickupAddress: `${shipper.name} yard`, dropoffAddress: `${shipper.name} depot, ${dropoff}`,
        receiver: { name: recv[0], phone: recv[1] }, cargo, pieces: Math.round(ownKg / 50), weightKg: ownKg, readyInHours: -hoursAgo - 3, status: 'delivered', priceEtb: price, createdMinutesAgo: Math.round((hoursAgo + 30) * 60),
      });
      const load = await k.load(trip, post, sh, { raha: false, status: 'delivered', priceEtb: price, dropOrder: order++, pickedUpAt: new Date(departedAt.getTime() - 40 * 60_000), deliveredAt: completedAt, proposedBy: 'fleet' });
      await k.proof(sh, load, 'pickup_photo', new Date(departedAt.getTime() - 40 * 60_000));
      await k.deliver(trip, load, sh, { at: completedAt, amountEtb: price, payerOrgId: await payer(shipper), paid: paidFor(completedAt) });
      shipments++;
    }
    for (const m of matches) {
      const cargo = k.pick(CARGO_BY_SHIPPER[m.org.name] ?? ['building']);
      const price = Math.max(1500, k.round50(m.kg * route.routeKm * 0.029));
      const recv = k.pick(RECEIVERS);
      const viaBroker = m.org.managedByOrgId ? w.yonas : null;
      const deliveredAt = new Date(completedAt.getTime() - k.between(0, 30) * 60_000);
      const sh = await k.shipment({
        shipper: m.org, loggedBy: viaBroker, source: viaBroker ? 'broker' : 'app', from: plan.from, to: dropoff, pickupAddress: `${m.org.name} warehouse, ${plan.from === 'ADD' ? 'Bole Bulbula' : plan.from}`, dropoffAddress: `${recv[0]}, ${dropoff}`,
        receiver: { name: recv[0], phone: recv[1] }, cargo, pieces: Math.max(1, Math.round(m.kg / 50)), weightKg: m.kg, readyInHours: -hoursAgo - 2, status: 'delivered', priceEtb: price, createdMinutesAgo: Math.round((hoursAgo + 6) * 60),
      });
      const flag = k.rand() < 0.04 ? 'photo_blurry' : null;
      const load = await k.load(trip, post, sh, { raha: true, status: 'delivered', priceEtb: price, dropOrder: order++, pickedUpAt: new Date(departedAt.getTime() - 25 * 60_000), deliveredAt, proposedBy: 'shipper' });
      await k.proof(sh, load, 'pickup_photo', new Date(departedAt.getTime() - 25 * 60_000));
      await k.deliver(trip, load, sh, { at: deliveredAt, amountEtb: price, payerOrgId: m.org.id, paid: paidFor(deliveredAt), flag, reviewed: flag ? hoursAgo > 48 : false });
      shipments++;
    }
  }

  // keep each driver's trip counter consistent with what we just generated
  await k.ds.query(`UPDATE driver_profiles dp SET trips_completed = dp.trips_completed + sub.n FROM (SELECT driver_id, count(*)::int AS n FROM trips WHERE status = 'completed' GROUP BY driver_id) sub WHERE sub.driver_id = dp.user_id`);
  return { trips, shipments };
}
