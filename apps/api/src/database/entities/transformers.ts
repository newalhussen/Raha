import type { ColumnOptions } from 'typeorm';
import type { GeoPoint } from '../../common/geo';

/** Postgres returns `numeric` as string; the API works with numbers. */
export const numeric = {
  to: (v: number | null | undefined) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : parseFloat(v)),
};

export const numericRequired = {
  to: (v: number) => v,
  from: (v: string) => parseFloat(v),
};

export const geoPoint = (nullable = true): ColumnOptions => ({
  type: 'geography',
  spatialFeatureType: 'Point',
  srid: 4326,
  nullable,
  select: true,
});

export type { GeoPoint };
