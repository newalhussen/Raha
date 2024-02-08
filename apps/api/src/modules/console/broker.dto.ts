import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BODY_TYPES, type BodyType } from '@raha/contracts';
import { CreateShipmentDto } from '../shipments/shipments.dto';

/** "Log load from call": the same fields as a shipment plus who the business is. */
export class LogLoadDto extends CreateShipmentDto {
  /** An existing shipper account the broker manages… */
  @IsOptional() @IsUUID() shipperOrgId?: string;
  /** …or a new business, created on the fly for phone customers. */
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) shipperName?: string;
  @IsOptional() @IsString() @MaxLength(20) shipperPhone?: string;
  @IsOptional() @IsIn(['phone', 'telegram', 'broker']) source?: 'phone' | 'telegram' | 'broker';
}

export class AddNetworkTruckDto {
  @IsString() @MinLength(4) @MaxLength(15) plate: string;
  @IsOptional() @IsString() @MaxLength(120) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(20) ownerPhone?: string;
  @IsOptional() @IsString() @MaxLength(80) makeModel?: string;
  @IsOptional() @IsIn(BODY_TYPES) bodyType?: BodyType;
  @IsOptional() @IsInt() @Min(500) @Max(60_000) maxLoadKg?: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class OfferLoadDto {
  @IsUUID() shipmentId: string;
  @IsUUID() capacityPostId: string;
  @IsOptional() @IsInt() @Min(0) priceEtb?: number;
}

export class AssignOfferDto {
  @IsUUID() shipmentId: string;
  @IsUUID() capacityPostId: string;
  @IsOptional() @IsInt() @Min(0) priceEtb?: number;
}
