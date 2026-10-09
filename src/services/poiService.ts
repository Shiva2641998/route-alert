import { POI, POIType } from '../types/poi';
import { Route } from '../types/route';
import { LocationCoordinate } from '../types/location';
import { calculateHaversineDistance, calculatePathDistance, findClosestWaypointIndex } from './geoUtils';
import { readGoogleMapsApiKey } from './googleKey';

export interface POIProvider {
  searchCNGAlongRoute(route: Route): Promise<POI[]>;
  searchPOIsAlongRoute(route: Route, query: string, type?: POIType): Promise<POI[]>;
}

const DEFAULT_MOCK_CNG_STATIONS: POI[] = [
  {
    id: 'cng-igl-dhaula-kuan',
    name: 'IGL CNG Station Dhaula Kuan',
    type: 'CNG',
    coordinates: { latitude: 28.5895, longitude: 77.1610 },
    rating: 4.3,
    vicinity: 'Ring Road Near Dhaula Kuan Metro, Delhi',
    isOpen: true,
  },
  {
    id: 'cng-igl-aerocity',
    name: 'IGL CNG Mahipalpur Aerocity',
    type: 'CNG',
    coordinates: { latitude: 28.5450, longitude: 77.1215 },
    rating: 4.1,
    vicinity: 'Near IGI Airport T3 Approach, New Delhi',
    isOpen: true,
  },
  {
    id: 'cng-haryana-cyberhub',
    name: 'Haryana City Gas DLF CyberCity',
    type: 'CNG',
    coordinates: { latitude: 28.4998, longitude: 77.0910 },
    rating: 4.4,
    vicinity: 'NH48 Cyber Hub Service Lane, Gurugram',
    isOpen: true,
  },
  {
    id: 'cng-haryana-rajiv-chowk',
    name: 'HCG Station Rajiv Chowk',
    type: 'CNG',
    coordinates: { latitude: 28.4525, longitude: 77.0450 },
    rating: 4.2,
    vicinity: 'Sohna Road Cut, Rajiv Chowk, Gurugram',
    isOpen: true,
  },
  {
    id: 'cng-abc-manesar',
    name: 'ABC CNG Station Manesar',
    type: 'CNG',
    // 250m off NH-48 waypoint 12 -> 1.4 min detour
    coordinates: { latitude: 28.3556, longitude: 76.9442 },
    rating: 4.2,
    vicinity: 'Sector 8, IMT Manesar, NH48 Corridor',
    isOpen: true,
  },
  {
    id: 'cng-haryana-gas-dharuhera',
    name: 'Haryana City Gas Dharuhera',
    type: 'CNG',
    coordinates: { latitude: 28.2158, longitude: 76.8015 },
    rating: 4.0,
    vicinity: 'Near Bhiwadi Bypass, Dharuhera NH48',
    isOpen: true,
  },
  {
    id: 'cng-deepam-behror',
    name: 'Deepam Green Gas Behror',
    type: 'CNG',
    coordinates: { latitude: 27.8895, longitude: 76.2870 },
    rating: 4.5,
    vicinity: 'NH48 Behror Bypass, Rajasthan',
    isOpen: true,
  },
  {
    id: 'cng-torrent-kotputli',
    name: 'Torrent Gas CNG Kotputli',
    type: 'CNG',
    coordinates: { latitude: 27.7075, longitude: 76.2050 },
    rating: 4.3,
    vicinity: 'RIICO Industrial Area, NH48 Kotputli',
    isOpen: true,
  },
  {
    id: 'cng-rajasthan-gas-shahpura',
    name: 'Rajasthan State Gas Shahpura',
    type: 'CNG',
    // Farther inside Shahpura, off NH48, so the driving detour stays above 2 minutes
    coordinates: { latitude: 27.412, longitude: 75.982 },
    rating: 3.9,
    vicinity: 'Old Market Link Road, Shahpura',
    isOpen: true,
  },
  {
    id: 'cng-torrent-kukas',
    name: 'Torrent Gas Kukas Gateway',
    type: 'CNG',
    coordinates: { latitude: 27.0545, longitude: 75.8740 },
    rating: 4.4,
    vicinity: 'Hotel Corridor, Kukas, Jaipur Highway',
    isOpen: true,
  },
];

