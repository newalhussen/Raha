import type { DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env';
import { ALL_ENTITIES } from './entities';
import { SnakeNamingStrategy } from './naming.strategy';

export function buildDataSourceOptions(env: Pick<Env, 'databaseUrl' | 'nodeEnv'>): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.databaseUrl,
    entities: ALL_ENTITIES,
    namingStrategy: new SnakeNamingStrategy(),
    // Schema is owned by the SQL migrations in ./migrations — never auto-sync.
    synchronize: false,
    logging: env.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
    extra: { max: 20, idleTimeoutMillis: 30_000 },
  };
}
