# Wayfold

A local-first iOS + Android app that gathers your travel bookings (Airbnb, Booking.com,
airlines, ...) into one itinerary. The app runs entirely on-device with **no server required**.

See [`docs/travel-itinerary-app-plan.md`](docs/travel-itinerary-app-plan.md) for the full plan.

## Layout

| Path              | What                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `app/`            | Expo (React Native) app — expo-router, on-device SQLite via Drizzle |
| `packages/shared` | Shared zod schemas + TypeScript types                               |
| `server/`         | Empty placeholder for the LLM proxy and the future premium backend  |
| `docs/`           | Plan and build prompts                                              |

## Prerequisites

- Node 22+
- pnpm 10 (`corepack enable` picks up the pinned version)
- For running on a device: an [Expo](https://expo.dev) account and the EAS CLI
  (`npx eas-cli@latest`)

## Run locally (no server)

```bash
pnpm install
pnpm app            # starts the Expo dev server
```

Wayfold uses a **development build** (`expo-dev-client`), not Expo Go — the share-to-app
target added later needs native code that Expo Go doesn't include. One-time setup:

```bash
cd app
npx eas-cli@latest login
npx eas-cli@latest init                                     # links the project, writes projectId to app.json
npx eas-cli@latest build --profile development --platform ios      # or android
# iOS Simulator instead: --profile development-simulator
```

Install the resulting build on your device/simulator, then `pnpm app` and open it from the dev
client. With Xcode / Android Studio installed you can build locally instead:
`npx expo run:ios` or `npx expo run:android`.

The local SQLite database (`wayfold.db`) is created on first launch; the home screen confirms it.

## Checks

```bash
pnpm check          # lint + format check + typecheck + tests (same as CI)
pnpm format         # auto-format
```

## Database

Drizzle schema lives in `app/src/db/schema.ts`. After changing it:

```bash
pnpm --filter @wayfold/app db:generate     # writes SQL migrations to app/drizzle/
```
