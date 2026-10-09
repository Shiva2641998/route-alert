import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { LiveMap } from '../components/LiveMap';
import { ApproachingDetourModal } from '../components/ApproachingDetourModal';
import { ReachedDetourModal } from '../components/ReachedDetourModal';
import { useTrip } from '../store/tripStore';
import { POI, POIType } from '../types/poi';
import { calculateHaversineDistance, findClosestWaypointIndex } from '../services/geoUtils';
import { SoundToggle } from '../components/SoundToggle';
import { describeUpcomingTurn, ManeuverDirection } from '../services/navigationVoice';

function maneuverIcon(direction?: ManeuverDirection): string {
  if (direction === 'left') return '←';
  if (direction === 'right') return '→';
  if (direction === 'u-turn') return '↩';
  return '↑';
}

function formatAhead(meters: number): string {
  if (meters >= 950) return `In ${(meters / 1000).toFixed(1)} km`;
  const rounded = Math.max(20, Math.round(meters / 10) * 10);
  return `In ${rounded} m`;
}

export const TripScreen: React.FC = () => {
  const {
    config,
    route,
    currentLocation,
    cngStations,
    remainingDistanceMeters,
    remainingDurationMinutes,
    isSimulating,
    isLoading,
    navigationMode,
    originalRoute,
    originalDestination,
    detourPoint,
    approachingPopup,
    reachedPopup,
    endTrip,
    stepSimulationForward,
    toggleSimulationMode,
    acceptApproachingDetour,
    cancelApproachingDetour,
    confirmReached,
    navigateBackToOriginalRoute,
  } = useTrip();

  const remainingKm = Math.round(remainingDistanceMeters / 1000);
  const speedKmh = Math.min(100, Math.max(0, Math.round((currentLocation?.speed ?? 0) * 3.6)));

  // Turn-by-turn header text dynamic by navigationMode
  const isDetourMode = navigationMode === 'DETOUR_NAVIGATION';
  const isReachedMode = navigationMode === 'REACHED_DETOUR';
  const isReturningMode = navigationMode === 'RETURNING_TO_MAIN_ROUTE';

  const maneuver = useMemo(() => {
    if (!currentLocation || !route) return null;
    if (isDetourMode || isReachedMode || isReturningMode) return null;
    return describeUpcomingTurn(currentLocation, route);
  }, [currentLocation, isDetourMode, isReachedMode, isReturningMode, route]);

  let navHeading = maneuver?.title ?? 'Continue straight';
  let navSubheading =
    maneuver?.distanceMeters != null
      ? formatAhead(maneuver.distanceMeters)
      : `Towards ${config?.destination || 'Destination'}`;
  let navIcon = maneuverIcon(maneuver?.direction);

  const getPoiIcon = (type?: POIType) => {
    switch (type) {
      case 'PETROL':
        return '⛽';
      case 'EV':
        return '⚡';
      case 'RESTAURANT':
        return '🍽️';
      case 'CAFE':
        return '☕';
      case 'HOTEL':
        return '🏨';
      case 'HOSPITAL':
        return '🏥';
      case 'ATM':
        return '🏧';
      case 'CUSTOM':
        return '📍';
      default:
        return '⛽';
    }
  };

  // Always show stops whose off-route detour fits the selected time. Icons stay on the map
  // for the whole trip, not only when the car is about to reach them.
  const visibleStations = useMemo<POI[]>(() => {
    if (!cngStations || cngStations.length === 0) return [];
    const maxMinutes = config?.maxDetourMinutes ?? 2;
    const corridor = (originalRoute ?? route)?.waypoints ?? [];
    if (corridor.length === 0) return cngStations;

    return cngStations.filter((station) => {
      const idx = findClosestWaypointIndex(station.coordinates, corridor);
      const offRouteMeters = calculateHaversineDistance(station.coordinates, corridor[idx]);
      // Round trip off the highway at ~35 km/h (583 m/min) plus a short turn penalty.
      const detourMinutes = (offRouteMeters * 2) / 583 + 0.5;
      return detourMinutes <= maxMinutes;
    });
  }, [cngStations, config?.maxDetourMinutes, originalRoute, route]);

  if (isDetourMode && detourPoint) {
    navHeading = `Detour: ${detourPoint.name}`;
    navSubheading = `Approaching stop (${(remainingDistanceMeters / 1000).toFixed(1)} km)`;
    navIcon = getPoiIcon(detourPoint.type);
  } else if (isReachedMode && detourPoint) {
    navHeading = 'Arrived at Detour Point';
    navSubheading = detourPoint.name;
    navIcon = '✓';
  } else if (isReturningMode) {
    navHeading = 'Rejoining Main Route';
    navSubheading = `Continuing toward ${originalDestination || config?.destination || 'Destination'}`;
    navIcon = '↩';
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Google Maps Turn-By-Turn Navigation Header */}
      <View style={[styles.navHeaderCard, isDetourMode && styles.navHeaderDetour]}>
        <View style={[styles.navTurnIconCircle, isDetourMode && styles.navTurnIconCircleDetour]}>
          <Text style={styles.navTurnArrow}>{navIcon}</Text>
        </View>
        <View style={styles.navInstructionCol}>
          <Text style={styles.navNextManeuver} numberOfLines={1}>
            {navHeading}
          </Text>
          <Text style={styles.navNextManeuverSub} numberOfLines={1}>
            {navSubheading}
          </Text>
        </View>
        <SoundToggle variant="light" />
        <View style={styles.navSpeedBox}>
          <Text style={styles.navSpeedNumber}>{speedKmh}</Text>
          <Text style={styles.navSpeedUnit}>km/h</Text>
        </View>
      </View>

      {/* Map View Area */}
      <View style={styles.mapWrapper}>
        <LiveMap
          route={route}
          currentLocation={currentLocation}
          cngStations={visibleStations}
          activeAlertPoiId={detourPoint?.id || approachingPopup?.poi.id}
        />

        {/* 1 KM Approaching Detour Modal: Navigate & Cancel */}
        <ApproachingDetourModal
          popup={navigationMode === 'APPROACHING_DETOUR' ? approachingPopup : null}
          onNavigate={acceptApproachingDetour}
          onCancel={cancelApproachingDetour}
          isLoading={isLoading}
        />

        {/* Arrival Reached Detour Modal: Reached & Navigate Back */}
        <ReachedDetourModal
          popup={reachedPopup}
          originalDestinationName={originalDestination || config?.destination || 'Destination'}
          onReached={confirmReached}
          onNavigateBack={navigateBackToOriginalRoute}
          isLoading={isLoading}
        />
      </View>

      {/* Bottom Status & Control Panel */}
      <View style={styles.bottomPanel}>
        <View style={styles.etaEtaRow}>
          <Text style={[styles.etaDurationNumber, isDetourMode && styles.etaDurationDetour]}>
            {remainingDurationMinutes > 60
              ? `${Math.floor(remainingDurationMinutes / 60)} hr ${remainingDurationMinutes % 60} min`
              : `${remainingDurationMinutes} min`}
          </Text>
          <View style={styles.etaDotSeparator} />
          <Text style={styles.etaDistanceText}>{remainingKm} km</Text>
          <View style={styles.etaDotSeparator} />
          <Text style={styles.etaSubText}>
            {isDetourMode
              ? 'Detour in progress'
              : isReturningMode
              ? 'Returning to main route'
              : 'Fastest route now'}
          </Text>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <View style={styles.monitoringRow}>
              <View
                style={[
                  styles.pulsingGreenDot,
                  isDetourMode && styles.pulsingBlueDot,
                ]}
              />
              <Text style={[styles.monitoringText, isDetourMode && styles.monitoringBlueText]}>
                {isDetourMode
                  ? `Navigating to ${detourPoint?.name || 'Detour Stop'}`
                  : isReachedMode
                  ? 'Arrived at detour stop'
                  : `${config?.searchQuery || config?.poiType || 'Stops'} Detector Active (≤ ${config?.maxDetourMinutes || 2} min)`}
              </Text>
            </View>
          </View>

          {/* Quick Simulation Advancement button for quick demo/testing */}
          {isSimulating && (
            <TouchableOpacity
              style={styles.stepButton}
              onPress={stepSimulationForward}
              activeOpacity={0.7}
            >
              <Text style={styles.stepButtonText}>Fast Drive ⏩</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Control Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.modeToggleButton}
            onPress={toggleSimulationMode}
            activeOpacity={0.7}
          >
            <Text style={styles.modeToggleText}>
              {isSimulating ? '🛰️ Switch to Live GPS' : '🚗 Switch to Demo Drive'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endTripButton}
            onPress={endTrip}
            activeOpacity={0.8}
          >
            <Text style={styles.endTripButtonText}>✕ EXIT</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F5132', // Google Maps dark green top header banner
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  navHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F5132', // Google Navigation Dark Green
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    zIndex: 20,
  },
  navHeaderDetour: {
    backgroundColor: '#1E3A8A', // Deep Blue during Detour navigation
  },
  navTurnIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#198754',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  navTurnIconCircleDetour: {
    backgroundColor: '#2563EB',
  },
  navTurnArrow: {
    fontSize: 26,
    color: '#FFFFFF',
    fontWeight: '900',
    lineHeight: 28,
  },
  navInstructionCol: {
    flex: 1,
  },
  navNextManeuver: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  navNextManeuverSub: {
    fontSize: 13,
    color: '#D1E7DD',
    fontWeight: '500',
    marginTop: 2,
  },
  navSpeedBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#DC3545',
  },
  navSpeedNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#212529',
  },
  navSpeedUnit: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6C757D',
  },
  mapWrapper: {
    flex: 1,
    backgroundColor: '#e8eaed',
    position: 'relative',
  },
  bottomPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  etaEtaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  etaDurationNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F5132', // Google Navigation Green ETA
  },
  etaDurationDetour: {
    color: '#1E3A8A',
  },
  etaDotSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    marginHorizontal: 8,
    alignSelf: 'center',
  },
  etaDistanceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  etaSubText: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  statusLeft: {
    flex: 1,
  },
  monitoringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulsingGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  pulsingBlueDot: {
    backgroundColor: '#3B82F6',
  },
  monitoringText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  monitoringBlueText: {
    color: '#2563EB',
  },
  stepButton: {
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C2D7FF',
  },
  stepButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A73E8',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeToggleButton: {
    flex: 1,
    backgroundColor: '#F1F3F4',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3C4043',
  },
  endTripButton: {
    width: 100,
    backgroundColor: '#D93025', // Google Red Exit
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D93025',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  endTripButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
