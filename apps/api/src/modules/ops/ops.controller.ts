import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AuditEntryDto,
  IssueDetailDto,
  IssueDto,
  OpsMatchRowDto,
  OpsOrgRowDto,
  OpsOverviewDto,
  OpsTripDetailDto,
  OpsTripRowDto,
  OpsUserRowDto,
  Paged,
  PaymentDto,
  ShipmentDetailDto,
  ShipmentSummaryDto,
  TruckOptionDto,
  VehicleDto,
  VerificationCaseDto,
  VerificationQueueDto,
  VerificationSubject,
} from '@raha/contracts';
import { Ctx, RequirePermissions } from '../../common/decorators';
import type { RequestContext } from '../../common/request-context';
import { AuditLog, User } from '../../database/entities';
import { IssuesService, CommentDto, CreateIssueDto, UpdateIssueDto, type IssueQuery } from '../issues/issues.service';
import { MarkPaidDto, PaymentsService } from '../payments/payments.service';
import { CancelShipmentDto, ConfirmDeliveryDto } from '../shipments/shipments.dto';
import { ShipmentsService } from '../shipments/shipments.service';
import { AssignMatchDto, CreateStaffDto, ManualCheckinDto, OpsDirectoryService, ReviewDeliveryDto, UpdateOrgStatusDto, UpdateUserDto } from './ops-directory.service';
import { OpsOverviewService } from './ops-overview.service';
import { DecideDto, OpsVerificationService } from './ops-verification.service';
import { In } from 'typeorm';

/** Everything the internal Raha Operations app calls. Staff only — every route needs an `ops:*` permission. */
@ApiTags('ops')
@ApiBearerAuth()
@Controller('ops')
export class OpsController {
  constructor(
    private readonly overview: OpsOverviewService,
    private readonly verification: OpsVerificationService,
    private readonly directory: OpsDirectoryService,
    private readonly issues: IssuesService,
    private readonly shipments: ShipmentsService,
    private readonly payments: PaymentsService,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Nav badges: cheap counts only. */
  @Get('counts')
  @RequirePermissions('ops:read')
  async counts() {
    const o = await this.overview.counts();
    return o;
  }

  @Get('overview')
  @RequirePermissions('ops:read')
  getOverview(): Promise<OpsOverviewDto> {
    return this.overview.overview();
  }

  // ── verification ──

  @Get('verification')
  @RequirePermissions('ops:verify')
  queue(@Query('type') type?: VerificationSubject): Promise<VerificationQueueDto> {
    return this.verification.queue(type);
  }

  @Get('verification/:caseId')
  @RequirePermissions('ops:verify')
  verificationCase(@Ctx() ctx: RequestContext, @Param('caseId', ParseUUIDPipe) id: string): Promise<VerificationCaseDto> {
    return this.verification.detail(id, ctx);
  }

  @Post('verification/:caseId/decision')
  @RequirePermissions('ops:verify')
  decide(@Ctx() ctx: RequestContext, @Param('caseId', ParseUUIDPipe) id: string, @Body() dto: DecideDto): Promise<VerificationCaseDto> {
    return this.verification.decide(ctx, id, dto);
  }

  // ── shipments ──

  @Get('shipments')
  @RequirePermissions('ops:read')
  shipmentList(@Query('status') status?: string, @Query('q') q?: string, @Query('source') source?: string, @Query('page') page?: string): Promise<Paged<ShipmentSummaryDto>> {
    return this.directory.shipmentList({ status, q, source, page: page ? Number(page) : undefined });
  }

  @Get('shipments/:id')
  @RequirePermissions('ops:read')
  shipment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<ShipmentDetailDto> {
    return this.shipments.detail(ctx, id);
  }

  @Post('shipments/:id/resend-pin')
  @RequirePermissions('ops:support')
  @HttpCode(200)
  resendPin(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.directory.resendPin(ctx, id);
  }

  @Post('shipments/:id/cancel')
  @RequirePermissions('ops:support')
  cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelShipmentDto): Promise<ShipmentDetailDto> {
    return this.shipments.cancel(ctx, id, dto);
  }

  @Post('shipments/:id/confirm-delivery')
  @RequirePermissions('ops:support')
  confirmDelivery(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDeliveryDto): Promise<ShipmentDetailDto> {
    return this.shipments.confirmManually(ctx, id, dto);
  }

  @Post('deliveries/:shipmentId/review')
  @RequirePermissions('ops:support')
  @HttpCode(204)
  async reviewDelivery(@Ctx() ctx: RequestContext, @Param('shipmentId', ParseUUIDPipe) id: string, @Body() dto: ReviewDeliveryDto): Promise<void> {
    await this.directory.reviewDelivery(ctx, id, dto);
  }

  // ── matching ──

  @Get('matching')
  @RequirePermissions('ops:read')
  matchingQueue(): Promise<OpsMatchRowDto[]> {
    return this.directory.matchingQueue();
  }

  @Get('matching/:shipmentId/candidates')
  @RequirePermissions('ops:read')
  candidates(@Param('shipmentId', ParseUUIDPipe) id: string, @Query('detourKm') detourKm?: string): Promise<TruckOptionDto[]> {
    return this.directory.candidates(id, detourKm ? Math.min(Number(detourKm), 80) : 40);
  }

