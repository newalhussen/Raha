import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MEMBER_ROLES, MEMBERSHIP_STATUSES, ORG_TYPES, type MemberRole, type MembershipStatus, type OrgType } from '@raha/contracts';

export class CreateOrgDto {
  @IsIn(ORG_TYPES) type: OrgType;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(120) nameAm?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @Matches(/^\d{10}$/, { message: 'TIN is 10 digits' }) tin?: string;
  @IsOptional() @IsString() @MaxLength(60) tradeLicenceNo?: string;
}

export class UpdateOrgDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) nameAm?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @Matches(/^\d{10}$/, { message: 'TIN is 10 digits' }) tin?: string;
  @IsOptional() @IsString() @MaxLength(60) tradeLicenceNo?: string;
}

export class InviteMemberDto {
  @IsString() @MinLength(9) @MaxLength(20) phone: string;
  @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @IsIn(MEMBER_ROLES) role: MemberRole;
}

export class UpdateMemberDto {
  @IsOptional() @IsIn(MEMBER_ROLES) role?: MemberRole;
  @IsOptional() @IsIn(MEMBERSHIP_STATUSES) status?: MembershipStatus;
}
