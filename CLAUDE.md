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
- `node-linker=hoisted` (`.npmrc`): one flat `node_modules` at the root, for Metro.

## Layout

- `app/src/app/` — expo-router routes only (every file is a screen; `_layout.tsx` = navigator).
- `app/src/db/` — `client.ts` opens `wayfold.db` (WAL, foreign keys on); `schema.ts` holds the
  Drizzle tables (trips, locations, attachments, bookings, segments) with CHECK constraints;
  `schema-matches-shared.ts` is a compile-time guard that each table infers the same type as
  its zod mirror; `seed-data.ts` + `seed.ts` are the dev-only sample trip; `test-db.ts` is the
  test harness. Generated migrations go to `app/drizzle/`.
- `app/src/app/_layout.tsx` runs migrations (`useMigrations`) then, in `__DEV__` only, the sample
  seed. It shows a "Database error" screen instead of crashing if either fails.
- `app/` imports use the `@/` alias for `app/src/`.
- `packages/shared/src/` — `enums.ts` (enum values, reused by Drizzle) and `schemas.ts` (zod
  entity schemas + primitives), imported as `@wayfold/shared`.
- `server/` — placeholder only; not a workspace package yet.
- `app/AGENTS.md` — Expo-specific agent guidance (versioned docs, CNG rules). Follow it too.

## Commands

Run from the repo root unless noted.

- `pnpm install` — install everything.
- `pnpm app` — start the Expo dev server.
- `pnpm check` — lint + format check + typecheck + tests. Run before every commit; CI runs it.
- `pnpm format` — Prettier write.
- `pnpm --filter @wayfold/app db:generate --name <what-changed>` — generate a SQL migration
  after editing `schema.ts` (commit the whole `app/drizzle/` folder). Never edit or delete a
  migration that has shipped; add a new one.
- In `app/`: add native/Expo packages with `npx expo install <pkg>` (picks SDK-compatible
  versions), never plain `pnpm add`. If api.expo.dev is unreachable, prefix `EXPO_OFFLINE=1`.

## Data conventions

- Instants are UTC ISO-8601 text with a `Z` and **whole seconds** (`2027-03-12T16:00:00Z`);
  `updated_at`/`deleted_at` use milliseconds (`Date.toISOString()`). Fixed width means string
  comparison and `ORDER BY` are chronological. The DB CHECKs reject naive local times.
- `trips.start_date`/`end_date` are calendar dates (`YYYY-MM-DD`), not instants.
- Enum values live in `packages/shared/src/enums.ts`; Drizzle columns and CHECKs import them.
- Money is minor units per currency: USD cents, but JPY has no minor unit (¥84,000 = `84000`).
  Look up the exponent per currency before formatting; never assume 100.
- Seed rows use fixed `5eed…` UUIDs and `ON CONFLICT DO NOTHING`, so they are idempotent and a
  soft-deleted sample row stays deleted.
- There is no runtime UUID source in the app yet. `crypto.randomUUID` isn't guaranteed on
  Hermes and `expo-crypto` is a native module (needs a new dev build) — decide in Prompt 2.

## Testing

- DB tests run the real generated migrations against Node's built-in `node:sqlite` through
  Drizzle's sqlite-proxy (`app/src/db/test-db.ts`), so CHECK/FK behavior is tested without a
  simulator. Add constraint tests there when adding constraints.
- Adding or changing a table: update `schema.ts`, the zod mirror in `packages/shared`, then run
  `db:generate`. `pnpm typecheck` fails if the two drift.

## Gotchas

- TypeScript 6 no longer auto-loads `@types/*`. Node types are opted in only where needed, via
  `/// <reference types="node" />` in `test-db.ts`; don't add them to the app's tsconfig.

- ESLint is pinned to 9: `eslint-plugin-react` (via `eslint-config-expo`) breaks on ESLint 10.
- `pnpm ci` is a reserved pnpm command — the CI script is `pnpm check`.
- Never create or edit `app/ios/` or `app/android/` by hand (they're generated and
  gitignored); configure native behavior via `app.json` and config plugins.
- Bundle IDs are `online.wayfold.app` (iOS + Android). Changing them after store release is
  painful.

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
