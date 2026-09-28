# DayHub

Your day. One place.

A mobile-first personal dashboard built with Next.js, React, TypeScript, Radix UI and persistent Upstash Redis or PostgreSQL storage. It includes an offline mutation queue, a generated PWA shell and a compact interface for iPhone, iPad and desktop.

## Run locally

Use Node.js 22 LTS and npm. A C++ build toolchain may be needed if your platform has no prebuilt `better-sqlite3` binary.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Finish or skip onboarding; editable demo data is selected in development. Without `DATABASE_URL`, local development saves to `.data/dayhub.sqlite`. Keep that directory to retain server data across restarts. It is deliberately excluded from this package.

```sh
npm test
npm run typecheck
npm run build
npm start
```

`npm run build` also generates the service worker's versioned asset list. Do not deploy an old `public/sw.js` without running the build. Use the production build to test offline shell caching; development assets change continuously.

## Use the existing Together database on Vercel

The earlier Together setup uses Upstash Redis (`together-db`). This updated build supports that database directly; the original DayHub ZIP was PostgreSQL-only. Deploy this updated source before expecting the shared Upstash connection to work.

1. In Vercel, connect the existing `together-db` storage integration to the **DayHub** project. Keep Together connected. Select the deployment environments needed for DayHub.
2. The integration supplies either `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or legacy `KV_REST_API_URL` and `KV_REST_API_TOKEN`. DayHub supports both naming conventions. Keep credentials server-side; no `NEXT_PUBLIC_` prefix.
3. Set `DAYHUB_STORAGE=upstash` if DayHub also has a `DATABASE_URL`; otherwise Upstash is detected automatically. Do not copy a Redis URL into `DATABASE_URL`.
4. A separate `SESSION_SECRET` is recommended but not mandatory with Upstash: when absent, DayHub derives a domain-separated signing key from its server-only Redis token. Rotating that token will invalidate anonymous sessions unless a stable `SESSION_SECRET` was set before users started using the app. Keep backups before rotating credentials.
5. Configure `CRON_SECRET` for scheduled price checks if desired. Redeploy after connecting the integration or changing environment variables; an older deployment does not inherit new variables.
6. Open DayHub → More → Data & backup. It should show **Upstash Redis** and **All changes saved**. Add a task, refresh, and confirm it remains. This live smoke test is still required.

Every DayHub key starts with `dayhub:v1:{dayhub-v1}:`. All reads, writes and resets are scoped to that prefix and the browser's account. No Redis-wide clear operation or Together-table migration is used. The two apps share database capacity and availability. Use a durable Upstash database with eviction disabled for personal records; this adapter does not assign expirations to data. It stores one versioned document per account, uses atomic Lua compare-and-set updates, and retains idempotency markers. The adapter limits an account document to 8 MB and reports failed writes without dropping the device queue. PostgreSQL remains available for larger datasets. Changing providers does not automatically migrate data: export and restore first.

## Alternative: deploy with PostgreSQL

1. Put this directory in a private Git repository and import it into Vercel as a Next.js project. Use Node.js 22 and the included `npm run build` command.
2. Provision a PostgreSQL database, for example Neon or Supabase. Set `DATABASE_URL` to its server-side connection string. For Supabase, use a pooler suitable for your deployment and a dedicated database role; this app uses PostgreSQL directly, not the public Supabase client.
3. Set `SESSION_SECRET` and `CRON_SECRET` to separate random secrets (generate each with `openssl rand -hex 32`). Set them for the deployment environments you use. Keep `SESSION_SECRET` stable across deployments so existing browser sessions remain valid.
4. Keep `NEXT_PUBLIC_DEMO_MODE=false` for personal use. Users can explicitly load samples from More → Data & backup.
5. Deploy. Database tables initialize automatically on the first database request. Alternatively run `npm run db:migrate` with `DATABASE_URL` supplied in the shell environment. The migration script does not automatically read `.env.local`.
6. Check `/api/data` through the app, create a task, refresh, then verify More → Data & backup reports PostgreSQL and no pending changes. Configure database-provider backups.
7. In iPhone Safari, open the HTTPS deployment and choose Share → Add to Home Screen. Launch it once online to prepare the offline shell. Test reopening in airplane mode before relying on it.

The PostgreSQL deployment path requires `DATABASE_URL` and `SESSION_SECRET`; the app intentionally refuses an ephemeral SQLite fallback on Vercel. No database credentials are included. A real PostgreSQL deployment still needs the smoke tests in `QA.md`.

### Optional background push

Generate VAPID keys with `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and a real `VAPID_SUBJECT` contact. Enable push in More → Notifications on each supported device. iPhone requires an installed Home Screen app and user permission. In-app alerts work without VAPID keys.

