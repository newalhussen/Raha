import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BODY_TYPES, CARGO_TYPES, type CorridorDto, type PlaceDto } from '@raha/contracts';
import { Public } from '../../common/decorators';
import { ReferenceService } from './reference.service';

@ApiTags('reference')
@ApiBearerAuth()
@Controller()
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  /** Public so the marketing site can show corridors; contains no personal data. */
  @Public()
  @Get('places')
  async places(@Query('q') q?: string, @Query('limit') limit?: number): Promise<PlaceDto[]> {
    const rows = await this.reference.searchPlaces(q, Math.min(Number(limit) || 30, 100));
    return rows.map((p) => this.reference.toPlaceDto(p));
  }

  @Public()
  @Get('corridors')
  corridors(): Promise<CorridorDto[]> {
    return this.reference.listCorridors();
  }

  @Public()
  @Get('reference/cargo-types')
  cargoTypes() {
    return { cargoTypes: CARGO_TYPES, bodyTypes: BODY_TYPES };
  }
}
