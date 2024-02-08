import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { ReceiverController } from './receiver.controller';
import { ReceiverService } from './receiver.service';

@Module({
  imports: [TripsModule],
  controllers: [ReceiverController],
  providers: [ReceiverService],
})
export class ReceiverModule {}
