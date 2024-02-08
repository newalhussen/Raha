import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { normalizeEthiopianPhone, type AuthResultDto, type OtpRequestResultDto, type SessionDto, type TokensDto, type ClientApp } from '@raha/contracts';
import { loadEnv } from '../../config/env';
import { DomainError, badRequest } from '../../common/errors';
import { hashPassword, hmacHex, randomDigits, randomToken, safeEqualHex, sha256Hex, verifyPassword } from '../../common/crypto';
import { DeviceToken, DriverProfile, Membership, OtpCode, RefreshToken, User } from '../../database/entities';
import { MessagingService } from '../messaging/messaging.service';
import { AuditService } from '../audit/audit.service';
import { toSessionDto } from './session.mapper';
import type { OtpRequestDto, OtpVerifyDto, UpdateMeDto, RegisterDeviceDto } from './auth.dto';

const OTP_TTL_SECONDS = 300;
const OTP_RESEND_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 6;
const REFRESH_GRACE_MS = 20_000;

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  private readonly env = loadEnv();
  /** Burns the same scrypt time for unknown accounts so login timing does not reveal who exists. */
  private readonly dummyHash = hashPassword(randomToken(12));

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(OtpCode) private readonly otps: Repository<OtpCode>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(DeviceToken) private readonly devices: Repository<DeviceToken>,
    private readonly jwt: JwtService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── phone + SMS code ─────────────────────────

  async requestOtp(dto: OtpRequestDto, ip: string | null): Promise<OtpRequestResultDto> {
    const phone = normalizeEthiopianPhone(dto.phone);
    if (!phone) throw badRequest('invalid_phone', 'Enter a valid Ethiopian mobile number, e.g. 091 120 4418');
    if (dto.app === 'ops') throw badRequest('use_staff_login', 'Operations staff sign in with email and password');

    const now = new Date();
    const lastHour = await this.otps.count({ where: { phone, createdAt: MoreThan(new Date(now.getTime() - 3_600_000)) } });
    if (lastHour >= OTP_MAX_PER_HOUR) throw new DomainError('otp_rate_limited', 'Too many codes requested. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
    const last = await this.otps.findOne({ where: { phone }, order: { createdAt: 'DESC' } });
    if (last && now.getTime() - last.createdAt.getTime() < OTP_RESEND_SECONDS * 1000) {
      throw new DomainError('otp_too_soon', `Wait ${OTP_RESEND_SECONDS} seconds before asking for a new code`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = randomDigits(6);
    await this.otps.insert({
      phone,
      codeHash: this.hashCode(phone, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      ip,
    });
    await this.messaging.sendSms(phone, `RAHA: Your sign-in code is ${code}. It expires in 5 minutes. Never share it.`);

    return {
      sent: true,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendInSeconds: OTP_RESEND_SECONDS,
      ...(this.env.otpDevEcho ? { devCode: code } : {}),
    };
  }

  async verifyOtp(dto: OtpVerifyDto, ip: string | null, userAgent: string | null): Promise<AuthResultDto> {
    const phone = normalizeEthiopianPhone(dto.phone);
    if (!phone) throw badRequest('invalid_phone', 'Enter a valid Ethiopian mobile number');
    if (dto.app === 'ops') throw badRequest('use_staff_login', 'Operations staff sign in with email and password');

    const rec = await this.otps.findOne({
      where: { phone, consumedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    if (!rec) throw new DomainError('otp_invalid', 'That code is wrong or has expired. Ask for a new one.', HttpStatus.UNAUTHORIZED);
    if (rec.attempts >= OTP_MAX_ATTEMPTS) throw new DomainError('otp_locked', 'Too many wrong codes. Ask for a new one.', HttpStatus.TOO_MANY_REQUESTS);

    rec.attempts += 1;
    if (!safeEqualHex(this.hashCode(phone, dto.code), rec.codeHash)) {
      await this.otps.save(rec);
      throw new DomainError('otp_invalid', 'That code is wrong or has expired.', HttpStatus.UNAUTHORIZED, { attemptsLeft: OTP_MAX_ATTEMPTS - rec.attempts });
    }
    rec.consumedAt = new Date();
    await this.otps.save(rec);

    let user = await this.users.findOne({ where: { phone } });
    if (!user) {
      user = await this.users.save(this.users.create({ phone, fullName: '' }));
      await this.audit.record({ action: 'user.create', entityType: 'user', entityId: user.id, data: { via: 'otp', app: dto.app } });
    }
    if (user.status !== 'active') throw new DomainError('account_suspended', 'This account is suspended. Call Raha support on 8817.', HttpStatus.FORBIDDEN);

    // First sign-in accepts any pending invitations.
    await this.memberships.update({ userId: user.id, status: 'invited' }, { status: 'active' });
    user.lastLoginAt = new Date();
    await this.users.save(user);

    const tokens = await this.issueTokens(user.id, dto.app, dto.deviceName ?? null, userAgent);
    const session = await this.session(user.id);
    const hasDriverProfile = await this.driverProfiles.exist({ where: { userId: user.id } });
    const needsProfile = dto.app === 'driver' ? !user.fullName || !hasDriverProfile : !user.fullName;
    this.log.log(`sign-in ${phone} via ${dto.app} from ${ip ?? 'unknown'}`);
    return { ...session, tokens, needsProfile };
  }

  // ───────────────────────── staff email + password ─────────────────────────

  async staffLogin(email: string, password: string, ip: string | null, userAgent: string | null): Promise<AuthResultDto> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.email) = lower(:email)', { email })
      .andWhere('u.is_staff = true')
      .getOne();
    // Same error and similar timing whether the account exists or not.
    const ok = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !ok) throw new DomainError('invalid_credentials', 'Email or password is incorrect', HttpStatus.UNAUTHORIZED);
    if (user.status !== 'active') throw new DomainError('account_suspended', 'This account is suspended', HttpStatus.FORBIDDEN);

    user.lastLoginAt = new Date();
    await this.users.save(user);
    const tokens = await this.issueTokens(user.id, 'ops', null, userAgent);
    await this.audit.record({ actor: { userId: user.id, isStaff: true, ip }, action: 'staff.login', entityType: 'user', entityId: user.id });
    return { ...(await this.session(user.id)), tokens, needsProfile: false };
  }

  // ───────────────────────── tokens ─────────────────────────

  async issueTokens(userId: string, app: ClientApp, deviceName: string | null, userAgent: string | null): Promise<TokensDto> {
    const accessToken = await this.jwt.signAsync({ sub: userId, app }, { secret: this.env.jwtSecret, expiresIn: this.env.accessTokenTtlSeconds });
    const refreshToken = randomToken(48);
    await this.refreshTokens.insert({
      userId,
      app,
      tokenHash: sha256Hex(refreshToken),
      deviceName,
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + this.env.refreshTokenTtlDays * 86_400_000),
    });
    return { accessToken, refreshToken, expiresIn: this.env.accessTokenTtlSeconds };
  }

  async refresh(refreshToken: string, userAgent: string | null): Promise<TokensDto> {
    const row = await this.refreshTokens.findOne({ where: { tokenHash: sha256Hex(refreshToken) } });
    if (!row) throw new DomainError('refresh_invalid', 'Session expired. Sign in again.', HttpStatus.UNAUTHORIZED);
    if (row.revokedAt) {
      // Two requests from the same browser can legitimately race with one refresh token (parallel page loads);
      // a rotation in the last few seconds is tolerated. Anything later is treated as theft.
      const justRotated = !!row.replacedBy && Date.now() - row.revokedAt.getTime() < REFRESH_GRACE_MS;
      if (!justRotated) {
        await this.refreshTokens.update({ userId: row.userId, app: row.app, revokedAt: IsNull() }, { revokedAt: new Date() });
        this.log.warn(`refresh token reuse detected for user ${row.userId} (${row.app}) — sessions revoked`);
        throw new DomainError('refresh_reused', 'Session expired. Sign in again.', HttpStatus.UNAUTHORIZED);
      }
    }
    if (row.expiresAt < new Date()) throw new DomainError('refresh_expired', 'Session expired. Sign in again.', HttpStatus.UNAUTHORIZED);
    const user = await this.users.findOne({ where: { id: row.userId } });
    if (!user || user.status !== 'active') throw new DomainError('refresh_invalid', 'Session expired. Sign in again.', HttpStatus.UNAUTHORIZED);

    const tokens = await this.issueTokens(row.userId, row.app, row.deviceName, userAgent);
    if (!row.revokedAt) {
      const next = await this.refreshTokens.findOneByOrFail({ tokenHash: sha256Hex(tokens.refreshToken) });
      await this.refreshTokens.update(row.id, { revokedAt: new Date(), replacedBy: next.id });
    }
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.update({ tokenHash: sha256Hex(refreshToken), revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  // ───────────────────────── session / profile ─────────────────────────

  async session(userId: string): Promise<SessionDto> {
    const user = await this.users.findOneByOrFail({ id: userId });
    const memberships = await this.memberships.find({
      where: { userId, status: In(['active', 'invited']) },
      relations: { organization: true },
      order: { createdAt: 'ASC' },
    });
    return toSessionDto(user, memberships);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<SessionDto> {
    const patch: Partial<User> = {};
    if (dto.fullName !== undefined) patch.fullName = dto.fullName.trim();
    if (dto.language !== undefined) patch.language = dto.language;
    if (dto.notifyTelegram !== undefined) patch.notifyTelegram = dto.notifyTelegram;
    if (dto.notifySms !== undefined) patch.notifySms = dto.notifySms;
    if (dto.notifyCall !== undefined) patch.notifyCall = dto.notifyCall;
    if (dto.dataSaver !== undefined) patch.dataSaver = dto.dataSaver;
    if (Object.keys(patch).length) await this.users.update(userId, patch);
    return this.session(userId);
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<void> {
    await this.devices.upsert(
      { userId, token: dto.token, platform: dto.platform ?? 'android', appVersion: dto.appVersion ?? null, lastSeenAt: new Date() },
      ['token'],
    );
  }

  private hashCode(phone: string, code: string): string {
    return hmacHex(this.env.jwtSecret, `${phone}:${code}`);
  }
}
