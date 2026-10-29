# Brand Bucket Command Center
Operational Intelligence & Field Sales Force Management Platform for Brand Bucket Nepal (Forya, Pee Safe / FURR, Renee).

The recovery release uses Supabase as its main database, Google Drive for files, and Google Sheets for manual report exports. See [user flow](docs/USER_FLOW.md), [release setup and verification](docs/RELEASE_RECOVERY.md), and [Google setup](docs/GOOGLE_SETUP.md).

Run `npm ci`, configure an ignored `.env.local` from `.env.example`, then `npm run build` and `npm run start:local`. The local app opens at http://127.0.0.1:3000/login with a real database account.
