import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class ProposeMatchDto {
  @IsUUID() shipmentId: string;
  @IsUUID() capacityPostId: string;
  /** Defaults to the matching engine's reference price. */
  @IsOptional() @IsNumber() @Min(0) priceEtb?: number;
}

export class MatchReasonDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
