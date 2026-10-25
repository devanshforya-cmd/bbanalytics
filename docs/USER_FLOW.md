# Brand Bucket Command Center — User Flow

This document describes the application flow inferred from the current routes, role checks, and data services. It is a code-based product map; features that only save in a browser or process are marked as not ready for shared production use.

## Local QA run — 2026-10-25

The main admin route sweep loaded all 26 operational routes after hydration. I exercised the dashboard date/channel/filter controls, all 11 Settings tabs, the activity trail's date and grouped views, the marketing-seeding switch, and the primary entry sheets for calls, cheques, documents, delivery failures, feedback, returns, influencers, customers, tasks, and products. Empty submissions for calls, delivery failures, feedback, returns, tasks, and customer onboarding stayed in the form and showed validation rather than creating blank records. The dispatch review step opened and returned to edit/cancel without saving a dispatch.

The sales-officer journey used Parthak through the app's local persona switcher, not a separate authenticated Supabase user. A single local visit was checked in and out to verify the route completion loop; it is still in the local data and one check-in remains in the offline queue. No order, cheque, return, dispatch, or customer record was committed during this pass. A temporary `QA Preview Check` brand was added in explicit local-preview mode and verified after reload; it is local test data, not a production brand. This is UI and local-state QA, not a two-account staging test.

The earlier local QA pass covered 26 tests and an optimized build. This follow-up adds a permission regression test; the current run passes 27 tests, TypeScript passes, and ESLint reports zero errors with 35 warnings. The production build is checked in an isolated copy so it does not interrupt localhost. Initial React duplicate-key and `NaN` chart defects were corrected. Local-preview brand creation now saves in browser storage only and survives a reload. The local backend cannot reach Supabase (`TypeError: fetch failed`), so shared-data behavior remains unverified.

### Defects corrected in this pass

- Checkout now persists its timestamp and the summary displays the measured visit duration and the correct next-stop/finish action.
- Sales officers no longer see admin route-assignment controls or the development persona switcher. Profile field totals now come from today's visits, orders, and cheques instead of fixed sample values.
- Legacy duplicate product and activity IDs are repaired before rendering, preventing React duplicate-key errors. The scorecard trend chart also handles a single data point without producing a `NaN` SVG coordinate.
- Activity-trail Today, Yesterday, and This Week filters now use the current local date; grouped rows use the same date key. The Settings `?tab=brands` deep link now opens Brand Management and tab clicks keep the URL in sync.
- Manual marketing seeding now displays and stores zero-revenue line totals consistently. Dashboard rep visit counts and trend deltas are data-derived; stores with no cheque history are no longer labeled overdue. Delivery-failure trend copy is derived from actual attempts and failures rather than fixed sample percentages.
- Brand creation now lets Postgres generate UUIDs, checks for an existing normalized code, and uses update-or-insert so it does not depend on an older database already having a unique code constraint. A migration adds the normalized unique index for concurrency safety. Product `brandCode` values do not create a `brands` row. Local preview writes are browser-only and visibly marked as unsynced; real Supabase writes still need a reachable backend and the schema migrations.
- Hidden feature routes redirect to an allowed page; dashboard brief metrics and export tabs now follow module grants. Protected APIs check the same grants, and an explicitly empty brand assignment grants no brands.
- Foreground GPS pings post through an authenticated server route; however, the local `GET /api/gps/ping` currently returns a storage error. The map now displays that failure and no longer fabricates speed/accuracy values. The street-map fallback no longer uses Esri's HTTP-200 "API KEY REQUIRED" tiles; it retries no-key OSM/CARTO sources and displays attribution.
- The mobile app shell uses the dynamic viewport height, accounts for iOS safe areas, and leaves pinch zoom available for accessibility.

### Remaining release boundary

The local build is suitable for continued product review, but it is not yet verified for live multi-user publishing. Operational state remains browser-local in the main `db` service; the offline queue still has one pending check-in; Supabase/RLS persistence and the app's custom session are not yet proven to work together. A read-only probe found the configured Supabase host returns public DNS `NXDOMAIN`, so the server cannot connect; re-copy the project URL from Supabase Project Settings and restart the dev server before checking credentials or schema. Local-preview brand operations bypass Supabase and are explicitly local-only. The local `GET /api/gps/ping` still returns a storage error, so shared GPS is not confirmed. Settings and live tracking show explicit preview/unavailable states instead of implying empty data or a healthy feed. The street-map fallback avoids an Esri endpoint that returned an HTTP-200 "API KEY REQUIRED" image. Free OSM/CARTO tiles are best-effort, not guaranteed. Apply both brand migrations in staging before verifying full metadata and normalized uniqueness. The local preview cannot establish independent sales-officer authentication, cross-device visibility, or production sync. Keep using localhost until the staging persistence/auth checks below pass.

## Entry and access

1. A staff member opens `/` or `/login` and signs in with email or a Nepali mobile number and password.
2. `/api/auth/login` looks up the account in Supabase, verifies its bcrypt password hash, and sets a signed, HTTP-only 24-hour session cookie.
3. The browser stores a limited user profile for navigation and display. The signed cookie is the credential checked by protected API routes.
4. The landing page is selected from the user role and available permissions. Sales officers with beat-plan access go to the beat plan; users with dashboard access go to the dashboard; other configured permissions select an available module.
5. Logout clears the browser profile and asks `/api/auth/logout` to clear the cookie.
6. Hidden modules are removed from navigation and direct page visits redirect to an allowed route. Protected APIs repeat the feature check; the client-side menu is not the security boundary.

## Daily operations

### Order and customer service

