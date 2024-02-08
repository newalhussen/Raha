import { Delivery, InboundMessage, Issue, Match, Notification, Shipment, ShipmentMessage, Vehicle, VerificationCase, VerificationDocument } from '../entities';
import type { Organization, User } from '../entities';
import type { World } from './cast';
import { ph } from './cast';
import { AVG_SPEED_KMH, Kit } from './kit';

/**
 * "Thursday morning" in the pilot: the state the design screens describe. All times are relative to when the seed runs,
 * so the app always looks like it is mid-day with loads waiting, trucks on the road and one truck running late.
 */
export async function buildLive(k: Kit, w: World): Promise<void> {
  const { ds } = k;
  const recv = { dawit: { name: 'Dawit Alemu', phone: '+251916552090' }, hawassaIp: { name: 'Hawassa IP Stores', phone: '+251911772201' }, store: { name: 'Almaz Tesfaye', phone: '+251911661201' } };

  // ───────────────────────── Abebe: open space with 8 t of his own cement aboard ─────────────────────────
  const abebePost = await k.post(w.abebe.vehicle!, w.abebe.user, w.kebede, { from: 'ADD', to: 'HWS', departsInHours: 3, committedKg: 8_000, kind: 'on_route', via: 'app' });
  const own = await k.shipment({
    shipper: w.habesha, source: 'fleet', from: 'ADD', to: 'HWS', pickupAddress: 'Habesha Cement dispatch yard, Kality', dropoffAddress: 'Hawassa Industrial Park, gate 2', receiver: recv.hawassaIp,
    pickupContact: { name: 'Seble Mekonnen', phone: ph(741) }, cargo: 'cement', pieces: 160, weightKg: 8_000, readyInHours: 1.2, status: 'matched', priceEtb: 21_500, createdMinutesAgo: 300,
  });
  const abebeTrip = await k.trip(abebePost, w.abebe.user, w.abebe.vehicle!, 'planned');
  await k.load(abebeTrip, abebePost, own, { raha: false, status: 'assigned', priceEtb: 21_500, proposedBy: 'fleet' });
  await ds.getRepository(Shipment).update(own.id, { tripId: abebeTrip.id });

  // ───────────────────────── other trucks with space ─────────────────────────
  const meseretPost = await k.post(w.meseret.vehicle!, w.meseret.user, w.meseretOrg, { from: 'ADD', to: 'HWS', departsInHours: 2, kind: 'return_leg', broker: w.yonas, via: 'broker' });
  const girmaPost = await k.post(w.girma.vehicle!, w.girma.user, w.selam, { from: 'ADD', to: 'HWS', departsInHours: 19, committedKg: 5_500, kind: 'on_route' });
  const biniyamPost = await k.post(w.biniyam.vehicle!, w.biniyam.user, w.selam, { from: 'ADD', to: 'HWS', departsInHours: 2.2, kind: 'dedicated' });
  const solomonPost = await k.post(w.solomon.vehicle!, w.solomon.user, w.kebede, { from: 'ADA', to: 'DIR', departsInHours: 2.5, kind: 'dedicated' });

  // Selam Logistics' Adama truck, a return leg to Addis tomorrow morning
  const dagimUser = await k.user({ name: 'Dagim Ayana', phone: ph(633) });
  await k.join(dagimUser, w.selam, 'driver');
  await k.driver(dagimUser, { trips: 61, home: 'ADA' });
  const dagimTruck = await k.vehicle(w.selam, { plate: '3-45002 AA', model: 'Isuzu FSR', maxKg: 10_000, volume: 38, driver: dagimUser, home: 'ADA' });
  const dagimPost = await k.post(dagimTruck, dagimUser, w.selam, { from: 'ADA', to: 'ADD', departsInHours: 20, kind: 'return_leg' });

  // Gojjam Trans' idle truck: Addis → Bahir Dar tomorrow morning with 6 t of its own load aboard
  const habtamu = await ds.getRepository(Vehicle).findOneOrFail({ where: { plate: '3-20118 AM' }, relations: { currentDriver: true } });
  await k.post(habtamu, habtamu.currentDriver, w.gojjam, { from: 'ADD', to: 'BDR', departsInHours: 19, committedKg: 6_000, kind: 'on_route' });

  // three empty return legs Hawassa → Addis tomorrow (Ethio Textile's 6 t will have "3 return legs")
  const lemma = await ds.getRepository(Vehicle).findOneOrFail({ where: { plate: '3-44120 AA' }, relations: { currentDriver: true } }) as Vehicle & { currentDriver: User };
  const ahmed = await ds.getRepository(Vehicle).findOneOrFail({ where: { plate: '3-35110 AA' }, relations: { currentDriver: true } }) as Vehicle & { currentDriver: User };
  const zelalem = await ds.getRepository(Vehicle).findOneOrFail({ where: { plate: '3-62213 SD' }, relations: { currentDriver: true } }) as Vehicle & { currentDriver: User };
  await k.post(lemma, lemma.currentDriver, w.selam, { from: 'HWS', to: 'ADD', departsInHours: 20, kind: 'return_leg' });
  await k.post(ahmed, ahmed.currentDriver, w.awashFreight, { from: 'HWS', to: 'ADD', departsInHours: 21, kind: 'return_leg' });
  await k.post(zelalem, zelalem.currentDriver, w.rift, { from: 'HWS', to: 'ADD', departsInHours: 22, kind: 'return_leg' });

  // ───────────────────────── open loads (the match board) ─────────────────────────
  const sheba8822 = await k.shipment(
    {
      shipper: w.sheba, createdBy: w.hanna, loggedBy: w.yonas, source: 'app', from: 'ADD', to: 'HWS', pickupAddress: 'Sheba Agro warehouse, Bole Bulbula', dropoffAddress: 'Piassa Coffee Traders, Hawassa',
      receiver: recv.dawit, pickupContact: { name: 'Hanna Girma', phone: '+251911330207' }, cargo: 'coffee', pieces: 16, weightKg: 800, volumeM3: 2.4, readyInHours: 1, createdMinutesAgo: 42,
    },
    'RH-26-08822',
  );
  const akakiCement = await k.shipment({ shipper: w.akaki, from: 'ADD', to: 'SHA', pickupAddress: 'Akaki Building Supplies, Kality', dropoffAddress: 'Shashemene market road', receiver: recv.store, cargo: 'cement', pieces: 30, weightKg: 1_500, readyInHours: 1.6, createdMinutesAgo: 35 });
  const mojoFoods = await k.shipment({ shipper: w.mojoFoods, from: 'MOJ', to: 'HWS', pickupAddress: 'Mojo Foods PLC factory, Mojo', dropoffAddress: 'Hawassa wholesale market', receiver: recv.store, cargo: 'packaged_food', pieces: 40, weightKg: 600, readyInHours: 2.6, createdMinutesAgo: 90 });
  await k.shipment({ shipper: w.akaki, from: 'ADD', to: 'SHA', pickupAddress: 'Akaki Building Supplies, Kality', dropoffAddress: 'Shashemene steel yard', receiver: recv.store, cargo: 'building', weightKg: 3_200, readyInHours: 2, createdMinutesAgo: 55 });
  const flour = await k.shipment(
    { shipper: w.awashMills, loggedBy: w.yonas, source: 'phone', from: 'ADA', to: 'DIR', pickupAddress: 'Awash Mills, Adama industrial zone', dropoffAddress: 'Dire Dawa Sabian wholesale', receiver: recv.store, cargo: 'cereals', pieces: 64, weightKg: 3_200, readyInHours: 3, createdMinutesAgo: 70 },
    'RH-26-08830',
  );
  await k.shipment({ shipper: w.tana, loggedBy: w.yonas, source: 'app', from: 'ADD', to: 'BDR', pickupAddress: 'Tana Pharma, Lideta', dropoffAddress: 'Felege Hiwot hospital stores, Bahir Dar', receiver: recv.store, cargo: 'medical', pieces: 24, weightKg: 1_500, readyInHours: 20, createdMinutesAgo: 92 }, 'RH-26-08833');
  await k.shipment({ shipper: w.ethioTextile, loggedBy: w.yonas, source: 'telegram', from: 'HWS', to: 'ADD', pickupAddress: 'Hawassa Industrial Park, Ethio Textile', dropoffAddress: 'Addis Ababa export terminal, Kality', receiver: recv.store, cargo: 'textiles', pieces: 120, weightKg: 6_000, readyInHours: 20, createdMinutesAgo: 120 }, 'RH-26-08835');
  await k.shipment({ shipper: w.buna, loggedBy: w.yonas, source: 'app', from: 'ADD', to: 'JIM', pickupAddress: 'Buna Bank head office, Bole', dropoffAddress: 'Buna Bank Jimma branch', receiver: recv.store, cargo: 'furniture', pieces: 35, weightKg: 2_000, readyInHours: 44, createdMinutesAgo: 180 }, 'RH-26-08838');
  await k.shipment({ shipper: w.messebo, loggedBy: w.yonas, source: 'phone', from: 'MKL', to: 'ADD', pickupAddress: 'Messebo Cement plant, Mekelle', dropoffAddress: 'Addis Ababa building site, Bole Arabsa', receiver: recv.store, cargo: 'cement', pieces: 180, weightKg: 9_000, readyInHours: 43, createdMinutesAgo: 240 }, 'RH-26-08841');

  // ───────────────────────── proposals in flight ─────────────────────────
  const prop = async (sh: Shipment, post: { id: string }, status: 'pending_carrier' | 'pending_shipper', by: Match['proposedBy'], price: number, fit: Match['fitKind'], fee = 0) =>
    ds.getRepository(Match).save(ds.getRepository(Match).create({ shipmentId: sh.id, capacityPostId: post.id, status, proposedBy: by, priceEtb: price, brokerFeeEtb: fee, fitKind: fit, isRahaMatch: true, score: 84, expiresAt: k.hrs(5), createdAt: k.hrs(-0.4) }));
  await prop(mojoFoods, abebePost, 'pending_carrier', 'shipper', 3_200, 'same_trip');
  await prop(flour, solomonPost, 'pending_carrier', 'broker', 11_800, 'dedicated', 900);
  await prop(sheba8822, biniyamPost, 'pending_shipper', 'fleet', 10_400, 'dedicated');

  // a maize load already matched with Selam's Adama truck (departs tomorrow)
  const maize = await k.shipment(
    { shipper: w.sheba, createdBy: w.hanna, source: 'app', from: 'ADA', to: 'ADD', pickupAddress: 'Sheba Agro collection point, Adama', dropoffAddress: 'Sheba Agro warehouse, Bole Bulbula', receiver: { name: 'Hanna Girma', phone: '+251911330207' }, cargo: 'cereals', pieces: 50, weightKg: 2_500, readyInHours: 19, status: 'matched', priceEtb: 6_900, createdMinutesAgo: 400 },
    'RH-26-08826',
  );
  const dagimTrip = await k.trip(dagimPost, dagimUser, dagimTruck, 'planned');
  await k.load(dagimTrip, dagimPost, maize, { raha: true, status: 'assigned', priceEtb: 6_900, proposedBy: 'shipper', fit: 'empty_return' });
  await ds.query(`UPDATE capacity_posts SET status = 'open' WHERE id = $1`, [dagimPost.id]);

  // ───────────────────────── trucks on the road ─────────────────────────
  type Live = { fleet: Organization; person: { user: User; vehicle?: Vehicle }; from: string; to: string; lastPlace: string; lastAgoMin: number; ownKg?: number; ownShipper?: Organization; ownCargo?: string; matches?: Array<{ shipper: Organization; kg: number; cargo: string; ref?: string; broker?: boolean }>; late?: boolean };
  const onRoad: Live[] = [
    { fleet: w.kebede, person: w.daniel, from: 'ADD', to: 'HWS', lastPlace: 'MEK', lastAgoMin: 40, ownKg: 6_200, ownShipper: w.habesha, ownCargo: 'cement', matches: [{ shipper: w.sheba, kg: 800, cargo: 'coffee', ref: 'RH-26-08817', broker: true }] },
    { fleet: w.kebede, person: w.birhanu, from: 'ADD', to: 'DIR', lastPlace: 'AWA', lastAgoMin: 70, ownKg: 15_000, ownShipper: w.messebo, ownCargo: 'cement' },
    { fleet: w.kebede, person: w.yared, from: 'ADD', to: 'BDR', lastPlace: 'DEM', lastAgoMin: 120, ownKg: 2_500, ownShipper: w.habesha, ownCargo: 'cement', matches: [{ shipper: w.tana, kg: 1_000, cargo: 'medical' }] },
    { fleet: w.awashFreight, person: w.dereje, from: 'ADD', to: 'DIR', lastPlace: 'MIE', lastAgoMin: 95, matches: [{ shipper: w.sheba, kg: 4_000, cargo: 'coffee', ref: 'RH-26-08804', broker: true }, { shipper: w.mojoFoods, kg: 1_500, cargo: 'packaged_food' }] },
    { fleet: w.kassahunOrg, person: w.kassahun, from: 'ADA', to: 'ADD', lastPlace: 'MOJ', lastAgoMin: 205, ownKg: 4_000, ownShipper: w.awashMills, ownCargo: 'cereals', late: true },
    { fleet: w.gojjam, person: w.mulugeta, from: 'ADD', to: 'BDR', lastPlace: 'DEM', lastAgoMin: 50, ownKg: 9_000, ownShipper: w.habesha, ownCargo: 'cement' },
    { fleet: w.rift, person: w.fikru, from: 'DIR', to: 'ADD', lastPlace: 'AWA', lastAgoMin: 150, ownKg: 6_500, ownShipper: w.awashMills, ownCargo: 'cereals', matches: [{ shipper: w.mojoFoods, kg: 1_200, cargo: 'packaged_food' }] },
    { fleet: w.rift, person: w.tsegaye, from: 'ADD', to: 'JIM', lastPlace: 'WEL', lastAgoMin: 85, ownKg: 5_000, ownShipper: w.akaki, ownCargo: 'building', matches: [{ shipper: w.buna, kg: 900, cargo: 'furniture' }] },
    { fleet: w.rift, person: w.meronG, from: 'ADD', to: 'HWS', lastPlace: 'HWS', lastAgoMin: 25, matches: [{ shipper: w.sheba, kg: 700, cargo: 'coffee', ref: 'RH-26-08812' }, { shipper: w.mojoFoods, kg: 1_800, cargo: 'packaged_food' }] },
  ];

  // extra trucks so the control room has a realistic spread across corridors
  const fillers: Array<{ fleet: Organization; name: string; plate: string; model: string; maxKg: number; from: string; to: string; lastPlace: string; lastAgoMin: number; ownKg: number; shipper: Organization; cargo: string; home: string }> = [
    { fleet: w.awashFreight, name: 'Kedir Mohammed', plate: '3-71822 AA', model: 'Sino HOWO', maxKg: 15_000, from: 'ADD', to: 'DJI', lastPlace: 'ADA', lastAgoMin: 35, ownKg: 14_000, shipper: w.messebo, cargo: 'cement', home: 'ADA' },
    { fleet: w.awashFreight, name: 'Hassen Ali', plate: '3-71830 AA', model: 'Sino HOWO', maxKg: 15_000, from: 'DJI', to: 'ADD', lastPlace: 'DIR', lastAgoMin: 110, ownKg: 13_000, shipper: w.awashMills, cargo: 'cereals', home: 'DIR' },
    { fleet: w.awashFreight, name: 'Mustefa Omer', plate: '3-71835 AA', model: 'Sino HOWO', maxKg: 15_000, from: 'ADD', to: 'DJI', lastPlace: 'AWA', lastAgoMin: 160, ownKg: 15_000, shipper: w.habesha, cargo: 'cement', home: 'ADA' },
    { fleet: w.gojjam, name: 'Alemu Wudu', plate: '3-20121 AM', model: 'Isuzu FSR', maxKg: 10_000, from: 'BDR', to: 'ADD', lastPlace: 'DEM', lastAgoMin: 75, ownKg: 7_000, shipper: w.akaki, cargo: 'building', home: 'BDR' },
    { fleet: w.rift, name: 'Shiferaw Bekele', plate: '3-62230 SD', model: 'Isuzu FSR', maxKg: 10_000, from: 'ADD', to: 'HWS', lastPlace: 'MOJ', lastAgoMin: 20, ownKg: 8_500, shipper: w.habesha, cargo: 'cement', home: 'HWS' },
    { fleet: w.rift, name: 'Befekadu Alem', plate: '3-62241 SD', model: 'Isuzu NPR', maxKg: 5_000, from: 'HWS', to: 'ADD', lastPlace: 'BAT', lastAgoMin: 65, ownKg: 3_500, shipper: w.mojoFoods, cargo: 'packaged_food', home: 'HWS' },
    { fleet: w.selam, name: 'Tamirat Nega', plate: '3-45010 AA', model: 'Isuzu FSR', maxKg: 10_000, from: 'ADD', to: 'ADA', lastPlace: 'MOJ', lastAgoMin: 45, ownKg: 6_000, shipper: w.awashMills, cargo: 'cereals', home: 'ADD' },
    { fleet: w.gojjam, name: 'Berhanu Tefera', plate: '3-20130 AM', model: 'Sino HOWO', maxKg: 15_000, from: 'MKL', to: 'ADD', lastPlace: 'KOM', lastAgoMin: 100, ownKg: 15_000, shipper: w.messebo, cargo: 'cement', home: 'MKL' },
  ];
  for (const f of fillers) {
    const user = await k.user({ name: f.name, phone: ph(Math.floor(k.between(1000, 9000))) });
    await k.join(user, f.fleet, 'driver');
    await k.driver(user, { trips: Math.floor(k.between(30, 200)), home: f.home });
    const vehicle = await k.vehicle(f.fleet, { plate: f.plate, model: f.model, maxKg: f.maxKg, volume: Math.round(f.maxKg / 262), driver: user, home: f.home });
    onRoad.push({ fleet: f.fleet, person: { user, vehicle }, from: f.from, to: f.to, lastPlace: f.lastPlace, lastAgoMin: f.lastAgoMin, ownKg: f.ownKg, ownShipper: f.shipper, ownCargo: f.cargo });
  }

  for (const t of onRoad) {
    const vehicle = t.person.vehicle!;
    const route = await k.route(t.from, t.to);
    const lastStop = route.stops.find((s) => s.place.code === t.lastPlace)!;
    const lastAt = new Date(k.now.getTime() - t.lastAgoMin * 60_000);
    const departedAt = new Date(lastAt.getTime() - (lastStop.km / AVG_SPEED_KMH) * 3_600_000 - 25 * 60_000);
    const ownKg = t.ownKg ?? 0;
    const post = await k.post(vehicle, t.person.user, t.fleet, {
      from: t.from, to: t.to, departsInHours: (departedAt.getTime() - k.now.getTime()) / 3_600_000, committedKg: ownKg, status: 'departed', kind: ownKg > 0 ? 'on_route' : 'dedicated',
    });
    const trip = await k.trip(post, t.person.user, vehicle, 'in_transit', { departedAt, lastPlace: t.lastPlace, lastAt });
    await k.autoCheckins(trip, route, departedAt, lastStop.km);
    // make the final check-in land at the intended time
    await ds.query(`UPDATE trip_checkins SET checked_in_at = $1, received_at = $1 WHERE trip_id = $2 AND place_id = $3`, [lastAt, trip.id, lastStop.place.id]);
    await ds.query(`UPDATE trips SET last_checkin_at = $1 WHERE id = $2`, [lastAt, trip.id]);

    let order = 1;
    const pickedAt = new Date(departedAt.getTime() - 35 * 60_000);
    if (ownKg > 0 && t.ownShipper) {
      const price = k.round50(ownKg * route.routeKm * 0.0098);
      const sh = await k.shipment({ shipper: t.ownShipper, source: 'fleet', from: t.from, to: t.to, pickupAddress: `${t.ownShipper.name} yard`, dropoffAddress: `${t.ownShipper.name} depot, ${route.stops[route.stops.length - 1]!.place.name}`, receiver: recv.hawassaIp, cargo: t.ownCargo ?? 'cement', pieces: Math.round(ownKg / 50), weightKg: ownKg, readyInHours: (pickedAt.getTime() - k.now.getTime()) / 3_600_000 - 1, status: 'in_transit', priceEtb: price, createdMinutesAgo: 600 });
      await k.load(trip, post, sh, { raha: false, status: 'in_transit', priceEtb: price, dropOrder: order++, pickedUpAt: pickedAt, proposedBy: 'fleet' });
      await k.proof(sh, null, 'pickup_photo', pickedAt);
    }
    for (const m of t.matches ?? []) {
      const price = Math.max(1500, k.round50(m.kg * route.routeKm * 0.029));
      const sh = await k.shipment(
        { shipper: m.shipper, loggedBy: m.broker ? w.yonas : null, source: m.broker ? 'broker' : 'app', createdBy: m.shipper.id === w.sheba.id ? w.hanna : null, from: t.from, to: t.to, pickupAddress: `${m.shipper.name} warehouse, ${t.from === 'ADD' ? 'Bole Bulbula' : t.from}`, dropoffAddress: m.ref === 'RH-26-08812' ? 'Piassa Coffee Traders, Hawassa' : `${m.shipper.name} buyer, ${route.stops[route.stops.length - 1]!.place.name}`, receiver: m.ref === 'RH-26-08812' || m.ref === 'RH-26-08817' ? recv.dawit : recv.store, cargo: m.cargo, pieces: Math.max(1, Math.round(m.kg / 50)), weightKg: m.kg, readyInHours: (pickedAt.getTime() - k.now.getTime()) / 3_600_000 - 1, status: 'in_transit', priceEtb: price, createdMinutesAgo: 500 },
        m.ref,
      );
      const load = await k.load(trip, post, sh, { raha: true, status: 'in_transit', priceEtb: price, dropOrder: order++, pickedUpAt: pickedAt, proposedBy: 'shipper', brokerFee: m.broker ? k.round50(price * 0.08) : 0 });
      await k.proof(sh, load, 'pickup_photo', pickedAt);
      await k.proof(sh, load, 'waybill', pickedAt);
    }
    await ds.query(`UPDATE vehicles SET status = 'on_trip', current_load_kg = $1 WHERE id = $2`, [ownKg + (t.matches ?? []).reduce((n, m) => n + m.kg, 0), vehicle.id]);
  }

  // Kidist: loading at the Kality depot (pickup photographed, not yet departed)
  const kidistPost = await k.post(w.kidist.vehicle!, w.kidist.user, w.kebede, { from: 'ADD', to: 'ADA', departsInHours: 0.8, committedKg: 2_000, kind: 'on_route' });
  const kidistTrip = await k.trip(kidistPost, w.kidist.user, w.kidist.vehicle!, 'loading');
  const loadingSh = await k.shipment({ shipper: w.mojoFoods, source: 'fleet', from: 'ADD', to: 'ADA', pickupAddress: 'Kality freight terminal, gate 3', dropoffAddress: 'Adama central market', receiver: recv.store, cargo: 'packaged_food', pieces: 40, weightKg: 2_000, readyInHours: -0.3, status: 'matched', priceEtb: 3_000, createdMinutesAgo: 200 });
  await k.load(kidistTrip, kidistPost, loadingSh, { raha: false, status: 'arrived_pickup', priceEtb: 3_000, proposedBy: 'fleet' });
  await ds.query(`UPDATE vehicles SET status = 'loading', current_load_kg = 2000 WHERE id = $1`, [w.kidist.vehicle!.id]);

  // ───────────────────────── a delivery under dispute and two to review ─────────────────────────
  const settled = async (p: { person: { user: User; vehicle?: Vehicle }; fleet: Organization; from: string; to: string; hoursAgo: number; shipper: Organization; ref: string; kg: number; pieces: number; cargo: string; confirmedBy?: Delivery['confirmedBy']; condition?: Delivery['condition']; flag: string; received?: number; paid?: boolean }) => {
    const route = await k.route(p.from, p.to);
    const departed = k.hrs(-p.hoursAgo - route.routeKm / AVG_SPEED_KMH - 0.5);
    const done = k.hrs(-p.hoursAgo);
    const post = await k.post(p.person.vehicle!, p.person.user, p.fleet, { from: p.from, to: p.to, departsInHours: (departed.getTime() - k.now.getTime()) / 3_600_000, status: 'departed', kind: 'dedicated' });
    const trip = await k.trip(post, p.person.user, p.person.vehicle!, 'completed', { departedAt: departed, completedAt: done, lastPlace: p.to, lastAt: done });
    await k.autoCheckins(trip, route, departed, route.routeKm);
    const price = Math.max(1500, k.round50(p.kg * route.routeKm * 0.029));
    const sh = await k.shipment({ shipper: p.shipper, from: p.from, to: p.to, pickupAddress: `${p.shipper.name} warehouse`, dropoffAddress: `Buyer, ${route.stops[route.stops.length - 1]!.place.name}`, receiver: recv.store, cargo: p.cargo, pieces: p.pieces, weightKg: p.kg, readyInHours: -p.hoursAgo - 8, status: 'delivered', priceEtb: price, createdMinutesAgo: (p.hoursAgo + 30) * 60 }, p.ref);
    const load = await k.load(trip, post, sh, { raha: true, status: 'delivered', priceEtb: price, pickedUpAt: departed, deliveredAt: done });
    await k.proof(sh, load, 'pickup_photo', departed);
    await k.deliver(trip, load, sh, { at: done, confirmedBy: p.confirmedBy, condition: p.condition, flag: p.flag, received: p.received, amountEtb: price, payerOrgId: p.shipper.id, paid: p.paid ? { method: 'telebirr', at: k.hrs(-p.hoursAgo + 20) } : null });
    return { sh, trip };
  };
  const shortDelivery = await settled({ person: w.kidist, fleet: w.kebede, from: 'ADD', to: 'ADA', hoursAgo: 18, shipper: w.habesha, ref: 'RH-26-08790', kg: 1_500, pieces: 30, cargo: 'cement', condition: 'short_count', flag: 'short_count', received: 28 });
  await settled({ person: w.mulugeta, fleet: w.gojjam, from: 'ADD', to: 'BDR', hoursAgo: 72, shipper: w.sheba, ref: 'RH-26-08761', kg: 6_000, pieces: 100, cargo: 'coffee', flag: 'photo_blurry', paid: true });
  await settled({ person: w.biniyam, fleet: w.selam, from: 'ADD', to: 'HWS', hoursAgo: 40, shipper: w.tana, ref: 'RH-26-08779', kg: 900, pieces: 18, cargo: 'medical', confirmedBy: 'shipper_manual', flag: 'no_pin' });

  // ───────────────────────── support queue ─────────────────────────
  const nextIssue = async () => `IS-${(await ds.query(`SELECT nextval('issue_ref_seq') AS n`))[0].n}`;
  const meronGTrip = await ds.query(`SELECT id FROM trips WHERE driver_id = $1 AND status = 'in_transit' LIMIT 1`, [w.meronG.user.id]);
  const lostPinShipment = await ds.getRepository(Shipment).findOneByOrFail({ ref: 'RH-26-08812' });
  await ds.getRepository(Issue).save([
    ds.getRepository(Issue).create({ ref: await nextIssue(), kind: 'dispute', priority: 1, title: 'Short delivery: 28 of 30 bags', body: 'RH-26-08790 · Habesha Cement vs Kebede Transport. Pickup photo shows 30 bags.', shipmentId: shortDelivery.sh.id, tripId: shortDelivery.trip.id, raisedByOrg: w.habesha.id, actionHint: 'Open case', createdAt: k.hrs(-17) }),
    ds.getRepository(Issue).create({ ref: await nextIssue(), kind: 'support', priority: 2, title: 'Receiver lost PIN', body: 'RH-26-08812 · Dawit A. at Piassa · driver waiting at door.', shipmentId: lostPinShipment.id, tripId: meronGTrip[0]?.id ?? null, raisedBy: w.dawitA.id, actionHint: 'Verify & resend', createdAt: k.hrs(-0.3) }),
    ds.getRepository(Issue).create({ ref: await nextIssue(), kind: 'support', priority: 3, title: "Shipper can't add employee", body: 'Tana Pharma · owner role needed to invite.', raisedByOrg: w.tana.id, actionHint: 'Reply', createdAt: k.hrs(-2) }),
    ds.getRepository(Issue).create({ ref: await nextIssue(), kind: 'support', priority: 3, title: 'Question about invoice timing', body: 'Sheba Agro finance asks when payments appear on the statement.', raisedByOrg: w.sheba.id, actionHint: 'Reply', createdAt: k.hrs(-5) }),
    ds.getRepository(Issue).create({ ref: await nextIssue(), kind: 'support', priority: 3, title: 'Driver cannot upload photo on 3G', body: 'Birhanu Wolde reports photo upload stuck at pickup.', raisedBy: w.birhanu.user.id, actionHint: 'Reply', createdAt: k.hrs(-7) }),
    ds.getRepository(Issue).create({ ref: await nextIssue(), kind: 'support', priority: 4, title: 'Add Amharic receipts', body: 'Feature request from Awash Mills.', raisedByOrg: w.awashMills.id, actionHint: 'Reply', createdAt: k.hrs(-30) }),
  ]);

  // ───────────────────────── verification queue ─────────────────────────
  const verifyCase = async (type: 'driver' | 'vehicle' | 'organization', subjectId: string, submittedBy: string | null, ageHours: number, docs: Array<{ kind: VerificationDocument['kind']; number?: string; expiresInDays?: number; note?: string }>) => {
    const c = await ds.getRepository(VerificationCase).save(ds.getRepository(VerificationCase).create({ subjectType: type, subjectId, status: 'pending', submittedBy, createdAt: k.hrs(-ageHours) }));
    for (const d of docs) {
      await ds.getRepository(VerificationDocument).save(
        ds.getRepository(VerificationDocument).create({ caseId: c.id, subjectType: type, subjectId, kind: d.kind, fileKey: await k.storeFile(k.between(0, 14)), number: d.number ?? null, expiresOn: d.expiresInDays !== undefined ? new Date(k.now.getTime() + d.expiresInDays * 86_400_000).toISOString().slice(0, 10) : null, reviewNote: d.note ?? null, uploadedBy: submittedBy, createdAt: k.hrs(-ageHours) }),
      );
    }
    const table = type === 'driver' ? 'driver_profiles' : type === 'vehicle' ? 'vehicles' : 'organizations';
    const key = type === 'driver' ? 'user_id' : 'id';
    await ds.query(`UPDATE ${table} SET verification_status = 'pending' WHERE ${key} = $1`, [subjectId]);
  };
  await ds.query(`UPDATE driver_profiles SET licence_number = 'AA-05-118 204', licence_grade = '5', licence_expiry = '2028-03-14' WHERE user_id = $1`, [w.mekdes.id]);
  await verifyCase('driver', w.mekdes.id, w.mekdes.id, 2, [
    { kind: 'driving_licence', number: 'AA-05-118 204', expiresInDays: 520 },
    { kind: 'fayda_id', number: '4129 8830 1175' },
    { kind: 'selfie', note: 'Face partly covered' },
  ]);
  await verifyCase('organization', w.ethioTextile.id, null, 3, [{ kind: 'trade_licence', number: 'HWS/4411/2016' }, { kind: 'tin_certificate', number: '0045512398' }]);
  const gojjamNew = await ds.getRepository(Vehicle).findOneByOrFail({ plate: '3-77310 AM' });
  await verifyCase('vehicle', gojjamNew.id, null, 4, [{ kind: 'libre', number: '3-77310 AM' }, { kind: 'insurance', expiresInDays: 300 }]);
  await verifyCase('driver', w.hailu.id, w.hailu.id, 5, [{ kind: 'driving_licence', number: 'DD-01-775 310', expiresInDays: 900 }, { kind: 'fayda_id', number: '8812 0034 9921' }, { kind: 'selfie' }]);
  await verifyCase('driver', w.nardos.id, w.nardos.id, 6, [{ kind: 'driving_licence', number: 'AA-03-445 612', expiresInDays: 30, note: 'Licence renewal' }, { kind: 'fayda_id', number: '2201 7745 0098' }, { kind: 'selfie' }]);
  await verifyCase('organization', w.abay.id, null, 24, [{ kind: 'trade_licence', number: 'AA/90321/2017' }, { kind: 'tin_certificate', number: '0067741120' }]);

  // Abebe's truck: papers approved, insurance expiring in 12 days (shows on the fleet board and his profile)
  const abebeCase = await ds.getRepository(VerificationCase).save(ds.getRepository(VerificationCase).create({ subjectType: 'vehicle', subjectId: w.abebe.vehicle!.id, status: 'approved', decidedBy: w.dawitM.id, decidedAt: k.hrs(-24 * 40), createdAt: k.hrs(-24 * 41) }));
  for (const [kind, exp] of [['libre', null], ['insurance', 12]] as const) {
    await ds.getRepository(VerificationDocument).save(ds.getRepository(VerificationDocument).create({ caseId: abebeCase.id, subjectType: 'vehicle', subjectId: w.abebe.vehicle!.id, kind, fileKey: await k.storeFile(5), number: kind === 'libre' ? '3-48213 AA' : null, expiresOn: exp === null ? null : new Date(k.now.getTime() + exp * 86_400_000).toISOString().slice(0, 10), status: 'approved', createdAt: k.hrs(-24 * 41) }));
  }

  // ───────────────────────── inbox, thread, notifications ─────────────────────────
  await ds.getRepository(InboundMessage).save([
    ds.getRepository(InboundMessage).create({ orgId: w.yonas.id, channel: 'telegram', fromName: 'Kassahun D.', fromPhone: ph(670), body: 'Truck 3-55102 free in Adama after 16:00, 7 t.', createdAt: k.hrs(-0.04) }),
    ds.getRepository(InboundMessage).create({ orgId: w.yonas.id, channel: 'call', fromName: 'Habesha Cement', fromPhone: ph(701), body: 'Need 2 more trucks to Hawassa tomorrow.', createdAt: k.hrs(-0.3) }),
    ds.getRepository(InboundMessage).create({ orgId: w.yonas.id, channel: 'sms', fromName: 'Meseret T.', fromPhone: ph(671), body: 'Empty back to Hawassa 13:00, 5 t', createdAt: k.hrs(-1.2) }),
  ]);

  const sh8817 = await ds.getRepository(Shipment).findOneByOrFail({ ref: 'RH-26-08817' });
  await ds.getRepository(ShipmentMessage).save([
    ds.getRepository(ShipmentMessage).create({ shipmentId: sh8817.id, senderName: 'Raha', senderLabel: 'Pickup confirmed with 2 photos', channel: 'system', body: 'Pickup confirmed with 2 photos', createdAt: k.hrs(-5.4) }),
    ds.getRepository(ShipmentMessage).create({ shipmentId: sh8817.id, senderUserId: w.daniel.user.id, senderName: 'Daniel Fikre', senderLabel: 'Driver', channel: 'app', body: 'All 16 sacks loaded. Leaving Addis after the cement is loaded, about 13:00.', createdAt: k.hrs(-5.3) }),
    ds.getRepository(ShipmentMessage).create({ shipmentId: sh8817.id, senderUserId: w.hanna.id, senderName: 'Hanna Girma', senderLabel: 'Sheba Agro PLC', channel: 'app', body: 'Thank you. Dawit at Piassa will receive. He has the PIN.', createdAt: k.hrs(-5.2) }),
    ds.getRepository(ShipmentMessage).create({ shipmentId: sh8817.id, senderUserId: w.daniel.user.id, senderName: 'Daniel Fikre', senderLabel: 'Driver', channel: 'sms', body: 'Weak signal after Meki. Next update Shashemene.', createdAt: k.hrs(-0.6) }),
  ]);

  const note = (userId: string, type: string, title: string, body: string, ageH: number, read = false, also: string[] = []) =>
    ds.getRepository(Notification).create({ userId, channel: 'in_app', type, title, body, status: read ? 'read' : 'sent', sentAt: k.hrs(-ageH), readAt: read ? k.hrs(-ageH + 0.1) : null, data: { alsoSent: also }, createdAt: k.hrs(-ageH) });
  await ds.getRepository(Notification).save([
    note(w.abebe.user.id, 'load.fits', 'New load fits your truck', '800 kg coffee · Addis → Hawassa · ETB 6,400', 0.03, false, ['Telegram']),
    note(w.abebe.user.id, 'trip.changed', 'Pickup time changed', 'Habesha Cement moved RH-26-08795 pickup to 15:30.', 1),
    note(w.abebe.user.id, 'payment.recorded', 'Payment recorded', 'ETB 9,800 for RH-26-08711 marked paid by Kebede Transport.', 26, true),
    note(w.abebe.user.id, 'verification.decided', 'Licence verified', 'Raha Operations approved your driving licence.', 24 * 4, true),
    note(w.hanna.id, 'match.offer', 'New offer for RH-26-08822', 'Selam Logistics can carry 800 kg Addis → Hawassa for ETB 10,400.', 0.2, false),
    note(w.hanna.id, 'trip.started', 'RH-26-08817 is on the road', 'Departed. Arrival at Hawassa about 17:45. The receiver has the delivery PIN.', 4.2, true),
  ]);

  // keep sequences ahead of the explicit refs used above
  await ds.query(`SELECT setval('shipment_ref_seq', GREATEST((SELECT last_value FROM shipment_ref_seq), 8850))`);
}
