# Raha

Ethiopian freight marketplace: matches cargo with truck capacity already on the road, including return loads.

| App | Stack | Port | Path |
|---|---|---|---|
| API | NestJS + TypeORM, PostgreSQL 16 + PostGIS | 4000 | `apps/api` |
| Raha Web (shipper / broker / fleet, marketing, receiver page) | Next.js + TypeScript | 3000 | `apps/web` |
| Raha Operations (staff) | Next.js + TypeScript | 3001 | `apps/ops` |
| Raha Driver | Flutter + Dart (Android first) | — | `apps/driver` |
| Shared | `@raha/contracts` (enums, permissions, DTOs), `@raha/ui` (design system), `@raha/web-kit` (session/proxy plumbing) | — | `packages/*` |

Design source of truth: `Raha Logistics Identity/` ("Basalt & Signal Amber").

## Run it

```bash
npm install
docker compose up -d db            # or: ./scripts/dev-db.ps1 start  (portable Postgres, Windows)
cp apps/api/.env.example apps/api/.env
npm run build:packages
npm run db:migrate && npm run db:seed
npm run dev:api                    # http://localhost:4000/api/v1  (Swagger at /api/docs)
npm run dev:web                    # http://localhost:3000
npm run dev:ops                    # http://localhost:3001
```

Driver app:

```bash
cd apps/driver
flutter run                                        # Android emulator -> http://10.0.2.2:4000
flutter run --dart-define=API_URL=http://192.168.1.20:4000   # phone on the same Wi-Fi
flutter test && flutter analyze
```

`npm test` runs the API end-to-end lifecycle suite against the dev database.

## Seed logins

Phone login uses an SMS code. With `OTP_DEV_ECHO=true` the code is returned by the API and pre-filled in the apps; sent messages also appear at `GET /api/v1/dev/outbox`.

| Role | Login |
|---|---|
| Driver (Abebe Kebede) | `+251911204418` |
| Shipper (Hanna Girma) | `+251911330207` |
| Broker (Yonas Molla) | `+251911000810` |
| Fleet owner (Tesfaye Kebede) | `+251911000610` |
| Operations | `tigist@raha.et` / `Raha-ops-2026!` (also `dawit@`, `selam@`, `eden@raha.et`) |

## Architecture notes

- **One API, three clients.** Web apps never hold tokens in JS: Next route handlers keep httpOnly cookies and proxy `/api/proxy/*` to the API with the bearer token and `X-Org-Id`. The driver app uses the same API with its own secure token store.
- **Authorization.** A global guard resolves JWT → user → active organization membership. Permissions are an org-type × role matrix (plus staff roles) defined once in `@raha/contracts` and enforced with `@RequirePermissions`; the UIs hide what the API would refuse.
- **Matching** is PostGIS: each capacity post stores its route as a LineString; shipments match when pickup and drop fall within tolerance of the line, in order, with forward direction. Scoring weighs fit, detour, timing, reliability, price and return-leg bonus. Confirming a match locks shipment and post rows in one transaction; a DB `CHECK` makes overbooking impossible.
- **Tracking is milestone-based**, not live GPS: driver check-ins (app, SMS, Telegram or ops) place the truck on the corridor strip and drive the ETA. This works on 2G and low-end phones.
- **Delivery PIN.** The receiver gets a 4-digit PIN by SMS at departure. The server stores `sha256(salt:pin)` and an encrypted copy. The phone receives the salt+digest once the load is picked up, so it can verify the PIN with no signal; the server re-verifies on sync (max 5 attempts). Tradeoff: a 4-digit PIN is brute-forceable from the digest by someone who has the device, so the server always re-verifies, offline-synced deliveries are marked as such, and the proof photo is mandatory in the app.
- **Offline driver app.** Every trip action is written to a local queue first and flushed through `POST /driver/sync` (idempotent by action id, results per action). The trip screen shows the server state with queued actions applied on top. Photos are compressed on-device (~80 KB) and uploaded when the queue flushes.
- **Polling, not WebSockets**, in the web consoles (`AutoRefresh`) and on pull-to-refresh in the app: simpler to operate and kind to flaky networks. Notifications are queued rows drained by a worker (SMS / Telegram / push), with a console provider in development.
- **Payments are records**, not a wallet: delivery creates a pending payment due to the fleet; Operations marks it paid with a method.
- **Ethiopian context.** Phone normalisation (+251), ETB, Ethiopian calendar helper, English + Amharic in the driver app and SMS templates.

## Not built yet

SMS/Telegram inbound webhook (check-ins by message), a fleet "add own load" endpoint, push delivery (FCM), live map, real SMS gateway and payment-provider integrations.
