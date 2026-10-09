import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Route } from '../types/route';
import { POI } from '../types/poi';
import { LocationCoordinate, UserLocation } from '../types/location';
import {
  TripConfig,
  POIAlert,
  TripStatus,
  NavigationMode,
  ApproachingDetourPopup,
  ReachedDetourPopup,
} from '../types/trip';
import { routeService } from '../services/routeService';
import { poiService } from '../services/poiService';
import { detourService } from '../services/detourService';
import { locationService } from '../services/locationService';
import { playRideSound } from '../services/rideSound';
import { resetNavigationVoice, updateNavigationVoice } from '../services/navigationVoice';
import {
  calculateHaversineDistance,
  findClosestWaypointIndex,
  calculatePathDistance,
  isPOIAheadOfUser,
} from '../services/geoUtils';

/** Stop-along alerts, from farthest to closest. Each one sounds once per stop. */
const APPROACH_MILESTONES_METERS = [5000, 2000, 1000, 500, 400];

function approachMilestone(distanceMeters: number): number | null {
  let stage: number | null = null;
  for (const milestone of APPROACH_MILESTONES_METERS) {
    if (distanceMeters <= milestone) stage = milestone;
  }
  return stage;
}
// Arrival radius to trigger reached popup (100 m)
const ARRIVAL_RADIUS_METERS = 120;

export interface TripContextType {
  status: TripStatus;
  config: TripConfig | null;
  route: Route | null;
  currentLocation: UserLocation | null;
  cngStations: POI[];
  activeAlert: POIAlert | null;
  remainingDistanceMeters: number;
  remainingDurationMinutes: number;
  isLoading: boolean;
  errorMessage: string | null;
  isSimulating: boolean;
  notifiedPoiIds: string[];
  ignoredPoiIds: string[];

  // Detour Point Navigation Flow state
  navigationMode: NavigationMode;
  originalRoute: Route | null;
  originalDepartureLocation: LocationCoordinate | null;
  originalDestination: string | null;
  detourPoint: POI | null;
  detourRoute: Route | null;
  approachingPopup: ApproachingDetourPopup | null;
  reachedPopup: ReachedDetourPopup | null;

  // Actions
  startTrip: (config: TripConfig, simulate?: boolean) => Promise<boolean>;
  endTrip: () => void;
  ignoreAlert?: () => void;
  navigateAlert?: () => void;
  stepSimulationForward: () => void;
  toggleSimulationMode: () => void;

  // Approaching Detour Popup actions
  acceptApproachingDetour: () => Promise<void>;
  cancelApproachingDetour: () => void;

