import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested, ValidateIf } from 'class-validator';
import { BODY_TYPES, DOCUMENT_KINDS, type BodyType, type DocumentKind } from '@raha/contracts';

export class CreateVehicleDto {
  @IsString() @MinLength(4) @MaxLength(15) plate: string;
  @IsString() @MinLength(2) @MaxLength(80) makeModel: string;
  @IsOptional() @IsInt() @Min(1980) @Max(2100) year?: number;
  @IsIn(BODY_TYPES) bodyType: BodyType;
  @IsInt() @Min(500) @Max(60_000) maxLoadKg: number;
  @IsOptional() @IsNumber() @Min(1) @Max(200) boxVolumeM3?: number;
  @IsOptional() @IsUUID() homePlaceId?: string;
  @IsOptional() @IsUUID() driverUserId?: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) makeModel?: string;
  @IsOptional() @IsInt() @Min(1980) @Max(2100) year?: number;
  @IsOptional() @IsIn(BODY_TYPES) bodyType?: BodyType;
  @IsOptional() @IsInt() @Min(500) @Max(60_000) maxLoadKg?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(200) boxVolumeM3?: number;
  @IsOptional() @IsIn(['available', 'off_road']) status?: 'available' | 'off_road';
  @IsOptional() @IsString() @MaxLength(200) statusNote?: string;
  @IsOptional() @IsUUID() homePlaceId?: string;
  /** null un-assigns the driver. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID() driverUserId?: string | null;
}

export class DocumentInputDto {
  @IsIn(DOCUMENT_KINDS) kind: DocumentKind;
  @IsOptional() @IsString() @MaxLength(200) fileKey?: string;
  @IsOptional() @IsString() @MaxLength(60) number?: string;
  @IsOptional() @IsDateString() expiresOn?: string;
}

export class SubmitVerificationDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => DocumentInputDto)
  documents: DocumentInputDto[];
}
