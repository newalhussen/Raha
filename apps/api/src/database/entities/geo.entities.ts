import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, Relation } from 'typeorm';
import type { PlaceKind } from '@raha/contracts';
import type { GeoPoint } from '../../common/geo';
import { numericRequired } from './transformers';

@Entity('places')
export class Place {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text', unique: true }) code: string;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text', nullable: true }) nameAm: string | null;
  @Column({ type: 'text', default: 'town' }) kind: PlaceKind;
  @Column({ type: 'text', nullable: true }) region: string | null;
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 }) location: GeoPoint;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('corridors')
export class Corridor {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text', unique: true }) code: string;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'uuid' }) originPlaceId: string;
  @Column({ type: 'uuid' }) destinationPlaceId: string;
  @Column({ type: 'numeric', precision: 7, scale: 1, transformer: numericRequired }) distanceKm: number;
  @Column({ type: 'text', nullable: true }) via: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;

  @ManyToOne(() => Place) @JoinColumn({ name: 'origin_place_id' }) origin: Relation<Place>;
  @ManyToOne(() => Place) @JoinColumn({ name: 'destination_place_id' }) destination: Relation<Place>;
  @OneToMany(() => CorridorStop, (s) => s.corridor) stops: Relation<CorridorStop[]>;
}

@Entity('corridor_stops')
export class CorridorStop {
  @PrimaryColumn({ type: 'uuid' }) corridorId: string;
  @PrimaryColumn({ type: 'uuid' }) placeId: string;
  @Column({ type: 'int' }) seq: number;
  @Column({ type: 'numeric', precision: 7, scale: 1, transformer: numericRequired }) kmFromOrigin: number;

  @ManyToOne(() => Corridor, (c) => c.stops, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'corridor_id' }) corridor: Relation<Corridor>;
  @ManyToOne(() => Place) @JoinColumn({ name: 'place_id' }) place: Relation<Place>;
}
