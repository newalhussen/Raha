import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadEnv } from './config/env';
import { AccessGuard } from './common/access.guard';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.service';
import { AuthModule } from './modules/auth/auth.module';
import { CapacityModule } from './modules/capacity/capacity.module';
import { ConsoleModule } from './modules/console/console.module';
import { DriverModule } from './modules/driver/driver.module';
import { FilesModule } from './modules/files/files.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { HealthController } from './modules/health/health.controller';
import { IssuesModule } from './modules/issues/issues.module';
import { MatchingModule } from './modules/matching/matching.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OpsModule } from './modules/ops/ops.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReceiverModule } from './modules/receiver/receiver.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { TripsModule } from './modules/trips/trips.module';
import { VerificationModule } from './modules/verification/verification.module';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: loadEnv().jwtSecret }) }),
    // rate limits are off under Jest so e2e suites can sign in many users in one minute
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }], skipIf: () => process.env.NODE_ENV === 'test' }),
    ScheduleModule.forRoot(),
    MessagingModule,
    AuditModule,
    ReferenceModule,
    FilesModule,
    NotificationsModule,
    VerificationModule,
    AuthModule,
    OrgsModule,
    FleetModule,
    CapacityModule,
    TripsModule,
    MatchingModule,
    PaymentsModule,
    ShipmentsModule,
    DriverModule,
    ConsoleModule,
    ReceiverModule,
    IssuesModule,
    OpsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
