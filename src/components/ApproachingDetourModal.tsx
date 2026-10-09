import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ApproachingDetourPopup } from '../types/trip';
import { POIType } from '../types/poi';

function getCategoryIcon(type?: POIType): string {
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
}

interface ApproachingDetourModalProps {
  popup: ApproachingDetourPopup | null;
  onNavigate: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ApproachingDetourModal: React.FC<ApproachingDetourModalProps> = ({
  popup,
  onNavigate,
  onCancel,
  isLoading = false,
}) => {
  if (!popup) return null;

  const { poi, distanceMeters, milestoneMeters } = popup;

  const formatDistance = (meters: number) =>
    meters >= 1000 ? `${meters % 1000 === 0 ? meters / 1000 : (meters / 1000).toFixed(1)} km` : `${meters} m`;

  const checkpoint = formatDistance(milestoneMeters || distanceMeters);
  const formattedDistance = `${formatDistance(distanceMeters)} away`;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {/* Top Accent Header */}
        <View style={styles.headerRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>{getCategoryIcon(poi.type)}</Text>
            <Text style={styles.badgeText}>STOP IN {checkpoint.toUpperCase()}</Text>
          </View>
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceBadgeText}>{formattedDistance}</Text>
          </View>
        </View>

        {/* Location Name & Address */}
        <Text style={styles.pointName} numberOfLines={2}>
          {poi.name}
        </Text>
        {poi.vicinity ? (
          <Text style={styles.vicinity} numberOfLines={1}>
            📍 {poi.vicinity}
          </Text>
        ) : null}

        {/* Informational Subtext */}
        <Text style={styles.subtext}>
          Stop along the route, {checkpoint} ahead. Navigate to it now?
        </Text>

        {/* Two Big Action Buttons: Navigate & Cancel */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.button, styles.navigateButton, isLoading && styles.buttonDisabled]}
            onPress={onNavigate}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <Text style={styles.navigateButtonIcon}>↗</Text>
            <Text style={styles.navigateButtonText}>
              {isLoading ? 'Routing...' : 'Navigate'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onCancel}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
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
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.6,
  },
  distanceBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  distanceBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  pointName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    lineHeight: 26,
  },
  vicinity: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  subtext: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 20,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  navigateButton: {
    backgroundColor: '#16A34A', // Mobile driving green CTA
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  navigateButtonIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  navigateButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
