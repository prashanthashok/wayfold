import type { Attachment, Booking, Location, Segment, Trip } from '@wayfold/shared';

import type { attachments, bookings, locations, segments, trips } from './schema';

// Compile-time guard: each Drizzle table must infer exactly the same row type as its zod mirror
// in @wayfold/shared. If someone edits one and not the other, `pnpm typecheck` fails here.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type SchemaMatchesShared = [
  Expect<Equal<typeof trips.$inferSelect, Trip>>,
  Expect<Equal<typeof locations.$inferSelect, Location>>,
  Expect<Equal<typeof attachments.$inferSelect, Attachment>>,
  Expect<Equal<typeof bookings.$inferSelect, Booking>>,
  Expect<Equal<typeof segments.$inferSelect, Segment>>,
];