const CORRIDOR_METERS = 4000;
const MAX_SAMPLES = 8;

function sampleAlongRoute(waypoints: LocationCoordinate[]): LocationCoordinate[] {
  if (waypoints.length === 0) return [];
  if (waypoints.length === 1) return [waypoints[0]];

  const total = calculatePathDistance(waypoints);
  const spacing = Math.max(6000, total / Math.max(1, MAX_SAMPLES - 1));
  const samples: LocationCoordinate[] = [waypoints[0]];
  let walked = 0;
  let nextAt = spacing;

  for (let i = 1; i < waypoints.length; i++) {
    walked += calculateHaversineDistance(waypoints[i - 1], waypoints[i]);
    if (walked >= nextAt) {
      samples.push(waypoints[i]);
      nextAt += spacing;
    }
  }

  const last = waypoints[waypoints.length - 1];
  if (calculateHaversineDistance(samples[samples.length - 1], last) > 2000) {
    samples.push(last);
  }

  return samples.slice(0, MAX_SAMPLES);
}

function distanceToRoute(point: LocationCoordinate, waypoints: LocationCoordinate[]): number {
  const index = findClosestWaypointIndex(point, waypoints);
  if (index < 0) return Infinity;
  return calculateHaversineDistance(point, waypoints[index]);
}

function isDelhiJaipurCorridor(route: Route): boolean {
  const origin = route.originName.toLowerCase();
  const destination = route.destinationName.toLowerCase();
  return origin.includes('delhi') && destination.includes('jaipur');
}

async function searchGoogleCngNear(
  point: LocationCoordinate,
  apiKey: string
): Promise<POI[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.rating,places.formattedAddress,places.businessStatus',
    },
    body: JSON.stringify({
      textQuery: 'CNG station',
      pageSize: 8,
      locationBias: {
        circle: {
          center: { latitude: point.latitude, longitude: point.longitude },
          radius: 8000,
        },
      },
    }),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      businessStatus?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };

  return (data.places ?? [])
    .filter((place) => place.id && place.location?.latitude != null && place.location.longitude != null)
    .map((place) => ({
      id: place.id as string,
      name: place.displayName?.text || 'CNG Station',
      type: 'CNG' as const,
      coordinates: {
        latitude: place.location!.latitude as number,
        longitude: place.location!.longitude as number,
      },
      rating: place.rating,
      vicinity: place.formattedAddress,
      isOpen: place.businessStatus ? place.businessStatus === 'OPERATIONAL' : undefined,
    }));
}

async function searchOverpassCng(route: Route): Promise<POI[]> {
  const lats = route.waypoints.map((point) => point.latitude);
  const lngs = route.waypoints.map((point) => point.longitude);
  const pad = 0.04;
  const south = Math.min(...lats) - pad;
  const north = Math.max(...lats) + pad;
  const west = Math.min(...lngs) - pad;
  const east = Math.max(...lngs) + pad;
  const query = `[out:json][timeout:20];(node["amenity"="fuel"]["fuel:cng"="yes"](${south},${west},${north},${east});node["amenity"="fuel"]["name"~"CNG",i](${south},${west},${north},${east}););out body 40;`;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    elements?: Array<{ id: number; lat?: number; lon?: number; tags?: Record<string, string> }>;
  };

  return (data.elements ?? [])
    .filter((element) => element.lat != null && element.lon != null)
    .map((element) => ({
      id: `osm-${element.id}`,
      name: element.tags?.name || 'CNG Station',
      type: 'CNG' as const,
      coordinates: { latitude: element.lat as number, longitude: element.lon as number },
      vicinity: [element.tags?.['addr:street'], element.tags?.['addr:city']].filter(Boolean).join(', ') || undefined,
      isOpen: true,
    }));
}

function preferCngNamedStations(stations: POI[]): POI[] {
  const named = stations.filter((station) =>
    /cng|natural gas|compressed|mngl|igl\b|mahanagar gas|torrent gas|adani gas/i.test(station.name)
  );
  return named.length > 0 ? named : stations;
}

