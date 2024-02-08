import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MatchDto, MessageDto, ShipmentDetailDto, ShipmentListDto, TruckOptionDto } from '@raha/contracts';
import { Ctx, RequirePermissions } from '../../common/decorators';
import { requireOrg, type RequestContext } from '../../common/request-context';
import { MatchesService } from '../matching/matches.service';
import { BookTruckDto, CancelShipmentDto, ConfirmDeliveryDto, CreateShipmentDto, ListShipmentsQuery, PostMessageDto, PreviewOptionsDto } from './shipments.dto';
import { MessagesService } from './messages.service';
import { ShipmentsService } from './shipments.service';

@ApiTags('shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly matches: MatchesService,
    private readonly messages: MessagesService,
  ) {}

  @Get()
  @RequirePermissions('shipment:read')
  list(@Ctx() ctx: RequestContext, @Query() q: ListShipmentsQuery): Promise<ShipmentListDto> {
    return this.shipments.list(ctx, q);
  }

  /** Transport options for a shipment that has not been saved yet — drives the right-hand panel of the form. */
  @Post('preview-options')
  @RequirePermissions('shipment:create')
  preview(@Body() dto: PreviewOptionsDto) {
    return this.shipments.preview(dto);
  }

  @Post()
  @RequirePermissions('shipment:create')
  async create(@Ctx() ctx: RequestContext, @Body() dto: CreateShipmentDto): Promise<ShipmentDetailDto> {
    const org = requireOrg(ctx);
    const isBroker = org.type === 'brokerage';
    const shipment = await this.shipments.create(ctx, dto, { shipperOrgId: org.id, source: isBroker ? 'broker' : 'app', loggedByOrgId: isBroker ? org.id : null });
    if (dto.bookCapacityPostId) {
      try {
        await this.matches.propose(ctx, { shipmentId: shipment.id, capacityPostId: dto.bookCapacityPostId, side: isBroker ? 'broker' : 'shipper' });
      } catch (err) {
        this.shipments.bookingFailed(err, shipment.id);
      }
    }
    return this.shipments.detail(ctx, shipment.id);
  }

  @Get(':id')
  @RequirePermissions('shipment:read')
  detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<ShipmentDetailDto> {
    return this.shipments.detail(ctx, id);
  }

  @Get(':id/options')
  @RequirePermissions('shipment:read')
  options(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<TruckOptionDto[]> {
    return this.shipments.options(ctx, id);
  }

  /** "Book" next to a transport option: asks that truck's carrier to take the load. */
  @Post(':id/book')
  @RequirePermissions('match:book')
  async book(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BookTruckDto): Promise<ShipmentDetailDto> {
    const org = requireOrg(ctx);
    await this.matches.propose(ctx, { shipmentId: id, capacityPostId: dto.capacityPostId, side: org.type === 'brokerage' ? 'broker' : 'shipper', priceEtb: dto.priceEtb });
    return this.shipments.detail(ctx, id);
  }

  @Get(':id/matches')
  @RequirePermissions('shipment:read')
  async matchList(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<MatchDto[]> {
    await this.shipments.get(ctx, id);
    return this.matches.forShipment(ctx, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('shipment:cancel')
  cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelShipmentDto): Promise<ShipmentDetailDto> {
    return this.shipments.cancel(ctx, id, dto);
  }

  @Post(':id/confirm-delivery')
  @RequirePermissions('shipment:confirm_delivery')
  confirmDelivery(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDeliveryDto): Promise<ShipmentDetailDto> {
    return this.shipments.confirmManually(ctx, id, dto);
  }

  @Get(':id/messages')
  @RequirePermissions('shipment:read')
  thread(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<MessageDto[]> {
    return this.messages.list(ctx, id);
  }

  @Post(':id/messages')
  @RequirePermissions('message:post')
  post(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PostMessageDto): Promise<MessageDto> {
    return this.messages.post(ctx, id, dto.body);
  }
}
