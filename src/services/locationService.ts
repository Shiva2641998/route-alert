import * as ExpoLocation from 'expo-location';
import { UserLocation, LocationCoordinate } from '../types/location';
import { Route } from '../types/route';
import { calculateBearing, calculateHaversineDistance } from './geoUtils';

/** Auto-drive cruise speed: 100 km/h. */
const AUTO_DRIVE_MAX_MPS = 100 / 3.6;
const SIM_TICK_MS = 250;

export type LocationUpdateCallback = (location: UserLocation) => void;
export type LocationErrorCallback = (error: string) => void;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Location request timed out'));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export class LocationService {
  private subscription: ExpoLocation.LocationSubscription | null = null;
  private simulationInterval: ReturnType<typeof setInterval> | null = null;
  private simulatedWaypointIndex: number = 0;
  private simulationOffsetMeters: number = 0;

  /**
   * Request device foreground location permissions.
   */
  async requestPermission(): Promise<{ granted: boolean; error?: string }> {
    try {
      const { status } = await withTimeout(
        ExpoLocation.requestForegroundPermissionsAsync(),
        8000
      );
      if (status !== 'granted') {
        return {
          granted: false,
          error: 'Location permission was denied. You can still test with route simulation.',
        };
      }
      return { granted: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to request location permission';
      return { granted: false, error: message };
    }
  }

  /**
   * Fetches current GPS location.
   */
  async getCurrentLocation(): Promise<UserLocation | null> {
    try {
      const loc = await withTimeout(
        ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        }),
        8000
      );

      return {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
        heading: loc.coords.heading ?? null,
        speed: loc.coords.speed ?? null,
        timestamp: loc.timestamp,
      };
    } catch {
      return null;
    }
  }

  /**
   * Starts tracking live device GPS location.
   */
  async startLiveTracking(
    onUpdate: LocationUpdateCallback,
    onError?: LocationErrorCallback
  ): Promise<boolean> {
    const permission = await this.requestPermission();
    if (!permission.granted) {
      if (onError && permission.error) {
        onError(permission.error);
      }
      return false;
    }

    try {
      this.subscription = await withTimeout(
        ExpoLocation.watchPositionAsync(
          {
            accuracy: ExpoLocation.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 10,
          },
          (loc) => {
            onUpdate({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy ?? null,
              heading: loc.coords.heading ?? null,
              speed: loc.coords.speed ?? null,
              timestamp: loc.timestamp,
            });
          }
        ),
        8000
      );
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'GPS is unavailable';
      if (onError) onError(message);
      return false;
    }
  }

  /**
   * Stops live device GPS tracking.
   */
  stopLiveTracking(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
  }

  /**
   * Simulates travelling along the route waypoints.
   * Enables end-to-end testing of Delhi -> Jaipur detour alerts in real-time.
   */
  startRouteSimulation(
    route: Route,
    onUpdate: LocationUpdateCallback,
    _stepIntervalMs: number = SIM_TICK_MS,
    startIndex: number = 0
  ): void {
    this.stopSimulation();
    this.simulatedWaypointIndex = Math.max(0, Math.min(startIndex, route.waypoints.length - 1));
    this.simulationOffsetMeters = 0;

    if (route.waypoints.length > 0) {
      this.emitSimulatedLocation(route, onUpdate, AUTO_DRIVE_MAX_MPS);
    }

    this.simulationInterval = setInterval(() => {
      const stillMoving = this.advanceSimulation(route, AUTO_DRIVE_MAX_MPS * (SIM_TICK_MS / 1000));
      this.emitSimulatedLocation(route, onUpdate, stillMoving ? AUTO_DRIVE_MAX_MPS : 0);
      if (!stillMoving) this.stopSimulation();
    }, SIM_TICK_MS);
  }

  /**
   * Manual advance for simulation step (e.g. "Fast Drive" button for rapid inspection).
   * Moves 1 km while keeping the same 100 km/h speed reading.
   */
  stepSimulation(route: Route, onUpdate: LocationUpdateCallback): number {
    const stillMoving = this.advanceSimulation(route, 1000);
    this.emitSimulatedLocation(route, onUpdate, stillMoving ? AUTO_DRIVE_MAX_MPS : 0);
    return this.simulatedWaypointIndex;
  }

  private advanceSimulation(route: Route, meters: number): boolean {
    const points = route.waypoints;
    let remaining = meters;

    while (remaining > 0 && this.simulatedWaypointIndex < points.length - 1) {
      const segment = calculateHaversineDistance(
        points[this.simulatedWaypointIndex],
        points[this.simulatedWaypointIndex + 1]
      );
      if (segment < 0.5) {
        this.simulatedWaypointIndex += 1;
        this.simulationOffsetMeters = 0;
        continue;
      }

      const left = segment - this.simulationOffsetMeters;
      if (remaining < left) {
        this.simulationOffsetMeters += remaining;
        return true;
      }

      remaining -= left;
      this.simulatedWaypointIndex += 1;
      this.simulationOffsetMeters = 0;
    }

    return false;
  }

  private emitSimulatedLocation(
    route: Route,
    onUpdate: LocationUpdateCallback,
    speedMps: number
  ): void {
    const points = route.waypoints;
    if (points.length === 0) return;

    const index = Math.min(this.simulatedWaypointIndex, points.length - 1);
    const current = points[index];
    const next = points[Math.min(index + 1, points.length - 1)];
    const segment = calculateHaversineDistance(current, next);
    const progress = segment > 1 ? Math.min(1, this.simulationOffsetMeters / segment) : 0;

    onUpdate({
      latitude: current.latitude + (next.latitude - current.latitude) * progress,
      longitude: current.longitude + (next.longitude - current.longitude) * progress,
      accuracy: 4,
      heading: Math.round(calculateBearing(current, next)),
      speed: speedMps,
      timestamp: Date.now(),
    });
  }

  /**
   * Stops simulation timer.
   */
  stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  /**
   * Cleanup all tracking.
   */
  cleanup(): void {
    this.stopLiveTracking();
    this.stopSimulation();
  }
}

export const locationService = new LocationService();
