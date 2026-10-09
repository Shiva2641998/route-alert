import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface DetourSelectorProps {
  selectedDetour: number;
  onSelectDetour: (minutes: number) => void;
  options?: number[];
}

export const DetourSelector: React.FC<DetourSelectorProps> = ({
  selectedDetour,
  onSelectDetour,
  options = [1, 2, 5, 10],
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>MAXIMUM DETOUR</Text>
      <View style={styles.optionsGrid}>
        {options.map((option) => {
          const isSelected = selectedDetour === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
              onPress={() => onSelectDetour(option)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                {option} min
              </Text>
              {isSelected && <View style={styles.selectedBadge} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionButtonSelected: {
    backgroundColor: '#E8F0FE', // Google Blue tint
    borderColor: '#1A73E8',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
  optionTextSelected: {
    color: '#1A73E8',
    fontWeight: '700',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1A73E8',
  },
});
