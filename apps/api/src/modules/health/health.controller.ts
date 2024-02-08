import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators';
import { MessagingService } from '../messaging/messaging.service';
import { loadEnv } from '../../config/env';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly db: DataSource,
    private readonly messaging: MessagingService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    const [{ postgis }] = await this.db.query<{ postgis: string }[]>('select postgis_version() as postgis');
    return { status: 'ok', time: new Date().toISOString(), postgis };
  }

  /** Development only: what the "SMS gateway" and "Telegram" would have sent (OTP codes, receiver PINs…). */
  @Public()
  @Get('dev/outbox')
  outbox() {
    if (loadEnv().isProduction) return { items: [] };
    return { items: this.messaging.recent(50) };
  }
}