The included daily cron checks prices at 21:00 UTC, protected by `CRON_SECRET`. Each run checks at most 20 eligible products, observes a 12-hour per-product interval and a time budget. Larger deployments need a durable job queue and resumable batches. Daily cron is not an exact-time reminder service. Due reminders are generated when the app is active; push dispatch sends persisted notifications after mutations and during the cron run.

## What works

- Home prioritization, calculated Today statistics, rule-based daily briefing, combined daily timeline and global search.
- Create, edit and delete tasks, recurring events, bills, expenses, notes, deliveries, products and wishlists. Task completion, bill payment and delivery status are stored.
- Recurring task and bill successors, calendar recurrence, category filters, pinned and archived notes, spending totals and category breakdowns.
- Product URL lookup with manual fallback, price updates and dated history, range-filtered charts, target/drop/new-low/restock alerts, deal filters, sorting, wishlists and purchase savings.
- Activity and notification centres, read/clear controls, profile, currency, time/date formats, categories, widget visibility/order, location and dark/light/system appearance.
- Onboarding, export/restore, conflict resolution, local-first writes, server synchronization, safe-area layouts, touch feedback, quick-add sheets, visible detail navigation, manifest/icons and offline shell.

## Persistence and accounts

Every local write is committed to IndexedDB before it is presented as saved. Mutations are queued with operation IDs and expected server versions. The server applies writes transactionally, detects conflicts and deduplicates retries. Price history and alerts are stored in the same transaction as a product change. Connection errors retain the queue and show a status message; conflicts have an explicit resolution action.

The initial account model is private per browser, identified by a signed, HttpOnly cookie. It is **not a recoverable login or automatic cross-device account**. Safari and a Home Screen app may have distinct storage contexts. Clearing site data or losing the session cookie can remove access to that anonymous account; unsynced device data cannot survive device erasure. Export backups regularly and use Restore to move to another browser. Add a real identity provider before expecting account recovery, shared households or cross-device synchronization. The server already scopes all records to an owner ID.

The SQLite/PostgreSQL path uses dedicated tables with owner IDs, versions and validated JSON payloads. Price history has its own relational table with product foreign keys and indexes. `lib/db/index.ts` owns schema initialization and routes calls to the configured repository. The Upstash path keeps history, alerts, entries and operation IDs in a per-account document so a single atomic write commits them together. JSON payloads keep optional module fields flexible; this is not a fully column-normalized accounting schema.

## Price and weather services

Product fetching happens only on the server. URLs must use HTTPS. The fetcher validates DNS results, pins public addresses, revalidates redirects and limits response size/time. Extraction supports nested Product/Offer JSON-LD, currency-qualified product metadata, and embedded Shopify variant data. Selected variants are matched and ambiguous price ranges are refused. Redirected product links and protocol-relative images are supported. Known retailer names cover Amazon AU, The Iconic, JB Hi-Fi and Officeworks; retailer naming is not a guarantee of live coverage. Stores that require inaccessible JavaScript data, deny requests or omit readable offers still require manual entry. Each product records failed checks separately from its last successful price; failed checks do not generate price history or alerts. Manual checks have a one-minute cooldown, while scheduled attempts use twelve hours. Currency mismatches are rejected during checks. Confirm final prices at the store.

