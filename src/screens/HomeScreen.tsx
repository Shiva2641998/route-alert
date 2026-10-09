import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LocationInput } from '../components/LocationInput';
import { DetourSelector } from '../components/DetourSelector';
import { useTrip } from '../store/tripStore';
import { PlaceSuggestion } from '../services/placesService';
import { LocationCoordinate } from '../types/location';
import { POIType } from '../types/poi';
import { SoundToggle } from '../components/SoundToggle';

const PRESET_CATEGORIES: { id: POIType; label: string; icon: string; query: string }[] = [
  { id: 'CNG', label: 'CNG', icon: '⛽', query: 'CNG station' },
  { id: 'PETROL', label: 'Petrol', icon: '⛽', query: 'petrol pump gas station' },
  { id: 'EV', label: 'EV Charger', icon: '⚡', query: 'EV charging station' },
  { id: 'RESTAURANT', label: 'Food / Dhaba', icon: '🍽️', query: 'restaurant dhaba food' },
  { id: 'CAFE', label: 'Cafe', icon: '☕', query: 'cafe coffee shop' },
  { id: 'HOTEL', label: 'Hotel', icon: '🏨', query: 'hotel motel stay' },
  { id: 'HOSPITAL', label: 'Hospital', icon: '🏥', query: 'hospital medical emergency' },
  { id: 'ATM', label: 'ATM', icon: '🏧', query: 'ATM bank cash' },
];

