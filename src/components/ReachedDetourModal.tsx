import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ReachedDetourPopup } from '../types/trip';

interface ReachedDetourModalProps {
  popup: ReachedDetourPopup | null;
  originalDestinationName: string;
  onReached: () => void;
  onNavigateBack: () => void;
  isLoading?: boolean;
}

export const ReachedDetourModal: React.FC<ReachedDetourModalProps> = ({
  popup,
  originalDestinationName,
  onReached,
  onNavigateBack,
  isLoading = false,
}) => {
  if (!popup) return null;

  const { poi } = popup;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {/* Celebration / Check Icon */}
        <View style={styles.topIconCircle}>
          <Text style={styles.topIcon}>✓</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>You have reached the selected location</Text>

        {/* Location Box */}
        <View style={styles.stationBox}>
          <Text style={styles.stationName}>{poi.name}</Text>
          {poi.vicinity ? (
            <Text style={styles.stationVicinity} numberOfLines={2}>
              📍 {poi.vicinity}
            </Text>
          ) : null}
        </View>

        {/* Next step prompt */}
        <Text style={styles.promptText}>
          Original destination:{' '}
          <Text style={styles.promptDestHighlight}>{originalDestinationName}</Text>
        </Text>

        {/* Two Big Action Buttons: Reached & Navigate Back */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.button, styles.reachedButton]}
            onPress={onReached}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <Text style={styles.reachedButtonText}>Reached</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.navigateBackButton, isLoading && styles.buttonDisabled]}
            onPress={onNavigateBack}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <Text style={styles.navigateBackIcon}>↩</Text>
            <Text style={styles.navigateBackButtonText}>
              {isLoading ? 'Resuming...' : 'Navigate Back'}
            </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1100,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  topIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    borderWidth: 2,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  topIcon: {
    fontSize: 32,
    color: '#16A34A',
    fontWeight: '900',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 26,
  },
  stationBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  stationName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  stationVicinity: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  promptText: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 20,
  },
  promptDestHighlight: {
    fontWeight: '700',
    color: '#1E40AF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
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
  reachedButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  reachedButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  navigateBackButton: {
    backgroundColor: '#1E40AF', // Deep navigation blue
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  navigateBackIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  navigateBackButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