`Order Flow → Extractor` is the intended WhatsApp-message path: paste a message, review parsed customer and line-item fields, then continue into the order queue. `Manual Entry` provides a direct order form. `Daily Orders` is the review queue; delivery failures and returns are separate follow-up paths. The customer directory and profile combine order, failure, return, and feedback history, while `Customer Insights` summarizes customer and brand patterns.

Expected loop: capture → validate → save → review in Daily Orders → update delivery outcome → handle return or complaint → inspect the customer timeline.

### Field sales visit

`Offline Sales → Beat Plan` is the field user's starting point. A planned stop leads to check-in (including location), stock count, shelf photos, call notes, order or cheque capture, and then check-out. `Stores` and store detail pages hold retailer/distributor context. `Live Tracking` shows location activity; `Scorecard` summarizes completed work. Cheques and documents have separate handover/status workflows, and dispatches record stock sent to a distributor.

Expected loop: assign route → visit store → record evidence and outcomes → check out → supervisor reviews tracking/scorecard → follow up on cheques, documents, or stock.

### Operations and administration

- `OpsCore → Tasks`, calendar, and activity pages support assignment, status updates, and operational review; `Export` is the reporting handoff.
- `Products` manages the catalog used by orders and stock counts.
- `Reviews → Feedback`, returns, and categories support complaint resolution and review classification.
- `Marketing → Influencers` and `Sends` track influencer and campaign work.
- `Settings` manages brands, staff, roles, permissions, and operational configuration.
- Brand records live in the `brands` table. A product's `brandCode` is only a reference and does not create a brand record; create or edit brand records in Settings (or the setup wizard) to add one to the shared portfolio.

## Permission and recovery paths

- A user with no access to the requested page should be redirected to the first allowed landing page, rather than sent to a dashboard they cannot open.
- Users without a module grant do not see its navigation item, dashboard metrics, morning-brief rows, global-search category, or export tab. Protected APIs repeat the feature check and return not found when the feature is hidden.
- Unknown customer phone numbers return to the customer directory.
- Invalid credentials and unavailable sign-in services show recoverable errors; repeated failures are rate-limited.
- Offline entries should remain queued until the server confirms the write. A retry must not display “synced” after a rejected or unsupported write.

## Broken loops found in the current implementation

These are release blockers, not user instructions or product requirements:

1. **Shared persistence is incomplete.** The main `db` service persists its operational state in browser `localStorage`. Different users/devices therefore do not share a reliable source of truth. Several API routes mutate a process-local `db` instance, which is not durable across serverless invocations.
2. **The offline write outbox is not connected to the app session.** `/api/sync` now provides a permission-filtered authenticated GET for initial reads, but the outbox posts to `/api/sync` and its current write handler still calls Supabase directly from the browser using the anonymous key. It cannot send the custom HTTP-only app session as a Supabase Auth identity, so rejected writes must stay queued.
3. **RLS and app authentication do not line up.** `supabase/rls.sql` relies on `auth.uid()` for an authenticated Supabase user. The app creates its own HMAC session cookie and does not establish a Supabase Auth session. Browser reads/writes protected by those policies will be rejected unless the persistence/auth model is changed.
4. **The schema and UI models need an explicit mapping.** The UI uses camelCase objects and client-generated IDs, while the SQL schema uses snake_case fields, UUID keys, and related child tables. A generic upsert of UI objects cannot safely persist those records. Some offline queue event types also have no handler.
5. **Cron delivery and backups are not implemented.** `/api/cron/daily-check` returns in-memory counts but does not save a backup or send email. `/api/cron/weekly-report` now uses a seven-day window and derived metrics, but returns HTML only; it does not send email and is still based on process-local data.
6. **Login throttling is process-local.** The five-attempt limiter lives in memory, so it can reset on serverless restarts and does not coordinate across instances. Use a shared rate-limit store before treating it as production brute-force protection.
7. **Brand Settings needs migrations in the target database.** The UI now uses database UUIDs and can save core name/code across legacy column variants. Apply `20261025000000_brand_settings_fields.sql` for optional metadata and `20261025010000_brand_code_unique.sql` for case-insensitive uniqueness; resolve duplicate normalized codes first.
8. **PWA GPS is not uninterrupted background tracking.** The map can receive authenticated pings while the app is open and location is allowed. Mobile browsers can pause background pages, and free public map tiles have no uptime guarantee. For stronger tracking, use a native Traccar Client/SDK with a self-hosted Traccar server; budget for server and tile hosting if uptime matters.
9. **A browser hydration screenshot showed `bis_skin_checked`.** That attribute is absent from application source and is consistent with browser extensions modifying the DOM before hydration. Verify in a private window or with extensions disabled; do not silence the warning in app code unless a clean browser reproduces it.

Until the persistence, auth/RLS, and cron loops are completed and verified against a staging Supabase project, this app should be treated as a reviewable build, not used as the live multi-user system of record.

## Minimum end-to-end release checks

After those blockers are fixed, verify in staging with real separate accounts for each role:

1. Sign in, refresh, let a session expire, and sign out; confirm a deactivated account loses access.
2. Create an order from both Extractor and Manual Entry; confirm it appears to a second authorized user after refresh.
3. Submit a failed delivery, return, and complaint; resolve or assign each and confirm the customer timeline updates.
4. Complete a field visit online and offline, reconnect, and confirm the visit, stock, photo metadata, call, order, and cheque are written once and visible to a supervisor.
5. Update a task, product, store, dispatch, and cheque status from their screens; confirm role/brand/ownership boundaries and persistence.
6. Run scheduled jobs in staging and verify the actual email and backup artifacts, not only success-shaped JSON responses.