export const HomeScreen: React.FC = () => {
  const [origin, setOrigin] = useState('Delhi');
  const [destination, setDestination] = useState('Jaipur');
  const [originCoordinates, setOriginCoordinates] = useState<LocationCoordinate | undefined>();
  const [destinationCoordinates, setDestinationCoordinates] = useState<LocationCoordinate | undefined>();
  const [selectedPoiType, setSelectedPoiType] = useState<POIType>('CNG');
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [maxDetour, setMaxDetour] = useState(2); // Default: 2 minutes
  const [simulateTrip, setSimulateTrip] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<'origin' | 'destination' | null>(null);

  const applyPlace = (
    place: PlaceSuggestion,
    setName: (value: string) => void,
    setCoordinates: (value: LocationCoordinate | undefined) => void
  ) => {
    setName(place.mainText || place.fullText);
    if (place.latitude != null && place.longitude != null) {
      setCoordinates({ latitude: place.latitude, longitude: place.longitude });
    }
  };

  const { startTrip, isLoading, errorMessage } = useTrip();

  const handleStartTrip = async () => {
    const activeCategory = PRESET_CATEGORIES.find((c) => c.id === selectedPoiType);
    const resolvedQuery =
      selectedPoiType === 'CUSTOM'
        ? customSearchQuery.trim() || 'restaurant dhaba'
        : activeCategory?.query || 'CNG station';

    await startTrip(
      {
        origin,
        destination,
        originCoordinates,
        destinationCoordinates,
        poiType: selectedPoiType,
        searchQuery: resolvedQuery,
        maxDetourMinutes: maxDetour,
      },
      simulateTrip
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {
          if (activeDropdown) setActiveDropdown(null);
        }}
      >
        {/* App Header */}
        <View style={styles.header}>
          <View style={styles.soundToggle}>
            <SoundToggle />
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.googleG}>G</Text>
            <Text style={styles.headerBadgeText}>Google Maps Powered</Text>
          </View>
          <Text style={styles.appTitle}>Route Alert</Text>
          <Text style={styles.appSubtitle}>Smart on-route stop finder & detour navigator</Text>
        </View>

        {/* Main Card */}
        <View style={[styles.card, { zIndex: activeDropdown ? 50 : 1 }]}>
          <Text style={styles.sectionHeading}>Where are you going?</Text>

          {/* Inputs */}
          <LocationInput
            label="From"
            value={origin}
            onChangeText={(text) => {
              setOrigin(text);
              setOriginCoordinates(undefined);
            }}
            onSelectPlace={(place) => applyPlace(place, setOrigin, setOriginCoordinates)}
            placeholder="Starting City / Location"
            icon="🟢"
            zIndex={activeDropdown === 'origin' ? 200 : 20}
            isOpen={activeDropdown === 'origin'}
            onOpenChange={(open) => setActiveDropdown(open ? 'origin' : null)}
            showCurrentLocation={true}
          />

          <LocationInput
            label="To"
            value={destination}
            onChangeText={(text) => {
              setDestination(text);
              setDestinationCoordinates(undefined);
            }}
            onSelectPlace={(place) => applyPlace(place, setDestination, setDestinationCoordinates)}
            placeholder="Destination City / Location"
            icon="🏁"
            zIndex={activeDropdown === 'destination' ? 200 : 10}
            isOpen={activeDropdown === 'destination'}
            onOpenChange={(open) => setActiveDropdown(open ? 'destination' : null)}
            showCurrentLocation={false}
          />

          {/* What to find along route: Category Chips & Custom Search */}
          <View style={styles.poiSection}>
            <Text style={styles.inputLabel}>FIND STOPS ALONG ROUTE</Text>
            <View style={styles.categoryGrid}>
              {PRESET_CATEGORIES.map((cat) => {
                const isSelected = selectedPoiType === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                    onPress={() => {
                      setSelectedPoiType(cat.id);
                      setCustomSearchQuery('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryIcon}>{cat.icon}</Text>
                    <Text
                      style={[
                        styles.categoryLabel,
                        isSelected && styles.categoryLabelActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  selectedPoiType === 'CUSTOM' && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedPoiType('CUSTOM')}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryIcon}>🔍</Text>
                <Text
                  style={[
                    styles.categoryLabel,
                    selectedPoiType === 'CUSTOM' && styles.categoryLabelActive,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>

            {/* Custom Search Input Box */}
            {selectedPoiType === 'CUSTOM' && (
              <View style={styles.customSearchWrapper}>
                <Text style={styles.customSearchIcon}>🔍</Text>
                <TextInput
                  style={styles.customSearchInput}
                  placeholder="e.g. Haldiram, Starbucks, Subway, Hospital..."
                  placeholderTextColor="#94A3B8"
                  value={customSearchQuery}
                  onChangeText={setCustomSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}
          </View>

          {/* Maximum Detour Selector */}
          <DetourSelector
            selectedDetour={maxDetour}
            onSelectDetour={setMaxDetour}
            options={[1, 2, 5, 10]}
          />

          {/* Simulation Toggle Option */}
          <TouchableOpacity
            style={styles.simulationToggle}
            onPress={() => setSimulateTrip(!simulateTrip)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.checkbox,
                simulateTrip && styles.checkboxActive,
              ]}
            >
              {simulateTrip && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <View style={styles.simulationTextContainer}>
              <Text style={styles.simulationTitle}>Demo Route Simulation</Text>
              <Text style={styles.simulationDesc}>
                Auto-travels along the selected route to test alerts
              </Text>
            </View>
          </TouchableOpacity>

          {/* Error Notice */}
          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Start Trip CTA */}
          <TouchableOpacity
            style={[styles.startButton, isLoading && styles.startButtonDisabled]}
            onPress={handleStartTrip}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.startButtonText}>START TRIP</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 20) : 0,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginVertical: 20,
  },
  soundToggle: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 2,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 8,
    gap: 6,
  },
  googleG: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1A73E8',
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A73E8',
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  poiSection: {
    marginBottom: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  categoryLabelActive: {
    color: '#92400E',
    fontWeight: '700',
  },
  customSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    paddingHorizontal: 12,
    height: 48,
    marginTop: 6,
  },
  customSearchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  customSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  simulationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  checkboxCheck: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  simulationTextContainer: {
    flex: 1,
  },
  simulationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  simulationDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '500',
  },
  startButton: {
    backgroundColor: '#1A73E8', // Google Blue
    borderRadius: 24,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
