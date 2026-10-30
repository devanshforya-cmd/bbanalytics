# BB Analytics user flow

Updated for the recovery release, 27 October 2026. This describes the implemented flows; external setup and verification limits are in [RELEASE_RECOVERY.md](RELEASE_RECOVERY.md).

## Sign-in and permissions

A Super Admin creates staff accounts in Settings → Staff & Roles, assigns brands and a reporting manager, and grants each feature and action. Staff sign in using email or Nepal mobile number and their password. The server issues a 24-hour HTTP-only session and rechecks the current account on every protected API request. Deactivating an account blocks subsequent requests. Login attempts are limited using shared Supabase storage, with a local preview limiter only for preview mode.

Hidden features disappear from navigation, search categories, dashboard sections, mobile shortcuts and guarded pages. Typing a hidden route redirects to an allowed page. Server reads and writes independently enforce feature, action, brand and OWN/TEAM/ALL restrictions. TEAM includes reporting descendants. Catalog/store data needed for an allowed field operation can be loaded without granting its management screen. Users cannot choose another officer's identity when sending GPS coordinates.

The client refreshes on focus and once a minute while visible and online. A refresh updates current grants and removes newly denied records from the displayed workspace. Requests reject revoked access immediately; an already open screen updates on the next refresh. Unsaved changes remain in the original account's private outbox for review.

## Super Admin setup

1. Create the portfolio in Settings → Brand Management. Products reference a brand code; they do not create a brand automatically. Saved brands populate filters after loading. Brands with linked records cannot be deleted or have their code changed; display names can change.
2. Create staff with a unique email/mobile and a password of 16–72 bytes. Assign a valid active manager and grant only the features needed. The final active Super Admin cannot be removed or demoted.
3. Configure products, outlets, document types, holidays, task templates and promotions. Business records are stored in Supabase. Calendar, view and filter preferences remain local to the browser.
4. Configure Google Workspace as described in [GOOGLE_SETUP.md](GOOGLE_SETUP.md). Drive stores uploads; Sheets holds manually exported reports. Supabase remains authoritative.

## Sales Officer day

1. Open My Day / Beat Plan. Only permitted routes, stores and brands are available.
2. Start field duty, allow location, and check in at a scheduled store. Complete stock counts, product facings, photos, orders, calls, cheque collection or document handover as permitted.
3. Uploads require a working Google connection. A failed upload stays an error and does not create a pretend attachment.
4. Check out and continue to the next stop or finish the day. Visit timestamps and duration are saved.
5. Work offline when necessary. The outbox preserves changes until the server confirms them. Reconnect and inspect Sync status. A conflict stays pending until the user reviews it; it is not silently overwritten.
6. Complete assigned tasks. Tasks use the assignee's actual user ID and name; nonexistent or inactive assignees are rejected.

## Orders and service

Orderflow supports extraction/manual entry, daily orders and failed deliveries. Orders use configured products and real prices/quantities; an order and its customer update commit together through the server API. Customer profiles, complaints, returns and dispatch work use the same durable workspace, with permissions repeated at the server boundary.

Dashboard statistics use saved records. No-order channels show no measured delivery success, regional timings require recorded deliveries, complaints link to actual orders, and weekly beat lines use that week's scheduled beats. Officer totals match user IDs rather than names.

Settings → Data Import validates each row against current product, brand, order and distributor IDs, shows a server-validated preview, and saves a complete batch in one transaction. It supports orders, returns and dispatches, with confirmed receipts and idempotent retry. It does not replace existing rows or provide batch rollback.

## Administration and sharing

Settings manages staff, brands, field requirements and configuration. Channels & Logistics reports actual recorded usage; it does not connect social accounts or courier services. Saved alert thresholds drive the daily in-app operations alerts. Email and lock-screen push delivery are not configured.

Feature flags and their events persist through protected server APIs. Only the Super Admin can manage definitions or view analytics. Event identity comes from the session.

Shared Access creates cryptographically random links. The server checks active status, expiry, passcode, brands and allowed modules before returning a limited projection. It excludes login secrets and internal records. Access counts are recorded separately so opening a link cannot conflict with editing its configuration. Revoking a link blocks later reads.

## Persistence and recovery

Authenticated browser → protected Next.js API → Supabase service client → versioned workspace records. Users and brands retain their dedicated tables. Public database access is closed because this app uses its own server session rather than a Supabase Auth browser session.

Each business mutation carries a unique ID and expected version. Repeating an acknowledged mutation is idempotent; stale versions return a conflict. Server batch changes use a transaction. The service worker never caches API responses or uploaded document proxies.

The cache and outbox belong to a user ID. Signing out clears the displayed workspace, and another account cannot upload the first account's queued work. Legacy browser data is backed up and recovered only for its matching owner and allowed records. Unrecognized legacy queue entries need manual review; their original payload is retained.

## Verification boundary

The recovery tests include real, separate Super Admin and Sales Officer accounts against Supabase, along with automated permission, queue, route, sharing, Google formatting and caching checks. Temporary test business records are removed after each run. See the release document for current evidence. Google consent/upload/export, a complete phone hardware run and sustained multi-user load require separate verification; a passing build is not a guarantee that every device or external service will work continuously.
# October 29 feature update

- Every authenticated user with Beat Plans access can opt into device GPS from the GPS sharing panel across the app. It reports real fixes, permission errors and confirmed saves; stopping/off-duty pauses capture. For background phone capture, pair the free native client using [GPS_SETUP.md](GPS_SETUP.md).
- Each user enables push from the profile drawer, registers that device and sends a real test request. See [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md).
- Settings → Channels & Logistics supports add, rename and delete/archive with an explicit save. Used choices remain on historical orders. New choices propagate to order entry, edits, imports and channel reports.
- Stores → Area selling prioritizes retailer and branch opportunities using recorded local delivered demand. City/area can be edited on store details with Store EDIT permission. Comparisons separate retailer/branch peers and show insufficient-data states. [AREA_SELLING_RULES.md](AREA_SELLING_RULES.md) explains the deterministic scores.
