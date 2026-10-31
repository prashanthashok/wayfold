import { router } from 'expo-router';
import {
  buildTimeline,
  daysBetween,
  formatCalendarDate,
  formatLocalTime,
  formatLocalTimeWithZone,
  formatMoney,
  tzAbbreviation,
  type BookingWithSegments,
  type Location,
  type Trip,
  type TimelineEvent,
} from '@wayfold/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openBookingLink } from '@/lib/links';
import { colors, spacing } from '@/theme';

import { Button, Card } from './ui';

interface Props {
  trip: Trip;
  items: readonly BookingWithSegments[];
  locations: ReadonlyMap<string, Location>;
}

/** Day-by-day itinerary. Each time is shown in the zone where it happens, with the zone label. */
export function TripTimeline({ trip, items, locations }: Props) {
  const days = buildTimeline(trip, items);

  return (
    <View style={styles.stack}>
      {days.map((day) => (
        <View key={day.date} style={styles.day}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{formatCalendarDate(day.date)}</Text>
            <Text style={styles.dayMeta}>
              {day.inTrip
                ? `Day ${daysBetween(trip.startDate, day.date) + 1}`
                : 'Outside trip dates'}
            </Text>
          </View>
          {day.events.length === 0 ? (
            <Text style={styles.empty}>Nothing planned</Text>
          ) : (
            day.events.map((event) => (
              <EventRow
                key={event.key}
                event={event}
                homeTimezone={trip.homeTimezone}
                tripId={trip.id}
                locations={locations}
              />
            ))
          )}
        </View>
      ))}
    </View>
  );
}

const KIND_LABEL: Record<TimelineEvent['kind'], string> = {
  CHECK_IN: 'Check-in',
  CHECK_OUT: 'Check-out',
  DEPARTURE: 'Departs',
  ACTIVITY: '',
};

function EventRow({
  event,
  homeTimezone,
  tripId,
  locations,
}: {
  event: TimelineEvent;
  homeTimezone: string;
  tripId: string;
  locations: ReadonlyMap<string, Location>;
}) {
  const { booking, segment } = event;
  const placeName = (id: string | null) => (id ? locations.get(id)?.name : undefined);
  const from = placeName(segment.startLocationId);
  const to = placeName(segment.endLocationId);

  const place =
    event.kind === 'DEPARTURE' ? [from, to].filter(Boolean).join(' → ') : (from ?? to ?? '');
  const headline = [KIND_LABEL[event.kind], place].filter(Boolean).join(' · ');

  const details = [
    booking.provider,
    event.kind === 'DEPARTURE' ? segment.flightNumber : null,
    event.kind === 'CHECK_IN' ? segment.room && `Room ${segment.room}` : null,
    event.kind === 'ACTIVITY' ? segment.meetingPoint && `Meet: ${segment.meetingPoint}` : null,
    booking.confirmationNumber && `#${booking.confirmationNumber}`,
    event.kind !== 'CHECK_OUT' && booking.costAmount !== null && booking.costCurrency !== null
      ? formatMoney(booking.costAmount, booking.costCurrency)
      : null,
  ].filter(Boolean);

  const ends =
    event.endsAtUtc && event.endsTimezone && event.endsAtUtc !== event.atUtc
      ? `${event.kind === 'DEPARTURE' ? 'Arrives' : 'Ends'} ${formatLocalTimeWithZone(
          event.endsAtUtc,
          event.endsTimezone,
        )}${event.endsDaysLater > 0 ? ` (+${event.endsDaysLater} day${event.endsDaysLater > 1 ? 's' : ''})` : ''}`
      : null;

  const home =
    event.timezone !== homeTimezone
      ? `Home time: ${formatLocalTimeWithZone(event.atUtc, homeTimezone)}`
      : null;

  const cancelled = booking.status === 'CANCELLED';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${booking.title}, ${formatLocalTime(event.atUtc, event.timezone)}`}
      onPress={() => router.push(`/trip/${tripId}/booking/${booking.id}`)}
    >
      <Card style={styles.event}>
        <View style={styles.timeCol}>
          <Text style={styles.time}>{formatLocalTime(event.atUtc, event.timezone)}</Text>
          <Text style={styles.tz}>{tzAbbreviation(event.atUtc, event.timezone)}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, cancelled && styles.struck]} numberOfLines={2}>
              {booking.title}
            </Text>
            {booking.status !== 'CONFIRMED' && (
              <Text style={[styles.badge, cancelled && styles.badgeCancelled]}>
                {cancelled ? 'Cancelled' : 'Pending'}
              </Text>
            )}
          </View>
          {headline !== '' && <Text style={styles.line}>{headline}</Text>}
          {details.length > 0 && <Text style={styles.line}>{details.join(' · ')}</Text>}
          {ends && <Text style={styles.line}>{ends}</Text>}
          {home && <Text style={styles.home}>{home}</Text>}
          {booking.originalUrl && event.kind !== 'CHECK_OUT' && (
            <Button
              title="Open booking ↗"
              variant="link"
              onPress={() => void openBookingLink(booking.originalUrl!)}
            />
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  day: { gap: spacing.sm },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  dayTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  dayMeta: { fontSize: 12, color: colors.muted },
  empty: { fontSize: 14, color: colors.faint, paddingVertical: spacing.xs },
  event: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  timeCol: { width: 68 },
  time: { fontSize: 16, fontWeight: '600', color: colors.text },
  tz: { fontSize: 12, color: colors.muted },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.warningText,
    backgroundColor: colors.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeCancelled: { color: colors.danger, backgroundColor: '#fde8ec' },
  line: { fontSize: 13, color: colors.muted },
  home: { fontSize: 12, color: colors.faint },
});
