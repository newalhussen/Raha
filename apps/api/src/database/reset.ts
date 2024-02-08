import { Client } from 'pg';
import { loadEnv } from '../config/env';
import { runMigrations } from './migrate';
import { runSeed } from './seed/run';

/** Development helper: drop everything, re-apply migrations, load sample data. */
async function main() {
  const env = loadEnv();
  if (env.isProduction) throw new Error('db:reset is disabled in production');
  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
  await runMigrations();
  await runSeed();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
