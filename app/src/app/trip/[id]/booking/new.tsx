import { useLocalSearchParams } from 'expo-router';

import { BookingScreen } from '@/components/BookingScreen';

export default function NewBookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookingScreen tripId={id} />;
}
