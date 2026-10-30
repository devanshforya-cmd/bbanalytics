# Recovery release operations

## October 30 field and selling release

The GPS/push/channel/area-selling update passed 112 automated tests, TypeScript and an optimized production build (33 existing lint warnings, no lint errors). Seventeen real HTTP/Supabase groups passed, including native GPS pairing, uploaded positions, stale protection, rotation, off-duty pause and revocation; push subscription ownership, public-key status, private-key secrecy, same-origin protection, endpoint validation and removal. The push storage tables have RLS enabled with no anonymous/authenticated grants. The production dependency audit reports zero known vulnerabilities. A browser check saved, renamed and removed a temporary channel, with confirmed sync.

GPS now works across authenticated app routes with explicit sharing controls and a user-bound retry queue. Native background capture uses the paired Traccar Client receiver; see [GPS_SETUP.md](GPS_SETUP.md). Store/check-in coordinates are no longer invented when capture fails. Actual phone reception/background permissions remain a device test.

Web Push runtime keys and protected subscription storage are configured. Profile controls register each device and request a test send. Persisted work notifications trigger delivery and deduplicated retries. Provider acceptance does not prove display; actual lock-screen display remains to be confirmed on the intended devices. See [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md).

Channels & Logistics supports persisted add/edit/delete/archive choices throughout order entry/imports/reports. Historical labels remain intact. Custom channels appear in ALL/channel reports; the existing D2C/B2B grouping is unchanged. Retailers and branches have deterministic area selling scores, explicit city/area editing, local product trends and evidence-based pitches; see [AREA_SELLING_RULES.md](AREA_SELLING_RULES.md). No AI provider or subscription is needed.

Origin validation now uses the actual request Host rather than Next's internal URL hostname, so valid localhost/127.0.0.1 saves and callbacks work while cross-origin requests remain rejected.

## Architecture and security

Supabase is the source of truth. Canonical camelCase business records are stored in `workspace_records` by collection and ID with a version, mutation ID and trusted creator. `users` and `brands` remain dedicated tables. GPS stores one current position per officer. Raw public/anonymous table privileges and the old permissive policies were removed; the server validates the app session, feature/action, brand and record scope before using its service credential.

Apply the migrations in `supabase/migrations/` in order to a new environment. The filenames match the versions applied to the connected recovery project. Do not run the old bootstrap schema or permissive policy SQL over the recovered database. Keep `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SESSION_SECRET`, `CRON_SECRET` and Google client secrets server-only. Never publish `.env.local` or `INITIAL_ADMIN_PASSWORD`.

The deployment requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, a stable random `AUTH_SESSION_SECRET` of at least 32 bytes, and `CRON_SECRET`. Hosted `LOCAL_PREVIEW_AUTH` must be false. The health endpoint checks configured authentication and database access without exposing credentials. Changing the session secret signs users out and requires reconnecting Google.

## Run and check locally

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
npm run start:local
```

Open http://127.0.0.1:3000/login. Use an existing database account; this release does not ship a public default password. Keep the terminal running.

For a deliberate real Supabase check against that local server, run `node scripts/qa-recovery.mjs`. It reads the ignored local environment, creates uniquely named temporary fixtures, checks two roles, and deletes its own fixtures in `finally`. It requires the existing initial administrator password in the local environment. Do not run it against unrelated projects. `QA_KEEP_OFFICER=1` is only for a supervised browser QA session; remove that temporary account afterwards.

## Verification evidence

The latest completed code checks passed 80 tests and an optimized production build. A real Supabase run passed 15 grouped checks: database/auth health, denied anonymous staff access, initial configuration, account-switch protection, staff password creation, role/brand/OWN reads and forbidden writes, durable save/reload, replay/conflicts, brand references, task assignment, GPS identity/current position, order/customer commit, feature flag identity/analytics, shared passcode/projection/count/revocation, Google setup status, and login throttling. Grouped checks cover multiple assertions. CSV order/return/dispatch saves, rejected invalid references, replay protection and Customer 360 aggregation were also verified against the real database. The production dependency audit reported zero known vulnerabilities; tracked source scanning found no configured server secrets. The build reports 33 lint warnings and zero lint errors.

A clean browser run verified the Super Admin sign-in, configured brands and Settings. The restricted Sales Officer’s seven granted routes loaded without console errors. Its hidden scorecard URL redirected to Beat Plan, with zero scorecard links. Physical GPS is blocked by the current browser/device permission; the app displays that condition. Seven production HTTPS checks passed on the live domain: health, anonymous denial, real secure admin sign-in, saved/reloaded record, stale-version rejection, Google setup status, and fixture cleanup. Both production domains return healthy database/authentication status. The application source is commit `31c6a9116c829694273336b687442bff013bed33`. The original hydration screenshot's `bis_skin_checked` attribute is not in app source; extension-modified DOM needs a clean-browser comparison rather than suppression.

Supabase security advisories after the recovery migrations reported informational “RLS enabled, no policy” entries for deliberately server-only tables, with no public table grants. This is intentional for this custom-session architecture; it is not permission to add `USING (true)` policies.

## Google setup

Follow [GOOGLE_SETUP.md](GOOGLE_SETUP.md). The app needs its own Google Cloud OAuth Web application client, enabled Drive/Sheets APIs and administrator consent. A Codex connector connection is not the website's OAuth connection. Configure credentials securely in local environment/Vercel, then connect from Settings → Google Workspace. Files remain private and report exports are manual. Actual OAuth consent, Drive upload and Sheets export remain unverified until this setup is complete.

## Publishing and rollback

Push a recovery branch and review the change as a pull request. Build and test a Vercel preview with the corrected runtime variables before assigning production. Vercel Standard Protection is enabled: previews and generated deployment URLs require Vercel access, while production domains use the app login. Both `bbanalytics-three.vercel.app` and `bbanalytics-bb-1830.vercel.app` passed public health checks. Do not delete repository history or previous deployments to fix configuration errors.

Retain the previous deployment for code rollback, but do not reopen anonymous database access. The old browser-direct database code is incompatible with the recovered server-only access model. A code rollback alone is not a valid data rollback. Export/backup the database before future destructive migrations, and verify restoration separately.

## Known limits

- Foreground PWA GPS is supported. Mobile browsers can suspend background pages; background capture uses the paired native client described above. Physical phone setup is required. Free public map tiles do not offer a 100% uptime guarantee.
- The sync response is a full permitted snapshot. Database reads are paginated internally, but very large workspaces will need response paging to stay within hosted response limits. Large-volume load and concurrent multi-device editing have not been soak-tested.
- CSV imports support orders, returns and dispatches, one product per record, 50 rows and 300 KB per batch, within BS 2078–2085. Imports do not overwrite records. Batch rollback and Daily Counts imports are unavailable; the former fake success controls were removed.
- Photos/documents require Google setup; uploads are capped at 4 MB. Existing embedded browser images are not automatically migrated.
- Cron creates daily in-app alerts and retries push for registered devices. Scheduled email and offsite database backup storage are not configured. Device notification display depends on browser/OS consent and device settings.
- The build has existing lint warnings about React dependencies and ordinary image elements. Zero known build errors does not mean zero warnings or a guarantee of zero runtime faults.
