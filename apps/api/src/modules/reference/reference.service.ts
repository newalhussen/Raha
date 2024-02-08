import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import type { CorridorDto, PlaceDto } from '@raha/contracts';
import { haversineKm } from '../../common/geo';
import { notFound } from '../../common/errors';
import { Corridor, CorridorStop, Place } from '../../database/entities';

export interface ResolvedRoute {
  corridorId: string | null;
  corridorName: string | null;
  /** Road km from origin to destination. */
  routeKm: number;
  direction: 'forward' | 'reverse' | null;
  /** Places in travel order, origin first, destination last (intermediate corridor stops included). */
  stops: Array<{ place: Place; km: number }>;
}

const ROAD_FACTOR = 1.35; // straight-line -> road distance when no corridor is known
const CACHE_MS = 5 * 60_000;

/** Places and corridors change rarely; keep them in memory and resolve routes from there. */
@Injectable()
export class ReferenceService {
  private placesById = new Map<string, Place>();
  private placesByCode = new Map<string, Place>();
  private corridors: Corridor[] = [];
  private loadedAt = 0;

  constructor(
    @InjectRepository(Place) private readonly places: Repository<Place>,
    @InjectRepository(Corridor) private readonly corridorRepo: Repository<Corridor>,
    @InjectRepository(CorridorStop) private readonly stops: Repository<CorridorStop>,
  ) {}

  private async ensureLoaded(): Promise<void> {
    if (Date.now() - this.loadedAt < CACHE_MS && this.placesById.size > 0) return;
    const [places, corridors] = await Promise.all([
      this.places.find({ order: { name: 'ASC' } }),
      this.corridorRepo.find({ relations: { stops: { place: true }, origin: true, destination: true }, order: { name: 'ASC' } }),
    ]);
    this.placesById = new Map(places.map((p) => [p.id, p]));
    this.placesByCode = new Map(places.map((p) => [p.code, p]));
    for (const c of corridors) c.stops.sort((a, b) => a.seq - b.seq);
    this.corridors = corridors;
    this.loadedAt = Date.now();
  }

  /** Drop the cache (tests, or after editing reference data). */
  invalidate(): void {
    this.loadedAt = 0;
  }

  async place(id: string): Promise<Place> {
    await this.ensureLoaded();
    const p = this.placesById.get(id);
    if (!p) throw notFound('Place');
    return p;
  }

  async placeByCode(code: string): Promise<Place> {
    await this.ensureLoaded();
    const p = this.placesByCode.get(code);
    if (!p) throw notFound(`Place ${code}`);
    return p;
  }

  async allPlaces(): Promise<Place[]> {
    await this.ensureLoaded();
    return [...this.placesById.values()];
  }

  async searchPlaces(q?: string, limit = 30): Promise<Place[]> {
    if (!q?.trim()) return (await this.allPlaces()).slice(0, limit);
    return this.places.find({
      where: [{ name: ILike(`%${q.trim()}%`) }, { nameAm: ILike(`%${q.trim()}%`) }, { code: ILike(q.trim()) }],
      order: { name: 'ASC' },
      take: limit,
    });
  }

  toPlaceDto(p: Place): PlaceDto {
    return { id: p.id, code: p.code, name: p.name, nameAm: p.nameAm, lat: p.location.coordinates[1], lng: p.location.coordinates[0] };
  }

  async placeDto(id: string): Promise<PlaceDto> {
    return this.toPlaceDto(await this.place(id));
  }

  async listCorridors(): Promise<CorridorDto[]> {
    await this.ensureLoaded();
    return this.corridors.map((c) => this.toCorridorDto(c));
  }

  async corridor(id: string): Promise<Corridor | null> {
    await this.ensureLoaded();
    return this.corridors.find((c) => c.id === id) ?? null;
  }

  private toCorridorDto(c: Corridor): CorridorDto {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      distanceKm: c.distanceKm,
      via: c.via,
      origin: this.toPlaceDto(c.origin),
      destination: this.toPlaceDto(c.destination),
      stops: c.stops.map((s) => ({ place: this.toPlaceDto(s.place), kmFromOrigin: s.kmFromOrigin })),
    };
  }

  /**
   * Find the shortest corridor that contains both places and return the stops between them in
   * travel order. Falls back to a straight line (x1.35 for road distance) when no corridor links them.
   */
  async resolveRoute(originId: string, destinationId: string): Promise<ResolvedRoute> {
    await this.ensureLoaded();
    const origin = await this.place(originId);
    const destination = await this.place(destinationId);

    let best: { c: Corridor; ko: number; kd: number; span: number } | null = null;
    for (const c of this.corridors) {
      const so = c.stops.find((s) => s.placeId === originId);
      const sd = c.stops.find((s) => s.placeId === destinationId);
      if (!so || !sd) continue;
      const span = Math.abs(sd.kmFromOrigin - so.kmFromOrigin);
      if (!best || span < best.span) best = { c, ko: so.kmFromOrigin, kd: sd.kmFromOrigin, span };
    }

    if (best) {
      const forward = best.kd >= best.ko;
      const lo = Math.min(best.ko, best.kd);
      const hi = Math.max(best.ko, best.kd);
      const between = best.c.stops.filter((s) => s.kmFromOrigin >= lo && s.kmFromOrigin <= hi);
      if (!forward) between.reverse();
      return {
        corridorId: best.c.id,
        corridorName: best.c.name,
        routeKm: best.span,
        direction: forward ? 'forward' : 'reverse',
        stops: between.map((s) => ({ place: s.place, km: Math.abs(s.kmFromOrigin - best!.ko) })),
      };
    }

    const km = Math.round(haversineKm(origin.location, destination.location) * ROAD_FACTOR);
    return {
      corridorId: null,
      corridorName: null,
      routeKm: km,
      direction: null,
      stops: [
        { place: origin, km: 0 },
        { place: destination, km },
      ],
    };
  }
}
