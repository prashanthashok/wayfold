# Wayfold — Build Plan & Claude Code Prompts

**Wayfold** is a one-stop mobile app (iOS + Android) to aggregate, view, and share travel itineraries from multiple booking sources. Built **local-first** as a build-once, maintain-lightly side project, with an optional **premium server tier** for the few features that genuinely require a backend.

---

## 1. The Most Important Architectural Decision

This app is an **itinerary aggregator**, not a booking engine. That single distinction drives everything below.

**Finding from checking the APIs (2026):** none of the consumer booking sites expose a "give me this user's bookings" API to third-party apps.

| Source | Direct API for a user's bookings? | What to do instead |
|---|---|---|
| Airbnb | No. Partner-only, closed to unsolicited applicants. | Parse confirmation email / imported PDF |
| Booking.com | No. Affiliate/connectivity-partner only; signups often paused; "no data forwarding" clause; it's for inventory search, not personal bookings. | Parse confirmation email / imported PDF |
| Flights (Amadeus, Sabre, Travelport, Duffel, Kiwi, Skyscanner) | No — these search/book *new* flights; they don't return a booking made elsewhere. | Parse email/PDF for the booking; use a flight-*status* API to enrich live data |

**Therefore the ingestion pipeline is the core of the product**, in priority order:

1. **Share-to-app (primary, simplest)** — register the app as an OS share target. After booking, the user taps Share on the confirmation (page, PDF, email, or screenshot) and sends it in. No OAuth, no partnerships, no forwarding address; the user initiates every import. Route by type: a shared **URL** → save as the `originalUrl` link (can't be server-fetched; it's behind the user's login); a shared **PDF / text / image** → feed to the parsing ladder. Users often share both, giving you parseable content *and* the deep link. (Expo caveat: needs a custom dev build with a share-intent config plugin — not Expo Go.)
2. **PDF / document file import** — same parser, for files already saved on the device.
3. **Email parsing (TripIt-style)** — read-only OAuth into Gmail/Outlook, OR a dedicated forwarding address (`plans@wayfold.app`). More automatic, but needs a server, so it lives in the **premium tier** (see §2).
4. **Calendar import** (`.ics`, Apple Calendar on-device; Google Calendar sync is premium).
5. **Manual entry** (always-available fallback).

**Enrichment APIs that *are* available and useful:**
- Flight status / live data: **AeroDataBox**, **FlightAware AeroAPI**, **Cirium** (input: flight number + date → gate, terminal, delay, aircraft). Premium.
- Geocoding / maps: Google Maps / Mapbox (addresses → coordinates, timezone lookup).
- Timezone: derive IANA timezone from coordinates (Google Time Zone API or a local lookup).

**Compliance note:** scraping Airbnb/Booking.com/airlines violates their ToS. Parsing the *user's own* emails and documents, with their explicit consent, is the compliant path. Build the consent flow explicitly.

---

## 2. Architecture & Monetization (local-first + optional premium server)

### 2.1 Two tiers, one source of truth

**The device's local database is always the source of truth.** The app reads and writes a local SQLite store for everything — timeline, all views, cost totals, export, and the deterministic parsing. That's why it's instant and works offline (incl. on a plane). The optional server never replaces the local DB; it sits beside it and does only the two things a phone genuinely can't:

- **Sync hub** — a cloud mirror that reconciles a user's devices. Because itinerary data is **single-user** (no collaboration), sync is trivial: last-write-wins with soft deletes, no conflict resolution.
- **Ingestion worker** — receives forwarded/scanned emails, parses them, and pushes draft bookings down to the device.

Even the free tier needs one tiny piece of server: a **stateless serverless function** that proxies the Claude API for the LLM fallback (you can't ship the API key inside the app). It's scale-to-zero — pennies per call, nothing to babysit — which is categorically different from running a database 24/7.

### 2.2 The parsing ladder (deterministic first, LLM last)

Try the cheap, reliable, zero-maintenance parsers first; only fall through to the LLM for the messy long tail. This minimizes both cost and maintenance, because the LLM absorbs new/changed formats without you writing per-vendor code.

1. **`.ics` calendar files** — already structured.
2. **Apple Wallet passes (`.pkpass`)** — fixed schema (flight/seat/gate).
3. **Boarding-pass barcodes (IATA BCBP)** — known encoded format.
4. **schema.org JSON-LD email markup** — major airlines/OTAs embed machine-readable reservation data in confirmation-email HTML (it's what powers Gmail/Google Travel cards).
5. **LLM fallback** — arbitrary PDFs, screenshots, plain text with no structure. Routed through the serverless proxy.

Build each rung behind a single `ParserStrategy` interface so the ladder is just an ordered list; the share target, file import, and (premium) email ingestion all call the same ladder.

### 2.3 Free vs Premium split

| Capability | Free / buy-once (local-first) | Premium (subscription) |
|---|---|---|
| Manual entry, trips, segments | ✅ | ✅ |
| Share-to-app + PDF/file import | ✅ | ✅ |
| Deterministic parsing (ladder rungs 1–4) | ✅ unlimited | ✅ unlimited |
| LLM "smart import" (rung 5) | ✅ small monthly allowance, or BYO key | ✅ generous/unlimited allowance |
| Timeline + month/week/day/trip views | ✅ | ✅ |
| Per-trip cost totals, export (text/email/.ics) | ✅ | ✅ |
| Apple Calendar (on-device) | ✅ | ✅ |
| Cross-device cloud sync | — | ✅ |
| Email ingestion (forwarding + Gmail) | — | ✅ |
| Live flight status + push | — | ✅ |
| Google Calendar two-way sync | — | ✅ |
| Read-only web share link | — | ✅ |

### 2.4 Monetization model

Pricing principle: **charge recurring only for what costs you recurring.** Every recurring cost lives in the premium tier, so a user who's happy with share-sheet + PDF import never pays a subscription — they own the app outright. That keeps the model honest (you're not gating things that cost you nothing) while still funding the server features.

- **Core: free or a one-time purchase.** Near-zero recurring cost, so buy-once is sustainable.
- **Premium: a small subscription** covering sync + email ingestion + flight status + the LLM allowance.

**On the LLM cost specifically** — do *not* charge per-document. It charges for an invisible implementation detail (the user can't tell which path their doc will take), taxes exactly the long-tail bookings the app exists for, discourages the core "put everything in one place" behavior, and needs a consumable-IAP credit ledger with refund logic — the heaviest thing to maintain. Instead:
- Bundle a **free monthly LLM allowance** so the magic works out of the box.
- Bundle a **generous allowance into premium** (premium already has the account + billing, so no second system to build).
- Offer a **BYO-API-key** escape hatch for power users (their parses cost you nothing, unlimited).
- Only if you want pay-as-you-go without a sub: sell **credit packs** ("50 smart imports for $5"), never per-use — but know it still costs you the ledger maintenance.

### 2.5 Maintain-lightly guardrails (deliberately NOT building)

This is a weekend/downtime project, so protect your time:
- **No collaborative trips.** Single-user data is what makes sync a 30-line last-write-wins job instead of a CRDT project.
- **No FX conversion engine.** Show each currency separately (optional single display currency the user picks). No rate API, no "rates as of" disclaimers.
- **One billing surface, not two.** A flat subscription is less code than metered credits. Resist per-use meters.
- **Abstract every paid provider behind an interface** (`FlightStatus`, `InboundEmail`, `ParserStrategy`) so you can swap or disable them without touching callers.
- **Free tier needs no server account** — don't add auth/billing to it. Accounts appear only at the premium upgrade.

---

## 3. Recommended Tech Stack

| Layer | Recommendation | Why |
|---|---|---|
| Mobile (one codebase, iOS+Android) | **React Native + Expo (TypeScript)** | Single codebase, huge ecosystem, very Claude-Code-friendly. *Alt: Flutter*. |
| **On-device DB (source of truth)** | **SQLite** via `expo-sqlite` + **Drizzle ORM** *(alt: WatermelonDB)* | Local-first, offline, owns the data. Relational fit for trips → bookings → segments. |
| Local parsing (free) | **Deterministic parsers**: `.ics`, `.pkpass`, IATA BCBP barcode, schema.org JSON-LD | Reliable, zero per-call cost, zero maintenance. |
| LLM fallback | **Thin serverless function** proxying the Claude API (strict JSON schema) | Only for unstructured docs; hides the API key; scale-to-zero. |
| **Premium server (optional)** | **Node + TypeScript (Fastify)** + **PostgreSQL** + **S3-compatible storage** | Sync hub + email ingestion; runs only for paying users. |
| Auth | **None for free tier**; Sign in with Apple/Google for the premium account | Accounts only exist in premium. |
| Calendar | **Apple EventKit on-device (free)**; Google Calendar API server-side (premium) | |
| Notifications | Expo Notifications / FCM + APNs | Flight-status changes (premium). |

---

## 4. Data Model (core entities)

Lives in **SQLite on the device**, mirrored to Postgres only for premium sync. Every row carries `id` (UUID), `updatedAt`, and `deletedAt` (soft delete) from day one so sync is a no-brainer later.

```
Trip
  id, title, start_date, end_date, cover_image, home_timezone
  updated_at, deleted_at

Booking            # polymorphic parent for everything on the itinerary
  id, trip_id, type ∈ {ACCOMMODATION, TRANSPORT, ACTIVITY}
  title, provider (e.g. "Airbnb", "United"), confirmation_number
  original_url       # deep link back to the source booking
  status ∈ {CONFIRMED, PENDING, CANCELLED}
  source ∈ {SHARE, PDF, EMAIL, CALENDAR, MANUAL}
  parsed_by ∈ {DETERMINISTIC, LLM, MANUAL}   # for analytics + cost tracking
  cost_amount, cost_currency
  raw_attachment_id  # link to stored PDF/email
  updated_at, deleted_at

Segment            # the timed pieces of a booking
  id, booking_id
  start_at_utc, end_at_utc
  start_timezone (IANA), end_timezone (IANA)
  start_location_id, end_location_id
  # transport: flight no., seat, gate, terminal
  # accommodation: check-in/out, room
  # activity: meeting point
  updated_at, deleted_at

Location
  id, name, address, lat, lng, timezone (IANA)

Attachment
  id, kind ∈ {PDF, IMAGE, EMAIL_RAW}, storage_key (local path; cloud key if premium), parsed_at

# Premium-only (server + synced down):
Account            id, auth_providers[], subscription_status
LlmUsage           month, count   # enforce the free/premium allowance
```

**Timezone rule (do this from day one):** store every timestamp in **UTC** plus an **IANA timezone string** for each end of a segment. Never store naive local times. Display converts UTC → the segment's local tz, with the user's home tz available for comparison. This is the #1 source of bugs in travel apps — get it right at the schema level.

---

## 5. Feature → Phase Mapping

### Part A — Local-first core (free / buy-once, no server)

**Phase 0 — Foundations**
- Repo scaffold (monorepo: `/app` Expo, `/packages/shared` zod types, `/server` stub for later)
- SQLite + Drizzle data model (source of truth); EAS dev build configured
- App runs fully standalone — no backend required

**Phase 1 — MVP (ship this first)**
- Manual booking entry (accommodation / transport / activity)
- **Share-to-app target** + file import → **parsing ladder** → "review" → structured booking
- Itinerary **timeline / day view**
- Per-trip **total cost** (per currency)
- Links back to original booking; trip list + detail screens

**Phase 2 — Local views, calendar & export**
- Month / week / day / full-trip views
- Apple Calendar (EventKit) on-device sync; `.ics` import
- Export as text, formatted email, `.ics` via the OS share sheet
- Timezone adjustment + DST-correct display

### Part B — Premium server (subscription phase, clearly separated)

**Phase 3 — Premium account + cloud sync**
- Sign in with Apple/Google; Fastify + Postgres mirror; IAP subscription gate
- Opt-in seed-from-local; two-way last-write-wins sync; downgrade keeps local data

**Phase 4 — Email ingestion**
- Forwarding address + read-only Gmail OAuth; reuse the same parsing ladder server-side
- Dedupe; "Pending review" inbox synced to device

**Phase 5 — Enrichment & web share**
- Flight-status API enrichment (gate, delay, terminal) + push notifications
- Google Calendar two-way sync
- Read-only expiring web share link

---

## 6. Claude Code Prompts (copy-paste, in order)

> Tip: paste these one at a time. Let Claude Code finish and commit each before moving on. **Part A needs no backend** — you get a fully usable app from Prompts 0–5. **Part B is the premium phase** and is the only part that introduces a server.

## Part A — Local-first core (free / buy-once)

### Prompt 0 — Scaffold (local-first)
```
Set up a TypeScript monorepo for a cross-platform, LOCAL-FIRST travel itinerary app called Wayfold.
The app must run fully standalone with NO backend.

Structure:
- /app             — Expo (React Native) app, TypeScript, expo-router
- /packages/shared — shared TypeScript types and zod schemas
- /server          — EMPTY placeholder for a future premium backend; not used yet

On-device database is the source of truth: use expo-sqlite with Drizzle ORM.
Use pnpm workspaces. Add ESLint + Prettier + a basic CI script.
Configure an EAS dev build now (we'll need it for the share extension later).
Create a README explaining how to run the app locally with no server.
Do NOT add features yet — just a clean, runnable app with a placeholder home screen
and an initialized (empty) local SQLite database.
```

### Prompt 1 — Local data model (SQLite source of truth)
```
In /app, define the Drizzle schema (SQLite) for a local-first itinerary aggregator:
Trip, Booking, Segment, Location, Attachment.

Requirements:
- Every row has id (UUID), updatedAt, deletedAt (soft delete) for future sync.
- Booking.type {ACCOMMODATION, TRANSPORT, ACTIVITY}, Booking.source {SHARE, PDF, EMAIL,
  CALENDAR, MANUAL}, Booking.status {CONFIRMED, PENDING, CANCELLED}, Booking.parsedBy
  {DETERMINISTIC, LLM, MANUAL}.
- Booking: title, provider, confirmationNumber, originalUrl, costAmount (store as integer
  minor units), costCurrency (ISO 4217), relation to Attachment.
- Segment: startAtUtc, endAtUtc (UTC), startTimezone, endTimezone (IANA), start/end Location.
- Location: name, address, lat, lng, timezone (IANA).
- All timestamps in UTC. Never store naive local datetimes.

Mirror these as zod schemas in /packages/shared (single source of validation).
Add local migrations and a seed with one trip: a flight + a hotel + an activity across
two timezones.
```

### Prompt 2 — Manual entry + trip/timeline views (MVP core)
```
Build the MVP itinerary experience, fully on-device (read/write local SQLite).

- Create/edit Trip.
- Add a Booking via a form that switches fields by type (ACCOMMODATION / TRANSPORT /
  ACTIVITY), incl. cost + currency and an "original booking URL".
- Trip detail screen: chronological DAY-BY-DAY timeline of segments.
- Each booking row links out to its originalUrl.
- Compute and show the trip total cost grouped by currency (do NOT auto-convert; show each
  currency separately, with an optional single display currency the user picks).

All times render in each segment's local timezone, labeled with the tz abbreviation, using
the UTC + IANA fields. Add unit tests for the timezone conversion (include a DST case).
```

### Prompt 3 — Parsing ladder (deterministic first, LLM fallback)
```
Add the parsing pipeline as an ordered "ladder" behind a single ParserStrategy interface:
{ canHandle(input), parse(input) -> DRAFT Booking + Segments }. Try rungs in order; only
fall through when a rung declines.

Rungs (deterministic, on-device, free, unlimited):
1. .ics calendar files
2. Apple Wallet .pkpass
3. IATA BCBP boarding-pass barcode (scan or from an image)
4. schema.org JSON-LD reservation markup (from shared email HTML)

Final rung (LLM fallback, for unstructured PDFs/images/text):
5. Call a thin SERVERLESS function (in /server) that proxies the Anthropic API and returns
   a Booking+Segments validated against the shared zod schema (reject + re-prompt on
   invalid). The API key lives only in the function, never in the app.

Add an LLM allowance counter (free monthly quota) and a BYO-API-key setting that bypasses
the quota. Accept {pdf | image | plainText | url}. URL -> DRAFT with originalUrl only (no
server fetch). Everything returns a DRAFT to a "Review imported booking" screen: editable
fields side by side, handle multi-segment items (round-trip = two segments), never auto-save.
Set Booking.parsedBy accordingly.
```

### Prompt 3b — Share-to-app target (primary capture method)
```
Make the app a native OS share target so users can send a confirmation straight in after
booking. This is the main way bookings enter the app.

- Register as a share target for iOS (Share Extension) and Android (ACTION_SEND/
  SEND_MULTIPLE intent filters). Use a share-intent config plugin + the EAS dev build —
  this does NOT work in Expo Go.
- Accept: URL, plain text, PDF, image (screenshot).
- Route through the Prompt 3 parsing ladder: URL -> DRAFT with originalUrl; PDF/text/image
  -> ladder. If multiple items are shared together (screenshot + link), merge into one
  DRAFT (parse the content, attach the URL as originalUrl).
- Always land in the "Review imported booking" screen; let the user pick/create the Trip.
```

### Prompt 4 — Multi-view calendar + Apple Calendar + export (all local)
```
All on-device, no server.

- Month / Week / Day / Full-trip views, switchable via a segmented control. Month shows
  trip blocks; Week/Day show timed segments in local time; Full-trip is a vertical timeline.
  Make it performant for trips with many bookings.
- Apple Calendar sync via Expo + EventKit (on-device). Import a .ics file as bookings
  (reuse the ladder).
- Export a trip as: (a) plain text, (b) formatted HTML email body, (c) .ics of all segments,
  shared via the OS share sheet. Make timezones explicit in every exported format.
```

## Part B — Premium server (subscription phase)

> Everything below introduces the backend in /server and is gated behind the premium
> subscription. The free app keeps working without any of it.

### Prompt 5 — Premium account, cloud sync & subscription gate
```
Stand up the premium backend in /server (Fastify + Postgres) and wire it to the app.

- Auth: Sign in with Apple and Google; backend issues its own session JWT.
- Subscription: gate premium features behind an IAP subscription (StoreKit / Play Billing);
  validate receipts server-side; expose subscriptionStatus to the app.
- Cloud mirror: Postgres mirrors the device schema. On upgrade, prompt the user to opt in to
  uploading existing local data to seed the mirror (explicit consent; nothing leaves the
  device until they accept).
- Sync: two-way, last-write-wins using updatedAt + deletedAt (soft deletes). Data is
  single-user, so NO conflict resolution beyond LWW. The device keeps a full local replica
  and stays the working copy.
- Downgrade: on cancellation, sync + premium features switch off but ALL local data remains
  and the app keeps working offline. Never hold data hostage.
```

### Prompt 6 — Email ingestion (premium)
```
Add email-based ingestion, reusing the SAME ParserStrategy ladder server-side.

Behind a feature flag, implement BOTH:
1. Forwarding address: per-user alias (plans+<userid>@wayfold.app) via an inbound-email
   webhook (Postmark/Mailgun; abstract behind an InboundEmail interface). On receipt, run
   the ladder on the email HTML (JSON-LD rung often hits) + any PDF attachments.
2. Read-only Gmail OAuth: with explicit consent, periodically scan for travel confirmations
   and parse them.

Dedupe against existing bookings (confirmationNumber + provider + date). Surface results in
a "Pending review" inbox that syncs to the device; require explicit confirmation before
anything lands on the itinerary. Document the consent flow clearly.
```

### Prompt 7 — Flight status, Google Calendar & web share (premium)
```
Premium enrichment + sharing.

- Flight status: enrich flight TRANSPORT segments via AeroDataBox behind a FlightStatus
  interface (swappable for FlightAware/Cirium). Input: flight number + date -> gate,
  terminal, status, delay, baggage. Refresh on trip open + on a schedule near departure;
  push (Expo Notifications) on material change. Cache and respect rate limits.
- Google Calendar: two-way sync of segments (server-side API; read-only consent first,
  write opt-in). Carry correct IANA timezones on every event; add DST conversion tests.
- Read-only web share: generate a signed, expiring URL that renders a read-only itinerary,
  shared via the OS share sheet. Timezones explicit.
```

---

## 7. Open Decisions To Make Before You Start

1. **React Native (Expo) vs Flutter** — Prompt 0 assumes Expo; change it if you prefer Flutter.
2. **SQLite layer** — `expo-sqlite` + Drizzle (typed, lightweight) vs WatermelonDB (built-in sync helpers). Drizzle is simpler to start; WatermelonDB pays off only if sync gets complex (it shouldn't, given single-user data).
3. **Premium sync approach** — a simple custom LWW sync against your Postgres mirror is the lightest cross-platform option (recommended). Apple CloudKit is free but Apple-only.
4. **LLM allowance sizing** — pick the free monthly quota (e.g. ~5–10 smart imports) and whether to also ship BYO-key at launch.
5. **Forwarding address vs Gmail OAuth first (premium)** — forwarding is simpler and provider-agnostic; Gmail OAuth needs Google's security review. Ship forwarding first.
6. **Flight-status provider** — AeroDataBox's free tier to start; FlightAware/Cirium for reliability later.

---

## 8. Suggested Build Order (shortest path to something usable)

`Prompt 0 → 1 → 2` gives you a working, offline, single-user app with manual entry.
Add `Prompt 3 → 3b` next — the parsing ladder plus the share target is the biggest "magic"
moment for least effort, and the share target is how bookings actually enter the app.
`Prompt 4` rounds out the free core (views, calendar, export).

Stop there and ship the free/buy-once app. Only build **Part B (Prompts 5 → 6 → 7)** once
you have users asking for sync and automatic email capture — it's the only part that adds a
server, recurring cost, and a subscription to maintain.
