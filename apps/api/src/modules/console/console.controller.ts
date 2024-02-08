import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  BoardTruckDto,
  BrokerBoardDto,
  BrokerCountsDto,
  BrokerShipperDto,
  BrokerTripRowDto,
  FleetBoardDto,
  FleetCountsDto,
  FleetOfferDto,
  FleetTripRowDto,
  InboxItemDto,
  MatchDto,
  NetworkTruckDto,
  ShipmentDetailDto,
} from '@raha/contracts';
import { Ctx, RequireOrgType, RequirePermissions } from '../../common/decorators';
import { requireOrg, type RequestContext } from '../../common/request-context';
import { MatchesService } from '../matching/matches.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CapacityPost, Match, Shipment } from '../../database/entities';
import { POST_RELATIONS } from '../capacity/capacity.service';
import { AddNetworkTruckDto, AssignOfferDto, LogLoadDto, OfferLoadDto } from './broker.dto';
import { BrokerService } from './broker.service';
import { FleetConsoleService } from './fleet-console.service';

@ApiTags('fleet-console')
@ApiBearerAuth()
@RequireOrgType('fleet')
@Controller('fleet')
export class FleetConsoleController {
  constructor(
    private readonly console: FleetConsoleService,
    private readonly matches: MatchesService,
    @InjectRepository(Match) private readonly matchRepo: Repository<Match>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
  ) {}

  @Get('counts')
  @RequirePermissions('org:read')
  counts(@Ctx() ctx: RequestContext): Promise<FleetCountsDto> {
    return this.console.counts(requireOrg(ctx).id);
  }

  @Get('board')
  @RequirePermissions('fleet:trucks')
  board(@Ctx() ctx: RequestContext): Promise<FleetBoardDto> {
    return this.console.board(ctx, requireOrg(ctx).id);
  }

  @Get('offers')
  @RequirePermissions('offer:assign')
  offers(@Ctx() ctx: RequestContext): Promise<FleetOfferDto[]> {
    return this.console.offers(ctx, requireOrg(ctx).id, 60);
  }

  /** "Assign": the fleet offers one of its published trucks to a load. The shipper then confirms. */
  @Post('offers/assign')
  @RequirePermissions('offer:assign')
  async assign(@Ctx() ctx: RequestContext, @Body() dto: AssignOfferDto): Promise<MatchDto> {
    const m = await this.matches.propose(ctx, { shipmentId: dto.shipmentId, capacityPostId: dto.capacityPostId, side: 'fleet', priceEtb: dto.priceEtb });
    return this.present(ctx, m.id);
  }

  @Get('trips')
  @RequirePermissions('fleet:trucks')
  trips(@Ctx() ctx: RequestContext): Promise<FleetTripRowDto[]> {
    return this.console.activeTrips(requireOrg(ctx).id);
  }

  private async present(ctx: RequestContext, id: string): Promise<MatchDto> {
    const m = await this.matchRepo.findOneOrFail({ where: { id }, relations: { capacityPost: POST_RELATIONS } });
    const s = await this.shipments.findOneOrFail({ where: { id: m.shipmentId } });
    return this.matches.toDto(ctx, m as Match & { capacityPost: CapacityPost }, s);
  }
}

@ApiTags('broker')
@ApiBearerAuth()
@RequireOrgType('brokerage')
@Controller('broker')
export class BrokerController {
  constructor(
    private readonly broker: BrokerService,
    private readonly matches: MatchesService,
    @InjectRepository(Match) private readonly matchRepo: Repository<Match>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
  ) {}

  @Get('counts')
  @RequirePermissions('org:read')
  counts(@Ctx() ctx: RequestContext): Promise<BrokerCountsDto> {
    return this.broker.counts(ctx, requireOrg(ctx).id);
  }

  @Get('board')
  @RequirePermissions('broker:log_load')
  board(@Ctx() ctx: RequestContext): Promise<BrokerBoardDto> {
    return this.broker.board(ctx, requireOrg(ctx).id);
  }

  /** Trucks that fit one load, ranked, with the broker's fee. */
  @Get('loads/:shipmentId/trucks')
  @RequirePermissions('broker:offer')
  trucks(@Ctx() ctx: RequestContext, @Param('shipmentId', ParseUUIDPipe) id: string): Promise<BoardTruckDto[]> {
    return this.broker.trucksFor(requireOrg(ctx).id, id);
  }

  @Post('loads')
  @RequirePermissions('broker:log_load')
  logLoad(@Ctx() ctx: RequestContext, @Body() dto: LogLoadDto): Promise<ShipmentDetailDto> {
    return this.broker.logLoad(ctx, requireOrg(ctx).id, dto);
  }

  /** "Offer load": asks a truck's carrier to take the load. */
  @Post('offers')
  @RequirePermissions('broker:offer')
  async offer(@Ctx() ctx: RequestContext, @Body() dto: OfferLoadDto): Promise<MatchDto> {
    const m = await this.matches.propose(ctx, { shipmentId: dto.shipmentId, capacityPostId: dto.capacityPostId, side: 'broker', priceEtb: dto.priceEtb });
    const full = await this.matchRepo.findOneOrFail({ where: { id: m.id }, relations: { capacityPost: POST_RELATIONS } });
    const s = await this.shipments.findOneOrFail({ where: { id: m.shipmentId } });
    return this.matches.toDto(ctx, full as Match & { capacityPost: CapacityPost }, s);
  }

  @Get('trips')
  @RequirePermissions('broker:log_load')
  trips(@Ctx() ctx: RequestContext): Promise<BrokerTripRowDto[]> {
    return this.broker.activeTrips(requireOrg(ctx).id);
  }

  @Get('network')
  @RequirePermissions('broker:network')
  network(@Ctx() ctx: RequestContext): Promise<NetworkTruckDto[]> {
    return this.broker.networkTrucks(requireOrg(ctx).id);
  }

  @Post('network')
  @RequirePermissions('broker:network')
  addTruck(@Ctx() ctx: RequestContext, @Body() dto: AddNetworkTruckDto): Promise<NetworkTruckDto> {
    return this.broker.addNetworkTruck(ctx, requireOrg(ctx).id, dto);
  }

  @Delete('network/:vehicleId')
  @RequirePermissions('broker:network')
  @HttpCode(204)
  async removeTruck(@Ctx() ctx: RequestContext, @Param('vehicleId', ParseUUIDPipe) id: string): Promise<void> {
    await this.broker.removeNetworkTruck(ctx, requireOrg(ctx).id, id);
  }

  @Get('shippers')
  @RequirePermissions('broker:log_load')
  shippers(@Ctx() ctx: RequestContext): Promise<BrokerShipperDto[]> {
    return this.broker.shippers(requireOrg(ctx).id);
  }

  @Get('inbox')
  @RequirePermissions('broker:log_load')
  inbox(@Ctx() ctx: RequestContext): Promise<InboxItemDto[]> {
    return this.broker.inboxItems(requireOrg(ctx).id, true);
  }

  @Post('inbox/:id/handled')
  @RequirePermissions('broker:log_load')
  @HttpCode(204)
  async handled(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.broker.handleInbox(ctx, requireOrg(ctx).id, id);
  }
}