  @Post('matching/:shipmentId/assign')
  @RequirePermissions('ops:match')
  async assign(@Ctx() ctx: RequestContext, @Param('shipmentId', ParseUUIDPipe) id: string, @Body() dto: AssignMatchDto): Promise<ShipmentDetailDto> {
    await this.directory.assign(ctx, id, dto);
    return this.shipments.detail(ctx, id);
  }

  // ── trips ──

  @Get('trips')
  @RequirePermissions('ops:read')
  trips(@Query('status') status?: 'active' | 'late' | 'completed'): Promise<OpsTripRowDto[]> {
    return this.directory.tripList({ status });
  }

  @Get('trips/:id')
  @RequirePermissions('ops:read')
  trip(@Param('id', ParseUUIDPipe) id: string): Promise<OpsTripDetailDto> {
    return this.directory.tripDetail(id);
  }

  @Post('trips/:id/checkin')
  @RequirePermissions('ops:support')
  manualCheckin(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualCheckinDto): Promise<OpsTripDetailDto> {
    return this.directory.manualCheckin(ctx, id, dto);
  }

  // ── directory ──

  @Get('vehicles')
  @RequirePermissions('ops:read')
  vehicles(@Query('status') status?: string, @Query('verification') verification?: string, @Query('q') q?: string, @Query('page') page?: string): Promise<Paged<VehicleDto>> {
    return this.directory.vehicleList({ status, verification, q, page: page ? Number(page) : undefined });
  }

  @Get('organizations')
  @RequirePermissions('ops:read')
  orgs(@Query('type') type?: string, @Query('verification') verification?: string, @Query('q') q?: string, @Query('page') page?: string): Promise<Paged<OpsOrgRowDto>> {
    return this.directory.orgList({ type, verification, q, page: page ? Number(page) : undefined });
  }

  @Patch('organizations/:id')
  @RequirePermissions('ops:verify')
  @HttpCode(204)
  async orgStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrgStatusDto): Promise<void> {
    await this.directory.setOrgVerification(ctx, id, dto);
  }

  @Get('users')
  @RequirePermissions('ops:users')
  userList(@Query('q') q?: string, @Query('staff') staff?: string, @Query('status') status?: string, @Query('page') page?: string): Promise<Paged<OpsUserRowDto>> {
    return this.directory.userList({ q, staff: staff === undefined ? undefined : staff === 'true', status, page: page ? Number(page) : undefined });
  }

  @Get('users/:id')
  @RequirePermissions('ops:users')
  user(@Param('id', ParseUUIDPipe) id: string): Promise<OpsUserRowDto> {
    return this.directory.userDetail(id);
  }

  @Patch('users/:id')
  @RequirePermissions('ops:users')
  updateUser(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto): Promise<OpsUserRowDto> {
    return this.directory.updateUser(ctx, id, dto);
  }

  @Post('users')
  @RequirePermissions('ops:admin')
  createStaff(@Ctx() ctx: RequestContext, @Body() dto: CreateStaffDto): Promise<OpsUserRowDto> {
    return this.directory.createStaff(ctx, dto);
  }

  // ── support ──

  @Get('issues')
  @RequirePermissions('ops:read')
  issueList(@Query() q: IssueQuery): Promise<Paged<IssueDto>> {
    return this.issues.list({ ...q, page: q.page ? Number(q.page) : undefined });
  }

  @Get('issues/:id')
  @RequirePermissions('ops:read')
  issue(@Param('id', ParseUUIDPipe) id: string): Promise<IssueDetailDto> {
    return this.issues.detail(id);
  }

  @Post('issues')
  @RequirePermissions('ops:support')
  createIssue(@Ctx() ctx: RequestContext, @Body() dto: CreateIssueDto): Promise<IssueDto> {
    return this.issues.create(ctx, dto);
  }

  @Patch('issues/:id')
  @RequirePermissions('ops:support')
  updateIssue(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIssueDto): Promise<IssueDetailDto> {
    return this.issues.update(ctx, id, dto);
  }

  @Post('issues/:id/comments')
  @RequirePermissions('ops:support')
  comment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommentDto): Promise<IssueDetailDto> {
    return this.issues.comment(ctx, id, dto);
  }

  // ── money & audit ──

  @Get('payments')
  @RequirePermissions('ops:finance')
  paymentList(@Ctx() ctx: RequestContext, @Query('status') status?: 'pending' | 'paid' | 'all'): Promise<PaymentDto[]> {
    return this.payments.list(ctx, { status });
  }

  @Post('payments/:id/paid')
  @RequirePermissions('ops:finance')
  markPaid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkPaidDto): Promise<PaymentDto> {
    return this.payments.markPaid(ctx, id, dto);
  }

  @Get('audit')
  @RequirePermissions('ops:admin')
  async audit(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string, @Query('limit') limit?: string): Promise<AuditEntryDto[]> {
    const rows = await this.auditRepo.find({
      where: { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) },
      order: { createdAt: 'DESC' },
      take: Math.min(Number(limit) || 100, 300),
    });
    const actors = rows.length ? await this.users.find({ where: { id: In(rows.map((r) => r.actorId).filter((x): x is string => !!x)) }, select: ['id', 'fullName'] }) : [];
    const aMap = new Map(actors.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), actor: r.actorId ? aMap.get(r.actorId) ?? null : null, actorType: r.actorType, action: r.action, entityType: r.entityType, entityId: r.entityId, data: r.data }));
  }
}
