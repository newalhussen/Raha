import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { DriverSummaryDto, VehicleDto } from '@raha/contracts';
import { Ctx, RequireOrgType, RequirePermissions } from '../../common/decorators';
import { requireOrg, type RequestContext } from '../../common/request-context';
import { CreateVehicleDto, SubmitVerificationDto, UpdateVehicleDto } from './fleet.dto';
import { FleetService } from './fleet.service';

@ApiTags('fleet')
@ApiBearerAuth()
@RequireOrgType('fleet')
@Controller('fleet')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('trucks')
  @RequirePermissions('fleet:trucks')
  trucks(@Ctx() ctx: RequestContext): Promise<VehicleDto[]> {
    return this.fleet.listVehicles(requireOrg(ctx).id);
  }

  @Post('trucks')
  @RequirePermissions('fleet:trucks')
  createTruck(@Ctx() ctx: RequestContext, @Body() dto: CreateVehicleDto): Promise<VehicleDto> {
    return this.fleet.createVehicle(ctx, requireOrg(ctx).id, dto);
  }

  @Patch('trucks/:id')
  @RequirePermissions('fleet:trucks')
  updateTruck(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto): Promise<VehicleDto> {
    return this.fleet.updateVehicle(ctx, requireOrg(ctx).id, id, dto);
  }

  @Post('trucks/:id/verification')
  @RequirePermissions('fleet:trucks')
  async submitTruck(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitVerificationDto) {
    const c = await this.fleet.submitVehicleVerification(ctx, requireOrg(ctx).id, id, dto);
    return { caseId: c.id, status: c.status };
  }

  @Get('drivers')
  @RequirePermissions('fleet:drivers')
  drivers(@Ctx() ctx: RequestContext): Promise<DriverSummaryDto[]> {
    return this.fleet.listDrivers(requireOrg(ctx).id);
  }

  @Post('drivers/:userId/verification')
  @RequirePermissions('fleet:drivers')
  async submitDriver(@Ctx() ctx: RequestContext, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: SubmitVerificationDto) {
    const c = await this.fleet.submitDriverVerification(ctx, requireOrg(ctx).id, userId, dto);
    return { caseId: c.id, status: c.status };
  }
}
