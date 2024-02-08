import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MemberDto, OrganizationDto, SessionDto } from '@raha/contracts';
import { Ctx, RequirePermissions } from '../../common/decorators';
import { requireOrg, type RequestContext } from '../../common/request-context';
import { CreateOrgDto, InviteMemberDto, UpdateMemberDto, UpdateOrgDto } from './orgs.dto';
import { OrgsService } from './orgs.service';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  /** Open a company account (shipper, fleet or brokerage). Returns the refreshed session. */
  @Post()
  create(@Ctx() ctx: RequestContext, @Body() dto: CreateOrgDto): Promise<SessionDto> {
    return this.orgs.create(ctx, dto);
  }

  @Get('current')
  @RequirePermissions('org:read')
  current(@Ctx() ctx: RequestContext): Promise<OrganizationDto> {
    return this.orgs.current(requireOrg(ctx).id);
  }

  @Patch('current')
  @RequirePermissions('org:update')
  update(@Ctx() ctx: RequestContext, @Body() dto: UpdateOrgDto): Promise<OrganizationDto> {
    return this.orgs.update(ctx, requireOrg(ctx).id, dto);
  }

  @Get('current/members')
  @RequirePermissions('org:read')
  members(@Ctx() ctx: RequestContext): Promise<MemberDto[]> {
    return this.orgs.members(requireOrg(ctx).id);
  }

  @Post('current/members')
  @RequirePermissions('members:manage')
  invite(@Ctx() ctx: RequestContext, @Body() dto: InviteMemberDto): Promise<MemberDto> {
    const org = requireOrg(ctx);
    return this.orgs.invite(ctx, org.id, org.type, dto);
  }

  @Patch('current/members/:id')
  @RequirePermissions('members:manage')
  updateMember(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDto): Promise<MemberDto> {
    return this.orgs.updateMember(ctx, requireOrg(ctx).id, id, dto);
  }

  @Delete('current/members/:id')
  @RequirePermissions('members:manage')
  @HttpCode(204)
  async removeMember(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.orgs.removeMember(ctx, requireOrg(ctx).id, id);
  }
}
