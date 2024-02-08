import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';

@Module({
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
