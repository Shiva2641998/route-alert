import { POI, POIType } from './poi';
import { Route } from './route';
import { LocationCoordinate, UserLocation } from './location';

export interface DetourInfo {
  detourMinutes: number;
  detourDistanceMeters: number;
}

export type TripStatus = 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED';

export interface TripConfig {
  origin: string;
  destination: string;
  originCoordinates?: LocationCoordinate;
  destinationCoordinates?: LocationCoordinate;
  poiType: POIType;
  searchQuery?: string;
  maxDetourMinutes: number;
}

export interface POIAlert {
  poi: POI;
  detour: DetourInfo;
  directDistanceMeters: number;
}

export type NavigationMode =
  | 'MAIN_ROUTE'
  | 'APPROACHING_DETOUR'
  | 'DETOUR_NAVIGATION'
  | 'REACHED_DETOUR'
  | 'RETURNING_TO_MAIN_ROUTE';

export interface ApproachingDetourPopup {
  poi: POI;
  distanceMeters: number;
  /** Distance checkpoint that opened this alert, such as 5000, 2000, 1000, 500, or 400. */
  milestoneMeters: number;
}

export interface ReachedDetourPopup {
  poi: POI;
  distanceMeters: number;
}

export interface TripState {
  status: TripStatus;
  config: TripConfig | null;
  route: Route | null;
  currentLocation: UserLocation | null;
  remainingDistanceMeters: number;
  remainingDurationMinutes: number;
  activeAlert: POIAlert | null;
  notifiedPoiIds: string[];
  ignoredPoiIds: string[];
  navigationMode: NavigationMode;
  originalRoute: Route | null;
  originalDepartureLocation: LocationCoordinate | null;
  originalDestination: string | null;
  detourPoint: POI | null;
  detourRoute: Route | null;
  approachingPopup: ApproachingDetourPopup | null;
  reachedPopup: ReachedDetourPopup | null;
}
