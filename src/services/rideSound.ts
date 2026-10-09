import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { isSoundMuted, subscribeSoundMuted } from './soundSettings';

export type RideSound = 'popup' | 'start' | 'end';

const sources: Record<RideSound, number> = {
  popup: require('../../assets/sounds/popup.wav'),
  start: require('../../assets/sounds/start.wav'),
  end: require('../../assets/sounds/end.wav'),
};

const players: Partial<Record<RideSound, AudioPlayer>> = {};
let audioReady: Promise<void> | null = null;

function prepareAudio(): Promise<void> {
  if (!audioReady) {
    audioReady = setAudioModeAsync({ playsInSilentMode: true }).then(() => undefined);
  }
  return audioReady;
}

subscribeSoundMuted((muted) => {
  if (!muted) return;
  Object.values(players).forEach((player) => player?.pause());
});

/** Plays a short cue for a popup, ride start, or ride end. */
export function playRideSound(kind: RideSound): void {
  if (isSoundMuted()) return;
  void (async () => {
    try {
      await prepareAudio();
      let player = players[kind];
      if (!player) {
        player = createAudioPlayer(sources[kind]);
        players[kind] = player;
      }
      await player.seekTo(0);
      player.play();
    } catch {
      // Playback is optional if the device blocks audio.
    }
  })();
}
