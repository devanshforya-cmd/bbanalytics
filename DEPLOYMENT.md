# Deployment and Release Readiness

## Release status

**Hold production publishing.** The app builds and its current unit tests pass, but the current persistence path is not a durable, shared system of record. The main UI database is browser-local, several API routes use process memory, the offline outbox posts to a missing `/api/sync` write handler, and the app's custom session cookie is not a Supabase Auth identity for the policies in `supabase/rls.sql`. A successful-looking page or API response therefore does not prove a record is saved for other users.

See [docs/USER_FLOW.md](docs/USER_FLOW.md) for the product map, known broken loops, and minimum end-to-end release checks.

## Current stack and verified safeguards

- Next.js 15 App Router, React 18, Tailwind CSS 4.
- Supabase is configured as the intended database. `supabase/schema.sql` and `supabase/rls.sql` are not yet verified end-to-end with this app's custom HMAC session model.
- Sign-in verifies bcrypt hashes server-side and issues a signed, HTTP-only, SameSite=Strict 24-hour cookie. Protected APIs must use `requireAuth`; cron routes use `CRON_SECRET`.
- Login throttling is currently process-local and is not reliable as a distributed production rate limiter.
- Client-side browser storage remains part of the current data path. Local preview mode intentionally keeps brand changes in this browser only and marks them as unsynced. Do not treat this as backup or cross-device persistence.
- `/api/cron/daily-check` currently returns in-memory counts; it does not save a backup. The weekly report route returns HTML and does not send email. Configure no cron, email, or backup expectation from those routes until implemented and tested.

## Required environment variables

Set these in the target environment, using unique production secrets:

| Variable | Required | Use |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes for current browser client | Supabase public/anonymous key; never use it as a server secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for sign-in and protected server lookups | Server-only Supabase admin key; never expose to browser code |
| `AUTH_SESSION_SECRET` | Yes | Random server-only HMAC key, at least 32 bytes |
| `CRON_SECRET` | Yes if cron routes are enabled | Random bearer secret, at least 32 bytes |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical application URL |

Optional integrations such as Resend, VAPID, Google Drive, and Google Sheets should only be configured after their routes are tested against real staging credentials. Never commit `.env.local` or production credentials.

## Database and migration gate

1. Create a separate Supabase staging project and take a restorable backup before applying migrations.
2. Review and reconcile the app types, API payloads, `supabase/schema.sql`, and `supabase/rls.sql` first. In particular, decide how the custom app cookie maps to RLS authorization. Do not loosen RLS or enable anonymous writes as a workaround.
3. Apply `supabase/migrations/20261025000000_brand_settings_fields.sql` to staging for full brand metadata (color, category, company, and description).
4. Apply `supabase/migrations/20261025010000_brand_code_unique.sql` to staging. It stops if case-normalized duplicate codes exist; resolve those before retrying.
5. Apply the remaining schema changes only after the app/RLS mapping exists; create and test storage policies for every bucket before uploading operational documents or photos.
6. Seed the first administrator with `INITIAL_ADMIN_PASSWORD` and the service-role key using `npx tsx scripts/seed-admin.ts`. Rotate the initial password after first sign-in.
7. Run the role-by-role end-to-end checks in `docs/USER_FLOW.md` against staging and confirm data visibility from a second device/account.

## Build and deployment gate

The project uses `npm ci`, `npm run lint`, `npm test`, and `npm run build`. Run all four on the exact release commit. The current lint command reports warnings; warnings still need review when they touch the flow being released.

Do not connect the production domain or enable scheduled jobs until the persistence/auth gate above passes. After staging passes, deploy a preview, inspect login and all permitted routes for each role, verify cron side effects and stored backup artifacts, then promote through the organization's approved review process.

## Current audit snapshot

This snapshot reflects the repository review on 2026-10-25; rerun checks before any release:

- Unit tests: 27 passed after the current changes.
- ESLint: no errors; 35 hook dependency and image optimization warnings remain.
- TypeScript: `npx tsc --noEmit --pretty false` passed.
- Dependency audit: 0 known vulnerabilities after dependency overrides were applied. Re-run `npm audit` at release time.
- Clean install: `npm ci` passed from `package-lock.json`.
- Production build: passed on the current code in an isolated working copy to keep the localhost dev server intact.
- Runtime checks requiring connected staging Supabase, email, storage, and separate user accounts have not been completed.
- A read-only probe found that the configured Supabase project host returns public DNS `NXDOMAIN`; re-copy the Project URL from Supabase Project Settings and restart the dev server. Local-preview brand CRUD is explicitly browser-only; no Supabase migration or write was applied during this review.
- The `bis_skin_checked` hydration mismatch shown in the screenshot does not appear in app source and is likely injected by a browser extension. Verify in a clean browser before treating it as an application defect.
