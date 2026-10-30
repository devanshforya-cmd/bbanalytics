# BB Analytics deployment

The recovery release is live at [BB Analytics](https://bbanalytics-three.vercel.app/login). The verified core application uses Supabase for shared records and the application's own staff login. Vercel Standard Protection remains enabled for previews and generated deployment URLs.

See [release setup and limits](docs/RELEASE_RECOVERY.md), [current user flow](docs/USER_FLOW.md), and [Google setup](docs/GOOGLE_SETUP.md). Those documents supersede the earlier architecture blueprint and browser-only QA notes.

## Verified deployment

Initial recovery commit: `31c6a9116c829694273336b687442bff013bed33`. The latest release is published from GitHub `main`; verify its SHA in Vercel before assigning production.

- 112 automated tests, TypeScript and production build passed for the GPS/push/channels/area-selling update.
- 17 grouped checks passed against the real Supabase database using distinct admin/officer accounts, including native GPS and push subscription security.
- Seven live HTTPS checks passed: database/auth health, denied anonymous reads, secure admin login, saved record reload, stale-version rejection, Google configuration status, and test-record cleanup.
- Production dependency audit: zero known vulnerabilities. The build retains 33 lint warnings and no lint errors.

Google OAuth credentials and consent are still required before Drive uploads and Sheets exports work. Physical GPS/background capture and lock-screen notification display require a real-device test. Native GPS pairing and Web Push server delivery are implemented; follow [GPS setup](docs/GPS_SETUP.md) and [push setup](docs/PUSH_NOTIFICATIONS.md). CSV batch rollback, scheduled email and offsite backups remain unavailable.

## Runtime configuration

Use `.env.example` as the variable-name reference. Configure the real Supabase project URL, public key, server-only service-role key, stable `AUTH_SESSION_SECRET`, and `CRON_SECRET`. Hosted `LOCAL_PREVIEW_AUTH` must be false. `NEXTAUTH_SECRET` is not the app session key. Never deploy the one-time `INITIAL_ADMIN_PASSWORD` seed variable or expose server secrets with a `NEXT_PUBLIC_` prefix.

Apply only the ordered recovery migrations for an existing recovered environment. Do not rerun the old permissive RLS/bootstrap scripts. This app authenticates through protected server APIs; its service credential stays on the server and anonymous database table access stays closed.

`GET /api/health` should return HTTP 200 with database ready and authentication configured. Private workspace APIs must return 401 without the app session. A Vercel Ready build alone does not establish those checks.

## Publishing and recovery

Push a tested change through GitHub, verify the Vercel build, and test login plus a saved/reloaded record before treating a deployment as healthy. Preserve the prior deployment and database history. A code rollback to the earlier browser-direct data path is incompatible with the recovered database permissions; never reopen anonymous table access to make old code work.

The daily Vercel cron evaluates persisted records and saves in-app alerts. It does not send mail or produce an offsite backup. Configure and test those integrations separately before relying on them.
