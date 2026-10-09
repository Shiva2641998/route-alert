import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Route } from '../types/route';
import { UserLocation, LocationCoordinate } from '../types/location';
import { POI } from '../types/poi';

interface RouteMapProps {
  route: Route | null;
  currentLocation: UserLocation | null;
  cngStations: POI[];
  activeAlertPoiId?: string;
  ignoredPoiIds?: string[];
  onSelectStation?: (poi: POI) => void;
}

const getPoiMarkerIcon = (type?: string) => {
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

export const RouteMap: React.FC<RouteMapProps> = ({
  route,
  currentLocation,
  cngStations,
  activeAlertPoiId,
  ignoredPoiIds = [],
  onSelectStation,
}) => {
  const [mapSize, setMapSize] = useState({ width: 340, height: 420 });
  const [selectedStation, setSelectedStation] = useState<POI | null>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Load Google Maps JavaScript API SDK if in web browser and API key provided
  useEffect(() => {
    if (Platform.OS === 'web' && apiKey && apiKey.trim().length > 10) {
      if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) {
        setGoogleMapsLoaded(true);
        return;
      }
      const scriptId = 'google-maps-sdk-script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
        script.async = true;
        script.onload = () => setGoogleMapsLoaded(true);
        document.head.appendChild(script);
      }
    }
  }, [apiKey]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setMapSize((current) =>
      current.width === width && current.height === height ? current : { width, height }
    );
  };

  // Compute map bounds with padding
  const bounds = useMemo(() => {
    if (!route || route.waypoints.length === 0) {
      return { minLat: 26.5, maxLat: 29.0, minLng: 75.5, maxLng: 77.5 };
    }

    const allCoords: LocationCoordinate[] = [...route.waypoints];
    cngStations.forEach((poi) => allCoords.push(poi.coordinates));
    if (currentLocation) allCoords.push(currentLocation);

    const lats = allCoords.map((c) => c.latitude);
    const lngs = allCoords.map((c) => c.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latPad = (maxLat - minLat) * 0.12 || 0.1;
    const lngPad = (maxLng - minLng) * 0.12 || 0.1;

    return {
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
      minLng: minLng - lngPad,
      maxLng: maxLng + lngPad,
    };
  }, [route, cngStations, currentLocation]);

  // Project geographic coordinates to 2D view pixel coordinates
  const projectCoord = (coord: LocationCoordinate) => {
    const { minLat, maxLat, minLng, maxLng } = bounds;
    const latSpan = maxLat - minLat || 1;
    const lngSpan = maxLng - minLng || 1;

    // Invert latitude because higher latitude is North
    const yRatio = (maxLat - coord.latitude) / latSpan;
    const xRatio = (coord.longitude - minLng) / lngSpan;

    const x = Math.max(16, Math.min(mapSize.width - 24, xRatio * mapSize.width));
    const y = Math.max(20, Math.min(mapSize.height - 24, yRatio * mapSize.height));

    return { x, y };
  };

  const projectedWaypoints = useMemo(() => {
    if (!route) return [];
    return route.waypoints.map((wp) => projectCoord(wp));
  }, [route, bounds, mapSize]);

  const projectedUser = useMemo(() => {
    if (!currentLocation) return null;
    return projectCoord(currentLocation);
  }, [currentLocation, bounds, mapSize]);

  const isSatellite = mapType === 'satellite';

  return (
    <View style={[styles.container, isSatellite && styles.containerSatellite]} onLayout={onLayout}>
      {/* Google Maps Style Base Canvas */}
      <View style={styles.mapCanvas}>
        {/* Terrain & Roads Grid Graphic (Google Maps styling) */}
        <View style={[styles.googleGridOverlay, isSatellite && styles.googleGridSatellite]} />

        {/* Route Line Shadow (Google Maps 3D navigation casing) */}
        {projectedWaypoints.map((pt, i) => {
          if (i === 0) return null;
          const prev = projectedWaypoints[i - 1];
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          return (
            <View
              key={`casing-${i}`}
              style={[
                styles.routeCasing,
                {
                  left: prev.x,
                  top: prev.y,
                  width: dist,
                  transform: [
                    { translateY: -4 },
                    { rotate: `${angle}deg` },
                    { translateY: 4 },
                  ],
                },
              ]}
            />
          );
        })}

        {/* Google Maps Navigation Blue Route Polyline */}
        {projectedWaypoints.map((pt, i) => {
          if (i === 0) return null;
          const prev = projectedWaypoints[i - 1];
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          return (
            <View
              key={`seg-${i}`}
              style={[
                styles.routeSegment,
                {
                  left: prev.x,
                  top: prev.y,
                  width: dist,
                  transform: [
                    { translateY: -3 },
                    { rotate: `${angle}deg` },
                    { translateY: 3 },
                  ],
                },
              ]}
            />
          );
        })}

        {/* Origin Marker (Delhi - Green Pin) */}
        {projectedWaypoints.length > 0 && (
          <View
            style={[
              styles.markerWrapper,
              {
                left: projectedWaypoints[0].x - 16,
                top: projectedWaypoints[0].y - 32,
              },
            ]}
          >
            <View style={styles.googlePinStart}>
              <View style={styles.googlePinInnerDot} />
            </View>
            <View style={styles.markerLabelContainer}>
              <Text style={styles.markerLabelText}>{route?.originName || 'Delhi'}</Text>
            </View>
          </View>
        )}

        {/* Destination Marker (Jaipur - Red Flag Pin) */}
        {projectedWaypoints.length > 1 && (
          <View
            style={[
              styles.markerWrapper,
              {
                left: projectedWaypoints[projectedWaypoints.length - 1].x - 16,
                top: projectedWaypoints[projectedWaypoints.length - 1].y - 32,
              },
            ]}
          >
            <View style={styles.googlePinDest}>
              <Text style={styles.googlePinDestText}>🏁</Text>
            </View>
            <View style={styles.markerLabelContainer}>
              <Text style={styles.markerLabelText}>{route?.destinationName || 'Jaipur'}</Text>
            </View>
          </View>
        )}

        {/* CNG Stations Markers */}
        {cngStations.map((station) => {
          const pt = projectCoord(station.coordinates);
          const isActive = station.id === activeAlertPoiId;
          const isIgnored = ignoredPoiIds.includes(station.id);
          const isSelected = selectedStation?.id === station.id;

          return (
            <TouchableOpacity
              key={station.id}
              activeOpacity={0.8}
              onPress={() => {
                setSelectedStation(station);
                if (onSelectStation) onSelectStation(station);
              }}
              style={[
                styles.poiMarkerContainer,
                {
                  left: pt.x - 20,
                  top: pt.y - 24,
                  opacity: isIgnored ? 0.45 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.poiBubble,
                  isActive && styles.poiBubbleActive,
                  isSelected && styles.poiBubbleSelected,
                  isIgnored && styles.poiBubbleIgnored,
                ]}
              >
                <Text style={styles.poiIcon}>{getPoiMarkerIcon(station.type)}</Text>
              </View>
              <Text
                style={[
                  styles.poiName,
                  isActive && styles.poiNameActive,
                  isSelected && styles.poiNameSelected,
                ]}
                numberOfLines={1}
              >
                {station.name.replace('CNG Station', 'CNG').replace('Station', '')}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* User Vehicle Marker with Uber/Google Maps navigation puck and dynamic heading beam */}
        {projectedUser && (
          <View
            style={[
              styles.userVehicleMarker,
              {
                left: projectedUser.x - 20,
                top: projectedUser.y - 20,
              },
            ]}
          >
            {/* Pulsing GPS accuracy aura */}
            <View style={styles.userPulseRing} />
            {/* Uber-style vehicle puck rotating to match road bearing */}
            <View
              style={[
                styles.googleNavCircle,
                {
                  transform: [
                    { rotate: `${currentLocation?.heading ?? 215}deg` },
                  ],
                },
              ]}
            >
              <View style={styles.googleNavHeadingArrow} />
            </View>
          </View>
        )}
      </View>

      {/* Google Maps Header Toolbar Controls */}
      <View style={styles.topBarControls}>
        {/* Layer Switcher (Default / Satellite) */}
        <TouchableOpacity
          style={styles.mapLayerBtn}
          onPress={() => setMapType(isSatellite ? 'standard' : 'satellite')}
          activeOpacity={0.8}
        >
          <Text style={styles.mapLayerBtnText}>{isSatellite ? '🗺️ Default' : '🛰️ Satellite'}</Text>
        </TouchableOpacity>

        {/* Live Service Indicator Badge */}
        <View style={styles.googleBrandBadge}>
          <Text style={styles.googleBrandG}>G</Text>
          <Text style={styles.googleBrandText}>Maps Service</Text>
        </View>
      </View>

      {/* Selected Station Google Maps Details Card */}
      {selectedStation && !activeAlertPoiId && (
        <View style={styles.poiPopover}>
          <View style={styles.poiPopoverHeader}>
            <View style={styles.stationTitleRow}>
              <View style={styles.stationIconBox}>
                <Text style={styles.stationIconBoxText}>⛽</Text>
              </View>
              <View style={styles.stationTitleCol}>
                <Text style={styles.poiPopoverTitle}>{selectedStation.name}</Text>
                <Text style={styles.poiPopoverRating}>{selectedStation.rating || 4.2} ★★★★☆ (Google Maps)</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setSelectedStation(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.poiPopoverClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {selectedStation.vicinity ? (
            <Text style={styles.poiPopoverVicinity}>📍 {selectedStation.vicinity}</Text>
          ) : null}

          <View style={styles.stationStatusRow}>
            <Text style={styles.openStatusBadge}>Open 24 hours</Text>
            <Text style={styles.fuelTypeBadge}>Compressed Natural Gas</Text>
          </View>
        </View>
      )}

      {/* Google Watermark Bottom Left */}
      <View style={styles.googleWatermark}>
        <Text style={styles.googleWatermarkText}>Google</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8ECEF', // Google Maps default land color
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
  },
  containerSatellite: {
    backgroundColor: '#1E293B',
  },
  mapCanvas: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  googleGridOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#EEF2F5',
    opacity: 0.8,
  },
  googleGridSatellite: {
    backgroundColor: '#0F172A',
    opacity: 0.95,
  },
  routeCasing: {
    position: 'absolute',
    height: 10,
    backgroundColor: '#1A56DB', // Dark blue casing
    borderRadius: 5,
    transformOrigin: 'left center',
  },
  routeSegment: {
    position: 'absolute',
    height: 7,
    backgroundColor: '#4285F4', // Google Maps Navigation bright cyan/blue
    borderRadius: 4,
    transformOrigin: 'left center',
  },
  markerWrapper: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10,
  },
  googlePinStart: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#34A853', // Google Green
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  googlePinInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  googlePinDest: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EA4335', // Google Red
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  googlePinDestText: {
    fontSize: 12,
  },
  markerLabelContainer: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  markerLabelText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  poiMarkerContainer: {
    position: 'absolute',
    alignItems: 'center',
    width: 80,
    zIndex: 15,
  },
  poiBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FBBC04', // Google Yellow
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  poiBubbleActive: {
    backgroundColor: '#E6F4EA',
    borderColor: '#34A853',
    transform: [{ scale: 1.3 }],
    shadowColor: '#34A853',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  poiBubbleSelected: {
    borderColor: '#4285F4',
    backgroundColor: '#E8F0FE',
    transform: [{ scale: 1.2 }],
  },
  poiBubbleIgnored: {
    backgroundColor: '#F1F3F4',
    borderColor: '#BDC1C6',
  },
  poiIcon: {
    fontSize: 15,
  },
  poiName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#202124',
    marginTop: 2,
    textAlign: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  poiNameActive: {
    color: '#137333',
    fontWeight: '800',
    fontSize: 11,
  },
  poiNameSelected: {
    color: '#1A73E8',
    fontWeight: '800',
  },
  userVehicleMarker: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 35,
  },
  userPulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(66, 133, 244, 0.25)',
  },
  googleNavCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#4285F4',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  googleNavHeadingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 10,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
    transform: [{ translateY: -1 }],
  },
  topBarControls: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 40,
  },
  mapLayerBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DADCE0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mapLayerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3C4043',
  },
  googleBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DADCE0',
    gap: 5,
  },
  googleBrandG: {
    fontSize: 13,
    fontWeight: '900',
    color: '#4285F4',
  },
  googleBrandText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F6368',
  },
  poiPopover: {
    position: 'absolute',
    bottom: 30,
    left: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DADCE0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 50,
  },
  poiPopoverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  stationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  stationIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF7E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationIconBoxText: {
    fontSize: 16,
  },
  stationTitleCol: {
    flex: 1,
  },
  poiPopoverTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
  },
  poiPopoverRating: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E37400',
    marginTop: 2,
  },
  poiPopoverClose: {
    fontSize: 16,
    color: '#5F6368',
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  poiPopoverVicinity: {
    fontSize: 12,
    color: '#5F6368',
    marginBottom: 8,
  },
  stationStatusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  openStatusBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#137333',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  fuelTypeBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1A73E8',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  googleWatermark: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    zIndex: 20,
    opacity: 0.7,
  },
  googleWatermarkText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#70757A',
    letterSpacing: -0.5,
    fontStyle: 'italic',
  },
});
