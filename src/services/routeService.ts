import { Route } from '../types/route';
import { LocationCoordinate } from '../types/location';
import { calculatePathDistance, calculateHaversineDistance } from './geoUtils';
import { readGoogleMapsApiKey } from './googleKey';

export interface RouteEndpoints {
  origin?: LocationCoordinate;
  destination?: LocationCoordinate;
}

export interface RouteProvider {
  calculateRoute(origin: string, destination: string, endpoints?: RouteEndpoints): Promise<Route>;
}

/**
 * Decodes an encoded Google Maps Polyline string into coordinates array.
 */
export function decodePolyline(encoded: string): LocationCoordinate[] {
  const points: LocationCoordinate[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

/**
 * Standard realistic route points for Delhi to Jaipur via NH48
 */
export const DEFAULT_DELHI_JAIPUR_WAYPOINTS: LocationCoordinate[] = [
  // 1. Central Delhi - Connaught Place Outer Circle
  { latitude: 28.6315, longitude: 77.2167 },
  { latitude: 28.6180, longitude: 77.2085 },
  // 2. Chanakyapuri / Shanti Path (Diplomatic Enclave)
  { latitude: 28.5925, longitude: 77.1890 },
  // 3. Dhaula Kuan Flyover & Ring Road Junction
  { latitude: 28.5880, longitude: 77.1585 },
  // 4. Delhi Cantt & Subroto Park
  { latitude: 28.5720, longitude: 77.1410 },
  // 5. Mahipalpur Bypass & IGI Airport Terminal 3 Gateway
  { latitude: 28.5435, longitude: 77.1195 },
  // 6. Rajokri Border (Delhi - Haryana Entry Toll)
  { latitude: 28.5132, longitude: 77.0984 },
  // 7. Gurugram Ambience Mall & DLF Cyber Hub (NH48 Expressway)
  { latitude: 28.4985, longitude: 77.0890 },
  // 8. IFFCO Chowk Elevated Flyover
  { latitude: 28.4720, longitude: 77.0680 },
  // 9. Rajiv Chowk Underpass (Gurugram Central)
  { latitude: 28.4510, longitude: 77.0425 },
  // 10. Hero Honda Chowk
  { latitude: 28.4320, longitude: 77.0185 },
  // 11. Kherki Daula Toll Plaza (Dwarka Expressway cloverleaf)
  { latitude: 28.4089, longitude: 76.9944 },
  // 12. IMT Manesar Industrial Expressway (Near ABC CNG Station)
  { latitude: 28.3541, longitude: 76.9419 },
  // 13. Panchgaon Chowk (KMP Expressway interchange)
  { latitude: 28.3180, longitude: 76.8920 },
  // 14. Bilaspur Chowk
  { latitude: 28.2710, longitude: 76.8450 },
  // 15. Dharuhera Bypass & Bhiwadi Border Cut
  { latitude: 28.2140, longitude: 76.7990 },
  // 16. Masani Barrage / Sahibi River Bridge
  { latitude: 28.1630, longitude: 76.7110 },
  // 17. Bawal Industrial Area (Haryana border)
  { latitude: 28.0650, longitude: 76.5780 },
  // 18. Jaisinghpura Khera (Rajasthan Border Gateway)
  { latitude: 28.0035, longitude: 76.4712 },
  // 19. Neemrana Japanese Zone & Fort Palace Cut
  { latitude: 27.9890, longitude: 76.3860 },
  // 20. Behror Bypass (Midway Oasis)
  { latitude: 27.8872, longitude: 76.2825 },
  // 21. Kotputli Flyover & RIICO Industrial Zone
  { latitude: 27.7051, longitude: 76.2012 },
  // 22. Pragpura / Paota Junction
  { latitude: 27.5348, longitude: 76.1245 },
  // 23. Shahpura Toll Plaza & Town Bypass
  { latitude: 27.3879, longitude: 75.9587 },
  // 24. Manoharpur Highway Crossing
  { latitude: 27.3015, longitude: 75.9280 },
  // 25. Chandwaji / Amity University Interchange
  { latitude: 27.1865, longitude: 75.8940 },
  // 26. Achrol Valley Curve
  { latitude: 27.1240, longitude: 75.8810 },
  // 27. Kukas Industrial & Hotel Corridor
  { latitude: 27.0520, longitude: 75.8715 },
  // 28. Amer Fort Foothills & Delhi-Jaipur Highway Gateway
  { latitude: 26.9850, longitude: 75.8520 },
  // 29. Jal Mahal Tourist Corridor
  { latitude: 26.9535, longitude: 75.8450 },
  // 30. Zorawar Singh Gate (Old Jaipur City Wall)
  { latitude: 26.9380, longitude: 75.8320 },
  // 31. Central Jaipur / MI Road (Destination)
  { latitude: 26.9124, longitude: 75.7873 },
];

export class HybridRouteService implements RouteProvider {
  private getApiKey(): string {
    return readGoogleMapsApiKey();
  }

  private async geocodePlace(name: string): Promise<LocationCoordinate | null> {
    const known = this.resolvePlace(name);
    if (known) return known;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        name
      )}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'findAreaMap/1.0',
          Accept: 'application/json',
        },
      });
      if (!res.ok) return null;
      const list = (await res.json()) as Array<{ lat: string; lon: string }>;
      const hit = list[0];
      if (!hit) return null;
      const latitude = Number.parseFloat(hit.lat);
      const longitude = Number.parseFloat(hit.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { latitude, longitude };
    } catch {
      return null;
    }
  }

  private async calculateGoogleRoute(
    origin: string,
    destination: string,
    apiKey: string,
    endpoints?: RouteEndpoints
  ): Promise<Route | null> {
    const from = origin.trim().toLowerCase();
    const to = destination.trim().toLowerCase();
    const intermediates =
      from.includes('delhi') && to.includes('jaipur')
        ? [
            { location: { latLng: { latitude: 28.4985, longitude: 77.089 } } },
            { location: { latLng: { latitude: 28.3541, longitude: 76.9419 } } },
            { location: { latLng: { latitude: 27.8872, longitude: 76.2825 } } },
          ]
        : [];

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: endpoints?.origin
          ? { location: { latLng: endpoints.origin } }
          : { address: origin },
        destination: endpoints?.destination
          ? { location: { latLng: endpoints.destination } }
          : { address: destination },
        intermediates,
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
    };
    const road = data.routes?.[0];
    const encoded = road?.polyline?.encodedPolyline;
    if (!road || !encoded) return null;

    const waypoints = decodePolyline(encoded);
    if (waypoints.length < 2) return null;

    const durationSeconds = Number.parseInt(String(road.duration ?? '0').replace('s', ''), 10);

    return {
      id: `google-${Date.now()}`,
      originName: origin.trim() || 'Delhi',
      destinationName: destination.trim() || 'Jaipur',
      originCoordinates: waypoints[0],
      destinationCoordinates: waypoints[waypoints.length - 1],
      waypoints,
      totalDistanceMeters: road.distanceMeters ?? Math.round(calculatePathDistance(waypoints)),
      totalDurationMinutes: Math.round((Number.isFinite(durationSeconds) ? durationSeconds : 0) / 60),
    };
  }

  private resolvePlace(name: string): { latitude: number; longitude: number } | null {
    const query = name.trim().toLowerCase();
    if (!query) return null;
    if (query.includes('delhi')) return { latitude: 28.6315, longitude: 77.2167 };
    if (query.includes('jaipur')) return { latitude: 26.9124, longitude: 75.7873 };
    if (query.includes('gurugram') || query.includes('gurgaon')) {
      return { latitude: 28.4595, longitude: 77.0266 };
    }
    if (query.includes('manesar')) return { latitude: 28.3541, longitude: 76.9419 };
    return null;
  }

  /**
   * Road-following route, the same kind of geometry Uber draws on the map.
   * Uses the public driving router when a Google key is not configured.
   */
  private async calculateRoadRoute(
    origin: string,
    destination: string,
    endpoints?: RouteEndpoints
  ): Promise<Route | null> {
    const start = endpoints?.origin ?? (await this.geocodePlace(origin));
    const end = endpoints?.destination ?? (await this.geocodePlace(destination));
    if (!start || !end) return null;

    const from = origin.trim().toLowerCase();
    const to = destination.trim().toLowerCase();
    const via =
      from.includes('delhi') && to.includes('jaipur')
        ? [
            { latitude: 28.4985, longitude: 77.089 },
            { latitude: 28.3541, longitude: 76.9419 },
            { latitude: 27.8872, longitude: 76.2825 },
          ]
        : [];
    const coordinates = [start, ...via, end]
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(';');

    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      code?: string;
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };

    const road = data.routes?.[0];
    if (data.code !== 'Ok' || !road || road.geometry.coordinates.length < 2) {
      return null;
    }

    const waypoints = road.geometry.coordinates.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    }));

    return {
      id: `road-${Date.now()}`,
      originName: origin.trim() || 'Delhi',
      destinationName: destination.trim() || 'Jaipur',
      originCoordinates: waypoints[0],
      destinationCoordinates: waypoints[waypoints.length - 1],
      waypoints,
      totalDistanceMeters: Math.round(road.distance),
      totalDurationMinutes: Math.round(road.duration / 60),
    };
  }

  async calculateRoute(
    origin: string,
    destination: string,
    endpoints?: RouteEndpoints
  ): Promise<Route> {
    const apiKey = this.getApiKey();

    if (apiKey.length > 10) {
      try {
        const googleRoute = await this.calculateGoogleRoute(origin, destination, apiKey, endpoints);
        if (googleRoute) return googleRoute;
      } catch (e) {
        console.warn('Google Routes API call failed, using road router', e);
      }
    }

    try {
      const roadRoute = await this.calculateRoadRoute(origin, destination, endpoints);
      if (roadRoute) return roadRoute;
    } catch (e) {
      console.warn('Road router unavailable, using saved highway shape', e);
    }

    const from = origin.trim().toLowerCase();
    const to = destination.trim().toLowerCase();
    const savedDelhiJaipur =
      from.includes('delhi') && to.includes('jaipur') && !endpoints?.origin && !endpoints?.destination;
    if (!savedDelhiJaipur) {
      throw new Error('Could not find a driving route for these locations.');
    }

    // High fidelity fallback route
    const waypoints = [...DEFAULT_DELHI_JAIPUR_WAYPOINTS];
    const totalDistanceMeters = calculatePathDistance(waypoints);
    const totalDurationMinutes = Math.round((totalDistanceMeters / 1000 / 100) * 60);

    return {
      id: `route-${Date.now()}`,
      originName: origin.trim() || 'Delhi',
      destinationName: destination.trim() || 'Jaipur',
      originCoordinates: waypoints[0],
      destinationCoordinates: waypoints[waypoints.length - 1],
      waypoints,
      totalDistanceMeters: Math.round(totalDistanceMeters),
      totalDurationMinutes,
    };
  }

  /**
   * Builds a direct route from a location to a destination point (e.g. detour point),
   * utilizing Google Directions, OSRM, or interpolated waypoints.
   */
  async calculatePointToPointRoute(
    originCoord: LocationCoordinate,
    destCoord: LocationCoordinate,
    originName: string = 'Current Location',
    destName: string = 'Detour Point'
  ): Promise<Route> {
    const originStr = `${originCoord.latitude.toFixed(5)},${originCoord.longitude.toFixed(5)}`;
    const destStr = `${destCoord.latitude.toFixed(5)},${destCoord.longitude.toFixed(5)}`;

    const apiKey = this.getApiKey();
    if (apiKey.length > 10) {
      try {
        const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
          },
          body: JSON.stringify({
            origin: { location: { latLng: originCoord } },
            destination: { location: { latLng: destCoord } },
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
          };
          const road = data.routes?.[0];
          const encoded = road?.polyline?.encodedPolyline;
          if (road && encoded) {
            const waypoints = decodePolyline(encoded);
            if (waypoints.length >= 2) {
              const durSec = Number.parseInt(String(road.duration ?? '0').replace('s', ''), 10);
              return {
                id: `detour-${Date.now()}`,
                originName,
                destinationName: destName,
                originCoordinates: waypoints[0],
                destinationCoordinates: waypoints[waypoints.length - 1],
                waypoints,
                totalDistanceMeters: road.distanceMeters ?? Math.round(calculatePathDistance(waypoints)),
                totalDurationMinutes: Math.max(1, Math.round((Number.isFinite(durSec) ? durSec : 0) / 60)),
              };
            }
          }
        }
      } catch (e) {
        console.warn('Google point-to-point route failed, trying OSRM', e);
      }
    }

    // Try OSRM
    try {
      const coordStr = `${originCoord.longitude},${originCoord.latitude};${destCoord.longitude},${destCoord.latitude}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          code?: string;
          routes?: {
            distance: number;
            duration: number;
            geometry: { coordinates: [number, number][] };
          }[];
        };
        const road = data.routes?.[0];
        if (data.code === 'Ok' && road && road.geometry.coordinates.length >= 2) {
          const waypoints = road.geometry.coordinates.map(([longitude, latitude]) => ({
            latitude,
            longitude,
          }));
          return {
            id: `detour-${Date.now()}`,
            originName,
            destinationName: destName,
            originCoordinates: waypoints[0],
            destinationCoordinates: waypoints[waypoints.length - 1],
            waypoints,
            totalDistanceMeters: Math.round(road.distance),
            totalDurationMinutes: Math.max(1, Math.round(road.duration / 60)),
          };
        }
      }
    } catch (e) {
      console.warn('OSRM point-to-point route failed, using interpolated fall back', e);
    }

    // Direct interpolation fallback
    const distMeters = calculateHaversineDistance(originCoord, destCoord);
    const steps = Math.max(8, Math.min(30, Math.round(distMeters / 100)));
    const waypoints: LocationCoordinate[] = [];
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      waypoints.push({
        latitude: originCoord.latitude + (destCoord.latitude - originCoord.latitude) * frac,
        longitude: originCoord.longitude + (destCoord.longitude - originCoord.longitude) * frac,
      });
    }

    return {
      id: `detour-${Date.now()}`,
      originName,
      destinationName: destName,
      originCoordinates: waypoints[0],
      destinationCoordinates: waypoints[waypoints.length - 1],
      waypoints,
      totalDistanceMeters: Math.round(distMeters),
      totalDurationMinutes: Math.max(1, Math.round((distMeters / 1000 / 30) * 60)),
    };
  }
}

export const routeService = new HybridRouteService();
