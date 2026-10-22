const EARTH_RADIUS_MILES = 3958.7613;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in miles between two lat/lng points (haversine). */
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Round to 3 decimals for storage and display. */
export const roundMiles = (m: number) => Math.round(m * 1000) / 1000;

/** Walking minutes at a student pace of ~3 mph. */
export const walkMinutes = (miles: number) => (miles / 3) * 60;

export function formatMiles(m: number): string {
  if (m < 0.1) return `${Math.round(m * 5280 / 10) * 10} ft`;
  return `${m.toFixed(2)} mi`;
}
