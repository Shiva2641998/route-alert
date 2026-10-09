import { LocationCoordinate } from './location';

// Custom search or predefined stop types along route
export type POIType =
  | 'CNG'
  | 'PETROL'
  | 'EV'
  | 'RESTAURANT'
  | 'CAFE'
  | 'HOTEL'
  | 'HOSPITAL'
  | 'ATM'
  | 'CUSTOM';

export interface POI {
  id: string;
  name: string;
  type: POIType;
  coordinates: LocationCoordinate;
  rating?: number;
  vicinity?: string;
  isOpen?: boolean;
}
