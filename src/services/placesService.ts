import { readGoogleMapsApiKey } from './googleKey';
import * as ExpoLocation from 'expo-location';

export interface PlaceSuggestion {
  id: string;
  mainText: string;
  secondaryText?: string;
  fullText: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Searches places using Google Places API (New) autocomplete,
 * with graceful fallback to OpenStreetMap Nominatim API.
 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const apiKey = readGoogleMapsApiKey();

  if (apiKey) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify({
          input: trimmed,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          suggestions?: Array<{
            placePrediction?: {
              placeId?: string;
              text?: { text?: string };
              structuredFormat?: {
                mainText?: { text?: string };
                secondaryText?: { text?: string };
              };
            };
          }>;
        };

        if (data.suggestions && data.suggestions.length > 0) {
          return data.suggestions
            .filter((s) => s.placePrediction?.text?.text)
            .map((s) => {
              const pred = s.placePrediction!;
              const mainText = pred.structuredFormat?.mainText?.text || pred.text?.text || '';
              const secondaryText = pred.structuredFormat?.secondaryText?.text;
              const fullText = pred.text?.text || mainText;
              return {
                id: pred.placeId || fullText,
                mainText,
                secondaryText,
                fullText,
              };
            });
        }
      }
    } catch {
      // Fall through to Nominatim fallback
    }
  }

  // Fallback: OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      trimmed
    )}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'findAreaMap/1.0',
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const list = (await res.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
        name?: string;
        address?: {
          city?: string;
          state?: string;
          country?: string;
        };
      }>;

      return list.map((item) => {
        const parts = item.display_name.split(',');
        const mainText = item.name || parts[0]?.trim() || item.display_name;
        const secondaryText = parts.slice(1, 4).join(',').trim();
        return {
          id: String(item.place_id),
          mainText,
          secondaryText: secondaryText || undefined,
          fullText: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        };
      });
    }
  } catch {
    // Return empty on network issues
  }

  return [];
}

/**
 * Fetches latitude and longitude for a Google Places placeId.
 */
export async function getPlaceCoordinates(
  placeId: string
): Promise<{ latitude: number; longitude: number } | null> {
  const apiKey = readGoogleMapsApiKey();
  if (!apiKey || !placeId) return null;

  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
      placeId
    )}?fields=id,displayName,location`;
    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,location',
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        location?: { latitude: number; longitude: number };
      };
      if (data.location?.latitude != null && data.location?.longitude != null) {
        return {
          latitude: data.location.latitude,
          longitude: data.location.longitude,
        };
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

/**
 * Gets user's current GPS position and resolves human-readable location address.
 */
export async function getCurrentDeviceLocation(): Promise<{
  label: string;
  latitude: number;
  longitude: number;
} | null> {
  try {
    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.Balanced,
    });

    const { latitude, longitude } = loc.coords;

    // Reverse geocode via ExpoLocation
    try {
      const reverse = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
      if (reverse && reverse.length > 0) {
        const r = reverse[0];
        const parts = [
          r.name || r.street,
          r.district || r.subregion,
          r.city,
          r.region,
        ].filter(Boolean);

        const label = parts.length > 0 ? parts.join(', ') : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        return { label, latitude, longitude };
      }
    } catch {
      // Ignore reverse error and fallback
    }

    return {
      label: `Current Location (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
      latitude,
      longitude,
    };
  } catch {
    return null;
  }
}
