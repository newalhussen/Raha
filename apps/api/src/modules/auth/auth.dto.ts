import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { CLIENT_APPS, LANGUAGES, type ClientApp, type Language } from '@raha/contracts';

export class OtpRequestDto {
  @IsString() @MinLength(9) @MaxLength(20) phone: string;
  @IsIn(CLIENT_APPS) app: ClientApp;
}

export class OtpVerifyDto {
  @IsString() @MinLength(9) @MaxLength(20) phone: string;
  @IsString() @Length(6, 6) code: string;
  @IsIn(CLIENT_APPS) app: ClientApp;
  @IsOptional() @IsString() @MaxLength(80) deviceName?: string;
}

export class StaffLoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(200) password: string;
}

export class RefreshDto {
  @IsString() @MinLength(20) refreshToken: string;
}

export class UpdateMeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @IsIn(LANGUAGES) language?: Language;
  @IsOptional() @IsBoolean() notifyTelegram?: boolean;
  @IsOptional() @IsBoolean() notifySms?: boolean;
  @IsOptional() @IsBoolean() notifyCall?: boolean;
  @IsOptional() @IsBoolean() dataSaver?: boolean;
}

export class RegisterDeviceDto {
  @IsString() @MinLength(10) @MaxLength(4096) token: string;
  @IsOptional() @IsString() @MaxLength(20) platform?: string;
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
}
