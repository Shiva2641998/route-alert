import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { isSoundMuted, subscribeSoundMuted, toggleSoundMuted } from '../services/soundSettings';

interface SoundToggleProps {
  variant?: 'light' | 'dark';
}

/** Mute or unmute every sound in the app, including alerts and spoken turns. */
export const SoundToggle: React.FC<SoundToggleProps> = ({ variant = 'dark' }) => {
  const [muted, setMuted] = useState(isSoundMuted());

  useEffect(() => subscribeSoundMuted(setMuted), []);

  return (
    <TouchableOpacity
      style={[styles.button, variant === 'light' ? styles.lightButton : styles.darkButton]}
      onPress={() => toggleSoundMuted()}
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Unmute sounds' : 'Mute sounds'}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.icon}>{muted ? '🔇' : '🔊'}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkButton: {
    backgroundColor: '#E8F0FE',
  },
  lightButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  icon: {
    fontSize: 18,
  },
});
