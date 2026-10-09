import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { POIAlert } from '../types/trip';

interface CNGAlertProps {
  alert: POIAlert | null;
  onNavigate: () => void;
  onIgnore: () => void;
}

export const CNGAlert: React.FC<CNGAlertProps> = ({ alert, onNavigate, onIgnore }) => {
  if (!alert) return null;

  const { poi, detour, directDistanceMeters } = alert;

  // Format distance
  const formattedDistance =
    directDistanceMeters >= 1000
      ? `${(directDistanceMeters / 1000).toFixed(1)} km`
      : `${directDistanceMeters} m`;

  return (
    <View style={styles.cardContainer}>
      <View style={styles.card}>
        {/* Header Badge */}
        <View style={styles.headerRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>⛽</Text>
            <Text style={styles.badgeText}>CNG STATION FOUND</Text>
          </View>
          <View style={styles.detourPill}>
            <Text style={styles.detourPillText}>+{detour.detourMinutes} min detour</Text>
          </View>
        </View>

        {/* Station Name & Info */}
        <Text style={styles.stationName}>{poi.name}</Text>
        {poi.vicinity ? <Text style={styles.vicinity}>📍 {poi.vicinity}</Text> : null}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Detour Time</Text>
            <Text style={styles.statValueHighlight}>+{detour.detourMinutes} min</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Distance</Text>
            <Text style={styles.statValue}>{formattedDistance}</Text>
          </View>
          {poi.rating ? (
            <>
              <View style={styles.divider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Rating</Text>
                <Text style={styles.statValue}>{poi.rating} ★</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Action Buttons: Staying 100% In-App */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.ignoreButton]}
            onPress={onIgnore}
            activeOpacity={0.7}
          >
            <Text style={styles.ignoreButtonText}>IGNORE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.navigateButton]}
            onPress={onNavigate}
            activeOpacity={0.8}
          >
            <Text style={styles.navigateButtonIcon}>↗</Text>
            <Text style={styles.navigateButtonText}>DETOUR & NAVIGATE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    zIndex: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  badgeIcon: {
    fontSize: 14,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  detourPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  detourPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  stationName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  vicinity: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  statValueHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  ignoreButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  ignoreButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  navigateButton: {
    flex: 2,
    backgroundColor: '#1A73E8', // Google Maps Blue
    gap: 6,
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  navigateButtonIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  navigateButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
