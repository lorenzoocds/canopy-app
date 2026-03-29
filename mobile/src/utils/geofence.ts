// Haversine formula — distance in meters between two lat/lng points
export function getDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isWithinGeofence(
  userLat: number, userLon: number,
  targetLat: number, targetLon: number,
  radiusMeters: number
): boolean {
  return getDistanceMeters(userLat, userLon, targetLat, targetLon) <= radiusMeters;
}

export const VERIFY_GEOFENCE_RADIUS = 150; // meters
export const ERRAND_GEOFENCE_RADIUS = 100; // meters
