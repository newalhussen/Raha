import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthResultDto, OtpRequestResultDto, SessionDto, TokensDto } from '@raha/contracts';
import { Ctx, Public } from '../../common/decorators';
import type { RequestContext } from '../../common/request-context';
import { AuthService } from './auth.service';
import { OtpRequestDto, OtpVerifyDto, RefreshDto, RegisterDeviceDto, StaffLoginDto, UpdateMeDto } from './auth.dto';

const clientIp = (req: Request) => (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null;

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('auth/otp/request')
  @HttpCode(200)
  requestOtp(@Body() dto: OtpRequestDto, @Req() req: Request): Promise<OtpRequestResultDto> {
    return this.auth.requestOtp(dto, clientIp(req));
  }

  @Public()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('auth/otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: OtpVerifyDto, @Req() req: Request): Promise<AuthResultDto> {
    return this.auth.verifyOtp(dto, clientIp(req), req.headers['user-agent'] ?? null);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('auth/staff/login')
  @HttpCode(200)
  staffLogin(@Body() dto: StaffLoginDto, @Req() req: Request): Promise<AuthResultDto> {
    return this.auth.staffLogin(dto.email, dto.password, clientIp(req), req.headers['user-agent'] ?? null);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('auth/refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<TokensDto> {
    return this.auth.refresh(dto.refreshToken, req.headers['user-agent'] ?? null);
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@Ctx() ctx: RequestContext): Promise<SessionDto> {
    return this.auth.session(ctx.userId);
  }

  @ApiBearerAuth()
  @Patch('me')
  updateMe(@Ctx() ctx: RequestContext, @Body() dto: UpdateMeDto): Promise<SessionDto> {
    return this.auth.updateMe(ctx.userId, dto);
  }

  @ApiBearerAuth()
  @Post('me/devices')
  @HttpCode(204)
  async registerDevice(@Ctx() ctx: RequestContext, @Body() dto: RegisterDeviceDto): Promise<void> {
    await this.auth.registerDevice(ctx.userId, dto);
  }
}
