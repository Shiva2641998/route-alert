import { LocationCoordinate } from './location';

export interface Route {
  id: string;
  originName: string;
  destinationName: string;
  originCoordinates: LocationCoordinate;
  destinationCoordinates: LocationCoordinate;
  waypoints: LocationCoordinate[];
  totalDistanceMeters: number;
  totalDurationMinutes: number;
}
