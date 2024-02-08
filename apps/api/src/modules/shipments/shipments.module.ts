import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { TripsModule } from '../trips/trips.module';
import { MessagesService } from './messages.service';
import { ShipmentViewService } from './shipment-view.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  imports: [FleetModule, MatchingModule, PaymentsModule, TripsModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService, ShipmentViewService, MessagesService],
  exports: [ShipmentsService, ShipmentViewService, MessagesService],
})
export class ShipmentsModule {}
