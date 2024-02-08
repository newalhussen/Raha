import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  DriverEarningsDto,
  DriverHomeDto,
  DriverLoadDetailDto,
  DriverLoadDto,
  DriverProfileDto,
  DriverTripDetailDto,
  DriverTripSummaryDto,
  DriverVehicleDto,
  ReturnLoadsDto,
  SyncResult,
} from '@raha/contracts';
import { Ctx, RequireDriver } from '../../common/decorators';
import type { RequestContext } from '../../common/request-context';
import { FleetService } from '../fleet/fleet.service';
import { SubmitVerificationDto } from '../fleet/fleet.dto';
import { VerificationService } from '../verification/verification.service';
import { badRequest } from '../../common/errors';
import {
  AtDto,
  AvailabilityDto,
  CheckinDto,
  DeclineLoadDto,
  DeliverDto,
  OnboardDto,
  PickupDto,
  RegisterTruckDto,
  ReportIssueDto,
  ReturnAlertsDto,
  SetLoadedDto,
  SyncDto,
} from './driver.dto';
import { DriverService } from './driver.service';

/** First-run endpoints: usable before a driver profile exists. */
@ApiTags('driver')
@ApiBearerAuth()
@Controller('driver')
export class DriverOnboardingController {
  constructor(
    private readonly driver: DriverService,
    private readonly verification: VerificationService,
  ) {}

  @Post('onboard')
  @HttpCode(204)
  async onboard(@Ctx() ctx: RequestContext, @Body() dto: OnboardDto): Promise<void> {
    await this.driver.onboard(ctx, dto);
  }

  /** The driver hands in licence, Fayda ID and selfie for Raha Operations to check. */
  @Post('verification')
  @RequireDriver()
  async submitVerification(@Ctx() ctx: RequestContext, @Body() dto: SubmitVerificationDto) {
    const allowed = new Set(['driving_licence', 'fayda_id', 'selfie']);
    if (dto.documents.some((d) => !allowed.has(d.kind))) throw badRequest('wrong_documents', 'Send your driving licence, Fayda ID and a selfie');
    const c = await this.verification.submit(ctx, 'driver', ctx.userId, dto.documents);
    return { caseId: c.id, status: c.status };
  }
}

/** Everything the Raha Driver app needs. */
@ApiTags('driver')
@ApiBearerAuth()
@RequireDriver()
@Controller('driver')
export class DriverController {
  constructor(
    private readonly driver: DriverService,
    private readonly fleet: FleetService,
  ) {}

  @Get('home')
  home(@Ctx() ctx: RequestContext): Promise<DriverHomeDto> {
    return this.driver.home(ctx.userId);
  }

  @Put('availability')
  @HttpCode(204)
  async availability(@Ctx() ctx: RequestContext, @Body() dto: AvailabilityDto): Promise<void> {
    await this.driver.setAvailability(ctx.userId, dto.available);
  }

  @Put('return-alerts')
  @HttpCode(204)
  async returnAlerts(@Ctx() ctx: RequestContext, @Body() dto: ReturnAlertsDto): Promise<void> {
    await this.driver.setReturnAlerts(ctx.userId, dto.on);
  }

  // ── loads ──

  @Get('loads')
  loads(@Ctx() ctx: RequestContext, @Query('mode') mode?: 'route' | 'near' | 'all'): Promise<DriverLoadDto[]> {
    return this.driver.loads(ctx.userId, mode ?? 'route');
  }

  @Get('loads/:shipmentId')
  loadDetail(@Ctx() ctx: RequestContext, @Param('shipmentId', ParseUUIDPipe) shipmentId: string): Promise<DriverLoadDetailDto> {
    return this.driver.loadDetail(ctx.userId, shipmentId);
  }

  @Post('loads/:shipmentId/accept')
  accept(@Ctx() ctx: RequestContext, @Param('shipmentId', ParseUUIDPipe) shipmentId: string) {
    return this.driver.acceptLoad(ctx, shipmentId);
  }

  @Post('loads/:shipmentId/decline')
  @HttpCode(204)
  async decline(@Ctx() ctx: RequestContext, @Param('shipmentId', ParseUUIDPipe) shipmentId: string, @Body() dto: DeclineLoadDto): Promise<void> {
    await this.driver.declineLoad(ctx, shipmentId, dto.reason);
  }

  @Get('return-loads')
  returnLoads(@Ctx() ctx: RequestContext): Promise<ReturnLoadsDto> {
    return this.driver.returnLoads(ctx.userId);
  }

