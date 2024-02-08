import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CARGO_TYPES, DELIVERY_CONDITIONS, type DeliveryCondition } from '@raha/contracts';

const CARGO_KEYS = CARGO_TYPES.map((c) => c.key) as string[];

export class CreateShipmentDto {
  @IsUUID() pickupPlaceId: string;
  @IsString() @MinLength(3) @MaxLength(200) pickupAddress: string;
  @IsOptional() @IsLatitude() pickupLat?: number;
  @IsOptional() @IsLongitude() pickupLng?: number;
  @IsOptional() @IsString() @MaxLength(120) pickupContactName?: string;
  @IsOptional() @IsString() @MaxLength(20) pickupContactPhone?: string;

  @IsUUID() dropoffPlaceId: string;
  @IsString() @MinLength(3) @MaxLength(200) dropoffAddress: string;
  @IsOptional() @IsLatitude() dropoffLat?: number;
  @IsOptional() @IsLongitude() dropoffLng?: number;

  @IsString() @MinLength(2) @MaxLength(120) receiverName: string;
  @IsString() @MinLength(9) @MaxLength(20) receiverPhone: string;

  @IsIn(CARGO_KEYS) cargoType: string;
  @IsOptional() @IsString() @MaxLength(300) cargoDescription?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) pieces?: number;
  @IsInt() @Min(1) @Max(60_000) weightKg: number;
  @IsOptional() @IsNumber() @Min(0.01) @Max(200) volumeM3?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) requirements?: string[];

  @IsDateString() readyAt: string;
  @IsOptional() @IsDateString() readyUntil?: string;

  /** Book this truck straight away (the "Book" button next to a transport option). */
  @IsOptional() @IsUUID() bookCapacityPostId?: string;
}

/** Same fields as a shipment, used to preview truck options before anything is saved. */
export class PreviewOptionsDto {
  @IsUUID() pickupPlaceId: string;
  @IsUUID() dropoffPlaceId: string;
  @IsOptional() @IsLatitude() pickupLat?: number;
  @IsOptional() @IsLongitude() pickupLng?: number;
  @IsOptional() @IsLatitude() dropoffLat?: number;
  @IsOptional() @IsLongitude() dropoffLng?: number;
  @IsIn(CARGO_KEYS) cargoType: string;
  @IsInt() @Min(1) @Max(60_000) weightKg: number;
  @IsOptional() @IsNumber() @Min(0.01) @Max(200) volumeM3?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) requirements?: string[];
  @IsDateString() readyAt: string;
  @IsOptional() @IsDateString() readyUntil?: string;
}

export class BookTruckDto {
  @IsUUID() capacityPostId: string;
  @IsOptional() @IsNumber() @Min(0) priceEtb?: number;
}

export class CancelShipmentDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class ConfirmDeliveryDto {
  @IsOptional() @IsIn(DELIVERY_CONDITIONS) condition?: DeliveryCondition;
  @IsOptional() @IsInt() @Min(0) receivedCount?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class PostMessageDto {
  @IsString() @MinLength(1) @MaxLength(1000) body: string;
}

export class ListShipmentsQuery {
  @IsOptional() @IsIn(['active', 'completed', 'all']) tab?: 'active' | 'completed' | 'all';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
}