  // Reached Detour Popup actions
  confirmReached: () => void;
  navigateBackToOriginalRoute: () => Promise<void>;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<TripStatus>('NOT_STARTED');
  const [config, setConfig] = useState<TripConfig | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [currentLocation, setCurrentLocation] = useState<UserLocation | null>(null);
  const [cngStations, setCngStations] = useState<POI[]>([]);
  const [activeAlert, setActiveAlert] = useState<POIAlert | null>(null);
  const [remainingDistanceMeters, setRemainingDistanceMeters] = useState<number>(0);
  const [remainingDurationMinutes, setRemainingDurationMinutes] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);

  // Detour Point Navigation Flow State
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('MAIN_ROUTE');
  const [originalRoute, setOriginalRoute] = useState<Route | null>(null);
  const [originalDepartureLocation, setOriginalDepartureLocation] = useState<LocationCoordinate | null>(null);
  const [originalDestination, setOriginalDestination] = useState<string | null>(null);
  const [detourPoint, setDetourPoint] = useState<POI | null>(null);
  const [detourRoute, setDetourRoute] = useState<Route | null>(null);
  const [approachingPopup, setApproachingPopup] = useState<ApproachingDetourPopup | null>(null);
  const [reachedPopup, setReachedPopup] = useState<ReachedDetourPopup | null>(null);

  // Fast tracking refs to avoid race conditions & duplicate popups
  const notifiedPoiIdsRef = useRef<Set<string>>(new Set());
  const ignoredPoiIdsRef = useRef<Set<string>>(new Set());
  const cancelledApproachingPoiIdsRef = useRef<Set<string>>(new Set());
  const acceptedApproachingPoiIdsRef = useRef<Set<string>>(new Set());
  const announcedMilestoneRef = useRef<Map<string, number>>(new Map());
  // While the user is on a stop detour, or just rejoining, skip other approaching popups.
  const alertsPausedRef = useRef(false);
  const resumeAlertsAnchorRef = useRef<LocationCoordinate | null>(null);

  const [notifiedPoiIdsList, setNotifiedPoiIdsList] = useState<string[]>([]);
  const [ignoredPoiIdsList, setIgnoredPoiIdsList] = useState<string[]>([]);

  // Refs for current synchronous state access inside location callbacks
  const navigationModeRef = useRef<NavigationMode>('MAIN_ROUTE');
  navigationModeRef.current = navigationMode;

  const originalRouteRef = useRef<Route | null>(null);
  originalRouteRef.current = originalRoute;

  const activeRouteRef = useRef<Route | null>(null);
  activeRouteRef.current = route;

  const detourPointRef = useRef<POI | null>(null);
  detourPointRef.current = detourPoint;

  const detourRouteRef = useRef<Route | null>(null);
  detourRouteRef.current = detourRoute;

  const activeAlertRef = useRef<POIAlert | null>(null);
  activeAlertRef.current = activeAlert;

  const approachingPopupRef = useRef<ApproachingDetourPopup | null>(null);
  approachingPopupRef.current = approachingPopup;

  const reachedPopupRef = useRef<ReachedDetourPopup | null>(null);
  reachedPopupRef.current = reachedPopup;

  const currentLocationRef = useRef<UserLocation | null>(null);
  currentLocationRef.current = currentLocation;

  const configRef = useRef<TripConfig | null>(null);
  configRef.current = config;

  const isSimulatingRef = useRef<boolean>(true);
  isSimulatingRef.current = isSimulating;

  const cngStationsRef = useRef<POI[]>([]);
  cngStationsRef.current = cngStations;

  /**
   * Evaluates location updates based on the current navigationMode state machine.
   */
  const processLocationUpdate = useCallback(
    async (
      loc: UserLocation,
      activeRoute: Route,
      activeConfig: TripConfig,
      stations: POI[]
    ) => {
      setCurrentLocation(loc);
      updateNavigationVoice(loc, activeRoute);

      const mode = navigationModeRef.current;

      // ─────────────────────────────────────────────────────────────
      // STATE 1 & 2: MAIN ROUTE & APPROACHING DETOUR
      // ─────────────────────────────────────────────────────────────
      if (mode === 'MAIN_ROUTE' || mode === 'APPROACHING_DETOUR') {
        // 1. Calculate remaining distance & ETA to destination
        const userWaypointIndex = findClosestWaypointIndex(loc, activeRoute.waypoints);
        const distFromUserToClosest = calculateHaversineDistance(
          loc,
          activeRoute.waypoints[userWaypointIndex]
        );
        const remainingPath = calculatePathDistance(
          activeRoute.waypoints,
          userWaypointIndex,
          activeRoute.waypoints.length - 1
        );
        const totalRemainingMeters = Math.max(0, distFromUserToClosest + remainingPath);
        setRemainingDistanceMeters(totalRemainingMeters);
        const remainingMinutes = Math.round((totalRemainingMeters / 1000 / 100) * 60);
        setRemainingDurationMinutes(remainingMinutes);

        // After Navigate Back, wait until the car has left the stop before the next popup.
        if (alertsPausedRef.current) {
          const anchor = resumeAlertsAnchorRef.current;
          if (anchor && calculateHaversineDistance(loc, anchor) > 1500) {
            alertsPausedRef.current = false;
            resumeAlertsAnchorRef.current = null;
          }
        }

        // Announce the nearest stop ahead at 5 km, 2 km, 1 km, 500 m, and 400 m.
        if (!alertsPausedRef.current) {
          let nearest: { station: POI; distance: number; stage: number } | null = null;
          for (const station of stations) {
            if (acceptedApproachingPoiIdsRef.current.has(station.id)) continue;
            if (ignoredPoiIdsRef.current.has(station.id)) continue;

            const directDist = calculateHaversineDistance(loc, station.coordinates);
            const ahead = isPOIAheadOfUser(loc, station.coordinates, activeRoute.waypoints);
            const stage = ahead ? approachMilestone(directDist) : null;
            if (stage == null) continue;
            if (!nearest || directDist < nearest.distance) {
              nearest = { station, distance: directDist, stage };
            }
          }

          if (nearest) {
            const previous = announcedMilestoneRef.current.get(nearest.station.id) ?? Infinity;
            const roundedDistance = Math.round(nearest.distance);
            const currentPopup = approachingPopupRef.current;
            const isNewStage = nearest.stage < previous;

            if (isNewStage) {
              announcedMilestoneRef.current.set(nearest.station.id, nearest.stage);
              const popupData: ApproachingDetourPopup = {
                poi: nearest.station,
                distanceMeters: roundedDistance,
                milestoneMeters: nearest.stage,
              };
              approachingPopupRef.current = popupData;
              setNavigationMode('APPROACHING_DETOUR');
              setApproachingPopup(popupData);
              playRideSound('popup');
            } else if (currentPopup?.poi.id === nearest.station.id) {
              const popupData: ApproachingDetourPopup = {
                poi: nearest.station,
                distanceMeters: roundedDistance,
                milestoneMeters: currentPopup.milestoneMeters,
              };
              approachingPopupRef.current = popupData;
              setApproachingPopup(popupData);
            }
          }
        }
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // STATE 3: DETOUR_NAVIGATION (Turn-by-turn toward detour point)
      // ─────────────────────────────────────────────────────────────
      if (mode === 'DETOUR_NAVIGATION') {
        if (approachingPopupRef.current) {
          approachingPopupRef.current = null;
          setApproachingPopup(null);
        }
        const targetPoi = detourPointRef.current;
        if (!targetPoi) return;

        // Calculate distance from current position to detour point
        const distToDetour = calculateHaversineDistance(loc, targetPoi.coordinates);
        setRemainingDistanceMeters(Math.round(distToDetour));
        setRemainingDurationMinutes(Math.max(1, Math.round((distToDetour / 1000 / 30) * 60)));

        // Detect arrival at the detour point
        if (distToDetour <= ARRIVAL_RADIUS_METERS) {
          // Pause simulation while user is at the point
          if (isSimulatingRef.current) {
            locationService.stopSimulation();
          }

          setNavigationMode('REACHED_DETOUR');
          setReachedPopup({
            poi: targetPoi,
            distanceMeters: Math.round(distToDetour),
          });
          playRideSound('popup');
        }
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // STATE 4: REACHED_DETOUR
      // ─────────────────────────────────────────────────────────────
      if (mode === 'REACHED_DETOUR') {
        // Just maintain current view, waiting for user to tap Reached / Navigate Back
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // STATE 5: RETURNING_TO_MAIN_ROUTE
      // ─────────────────────────────────────────────────────────────
      if (mode === 'RETURNING_TO_MAIN_ROUTE') {
        const userWaypointIndex = findClosestWaypointIndex(loc, activeRoute.waypoints);
        const remainingPath = calculatePathDistance(
          activeRoute.waypoints,
          userWaypointIndex,
          activeRoute.waypoints.length - 1
        );
        setRemainingDistanceMeters(Math.round(remainingPath));
        setRemainingDurationMinutes(Math.round((remainingPath / 1000 / 100) * 60));

        // Once back within 300m of the main route corridor, transition to MAIN_ROUTE
        const orig = originalRouteRef.current;
        if (orig) {
          const closestOrigIdx = findClosestWaypointIndex(loc, orig.waypoints);
          const distToOrig = calculateHaversineDistance(loc, orig.waypoints[closestOrigIdx]);
          if (distToOrig < 300) {
            setNavigationMode('MAIN_ROUTE');
          }
        }
      }
    },
    []
  );

  /**
   * Starts a new trip: resets alert tracking, calculates route, fetches stations, starts tracking.
   */
  const startTrip = useCallback(
    async (newConfig: TripConfig, simulate: boolean = true): Promise<boolean> => {
      setIsLoading(true);
      setErrorMessage(null);

      // Reset trip memory
      notifiedPoiIdsRef.current.clear();
      ignoredPoiIdsRef.current.clear();
      cancelledApproachingPoiIdsRef.current.clear();
      acceptedApproachingPoiIdsRef.current.clear();
      announcedMilestoneRef.current.clear();
      alertsPausedRef.current = false;
      resumeAlertsAnchorRef.current = null;
      setNotifiedPoiIdsList([]);
      setIgnoredPoiIdsList([]);
      setActiveAlert(null);
      setApproachingPopup(null);
      setReachedPopup(null);
      setDetourPoint(null);
      setDetourRoute(null);
      setNavigationMode('MAIN_ROUTE');
      setIsSimulating(simulate);
      resetNavigationVoice();

      try {
        // 1. Calculate Route
        const calculatedRoute = await routeService.calculateRoute(
          newConfig.origin,
          newConfig.destination,
          {
            origin: newConfig.originCoordinates,
            destination: newConfig.destinationCoordinates,
          }
        );

        // 2. Fetch POIs (CNG, Petrol, Restaurant, Hotel, ATM, Custom) along route
        const searchQuery = newConfig.searchQuery || (newConfig.poiType === 'CNG' ? 'CNG station' : newConfig.poiType);
        const stations = await poiService.searchPOIsAlongRoute(
          calculatedRoute,
          searchQuery,
          newConfig.poiType
        );

        // Store original trip baseline
        const departureCoord: LocationCoordinate = {
          latitude: calculatedRoute.waypoints[0].latitude,
          longitude: calculatedRoute.waypoints[0].longitude,
        };
        setOriginalDepartureLocation(departureCoord);
        setOriginalDestination(newConfig.destination);
        setOriginalRoute(calculatedRoute);

        setRoute(calculatedRoute);
        setConfig(newConfig);
        setCngStations(stations);
        setRemainingDistanceMeters(calculatedRoute.totalDistanceMeters);
        setRemainingDurationMinutes(calculatedRoute.totalDurationMinutes);
        setStatus('ACTIVE');
        playRideSound('start');

        // Initial location at start of route
        const initialLoc: UserLocation = {
          latitude: calculatedRoute.waypoints[0].latitude,
          longitude: calculatedRoute.waypoints[0].longitude,
          accuracy: 5,
          heading: 215,
          speed: 100 / 3.6,
          timestamp: Date.now(),
        };
        setCurrentLocation(initialLoc);

        if (simulate) {
          locationService.startRouteSimulation(
            calculatedRoute,
            (simLoc) => {
              processLocationUpdate(simLoc, calculatedRoute, newConfig, stations);
            }
          );
        } else {
          const started = await locationService.startLiveTracking(
            (liveLoc) => {
              processLocationUpdate(liveLoc, calculatedRoute, newConfig, stations);
            },
            (error) => {
              setErrorMessage(error);
            }
          );

          if (!started) {
            setIsSimulating(true);
            locationService.startRouteSimulation(
              calculatedRoute,
              (simLoc) => {
                processLocationUpdate(simLoc, calculatedRoute, newConfig, stations);
              }
            );
          }
        }

        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to start trip';
        setErrorMessage(msg);
        setStatus('NOT_STARTED');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [processLocationUpdate]
  );

  /**
   * STEP 2 OF SPEC: User cancels the 1 km approaching popup.
   * - Close the popup
   * - Keep user on original/main navigation route
   * - Do not modify current route
   * - Mark point as cancelled so popup does not trigger repeatedly
   */
  const cancelApproachingDetour = useCallback(() => {
    // Dismiss this distance only. The next closer checkpoint can alert again.
    approachingPopupRef.current = null;
    setApproachingPopup(null);
    setNavigationMode('MAIN_ROUTE');
  }, []);

  /**
   * STEP 3 OF SPEC: User accepts the 1 km approaching popup (Taps "Navigate").
   * - Temporarily switch navigation from current route to selected point
   * - Start turn-by-turn navigation toward that point
   * - Continue tracking user's live location
   * - Original destination and route preserved in memory
   * - Mark point as accepted so 1km popup doesn't trigger again
   */
  const acceptApproachingDetour = useCallback(async () => {
    const popup = approachingPopupRef.current;
    if (!popup) return;

    const station = popup.poi;
    acceptedApproachingPoiIdsRef.current.add(station.id);
    alertsPausedRef.current = true;
    approachingPopupRef.current = null;
    navigationModeRef.current = 'DETOUR_NAVIGATION';
    setApproachingPopup(null);
    setIsLoading(true);

    try {
      const curr = currentLocationRef.current || {
        latitude: station.coordinates.latitude - 0.008,
        longitude: station.coordinates.longitude - 0.008,
      };

      // Calculate temporary detour route to this point
      const p2pRoute = await routeService.calculatePointToPointRoute(
        curr,
        station.coordinates,
        'Current Position',
        station.name
      );

      setDetourPoint(station);
      setDetourRoute(p2pRoute);
      setRoute(p2pRoute);
      setNavigationMode('DETOUR_NAVIGATION');

      // Update ETA & distance for the detour leg
      setRemainingDistanceMeters(p2pRoute.totalDistanceMeters);
      setRemainingDurationMinutes(p2pRoute.totalDurationMinutes);

      // If in simulation mode, drive the car along this detour route to the station
      if (isSimulatingRef.current && configRef.current) {
        locationService.startRouteSimulation(
          p2pRoute,
          (simLoc) => {
            processLocationUpdate(simLoc, p2pRoute, configRef.current!, cngStationsRef.current);
          },
          600
        );
      }
    } catch (e) {
      console.warn('Failed to switch to detour navigation', e);
    } finally {
      setIsLoading(false);
    }
  }, [processLocationUpdate]);

  /**
   * STEP 4 OF SPEC: User taps "Reached" on arrival popup.
   * Acknowledges arrival, keeps reached popup open or ready to "Navigate Back".
   */
  const confirmReached = useCallback(() => {
    // Keep user aware they are at the destination; popup offers Navigate Back
    setNavigationMode('REACHED_DETOUR');
  }, []);

  /**
   * STEP 5 OF SPEC: User selects "Navigate Back"
   * - Resume navigation to original destination
   * - Restore original/main route as much as possible
   * - Do NOT restart trip from scratch
   * - Continue navigation from user's current location
   * - Original departure/start location remains stored
   */
  const navigateBackToOriginalRoute = useCallback(async () => {
    setIsLoading(true);
    setReachedPopup(null);
    approachingPopupRef.current = null;
    setApproachingPopup(null);
    alertsPausedRef.current = true;
    if (currentLocationRef.current) {
      resumeAlertsAnchorRef.current = {
        latitude: currentLocationRef.current.latitude,
        longitude: currentLocationRef.current.longitude,
      };
    }
    navigationModeRef.current = 'RETURNING_TO_MAIN_ROUTE';

    try {
      const origRoute = originalRouteRef.current;
      const curr = currentLocationRef.current;
      const cfg = configRef.current;

      if (!origRoute || !cfg) {
        setNavigationMode('MAIN_ROUTE');
        return;
      }

      // Find the closest waypoint on the original route to rejoin
      const rejoinCoord = curr
        ? origRoute.waypoints[findClosestWaypointIndex(curr, origRoute.waypoints)]
        : origRoute.destinationCoordinates;

      const userRejoinIndex = curr
        ? findClosestWaypointIndex(curr, origRoute.waypoints)
        : 0;

      // Slice remaining original route waypoints ahead of rejoin point
      const remainingWaypoints = origRoute.waypoints.slice(userRejoinIndex);

      let resumedRoute: Route;

      if (curr) {
        // Calculate route segment from current location back to rejoin point
        const connector = await routeService.calculatePointToPointRoute(
          curr,
          rejoinCoord,
          'Current Location',
          'Main Highway'
        );

        // Combine: Current Location -> Rejoin connector -> Remaining original route
        const combinedWaypoints = [...connector.waypoints, ...remainingWaypoints];
        const combinedDistance = calculatePathDistance(combinedWaypoints);
        const combinedMinutes = Math.round((combinedDistance / 1000 / 100) * 60);

        resumedRoute = {
          id: `resumed-${Date.now()}`,
          originName: origRoute.originName,
          destinationName: origRoute.destinationName,
          originCoordinates: curr,
          destinationCoordinates: origRoute.destinationCoordinates,
          waypoints: combinedWaypoints,
          totalDistanceMeters: Math.round(combinedDistance),
          totalDurationMinutes: Math.max(1, combinedMinutes),
        };
      } else {
        resumedRoute = origRoute;
      }

      setRoute(resumedRoute);
      setNavigationMode('RETURNING_TO_MAIN_ROUTE');
      setRemainingDistanceMeters(resumedRoute.totalDistanceMeters);
      setRemainingDurationMinutes(resumedRoute.totalDurationMinutes);

      // Clean up detour references
      setDetourPoint(null);
      setDetourRoute(null);

      // Resume simulation or live tracking along the resumed route
      if (isSimulatingRef.current) {
        locationService.startRouteSimulation(
          resumedRoute,
          (simLoc) => {
            processLocationUpdate(simLoc, resumedRoute, cfg, cngStationsRef.current);
          },
          700
        );
      }
    } catch (e) {
      console.warn('Failed to resume original navigation', e);
      if (originalRouteRef.current) {
        setRoute(originalRouteRef.current);
      }
      setNavigationMode('MAIN_ROUTE');
    } finally {
      setIsLoading(false);
    }
  }, [processLocationUpdate]);

  /**
   * User taps [ IGNORE ] on CNG Alert card.
   */
  const ignoreAlert = useCallback(() => {
    if (activeAlert) {
      ignoredPoiIdsRef.current.add(activeAlert.poi.id);
      setIgnoredPoiIdsList(Array.from(ignoredPoiIdsRef.current));
      setActiveAlert(null);
    }
  }, [activeAlert]);

  /**
   * User taps [ NAVIGATE ] on CNG Alert card.
   * Directs user toward this station by initiating the approaching / detour flow.
   */
  const navigateAlert = useCallback(() => {
    if (activeAlert) {
      const station = activeAlert.poi;
      setActiveAlert(null);

      const curr = currentLocationRef.current;
      const dist = curr
        ? Math.round(calculateHaversineDistance(curr, station.coordinates))
        : activeAlert.directDistanceMeters;

      // Trigger the Approaching Detour Popup immediately
      setNavigationMode('APPROACHING_DETOUR');
      const stage = approachMilestone(dist) ?? APPROACH_MILESTONES_METERS[0];
      announcedMilestoneRef.current.set(station.id, stage);
      setApproachingPopup({
        poi: station,
        distanceMeters: dist,
        milestoneMeters: stage,
      });
      playRideSound('popup');
    }
  }, [activeAlert]);

  /**
   * End current trip and cleanup tracking.
   */
  const endTrip = useCallback(() => {
    playRideSound('end');
    resetNavigationVoice();
    locationService.cleanup();
    setStatus('COMPLETED');
    setActiveAlert(null);
    setApproachingPopup(null);
    setReachedPopup(null);
    setNavigationMode('MAIN_ROUTE');
  }, []);

  /**
   * Step simulation manually for instant testing.
   */
  const stepSimulationForward = useCallback(() => {
    if (route && config) {
      locationService.stepSimulation(route, (loc) => {
        processLocationUpdate(loc, route, config, cngStations);
      });
    }
  }, [route, config, cngStations, processLocationUpdate]);

  /**
   * Toggle between real GPS and route simulation.
   */
  const toggleSimulationMode = useCallback(() => {
    if (!route || !config) return;

    locationService.cleanup();
    const nextMode = !isSimulating;
    setIsSimulating(nextMode);

    if (nextMode) {
      locationService.startRouteSimulation(
        route,
        (simLoc) => {
          processLocationUpdate(simLoc, route, config, cngStations);
        }
      );
    } else {
      locationService.startLiveTracking(
        (liveLoc) => {
          processLocationUpdate(liveLoc, route, config, cngStations);
        },
        (error) => setErrorMessage(error)
      );
    }
  }, [isSimulating, route, config, cngStations, processLocationUpdate]);

  return (
    <TripContext.Provider
      value={{
        status,
        config,
        route,
        currentLocation,
        cngStations,
        activeAlert,
        remainingDistanceMeters,
        remainingDurationMinutes,
        isLoading,
        errorMessage,
        isSimulating,
        notifiedPoiIds: notifiedPoiIdsList,
        ignoredPoiIds: ignoredPoiIdsList,

        // Detour Point Navigation Flow
        navigationMode,
        originalRoute,
        originalDepartureLocation,
        originalDestination,
        detourPoint,
        detourRoute,
        approachingPopup,
        reachedPopup,

        startTrip,
        endTrip,
        ignoreAlert,
        navigateAlert,
        stepSimulationForward,
        toggleSimulationMode,

        // Detour popup handlers
        acceptApproachingDetour,
        cancelApproachingDetour,
        confirmReached,
        navigateBackToOriginalRoute,
      }}
    >
      {children}
    </TripContext.Provider>
  );
};

export const useTrip = (): TripContextType => {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error('useTrip must be used within a TripProvider');
  }
  return context;
};
