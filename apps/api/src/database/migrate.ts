import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { loadEnv } from '../config/env';

/**
 * Minimal forward-only SQL migration runner.
 * Files in ./migrations are applied in lexical order, each inside a transaction,
 * and recorded in `schema_migrations`.
 */
export async function runMigrations(databaseUrl = loadEnv().databaseUrl, log: (m: string) => void = console.log): Promise<string[]> {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      log(`applying ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    if (applied.length === 0) log('database is up to date');
  } finally {
    await client.end();
  }
  return applied;
}

if (require.main === module) {
  runMigrations().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
