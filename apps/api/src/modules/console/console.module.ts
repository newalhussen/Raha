import { Module } from '@nestjs/common';
import { CapacityModule } from '../capacity/capacity.module';
import { FleetModule } from '../fleet/fleet.module';
import { MatchingModule } from '../matching/matching.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { TripsModule } from '../trips/trips.module';
import { BrokerService } from './broker.service';
import { BrokerController, FleetConsoleController } from './console.controller';
import { FleetConsoleService } from './fleet-console.service';

/** Data behind the fleet and broker consoles of the web app. */
@Module({
  imports: [CapacityModule, FleetModule, MatchingModule, ShipmentsModule, TripsModule],
  controllers: [FleetConsoleController, BrokerController],
  providers: [FleetConsoleService, BrokerService],
  exports: [FleetConsoleService, BrokerService],
})
export class ConsoleModule {}
