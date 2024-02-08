import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ReceiverPageDto } from '@raha/contracts';
import { Public } from '../../common/decorators';
import { ReceiverConfirmDto, ReceiverService } from './receiver.service';

/** Public: reached from the SMS link. Throttled hard because the only secret is the code in the URL. */
@ApiTags('receiver')
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public/receiver')
export class ReceiverController {
  constructor(private readonly receiver: ReceiverService) {}

  @Get(':code')
  page(@Param('code') code: string): Promise<ReceiverPageDto> {
    return this.receiver.page(code.toUpperCase());
  }

  @Post(':code/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(@Param('code') code: string, @Body() dto: ReceiverConfirmDto): Promise<ReceiverPageDto> {
    return this.receiver.confirm(code.toUpperCase(), dto);
  }
}
