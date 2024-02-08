import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadEnv } from '../config/env';
import { buildDataSourceOptions } from './data-source';
import { ALL_ENTITIES } from './entities';

const repositories = TypeOrmModule.forFeature(ALL_ENTITIES);

/** One global module so any feature module can `@InjectRepository(Entity)` without re-registering it. */
@Global()
@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(loadEnv()) }), repositories],
  exports: [repositories],
})
export class DatabaseModule {}
