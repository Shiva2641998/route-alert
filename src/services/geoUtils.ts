import { LocationCoordinate } from '../types/location';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates the great-circle distance between two coordinates in meters using the Haversine formula.
 */
export function calculateHaversineDistance(
  coord1: LocationCoordinate,
  coord2: LocationCoordinate
): number {
  const toRad = (angle: number) => (angle * Math.PI) / 180;

  const lat1Rad = toRad(coord1.latitude);
  const lat2Rad = toRad(coord2.latitude);
  const deltaLatRad = toRad(coord2.latitude - coord1.latitude);
  const deltaLonRad = toRad(coord2.longitude - coord1.longitude);

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Finds the index of the closest waypoint on the route to a given coordinate.
 */
export function findClosestWaypointIndex(
  point: LocationCoordinate,
  waypoints: LocationCoordinate[]
): number {
  if (waypoints.length === 0) return -1;

  let minDistance = Infinity;
  let closestIndex = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const dist = calculateHaversineDistance(point, waypoints[i]);
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }

  return closestIndex;
}

/**
 * Calculates bearing/heading angle in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 */
export function calculateBearing(from: LocationCoordinate, to: LocationCoordinate): number {
  const toRad = (angle: number) => (angle * Math.PI) / 180;
  const toDeg = (angle: number) => (angle * 180) / Math.PI;

  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * Subsamples/interpolates between waypoints so that vehicle motion and polyline resolution
 * feels smooth and continuous like Uber / Google Maps turn-by-turn navigation.
 */
export function interpolatePoints(
  p1: LocationCoordinate,
  p2: LocationCoordinate,
  steps: number
): LocationCoordinate[] {
  const points: LocationCoordinate[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    points.push({
      latitude: p1.latitude + (p2.latitude - p1.latitude) * t,
      longitude: p1.longitude + (p2.longitude - p1.longitude) * t,
    });
  }
  return points;
}

export function calculatePathDistance(
  waypoints: LocationCoordinate[],
  startIndex: number = 0,
  endIndex: number = waypoints.length - 1
): number {
  if (waypoints.length < 2 || startIndex >= endIndex) return 0;

  let totalMeters = 0;
  const start = Math.max(0, startIndex);
  const end = Math.min(waypoints.length - 1, endIndex);

  for (let i = start; i < end; i++) {
    totalMeters += calculateHaversineDistance(waypoints[i], waypoints[i + 1]);
  }

  return totalMeters;
}

/**
 * Determines whether a POI is positioned ahead of the user along the route path.
 */
export function isPOIAheadOfUser(
  userLocation: LocationCoordinate,
  poiLocation: LocationCoordinate,
  waypoints: LocationCoordinate[]
): boolean {
  if (waypoints.length < 2) return true;

  const userIndex = findClosestWaypointIndex(userLocation, waypoints);
  const poiIndex = findClosestWaypointIndex(poiLocation, waypoints);

  // If the POI's closest route point is ahead of or equal to user's route point
  if (poiIndex > userIndex) {
    return true;
  }

  if (poiIndex === userIndex) {
    // If on same segment, check distance to next waypoint:
    // POI is ahead if user is further from destination than POI is
    const dest = waypoints[waypoints.length - 1];
    const userToDest = calculateHaversineDistance(userLocation, dest);
    const poiToDest = calculateHaversineDistance(poiLocation, dest);
    return poiToDest < userToDest;
  }

  return false;
}
