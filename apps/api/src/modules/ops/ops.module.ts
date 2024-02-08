import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { TripsModule } from '../trips/trips.module';
import { OpsController } from './ops.controller';
import { OpsDirectoryService } from './ops-directory.service';
import { OpsOverviewService } from './ops-overview.service';
import { OpsVerificationService } from './ops-verification.service';

@Module({
  imports: [FleetModule, MatchingModule, PaymentsModule, ShipmentsModule, TripsModule],
  controllers: [OpsController],
  providers: [OpsOverviewService, OpsDirectoryService, OpsVerificationService],
})
export class OpsModule {}
