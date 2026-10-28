# Wayfold

Wayfold is a local-first mobile app (iOS + Android) that aggregates travel itineraries from
bookings made elsewhere (Airbnb, Booking.com, airlines, ...). It is an **itinerary aggregator,
not a booking engine**: no booking site offers a third-party "user's bookings" API, so ingestion
(share sheet, file import, parsing) is the core of the product.

The full plan, phases, and step-by-step build prompts live in
[`docs/travel-itinerary-app-plan.md`](docs/travel-itinerary-app-plan.md). Read it before starting
any feature work, and check which phase/prompt the task belongs to.

Domain: `wayfold.online` (e.g. premium email forwarding at `plans+<userid>@wayfold.online`).

**Keep this file current by editing it in place** — add commands, layout, and new rules as the
project grows. Never replace it wholesale or drop the rules below.

## Stack

- pnpm monorepo: `/app` (Expo + React Native, TypeScript, expo-router), `/packages/shared`
  (zod schemas + shared types), `/server` (premium backend + LLM proxy function).
- On-device DB: SQLite via `expo-sqlite` + Drizzle ORM.
- Share target needs an EAS dev build — it does not work in Expo Go.

## Non-negotiable rules

1. **The device DB is the source of truth.** The app reads/writes local SQLite for everything.
   The server is only a sync mirror and email-ingestion worker; it never replaces local data.
2. **The free tier runs with no server account.** No auth, no billing, no required backend.
   The only free-tier server piece is the stateless LLM proxy function. Accounts exist only
   for premium.
3. **Time: UTC + IANA, always.** Store every timestamp as UTC plus an IANA timezone string for
   each end of a segment. Never store naive local datetimes. Display converts to the segment's
   local tz. Timezone code needs tests, including a DST case.
4. **Every synced row has `id` (UUID), `updatedAt`, `deletedAt`.** Soft deletes only.
5. **Money is integer minor units + ISO 4217 currency.** Never auto-convert currencies; show
   totals per currency.
6. **zod schemas in `/packages/shared` are the single source of validation**, including for
   LLM parser output.
7. **Parsing is a ladder behind one `ParserStrategy` interface**: `.ics` → `.pkpass` → IATA
   BCBP → schema.org JSON-LD → LLM fallback. Deterministic rungs first; LLM last. Every import
   lands as a DRAFT on the review screen — never auto-save.
8. **The Anthropic API key never ships in the app.** LLM calls go through the serverless proxy
   (or a user-supplied BYO key).
9. **Paid providers sit behind interfaces** (`ParserStrategy`, `FlightStatus`, `InboundEmail`)
   so they can be swapped or disabled without touching callers.
10. **Downgrading premium never loses data.** Local data stays and the app keeps working offline.

## Deliberately out of scope

- Collaborative/shared-edit trips (single-user data keeps sync to last-write-wins).
- FX conversion / rate APIs.
- Per-document LLM charges or metered billing.
- Scraping booking sites (ToS violation). Only parse the user's own content, with consent.
