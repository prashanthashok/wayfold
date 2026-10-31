import { Alert, Linking } from 'react-native';

import { isWebUrl } from '@/features/booking-form';

/** Opens a booking's original link in the browser. Only http(s) links are ever opened. */
export async function openBookingLink(url: string): Promise<void> {
  if (!isWebUrl(url)) {
    Alert.alert('Can’t open link', 'Only web links (https://…) can be opened.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Can’t open link', url);
  }
}
