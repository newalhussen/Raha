import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CAPACITY_KINDS, type CapacityKind } from '@raha/contracts';

export class PublishCapacityDto {
  @IsUUID() vehicleId: string;
  /** Defaults to the truck's assigned driver. */
  @IsOptional() @IsUUID() driverUserId?: string;
  @IsUUID() originPlaceId: string;
  @IsUUID() destinationPlaceId: string;
  @IsDateString() departsAt: string;
  @IsOptional() @IsIn(CAPACITY_KINDS) kind?: CapacityKind;
  /** Load already aboard from the owner's own contracts. */
  @IsOptional() @IsInt() @Min(0) committedKg?: number;
  /** Defaults to the truck's maximum load. */
  @IsOptional() @IsInt() @Min(500) @Max(60_000) totalCapacityKg?: number;
  @IsOptional() @IsNumber() @Min(0) freeVolumeM3?: number;
  @IsOptional() @IsNumber() @Min(0) askingPerTonneEtb?: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class UpdateCapacityDto {
  @IsOptional() @IsDateString() departsAt?: string;
  @IsOptional() @IsInt() @Min(0) committedKg?: number;
  @IsOptional() @IsNumber() @Min(0) freeVolumeM3?: number;
  @IsOptional() @IsNumber() @Min(0) askingPerTonneEtb?: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}
