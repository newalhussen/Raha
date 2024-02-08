import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { hatchPng } from '../src/database/seed/png';

/**
 * The whole freight lifecycle through the real HTTP API and database:
 * sign-up → verification by Raha Operations → publish space → book → accept → trip → PIN delivery → payment,
 * plus the guarantees that matter: capacity can't be double-booked, strangers can't read shipments, retries are harmless.
 *
 * Every run creates its own people (random phone numbers) so it can be repeated against the same database.
 */
let app: INestApplication;

const phone = () => `+2519${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

interface Res<T = any> { status: number; body: T }
async function call<T = any>(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, o: { token?: string; org?: string; body?: unknown } = {}): Promise<Res<T>> {
  let r = request(app.getHttpServer())[method](`/api/v1${path}`);
  if (o.token) r = r.set('authorization', `Bearer ${o.token}`);
  if (o.org) r = r.set('x-org-id', o.org);
  const res = await (o.body !== undefined ? r.send(o.body as object) : r);
  return { status: res.status, body: res.body };
}

async function signIn(number: string, appName: 'web' | 'driver', name?: string) {
  const req = await call('post', '/auth/otp/request', { body: { phone: number, app: appName } });
  expect(req.status).toBe(200);
  const ver = await call('post', '/auth/otp/verify', { body: { phone: number, code: req.body.devCode, app: appName } });
  expect(ver.status).toBe(200);
  const token = ver.body.tokens.accessToken as string;
  if (name) await call('patch', '/me', { token, body: { fullName: name } });
  return { token, userId: ver.body.user.id as string, session: ver.body };
}

const iso = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

let staff: string;
const places: Record<string, string> = {};

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configureApp(app);
  await app.init();

  const login = await call('post', '/auth/staff/login', { body: { email: 'tigist@raha.et', password: 'Raha-ops-2026!' } });
  expect(login.status).toBe(200);
  staff = login.body.tokens.accessToken;
  const list = await call('get', '/places?limit=100');
  for (const p of list.body) places[p.code] = p.id;
});

afterAll(async () => {
  await app.close();
});

describe('freight lifecycle', () => {
  // actors, filled in as the story progresses
  const A: Record<string, any> = {};

  it('a fleet owner-operator signs up, adds a truck and Raha Operations verifies it', async () => {
    const number = phone();
    const owner = await signIn(number, 'web', 'Test Trucker');
    A.ownerPhone = number;
    const org = await call('post', '/orgs', { token: owner.token, body: { type: 'fleet', name: `Test Haulage ${number.slice(-4)}`, city: 'Adama' } });
    expect(org.status).toBe(201);
    const orgId = org.body.memberships.find((m: any) => m.organizationType === 'fleet').organizationId;
    A.fleetOrg = orgId;
    A.ownerToken = owner.token;
    A.ownerId = owner.userId;

    const plate = `3-${Math.floor(10000 + Math.random() * 89999)} TT`;
    const truck = await call('post', '/fleet/trucks', { token: owner.token, org: orgId, body: { plate, makeModel: 'Isuzu FSR', bodyType: 'dry_box', maxLoadKg: 10000, driverUserId: owner.userId } });
    expect(truck.status).toBe(201);
    expect(truck.body.verification).toBe('unverified');
    A.vehicleId = truck.body.id;

    // can't publish space for an unverified truck
    const early = await call('post', '/capacity', { token: owner.token, org: orgId, body: { vehicleId: A.vehicleId, originPlaceId: places.ADD, destinationPlaceId: places.HWS, departsAt: iso(3), committedKg: 3000, kind: 'on_route' } });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('vehicle_not_verified');

    // documents → ops queue → approve
    const vDocs = await call('post', `/fleet/trucks/${A.vehicleId}/verification`, { token: owner.token, org: orgId, body: { documents: [{ kind: 'libre', number: plate }, { kind: 'insurance', expiresOn: '2027-06-30' }] } });
    expect(vDocs.status).toBe(201);
    const dDocs = await call('post', `/fleet/drivers/${owner.userId}/verification`, { token: owner.token, org: orgId, body: { documents: [{ kind: 'driving_licence', number: 'AA-01-123 456', expiresOn: '2029-01-01' }, { kind: 'fayda_id', number: '1234 5678 9012' }, { kind: 'selfie' }] } });
    expect(dDocs.status).toBe(201);

    const queue = await call('get', '/ops/verification', { token: staff });
    expect(queue.body.items.map((i: any) => i.caseId)).toEqual(expect.arrayContaining([vDocs.body.caseId, dDocs.body.caseId]));
    for (const caseId of [vDocs.body.caseId, dDocs.body.caseId]) {
      const detail = await call('get', `/ops/verification/${caseId}`, { token: staff });
      expect(detail.status).toBe(200);
      const decision = await call('post', `/ops/verification/${caseId}/decision`, { token: staff, body: { decision: 'approve' } });
      expect(decision.status).toBe(201);
    }
    const trucks = await call('get', '/fleet/trucks', { token: owner.token, org: orgId });
    expect(trucks.body[0].verification).toBe('verified');
  });

  it('a shipper signs up and the matching engine finds nothing yet for an off-route load', async () => {
    const number = phone();
    const s = await signIn(number, 'web', 'Test Shipper');
    const org = await call('post', '/orgs', { token: s.token, body: { type: 'shipper', name: `Test Coffee ${number.slice(-4)}`, city: 'Addis Ababa' } });
    A.shipperOrg = org.body.memberships.find((m: any) => m.organizationType === 'shipper').organizationId;
    A.shipperToken = s.token;

    const preview = await call('post', '/shipments/preview-options', {
      token: s.token, org: A.shipperOrg,
      body: { pickupPlaceId: places.ADD, dropoffPlaceId: places.JIM, cargoType: 'coffee', weightKg: 40, readyAt: iso(2) },
    });
    expect(preview.status).toBe(201);
    expect(preview.body.distanceKm).toBeGreaterThan(300);
  });

  it('the fleet publishes space; the shipper sees it ranked, books it, and the capacity bar adds up', async () => {
    const post = await call('post', '/capacity', { token: A.ownerToken, org: A.fleetOrg, body: { vehicleId: A.vehicleId, originPlaceId: places.ADD, destinationPlaceId: places.HWS, departsAt: iso(4), committedKg: 7000, kind: 'on_route' } });
    expect(post.status).toBe(201);
    expect(post.body.freeKg).toBe(3000);
    expect(post.body.bar).toMatchObject({ totalKg: 10000, inkKg: 7000, amberKg: 0, freeKg: 3000 });
    A.postId = post.body.id;

    // an overlapping duplicate is refused
    const dup = await call('post', '/capacity', { token: A.ownerToken, org: A.fleetOrg, body: { vehicleId: A.vehicleId, originPlaceId: places.ADD, destinationPlaceId: places.SHA, departsAt: iso(5), kind: 'on_route', committedKg: 1000 } });
    expect(dup.status).toBe(409);

    const ship = await call('post', '/shipments', {
      token: A.shipperToken, org: A.shipperOrg,
      body: {
        pickupPlaceId: places.ADD, pickupAddress: 'Bole Bulbula warehouse', dropoffPlaceId: places.HWS, dropoffAddress: 'Piassa, Hawassa', receiverName: 'Dawit Alemu', receiverPhone: '0916552090',
        cargoType: 'coffee', pieces: 16, weightKg: 800, volumeM3: 2.4, readyAt: iso(2),
      },
    });
    expect(ship.status).toBe(201);
    expect(ship.body.status).toBe('requested');
    expect(ship.body.ref).toMatch(/^RH-\d{2}-\d{5}$/);
    A.shipmentId = ship.body.id;
    A.receiverLink = ship.body.receiverLink;

    const options = await call('get', `/shipments/${A.shipmentId}/options`, { token: A.shipperToken, org: A.shipperOrg });
    const ours = options.body.find((o: any) => o.capacityPostId === A.postId);
    expect(ours).toBeDefined();
    expect(ours.fit).toBe('same_trip');
    expect(ours.priceEtb).toBeGreaterThan(0);
    expect(ours.bar).toMatchObject({ inkKg: 7000, amberKg: 800, freeKg: 2200 });
    expect(ours.savingsPct).toBeGreaterThan(0);

    const booked = await call('post', `/shipments/${A.shipmentId}/book`, { token: A.shipperToken, org: A.shipperOrg, body: { capacityPostId: A.postId } });
    expect(booked.status).toBe(201);
    expect(booked.body.matches[0]).toMatchObject({ status: 'pending_carrier', proposedBy: 'shipper' });
    A.matchId = booked.body.matches[0].id;
    A.price = booked.body.matches[0].priceEtb;

    // booking twice is refused
    const again = await call('post', `/shipments/${A.shipmentId}/book`, { token: A.shipperToken, org: A.shipperOrg, body: { capacityPostId: A.postId } });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_proposed');
  });

  it('strangers cannot see the shipment; the shipper cannot answer their own request', async () => {
    const stranger = await signIn(phone(), 'web', 'Nosy Parker');
    const org = await call('post', '/orgs', { token: stranger.token, body: { type: 'shipper', name: 'Other Shipper' } });
    const orgId = org.body.memberships[0].organizationId;
    const peek = await call('get', `/shipments/${A.shipmentId}`, { token: stranger.token, org: orgId });
    expect(peek.status).toBe(403);
    const none = await call('get', `/shipments/${A.shipmentId}`);
    expect(none.status).toBe(401);
    const selfAccept = await call('post', `/matches/${A.matchId}/accept`, { token: A.shipperToken, org: A.shipperOrg });
    expect(selfAccept.status).toBe(403);
  });

  it('the driver sees the offer in the app, accepts it, and a trip is created with the PIN held by the server', async () => {
    // the same person now opens the driver app; skip the 30 s "too soon" wait between codes
    await app.get(DataSource).query('DELETE FROM otp_codes WHERE phone = $1', [A.ownerPhone]);
    const driver = await signIn(A.ownerPhone, 'driver');
    A.driverToken = driver.token;
    const home = await call('get', '/driver/home', { token: driver.token });
    expect(home.status).toBe(200);
    expect(home.body.route.freeKg).toBe(3000);
    expect(home.body.suggestion.count).toBeGreaterThanOrEqual(1);

    const loads = await call('get', '/driver/loads?mode=route', { token: driver.token });
    const mine = loads.body.find((l: any) => l.shipmentId === A.shipmentId);
    expect(mine).toBeDefined();
    expect(mine.myMatch.status).toBe('pending_carrier');

    const accept = await call('post', `/driver/loads/${A.shipmentId}/accept`, { token: driver.token });
    expect(accept.status).toBe(201);
    expect(accept.body.state).toBe('confirmed');
    A.tripId = accept.body.tripId;

    const detail = await call('get', `/shipments/${A.shipmentId}`, { token: A.shipperToken, org: A.shipperOrg });
    expect(detail.body.status).toBe('matched');
    expect(detail.body.priceEtb).toBe(A.price);
    expect(detail.body.bar).toMatchObject({ amberKg: 800 });

    // capacity accounting moved
    const post = await call('get', '/capacity', { token: A.ownerToken, org: A.fleetOrg });
    expect(post.body[0]).toMatchObject({ matchedKg: 800, freeKg: 2200 });
  });

  it('runs the trip: arrive → pickup (photo) → start → check-ins (idempotent) → receiver page shows the PIN', async () => {
    const t = A.driverToken as string;
    const trip = await call('get', `/driver/trips/${A.tripId}`, { token: t });
    expect(trip.status).toBe(200);
    expect(trip.body.next.type).toBe('go_to_pickup');
    const loadId = trip.body.loads[0].loadId;
    expect(trip.body.loads[0].pinCheck).toBeNull(); // PIN digest is withheld until cargo is aboard

    expect((await call('post', `/driver/trips/${A.tripId}/begin`, { token: t })).status).toBe(201);
    const arrived = await call('post', `/driver/trips/${A.tripId}/loads/${loadId}/arrive`, { token: t, body: {} });
    expect(arrived.body.next.type).toBe('confirm_pickup');

    // pickup needs a photo and a count
    const bad = await call('post', `/driver/trips/${A.tripId}/loads/${loadId}/pickup`, { token: t, body: { counted: false, noDamage: true, waybill: true, photoKeys: ['x'] } });
    expect(bad.status).toBe(400);
    const up = await request(app.getHttpServer()).post('/api/v1/uploads').set('authorization', `Bearer ${t}`).attach('file', hatchPng(120, 80), { filename: 'pickup.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const picked = await call('post', `/driver/trips/${A.tripId}/loads/${loadId}/pickup`, { token: t, body: { counted: true, noDamage: true, waybill: true, photoKeys: [up.body.key], actionId: 'e2e-pickup-1' } });
    expect(picked.status).toBe(201);
    expect(picked.body.next.type).toBe('start_trip');
    expect(picked.body.loads[0].pinCheck).toMatchObject({ salt: expect.any(String), digest: expect.stringMatching(/^[0-9a-f]{64}$/) });

    // replaying the same pickup is harmless
    expect((await call('post', `/driver/trips/${A.tripId}/loads/${loadId}/pickup`, { token: t, body: { counted: true, noDamage: true, waybill: true, photoKeys: [up.body.key], actionId: 'e2e-pickup-1' } })).status).toBe(201);

    const started = await call('post', `/driver/trips/${A.tripId}/start`, { token: t, body: {} });
    expect(started.status).toBe(201);
    expect(started.body.status).toBe('in_transit');
    expect(started.body.next.type).toBe('check_in');
    A.loadId = loadId;

    const shipment = await call('get', `/shipments/${A.shipmentId}`, { token: A.shipperToken, org: A.shipperOrg });
    expect(shipment.body.status).toBe('in_transit');

    // the receiver was texted a PIN — twice (English + Amharic) — and the page shows it
    const outbox = await request(app.getHttpServer()).get('/api/v1/dev/outbox');
    await new Promise((r) => setTimeout(r, 6500)); // let the delivery worker drain the queue
    const outbox2 = await request(app.getHttpServer()).get('/api/v1/dev/outbox');
    const pinSms = (outbox2.body.items as any[]).find((m) => m.to === '+251916552090' && /PIN: \d{4}/.test(m.body));
    expect(outbox.status).toBe(200);
    expect(pinSms).toBeDefined();
    const code = A.receiverLink.split('/r/')[1];
    const page = await call('get', `/public/receiver/${code}`);
    expect(page.status).toBe(200);
    expect(page.body.status).toBe('in_transit');
    expect(page.body.pin).toMatch(/^\d{4}$/);
    expect(pinSms.body).toContain(page.body.pin);
    A.pin = page.body.pin;

    // check-ins: Mojo twice (same client id = one record), then wrong town is refused
    const clientId = '3f1d6a52-7a1e-4e1b-9d77-0a9c11c2e001';
    const c1 = await call('post', `/driver/trips/${A.tripId}/checkins`, { token: t, body: { placeId: places.MOJ, clientId, offline: true } });
    expect(c1.status).toBe(201);
    const c2 = await call('post', `/driver/trips/${A.tripId}/checkins`, { token: t, body: { placeId: places.MOJ, clientId, offline: true } });
    expect(c2.status).toBe(201);
    expect(c2.body.checkins.filter((c: any) => c.placeId === places.MOJ)).toHaveLength(1);
    const wrong = await call('post', `/driver/trips/${A.tripId}/checkins`, { token: t, body: { placeId: places.DJI, clientId: '3f1d6a52-7a1e-4e1b-9d77-0a9c11c2e002' } });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('not_on_route');

    const atDest = await call('post', `/driver/trips/${A.tripId}/checkins`, { token: t, body: { placeId: places.HWS, clientId: '3f1d6a52-7a1e-4e1b-9d77-0a9c11c2e003' } });
    expect(atDest.body.next.type).toBe('deliver');
  });

  it('delivers with the PIN: wrong PIN is rejected and counted, right PIN completes, pays the carrier and closes the trip', async () => {
    const t = A.driverToken as string;
    const wrongPin = A.pin === '0000' ? '1111' : '0000';
    const bad = await call('post', `/driver/trips/${A.tripId}/loads/${A.loadId}/deliver`, { token: t, body: { pin: wrongPin, condition: 'all_good' } });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('pin_wrong');
    expect(bad.body.details.attemptsLeft).toBe(4);

    const photo = await request(app.getHttpServer()).post('/api/v1/uploads').set('authorization', `Bearer ${t}`).attach('file', hatchPng(120, 80), { filename: 'drop.png', contentType: 'image/png' });
    const ok = await call('post', `/driver/trips/${A.tripId}/loads/${A.loadId}/deliver`, { token: t, body: { pin: A.pin, condition: 'all_good', photoKey: photo.body.key } });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('completed');
    expect(ok.body.summary.totalEtb).toBe(A.price);

    // idempotent replay (e.g. the phone retried after a dropped response)
    const replay = await call('post', `/driver/trips/${A.tripId}/loads/${A.loadId}/deliver`, { token: t, body: { pin: A.pin, condition: 'all_good', photoKey: photo.body.key } });
    expect(replay.status).toBe(201);

    const shipment = await call('get', `/shipments/${A.shipmentId}`, { token: A.shipperToken, org: A.shipperOrg });
    expect(shipment.body.status).toBe('delivered');
    expect(shipment.body.delivery).toMatchObject({ confirmedBy: 'pin', pinVerified: true, condition: 'all_good' });
    expect(shipment.body.proofs.map((p: any) => p.kind)).toEqual(expect.arrayContaining(['pickup_photo', 'delivery_photo']));
    expect(shipment.body.payment).toMatchObject({ status: 'pending', amountEtb: A.price });
    A.paymentId = shipment.body.payment.id;

    const page = await call('get', `/public/receiver/${A.receiverLink.split('/r/')[1]}`);
    expect(page.body.status).toBe('delivered');
    expect(page.body.pin).toBeNull(); // the PIN is never shown after delivery
  });

  it('the carrier records the payment; the driver’s earnings and the fleet board reflect it', async () => {
    const paid = await call('post', `/payments/${A.paymentId}/paid`, { token: A.ownerToken, org: A.fleetOrg, body: { method: 'telebirr', reference: 'TB1234567' } });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({ status: 'paid', method: 'telebirr', amountEtb: A.price });

    const earnings = await call('get', '/driver/earnings?period=week', { token: A.driverToken });
    expect(earnings.body.totalEtb).toBeGreaterThanOrEqual(A.price);
    expect(earnings.body.items[0]).toMatchObject({ status: 'paid', methodLabel: 'Telebirr' });

    const board = await call('get', '/fleet/board', { token: A.ownerToken, org: A.fleetOrg });
    expect(board.body.recordedMonthEtb).toBeGreaterThanOrEqual(A.price);
    expect(board.body.trucks[0].status).toBe('available');
  });

  it('never double-books capacity: two 3 t loads race for 5 t of space, exactly one wins', async () => {
    // fresh post with 5 t free
    const post = await call('post', '/capacity', { token: A.ownerToken, org: A.fleetOrg, body: { vehicleId: A.vehicleId, originPlaceId: places.ADD, destinationPlaceId: places.HWS, departsAt: iso(30), committedKg: 5000, kind: 'on_route' } });
    expect(post.status).toBe(201);
    const mk = async () => {
      const s = await call('post', '/shipments', {
        token: A.shipperToken, org: A.shipperOrg,
        body: { pickupPlaceId: places.ADD, pickupAddress: 'Warehouse A', dropoffPlaceId: places.HWS, dropoffAddress: 'Hawassa market', receiverName: 'Race Receiver', receiverPhone: '0911000111', cargoType: 'building', weightKg: 3000, readyAt: iso(28) },
      });
      expect(s.status).toBe(201);
      const b = await call('post', `/shipments/${s.body.id}/book`, { token: A.shipperToken, org: A.shipperOrg, body: { capacityPostId: post.body.id } });
      expect(b.status).toBe(201);
      return b.body.matches[0].id as string;
    };
    const [m1, m2] = [await mk(), await mk()];
    const results = await Promise.all([m1, m2].map((id) => call('post', `/matches/${id}/accept`, { token: A.driverToken })));
    const wins = results.filter((r) => r.status === 201).length;
    expect(wins).toBe(1);
    const loser = results.find((r) => r.status !== 201)!;
    expect(loser.status).toBe(409);
    expect(['capacity_exceeded', 'shipment_not_open', 'does_not_fit']).toContain(loser.body.code);

    const after = await call('get', '/capacity', { token: A.ownerToken, org: A.fleetOrg });
    const p = after.body.find((x: any) => x.id === post.body.id);
    expect(p.matchedKg).toBe(3000);
    expect(p.matchedKg + p.committedKg).toBeLessThanOrEqual(10000);
  });

  it('ops can see it all: the shipment, the trip, and the audit trail', async () => {
    const detail = await call('get', `/ops/shipments/${A.shipmentId}`, { token: staff });
    expect(detail.status).toBe(200);
    expect(detail.body.timeline.map((e: any) => e.label)).toEqual(expect.arrayContaining(['Shipment requested', 'Truck booked', 'Delivered', 'Payment recorded']));
    const audit = await call('get', `/ops/audit?entityType=shipment&entityId=${A.shipmentId}`, { token: staff });
    expect(audit.body.map((a: any) => a.action)).toEqual(expect.arrayContaining(['shipment.create', 'delivery.confirm']));
    // a non-staff token cannot reach ops
    const denied = await call('get', '/ops/overview', { token: A.shipperToken });
    expect(denied.status).toBe(403);
  });
});
