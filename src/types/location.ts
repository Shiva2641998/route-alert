export interface LocationCoordinate {
  latitude: number;
  longitude: number;
}

export interface UserLocation extends LocationCoordinate {
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}
