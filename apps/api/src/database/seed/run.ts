import { DataSource } from 'typeorm';
import { formatPhone } from '@raha/contracts';
import { loadEnv } from '../../config/env';
import { buildDataSourceOptions } from '../data-source';
import { buildWorld } from './cast';
import { buildHistory } from './history';
import { Kit } from './kit';
import { buildLive } from './live';

/** Everything except places/corridors (reference data lives in the migrations). */
const DATA_TABLES = [
  'audit_log', 'issue_comments', 'issues', 'inbound_messages', 'shipment_messages', 'notifications', 'payments', 'deliveries', 'proofs',
  'trip_checkins', 'trip_loads', 'matches', 'trips', 'capacity_posts', 'verification_documents', 'verification_cases', 'broker_network',
  'vehicles', 'driver_profiles', 'memberships', 'shipments', 'organizations', 'device_tokens', 'refresh_tokens', 'otp_codes', 'users',
];

export async function runSeed(): Promise<void> {
  const env = loadEnv();
  if (env.isProduction) throw new Error('Refusing to seed a production database');
  const ds = new DataSource(buildDataSourceOptions(env));
  await ds.initialize();
  const t0 = Date.now();
  try {
    console.log('Clearing sample data…');
    await ds.query(`TRUNCATE ${DATA_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    // history uses low reference numbers; the designed "today" shipments use RH-26-088xx
    await ds.query(`ALTER SEQUENCE shipment_ref_seq RESTART WITH 7000`);
    await ds.query(`ALTER SEQUENCE trip_ref_seq RESTART WITH 4000`);
    await ds.query(`ALTER SEQUENCE issue_ref_seq RESTART WITH 300`);

    const kit = new Kit(ds);
    console.log('People, companies and trucks…');
    const world = await buildWorld(kit);
    console.log('Eight weeks of history…');
    const hist = await buildHistory(kit, world);
    console.log(`  ${hist.trips} completed trips, ${hist.shipments} delivered shipments`);
    await ds.query(`ALTER SEQUENCE shipment_ref_seq RESTART WITH 8850`);
    console.log('Today…');
    await buildLive(kit, world);

    const [c] = await ds.query(`SELECT
      (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM organizations)::int AS orgs, (SELECT count(*) FROM vehicles)::int AS trucks,
      (SELECT count(*) FROM shipments)::int AS shipments, (SELECT count(*) FROM trips WHERE status = 'in_transit')::int AS on_road,
      (SELECT count(*) FROM shipments WHERE status = 'requested')::int AS open_loads, (SELECT count(*) FROM capacity_posts WHERE status = 'open')::int AS open_posts`);
    console.log(`\nSeeded in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${c.users} users, ${c.orgs} organizations, ${c.trucks} trucks, ${c.shipments} shipments;`);
    console.log(`today: ${c.on_road} trucks on the road, ${c.open_loads} open loads, ${c.open_posts} trucks with space.\n`);
    console.log('Sign in (SMS code is echoed in dev, or see GET /api/v1/dev/outbox):');
    console.log(`  Driver app     Abebe Kebede        ${formatPhone('+251911204418')}`);
    console.log(`  Shipper        Hanna Girma         ${formatPhone('+251911330207')}   (Sheba Agro PLC, staff)`);
    console.log(`  Broker         Yonas Molla         ${formatPhone('+251911000810')}   (Yonas Brokerage, owner)`);
    console.log(`  Fleet owner    Tesfaye Kebede      ${formatPhone('+251911000610')}   (Kebede Transport, owner)`);
    console.log('  Operations     tigist@raha.et / Raha-ops-2026!   (also dawit@, selam@, eden@raha.et)');
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  runSeed().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
