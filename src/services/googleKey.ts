/** Reads the Maps key and drops accidental trailing characters from the env file. */
export function readGoogleMapsApiKey(): string {
  const raw = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  return raw.trim().replace(/\++$/g, '');
}
