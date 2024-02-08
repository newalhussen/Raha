import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BODY_TYPES, DELIVERY_CONDITIONS, type BodyType, type DeliveryCondition } from '@raha/contracts';

export class AtDto {
  /** When it happened on the phone (ISO). Defaults to now. Offline actions carry their real time. */
  @IsOptional() @IsDateString() at?: string;
}

export class PickupDto extends AtDto {
  @IsBoolean() counted: boolean;
  @IsBoolean() noDamage: boolean;
  @IsBoolean() waybill: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsString({ each: true }) photoKeys: string[];
  @IsOptional() @IsString() @MaxLength(60) actionId?: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
}

export class CheckinDto extends AtDto {
  @IsUUID() placeId: string;
  /** Device-generated UUID — makes retries and offline replays harmless. */
  @IsUUID() clientId: string;
  @IsOptional() @IsBoolean() offline?: boolean;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
}

export class DeliverDto extends AtDto {
  @Matches(/^\d{4}$/, { message: 'The PIN is 4 digits' }) pin: string;
  @IsIn(DELIVERY_CONDITIONS) condition: DeliveryCondition;
  @IsOptional() @IsInt() @Min(0) receivedCount?: number;
  @IsOptional() @IsString() @MaxLength(200) photoKey?: string;
  @IsOptional() @IsBoolean() offline?: boolean;
}

export class SyncActionDto {
  @IsUUID() id: string;
  @IsIn(['begin', 'arrive', 'pickup', 'start', 'checkin', 'deliver']) type: 'begin' | 'arrive' | 'pickup' | 'start' | 'checkin' | 'deliver';
  @IsUUID() tripId: string;
  @IsOptional() @IsUUID() loadId?: string;
  @IsDateString() at: string;
  @IsObject() payload: Record<string, unknown>;
}

export class SyncDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SyncActionDto)
  actions: SyncActionDto[];
}

export class ReportIssueDto {
  @IsIn(['breakdown', 'delay', 'cargo_problem', 'safety', 'other']) kind: 'breakdown' | 'delay' | 'cargo_problem' | 'safety' | 'other';
  @IsString() @MinLength(3) @MaxLength(500) text: string;
}

export class SetLoadedDto {
  @IsInt() @Min(0) @Max(60_000) loadedKg: number;
}

export class AvailabilityDto {
  @IsBoolean() available: boolean;
}

export class ReturnAlertsDto {
  @IsBoolean() on: boolean;
}

export class DeclineLoadDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class OnboardDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @IsOptional() @IsString() @MaxLength(40) licenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) licenceGrade?: string;
  @IsOptional() @IsDateString() licenceExpiry?: string;
}

export class RegisterTruckDto {
  @IsString() @MinLength(4) @MaxLength(15) plate: string;
  @IsString() @MinLength(2) @MaxLength(80) makeModel: string;
  @IsIn(BODY_TYPES) bodyType: BodyType;
  @IsInt() @Min(500) @Max(60_000) maxLoadKg: number;
  @IsOptional() @IsInt() @Min(1980) @Max(2100) year?: number;
}
