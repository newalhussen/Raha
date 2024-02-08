import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { PaymentDto } from '@raha/contracts';
import { Ctx, RequirePermissions } from '../../common/decorators';
import type { RequestContext } from '../../common/request-context';
import { DisputePaymentDto, MarkPaidDto, PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payment:read')
  list(@Ctx() ctx: RequestContext, @Query('status') status?: 'pending' | 'paid' | 'all'): Promise<PaymentDto[]> {
    return this.payments.list(ctx, { status });
  }

  /** Mark a payment as received/paid. The money moved outside Raha (Telebirr, CBE, cash). */
  @Post(':id/paid')
  @RequirePermissions('payment:record')
  markPaid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkPaidDto): Promise<PaymentDto> {
    return this.payments.markPaid(ctx, id, dto);
  }

  @Post(':id/dispute')
  @RequirePermissions('payment:record')
  dispute(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisputePaymentDto): Promise<PaymentDto> {
    return this.payments.dispute(ctx, id, dto.reason);
  }
}
