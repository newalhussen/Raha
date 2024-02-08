import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';
import type { NotificationDto } from '@raha/contracts';
import { Ctx } from '../../common/decorators';
import type { RequestContext } from '../../common/request-context';
import { NotificationsService } from './notifications.service';

class MarkReadDto {
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) ids?: string[];
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Ctx() ctx: RequestContext): Promise<{ items: NotificationDto[]; unread: number }> {
    const [items, unread] = await Promise.all([this.notifications.inbox(ctx.userId), this.notifications.unreadCount(ctx.userId)]);
    return { items, unread };
  }

  @Post('read')
  @HttpCode(204)
  async read(@Ctx() ctx: RequestContext, @Body() dto: MarkReadDto): Promise<void> {
    await this.notifications.markRead(ctx.userId, dto.ids);
  }
}
