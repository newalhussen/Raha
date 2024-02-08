import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CapacityPostDto } from '@raha/contracts';
import { Ctx, RequirePermissions } from '../../common/decorators';
import type { RequestContext } from '../../common/request-context';
import { PublishCapacityDto, UpdateCapacityDto } from './capacity.dto';
import { CapacityService } from './capacity.service';

@ApiTags('capacity')
@ApiBearerAuth()
@Controller('capacity')
export class CapacityController {
  constructor(private readonly capacity: CapacityService) {}

  /** Truck space the caller's fleet (or broker network) has published. */
  @Get()
  @RequirePermissions('capacity:publish')
  list(@Ctx() ctx: RequestContext, @Query('status') status?: 'active' | 'all', @Query('vehicleId') vehicleId?: string): Promise<CapacityPostDto[]> {
    return this.capacity.list(ctx, { status, vehicleId });
  }

  @Post()
  @RequirePermissions('capacity:publish')
  publish(@Ctx() ctx: RequestContext, @Body() dto: PublishCapacityDto): Promise<CapacityPostDto> {
    return this.capacity.publish(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions('capacity:publish')
  update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCapacityDto): Promise<CapacityPostDto> {
    return this.capacity.update(ctx, id, dto);
  }

  @Post(':id/close')
  @RequirePermissions('capacity:publish')
  close(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<CapacityPostDto> {
    return this.capacity.close(ctx, id);
  }
}
