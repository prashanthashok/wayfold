import { Stack, router } from 'expo-router';
import { utcToZoned } from '@wayfold/shared';

import { TripForm } from '@/components/TripForm';
import { appCtx } from '@/db/context';
import { createTrip } from '@/db/repo';
import { deviceTimezone } from '@/lib/timezones';

export default function NewTripScreen() {
  const timezone = deviceTimezone();
  const today = utcToZoned(new Date().toISOString(), timezone).date;

  return (
    <>
      <Stack.Screen options={{ title: 'New trip' }} />
      <TripForm
        initial={{ title: '', startDate: today, endDate: today, homeTimezone: timezone }}
        submitLabel="Create trip"
        onSubmit={async (input) => {
          const trip = await createTrip(appCtx, input);
          router.replace(`/trip/${trip.id}`);
        }}
      />
    </>
  );
}
