import { z } from 'zod';

// Shared zod schemas and types for app + server. Entity schemas (Trip, Booking, Segment,
// Location, Attachment) are added in Prompt 1 — see docs/travel-itinerary-app-plan.md.

/** Every synced row is keyed by a UUID. */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;
