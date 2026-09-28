// Pure (no DB, no server-only imports) so the self-service clock screen can
// run the same check client-side and stop an out-of-range employee before
// they sit through the liveness + biometric steps — the server re-runs it
// authoritatively regardless (SelfServiceAttendanceService).

export type GeoPoint = { latitude: number; longitude: number };

// IUGG mean Earth radius.
const EARTH_RADIUS_METERS = 6_371_008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle (haversine) distance — accurate to well under a meter at site scale. */
export function distanceInMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeofenceResult = { withinRadius: boolean; distanceMeters: number; radiusMeters: number };

export function evaluateGeofence(position: GeoPoint, site: GeoPoint & { radiusMeters: number }): GeofenceResult {
  const distance = distanceInMeters(position, site);
  return {
    withinRadius: distance <= site.radiusMeters,
    distanceMeters: Math.round(distance),
    radiusMeters: site.radiusMeters,
  };
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
