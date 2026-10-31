import Storage from 'expo-sqlite/kv-store';

// Small per-device UI preferences. Not itinerary data, so they live in expo-sqlite's key-value
// store rather than in the synced tables.

const key = (tripId: string) => `displayCurrency:${tripId}`;

/** The currency the user chose to show first in a trip's totals, or null for "all separately". */
export function getDisplayCurrency(tripId: string): string | null {
  try {
    return Storage.getItemSync(key(tripId));
  } catch {
    return null;
  }
}

export function setDisplayCurrency(tripId: string, currency: string | null): void {
  try {
    if (currency) Storage.setItemSync(key(tripId), currency);
    else Storage.removeItemSync(key(tripId));
  } catch {
    // Preference is optional; failing to save it must never break the screen.
  }
}