Weather uses Open-Meteo with manual city search or optional browser location. Weather and retailer network calls may fail independently of the app; both have friendly fallbacks. Live JB Hi-Fi lookups succeeded for Sony WH-1000XM6 Silver and AirPods Pro 3 on 28 September 2026. The Iconic denied the deployment request; Officeworks did not expose a price readable by the previous parser. Coverage can change. Live weather and push delivery remain unverified.

## Structure

| Path                          | Responsibility                                                    |
| ----------------------------- | ----------------------------------------------------------------- |
| `app/`                        | Next.js shell, metadata and server API routes                     |
| `components/`                 | Accessible sheets, lists, detail screens, settings and navigation |
| `components/dashboard/`       | Home, spending and weather cards                                  |
| `components/price-watch/`     | Lazy-loaded price chart                                           |
| `lib/store.tsx`               | IndexedDB queue, optimistic data and synchronization              |
| `lib/db/`                     | Persistent repositories, schema and transactions                  |
| `lib/price-tracking/`         | Secure fetching, parser and scheduler                             |
| `lib/model.ts`                | Recurrence, summaries, calculations and alert logic               |
| `lib/integrations.ts`         | Future calendar, courier, receipt and AI interfaces               |
| `lib/push*`                   | Optional VAPID notification delivery                              |
| `types/`, `lib/validation.ts` | Shared model and input validation                                 |
| `scripts/`, `public/`         | Build-generated service worker, icons and manifest                |
| `tests/`                      | Persistence, recurrence, validation and price-alert tests         |

React renders user text safely; external links are validated. No service-role or API secrets are sent to the client. Anonymous access is suitable for this personal-app starting point; a public multiuser service should add recoverable authentication, per-user quotas and operational monitoring before opening unrestricted registration.

Google/Apple Calendar, mail scanning, banking, OCR, Siri, native iOS widgets and Live Activities are extension points, not implemented integrations. The briefing is deliberately rule-based and needs no AI API.

## Automatic store comparisons

Save a product once. DayHub opens its detail page, waits for cloud sync, and automatically searches for offers from other Australian stores. No additional store links are required. It uses SerpApi Google Shopping to identify candidate products, then Google Immersive Product with `more_stores=true` to retrieve sellers for a likely matching product. Offers are sorted by price. Conservative title checks reject detected model, size, colour, condition and accessory mismatches; uncertain matches appear separately and are excluded from the lowest-found indicator. This is heuristic matching, not a guarantee of identical variants.

**One-time activation:** set `SERPAPI_API_KEY` in Vercel Production and redeploy. Upstash is already required for shared caching and an atomic deployment-wide provider-request budget. `COMPARISON_DAILY_LIMIT` defaults to 10 uncached provider calls per UTC day (clamped to 1–100). A complete comparison normally consumes two calls. Results are cached for six hours; partial seller results for 15 minutes. A same-instance in-flight map coalesces repeated requests. Review the provider account quota/charges before enabling. DayHub does not create an account or purchase a plan.

Without a provider key the UI clearly reports that automatic comparison is not connected, retains the saved product and does not ask users to populate other stores manually. A key was unavailable during implementation, so provider orchestration, extra-seller expansion and matching are fixture-tested; real provider requests remain unverified. Results are Australia/AUD only and may include Google product comparison links. Shipping and checkout-only discounts are excluded. Coverage and freshness depend on the provider; there is no all-retailer or lowest-market-price guarantee.

Saved listings and optional manual controls remain in a collapsed section for existing users. Linked listings retain their histories and alerts; discovery results are cached offers, not automatically added tracked products. Existing price alerts currently monitor saved listings, not every discovered offer.