  // ── trips ──

  @Get('trips')
  trips(@Ctx() ctx: RequestContext, @Query('state') state?: 'active' | 'completed'): Promise<DriverTripSummaryDto[]> {
    return this.driver.tripList(ctx.userId, state === 'completed' ? 'completed' : 'active');
  }

  @Get('trips/:tripId')
  trip(@Ctx() ctx: RequestContext, @Param('tripId', ParseUUIDPipe) tripId: string): Promise<DriverTripDetailDto> {
    return this.driver.tripDetail(ctx.userId, tripId);
  }

  @Post('trips/:tripId/begin')
  begin(@Ctx() ctx: RequestContext, @Param('tripId', ParseUUIDPipe) tripId: string): Promise<DriverTripDetailDto> {
    return this.driver.begin(ctx.userId, tripId);
  }

  @Post('trips/:tripId/loads/:loadId/arrive')
  arrive(@Ctx() ctx: RequestContext, @Param('tripId', ParseUUIDPipe) tripId: string, @Param('loadId', ParseUUIDPipe) loadId: string, @Body() dto: AtDto): Promise<DriverTripDetailDto> {
    return this.driver.arrive(ctx.userId, tripId, loadId, dto.at);
  }

  @Post('trips/:tripId/loads/:loadId/pickup')
  pickup(@Ctx() ctx: RequestContext, @Param('tripId', ParseUUIDPipe) tripId: string, @Param('loadId', ParseUUIDPipe) loadId: string, @Body() dto: PickupDto): Promise<DriverTripDetailDto> {
    return this.driver.pickup(ctx.userId, tripId, loadId, dto);
  }

  @Post('trips/:tripId/start')
  start(@Ctx() ctx: RequestContext, @Param('tripId', ParseUUIDPipe) tripId: string, @Body() dto: AtDto): Promise<DriverTripDetailDto> {
    return this.driver.start(ctx.userId, tripId, dto.at);
  }

  @Post('trips/:tripId/checkins')
  checkin(@Ctx() ctx: RequestContext, @Param('tripId', ParseUUIDPipe) tripId: string, @Body() dto: CheckinDto): Promise<DriverTripDetailDto> {
    return this.driver.checkin(ctx.userId, tripId, dto);
  }

  @Post('trips/:tripId/loads/:loadId/deliver')
  deliver(@Ctx() ctx: RequestContext, @Param('tripId', ParseUUIDPipe) tripId: string, @Param('loadId', ParseUUIDPipe) loadId: string, @Body() dto: DeliverDto): Promise<DriverTripDetailDto> {
    return this.driver.deliver(ctx.userId, tripId, loadId, dto);
  }

  @Post('trips/:tripId/issues')
  report(@Ctx() ctx: RequestContext, @Param('tripId', ParseUUIDPipe) tripId: string, @Body() dto: ReportIssueDto) {
    return this.driver.reportIssue(ctx.userId, tripId, dto);
  }

  /** Replay the actions queued while offline. Returns one result per action; never fails the whole batch. */
  @Post('sync')
  @HttpCode(200)
  async sync(@Ctx() ctx: RequestContext, @Body() dto: SyncDto): Promise<{ results: SyncResult[] }> {
    return { results: await this.driver.sync(ctx.userId, dto.actions) };
  }

  // ── money, profile, truck ──

  @Get('earnings')
  earnings(@Ctx() ctx: RequestContext, @Query('period') period?: 'week' | 'month' | 'year'): Promise<DriverEarningsDto> {
    return this.driver.earnings(ctx.userId, period ?? 'month');
  }

  @Get('profile')
  profile(@Ctx() ctx: RequestContext): Promise<DriverProfileDto> {
    return this.driver.profile(ctx.userId);
  }

  @Get('vehicle')
  vehicle(@Ctx() ctx: RequestContext): Promise<DriverVehicleDto | null> {
    return this.driver.vehicle(ctx.userId);
  }

  @Patch('vehicle/load')
  setLoaded(@Ctx() ctx: RequestContext, @Body() dto: SetLoadedDto): Promise<DriverVehicleDto> {
    return this.driver.setLoaded(ctx.userId, dto.loadedKg);
  }

  @Post('truck')
  registerTruck(@Ctx() ctx: RequestContext, @Body() dto: RegisterTruckDto): Promise<DriverVehicleDto> {
    return this.driver.registerTruck(ctx, dto);
  }
}
