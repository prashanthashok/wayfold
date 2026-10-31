import { useLocalSearchParams } from 'expo-router';

import { BookingScreen } from '@/components/BookingScreen';

export default function EditBookingScreen() {
  const { id, bookingId } = useLocalSearchParams<{ id: string; bookingId: string }>();
  return <BookingScreen tripId={id} bookingId={bookingId} />;
}
