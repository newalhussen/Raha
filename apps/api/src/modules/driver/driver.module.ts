import { Module } from '@nestjs/common';
import { CapacityModule } from '../capacity/capacity.module';
import { FleetModule } from '../fleet/fleet.module';
import { MatchingModule } from '../matching/matching.module';
import { TripsModule } from '../trips/trips.module';
import { DriverController, DriverOnboardingController } from './driver.controller';
import { DriverService } from './driver.service';

@Module({
  imports: [CapacityModule, FleetModule, MatchingModule, TripsModule],
  controllers: [DriverOnboardingController, DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