async function searchGooglePOINear(
  point: LocationCoordinate,
  query: string,
  poiType: POIType,
  apiKey: string
): Promise<POI[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.rating,places.formattedAddress,places.businessStatus',
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 8,
      locationBias: {
        circle: {
          center: { latitude: point.latitude, longitude: point.longitude },
          radius: 8000,
        },
      },
    }),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      businessStatus?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };

  return (data.places ?? [])
    .filter((place) => place.id && place.location?.latitude != null && place.location.longitude != null)
    .map((place) => ({
      id: place.id as string,
      name: place.displayName?.text || query,
      type: poiType,
      coordinates: {
        latitude: place.location!.latitude as number,
        longitude: place.location!.longitude as number,
      },
      rating: place.rating,
      vicinity: place.formattedAddress,
      isOpen: place.businessStatus ? place.businessStatus === 'OPERATIONAL' : undefined,
    }));
}

async function searchOverpassGeneral(route: Route, query: string, poiType: POIType): Promise<POI[]> {
  const lats = route.waypoints.map((point) => point.latitude);
  const lngs = route.waypoints.map((point) => point.longitude);
  const pad = 0.04;
  const south = Math.min(...lats) - pad;
  const north = Math.max(...lats) + pad;
  const west = Math.min(...lngs) - pad;
  const east = Math.max(...lngs) + pad;

  const sanitized = query.replace(/[^\w\s]/gi, '').trim();
  const osmQuery = `[out:json][timeout:20];(node["name"~"${sanitized}",i](${south},${west},${north},${east});node["amenity"~"${sanitized}",i](${south},${west},${north},${east}););out body 40;`;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(osmQuery)}`,
  });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    elements?: Array<{ id: number; lat?: number; lon?: number; tags?: Record<string, string> }>;
  };

  return (data.elements ?? [])
    .filter((element) => element.lat != null && element.lon != null)
    .map((element) => ({
      id: `osm-${element.id}`,
      name: element.tags?.name || query,
      type: poiType,
      coordinates: { latitude: element.lat as number, longitude: element.lon as number },
      vicinity: [element.tags?.['addr:street'], element.tags?.['addr:city']].filter(Boolean).join(', ') || undefined,
      isOpen: true,
    }));
}

function filterStationsOnRoute(stations: POI[], route: Route, isCngSearch: boolean): POI[] {
  const unique = new Map<string, POI>();
  for (const station of stations) {
    if (distanceToRoute(station.coordinates, route.waypoints) > CORRIDOR_METERS) continue;
    if (!unique.has(station.id)) unique.set(station.id, station);
  }

  const list = isCngSearch ? preferCngNamedStations(Array.from(unique.values())) : Array.from(unique.values());
  return list.sort((a, b) => {
    return (
      findClosestWaypointIndex(a.coordinates, route.waypoints) -
      findClosestWaypointIndex(b.coordinates, route.waypoints)
    );
  });
}

export class HybridPOIService implements POIProvider {
  async searchCNGAlongRoute(route: Route): Promise<POI[]> {
    return this.searchPOIsAlongRoute(route, 'CNG station', 'CNG');
  }

  async searchPOIsAlongRoute(route: Route, query: string, type: POIType = 'CUSTOM'): Promise<POI[]> {
    const trimmedQuery = query.trim() || 'CNG station';
    const isCng = /cng/i.test(trimmedQuery);
    const resolvedType = type || (isCng ? 'CNG' : 'CUSTOM');
    const samples = sampleAlongRoute(route.waypoints);
    const apiKey = readGoogleMapsApiKey();
    let found: POI[] = [];

    if (apiKey) {
      const batches = await Promise.all(
        samples.map(async (point) => {
          try {
            return await searchGooglePOINear(point, trimmedQuery, resolvedType, apiKey);
          } catch {
            return [];
          }
        })
      );
      found = filterStationsOnRoute(batches.flat(), route, isCng);
    }

    if (found.length === 0) {
      try {
        const osmResults = isCng
          ? await searchOverpassCng(route)
          : await searchOverpassGeneral(route, trimmedQuery, resolvedType);
        found = filterStationsOnRoute(osmResults, route, isCng);
      } catch {
        found = [];
      }
    }

    if (found.length === 0 && isCng && isDelhiJaipurCorridor(route)) {
      return DEFAULT_MOCK_CNG_STATIONS;
    }

    return found;
  }
}

export const poiService = new HybridPOIService();
