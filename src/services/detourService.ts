import { LocationCoordinate } from '../types/location';
import { POI } from '../types/poi';
import { Route } from '../types/route';
import { DetourInfo } from '../types/trip';
import {
  calculateHaversineDistance,
  findClosestWaypointIndex,
  calculatePathDistance,
} from './geoUtils';

export interface DetourProvider {
  calculateDetour(
    currentLocation: LocationCoordinate,
    route: Route,
    poi: POI
  ): Promise<DetourInfo>;
}

/**
 * Isolated detour calculation service.
 * Models: Current Location -> CNG -> Back to Route
 *
 * It calculates the additional driving distance and extra driving minutes
 * introduced by diverting off the route to the POI and rejoining the route.
 */
export class DetourService implements DetourProvider {
  // Average detour road speed: ~35 km/h (city / access roads / turning into gas station)
  private readonly AVERAGE_DETOUR_SPEED_MPS = 35 * (1000 / 3600); // ~9.72 m/s

  // Turn-off / deceleration / pump queuing / rejoin buffer in minutes (approx 0.5 min base)
  private readonly REJOIN_PENALTY_MINUTES = 0.5;

  /**
   * Calculates the extra driving detour introduced by visiting the POI.
   *
   * Path 1 (Regular route): Current Location -> Waypoint[rejoin]
   * Path 2 (Detour route):  Current Location -> POI -> Waypoint[rejoin]
   * Detour Distance = Path 2 distance - Path 1 distance
   * Detour Time = (Detour Distance / Detour Speed) + turn penalty
   */
  async calculateDetour(
    currentLocation: LocationCoordinate,
    route: Route,
    poi: POI
  ): Promise<DetourInfo> {
    const waypoints = route.waypoints;

    if (!waypoints || waypoints.length === 0) {
      // Fallback direct distance detour estimate
      const directMeters = calculateHaversineDistance(currentLocation, poi.coordinates);
      const roundTripMeters = directMeters * 2;
      const minutes = (roundTripMeters / this.AVERAGE_DETOUR_SPEED_MPS) / 60;
      return {
        detourDistanceMeters: Math.round(roundTripMeters),
        detourMinutes: Math.round(minutes * 10) / 10,
      };
    }

    // 1. Identify where on the route the POI rejoins
    const poiRejoinIndex = findClosestWaypointIndex(poi.coordinates, waypoints);
    const rejoinWaypoint = waypoints[poiRejoinIndex];

    // 2. Identify user's current progress along route
    const userIndex = findClosestWaypointIndex(currentLocation, waypoints);

    // 3. Distance of regular route from user's current position to the rejoin point
    let regularRouteDistance: number;
    if (poiRejoinIndex >= userIndex) {
      regularRouteDistance =
        calculateHaversineDistance(currentLocation, waypoints[userIndex]) +
        calculatePathDistance(waypoints, userIndex, poiRejoinIndex);
    } else {
      // If user passed the closest waypoint, direct distance to rejoin
      regularRouteDistance = calculateHaversineDistance(currentLocation, rejoinWaypoint);
    }

    // 4. Detour path: Current Location -> POI -> Rejoin Waypoint
    const distToPOI = calculateHaversineDistance(currentLocation, poi.coordinates);
    const distPOIToRejoin = calculateHaversineDistance(poi.coordinates, rejoinWaypoint);
    const detourPathDistance = distToPOI + distPOIToRejoin;

    // Extra distance added by taking detour (cannot be less than off-route loop 2 * distPOIToRejoin)
    const extraDistanceMeters = Math.max(
      distPOIToRejoin * 1.8,
      detourPathDistance - regularRouteDistance
    );

    // Driving time for this extra distance + turning/intersection allowance
    const driveTimeMinutes = (extraDistanceMeters / this.AVERAGE_DETOUR_SPEED_MPS) / 60;
    const totalDetourMinutes = driveTimeMinutes + this.REJOIN_PENALTY_MINUTES;

    return {
      detourDistanceMeters: Math.round(extraDistanceMeters),
      detourMinutes: Math.max(0.2, Math.round(totalDetourMinutes * 10) / 10),
    };
  }
}

export const detourService = new DetourService();
