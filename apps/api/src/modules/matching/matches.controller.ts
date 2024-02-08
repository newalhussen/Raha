import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MatchDto } from '@raha/contracts';
import { Ctx } from '../../common/decorators';
import { forbidden, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { CapacityPost, Match, Shipment } from '../../database/entities';
import { POST_RELATIONS } from '../capacity/capacity.service';
import { MatchReasonDto, ProposeMatchDto } from './matches.dto';
import { MatchesService, type ProposeInput } from './matches.service';

@ApiTags('matches')
@ApiBearerAuth()
@Controller('matches')
export class MatchesController {
  constructor(
    private readonly matches: MatchesService,
    @InjectRepository(Match) private readonly repo: Repository<Match>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(CapacityPost) private readonly posts: Repository<CapacityPost>,
  ) {}

  /**
   * Propose a load to a truck. The side is inferred from who is calling:
   * shipper / broker handling the load → asks the carrier; carrier / fleet → offers to the shipper; ops → either.
   */
  @Post()
  async propose(@Ctx() ctx: RequestContext, @Body() dto: ProposeMatchDto): Promise<MatchDto> {
    const shipment = await this.shipments.findOne({ where: { id: dto.shipmentId } });
    if (!shipment) throw notFound('Shipment');
    const side = this.sideFor(ctx, shipment);
    const match = await this.matches.propose(ctx, { shipmentId: dto.shipmentId, capacityPostId: dto.capacityPostId, side, priceEtb: dto.priceEtb });
    return this.present(ctx, match.id);
  }

  @Post(':id/accept')
  async accept(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<MatchDto> {
    await this.matches.respond(ctx, id, 'accept');
    return this.present(ctx, id);
  }

  @Post(':id/decline')
  async decline(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MatchReasonDto): Promise<MatchDto> {
    await this.matches.respond(ctx, id, 'decline', dto.reason);
    return this.present(ctx, id);
  }

  @Post(':id/cancel')
  async cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MatchReasonDto): Promise<MatchDto> {
    await this.matches.respond(ctx, id, 'cancel', dto.reason);
    return this.present(ctx, id);
  }

  private sideFor(ctx: RequestContext, shipment: Shipment): ProposeInput['side'] {
    if (ctx.isStaff && ctx.permissions.includes('ops:match')) return 'ops';
    const orgId = ctx.org?.id;
    const handlesShipment = !!orgId && (orgId === shipment.shipperOrgId || orgId === shipment.loggedByOrgId);
    if (handlesShipment) {
      if (!ctx.permissions.includes('match:book')) throw forbidden('Your role cannot book trucks', 'permission_denied');
      return ctx.org!.type === 'brokerage' ? 'broker' : 'shipper';
    }
    if (ctx.org?.type === 'fleet' || ctx.org?.type === 'brokerage' || !ctx.org) {
      if (!ctx.permissions.includes('match:respond') && !ctx.permissions.includes('offer:assign')) throw forbidden('Your role cannot offer trucks', 'permission_denied');
      return ctx.org?.type === 'fleet' && ctx.org.role !== 'driver' ? 'fleet' : 'carrier';
    }
    throw forbidden('You are not a party to this shipment', 'not_a_party');
  }

  private async present(ctx: RequestContext, id: string): Promise<MatchDto> {
    const m = await this.repo.findOneOrFail({ where: { id }, relations: { capacityPost: POST_RELATIONS } });
    const shipment = await this.shipments.findOneOrFail({ where: { id: m.shipmentId } });
    return this.matches.toDto(ctx, m as Match & { capacityPost: CapacityPost }, shipment);
  }
}
