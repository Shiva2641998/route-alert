import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  searchPlaces,
  getCurrentDeviceLocation,
  getPlaceCoordinates,
  PlaceSuggestion,
} from '../services/placesService';

export interface LocationInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelectPlace?: (place: PlaceSuggestion) => void;
  placeholder?: string;
  icon?: string;
  zIndex?: number;
  showCurrentLocation?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const LocationInput: React.FC<LocationInputProps> = ({
  label,
  value,
  onChangeText,
  onSelectPlace,
  placeholder,
  icon = '📍',
  zIndex = 1,
  showCurrentLocation = true,
  isOpen: controlledIsOpen,
  onOpenChange,
}) => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const updateIsOpen = (nextOpen: boolean) => {
    setInternalIsOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const inputRef = useRef<TextInput>(null);
  const justSelectedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  // Debounced place search API call with cancellation of stale responses
  const performSearch = useCallback(async (query: string) => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const seq = ++searchSeqRef.current;
    setIsLoading(true);
    try {
      const results = await searchPlaces(trimmed);
      if (seq === searchSeqRef.current) {
        setSuggestions(results);
        if (results.length > 0) {
          updateIsOpen(true);
        }
      }
    } catch {
      if (seq === searchSeqRef.current) {
        setSuggestions([]);
      }
    } finally {
      if (seq === searchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!value || value.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value, performSearch]);

  const handleSelectSuggestion = async (place: PlaceSuggestion) => {
    justSelectedRef.current = true;
    const chosenName = place.fullText || place.mainText;
    onChangeText(chosenName);
    setSuggestions([]);
    updateIsOpen(false);

    if (onSelectPlace) {
      // If coordinates aren't populated yet and we have a placeId, fetch them
      if (place.latitude == null && place.id) {
        const coords = await getPlaceCoordinates(place.id);
        if (coords) {
          onSelectPlace({
            ...place,
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          return;
        }
      }
      onSelectPlace(place);
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const result = await getCurrentDeviceLocation();
      if (result) {
        justSelectedRef.current = true;
        onChangeText(result.label);
        setSuggestions([]);
        updateIsOpen(false);
        if (onSelectPlace) {
          onSelectPlace({
            id: 'current-location',
            mainText: result.label,
            fullText: result.label,
            latitude: result.latitude,
            longitude: result.longitude,
          });
        }
      }
    } finally {
      setIsLocating(false);
    }
  };

  const handleClear = () => {
    onChangeText('');
    setSuggestions([]);
    updateIsOpen(true);
    inputRef.current?.focus();
  };

  const showDropdown =
    isOpen &&
    (suggestions.length > 0 ||
      (showCurrentLocation && (isFocused || isOpen)) ||
      (isLoading && value.trim().length >= 2));

  return (
    <View
      style={[
        styles.container,
        {
          zIndex,
          elevation: Platform.OS === 'android' ? zIndex : undefined,
        },
      ]}
    >
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputWrapperFocused,
        ]}
      >
        <Text style={styles.icon}>{icon}</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={(text) => {
            justSelectedRef.current = false;
            onChangeText(text);
            if (!isOpen) updateIsOpen(true);
          }}
          onFocus={() => {
            setIsFocused(true);
            updateIsOpen(true);
            if (value && value.trim().length >= 2 && suggestions.length === 0) {
              performSearch(value);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          autoCorrect={false}
          autoCapitalize="words"
        />

        {/* Loading Spinner */}
        {isLoading && (
          <ActivityIndicator size="small" color="#1A73E8" style={styles.trailingIcon} />
        )}

        {/* Clear Button */}
        {!isLoading && value.length > 0 && (
          <TouchableOpacity
            style={styles.trailingIcon}
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}

        {/* Current GPS Location Quick Action */}
        {showCurrentLocation && (
          <TouchableOpacity
            style={styles.gpsButton}
            onPress={handleUseCurrentLocation}
            disabled={isLocating}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isLocating ? (
              <ActivityIndicator size="small" color="#1A73E8" />
            ) : (
              <Text style={styles.gpsIcon} accessibilityLabel="Use current location">
                🎯
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Autocomplete Dropdown List */}
      {showDropdown && (
        <View style={styles.dropdown}>
          <ScrollView
            style={styles.dropdownScroll}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={true}
          >
            {/* Quick "Use Current Location" item */}
            {showCurrentLocation && (
              <TouchableOpacity
                style={styles.gpsRow}
                onPress={handleUseCurrentLocation}
                activeOpacity={0.7}
              >
                <Text style={styles.gpsRowIcon}>🎯</Text>
                <View style={styles.suggestionTextWrapper}>
                  <Text style={styles.gpsRowTitle}>Use current location</Text>
                  <Text style={styles.gpsRowSubtitle}>Find via device GPS</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* In-dropdown loading indicator */}
            {isLoading && suggestions.length === 0 && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#1A73E8" />
                <Text style={styles.loadingText}>Searching locations...</Text>
              </View>
            )}

            {/* Places API suggestions */}
            {suggestions.map((item, index) => (
              <TouchableOpacity
                key={`${item.id}-${index}`}
                style={[
                  styles.suggestionRow,
                  index === suggestions.length - 1 && styles.suggestionRowLast,
                ]}
                onPress={() => handleSelectSuggestion(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionPin}>📍</Text>
                <View style={styles.suggestionTextWrapper}>
                  <Text style={styles.suggestionMain} numberOfLines={1}>
                    {item.mainText}
                  </Text>
                  {item.secondaryText ? (
                    <Text style={styles.suggestionSecondary} numberOfLines={1}>
                      {item.secondaryText}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    position: 'relative',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#DADCE0',
    paddingHorizontal: 12,
    height: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inputWrapperFocused: {
    borderColor: '#1A73E8',
    borderWidth: 1.8,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  trailingIcon: {
    paddingHorizontal: 6,
  },
  clearText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  gpsButton: {
    paddingLeft: 6,
    paddingRight: 2,
  },
  gpsIcon: {
    fontSize: 18,
  },
  dropdown: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 20,
    zIndex: 9999,
    maxHeight: 240,
  },
  dropdownScroll: {
    maxHeight: 240,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F0F7FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0EEFF',
  },
  gpsRowIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  gpsRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A73E8',
  },
  gpsRowSubtitle: {
    fontSize: 12,
    color: '#5F6368',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionPin: {
    fontSize: 16,
    marginRight: 10,
    opacity: 0.7,
  },
  suggestionTextWrapper: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  suggestionSecondary: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
});
