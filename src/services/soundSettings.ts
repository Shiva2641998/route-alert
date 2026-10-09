type SoundListener = (muted: boolean) => void;

let muted = false;
const listeners = new Set<SoundListener>();

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(next: boolean): void {
  muted = next;
  listeners.forEach((listener) => listener(muted));
}

export function toggleSoundMuted(): boolean {
  setSoundMuted(!muted);
  return muted;
}

export function subscribeSoundMuted(listener: SoundListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
