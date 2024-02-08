import { Module } from '@nestjs/common';
import { CapacityModule } from '../capacity/capacity.module';
import { FleetModule } from '../fleet/fleet.module';
import { TripsModule } from '../trips/trips.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { MatchingService } from './matching.service';
import { PricingService } from './pricing.service';

@Module({
  imports: [CapacityModule, FleetModule, TripsModule],
  controllers: [MatchesController],
  providers: [MatchingService, MatchesService, PricingService],
  exports: [MatchingService, MatchesService, PricingService],
})
export class MatchingModule {}
