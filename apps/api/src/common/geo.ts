/** GeoJSON helpers. TypeORM reads/writes PostGIS `geography` columns as GeoJSON. */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export function point(lat: number, lng: number): GeoPoint {
  return { type: 'Point', coordinates: [lng, lat] };
}

export function latOf(p: GeoPoint | null | undefined): number | null {
  return p ? p.coordinates[1] : null;
}

export function lngOf(p: GeoPoint | null | undefined): number | null {
  return p ? p.coordinates[0] : null;
}

/** Great-circle distance in km (used for quick sanity checks; PostGIS does the heavy lifting). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a.coordinates;
  const [lng2, lat2] = b.coordinates;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
