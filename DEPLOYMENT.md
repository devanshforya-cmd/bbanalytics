# Brand Bucket Command Center — Deployment & Operations Guide
## Complete Production Pipeline & Infrastructure Runbook (Fixes 56 & 57)

This document provides step-by-step instructions for deploying and maintaining the Brand Bucket Command Center (`command.brandbucket.com.np`) across Vercel, Supabase, and GitHub.

---

## 1. Architecture Overview

- **Frontend & Serverless**: Next.js 14 (App Router) on **Vercel**
- **Database & Storage**: PostgreSQL & Blob Storage on **Supabase**
- **Authentication**: Bcrypt-secured mobile login with 24-hour expiring sessions & Row-Level Security
- **Cron Jobs**: Vercel Cron (`15 2 * * *` -> Daily 8:00 AM NPT)
- **Emails**: Resend API (Free Tier: 3,000 emails/month)
- **Monitoring**: Better Uptime / Cronitor (Free Tier) + Vercel Speed Insights

---

## 2. Git & Branching Workflow (Fix 57a)

The repository follows a clean two-tier continuous deployment model:

```
feature/* ──(PR)──> dev [Staging/Preview] ──(PR)──> main [Production]
                         │                              │
                         ▼                              ▼
             preview.brandbucket.app         command.brandbucket.com.np
```

### Initial Git Repository Setup

If not already initialized:
```bash
cd forya-admin
git init
git add .
git commit -m "feat: complete brand bucket command center v2.0 with security hardening"
git branch -M main
git remote add origin git@github.com:brandbucket-nepal/command-center.git
git push -u origin main

# Create and push development branch
git checkout -b dev
git push -u origin dev
```

### Branch Rules:
1. **`main`**: Production branch. Direct commits disabled. Requires PR review and passing build.
2. **`dev`**: Integration branch for QA and staging testing. Deploys to preview environments on Vercel.
3. **`feature/*`**: Short-lived feature branches branched off `dev`.

---

## 3. Supabase Setup & Database Migration (Fix 57c)

### Step 1: Create Supabase Project
1. Go to [database.new](https://database.new) and sign in.
2. Create project:
   - **Name**: `brand-bucket-production`
   - **Region**: `Singapore (ap-southeast-1)` (lowest latency to Kathmandu, Nepal)
   - **Password**: Generate a high-entropy 32-character database password and store in 1Password.

### Step 2: Run Database Schema Migrations
1. Open the Supabase Dashboard -> **SQL Editor**.
2. Copy and paste the full contents of `supabase/schema.sql` and click **Run**.
3. Copy and paste the full contents of `supabase/rls.sql` and click **Run**.
   - This enables Row Level Security on all 13+ tables.
   - Enforces the append-only, immutable policy for `activity_logs`.
   - Isolates brand managers to their assigned brands.
   - Restricts sales officers to their own visits, routes, and cheques.

### Step 3: Create Storage Buckets
Under **Storage** -> **New Bucket**, create the following 5 buckets (Set to Public or Restricted as needed):
- `shelf-photos` (for before/after retail shelf verification)
- `cheque-photos` (for physical cheque front/back scans)
- `delivery-proofs` (for customer doorstep delivery photos)
- `documents` (for distributor agreements, VAT invoices, delivery chalans)
- `brand-logos` (for brand branding assets)

---

## 4. Vercel Deployment Configuration (Fix 57b & 57d)

### Step 1: Connect Repository
1. Log into [Vercel Dashboard](https://vercel.com) and click **Add New Project**.
2. Import `brandbucket-nepal/command-center`.
3. Framework Preset: **Next.js**.
4. Root Directory: `./` (or `forya-admin` if mono-repo).

### Step 2: Configure Environment Variables
Add the following under **Project Settings > Environment Variables**:

| Variable | Environment | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Supabase Project URL (`https://xyz.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Supabase Anon Public Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | Supabase Service Role Secret Key (Server-only) |
| `NEXT_PUBLIC_APP_URL` | Production | `https://command.brandbucket.com.np` |
| `NEXT_PUBLIC_APP_URL` | Preview | `https://$VERCEL_URL` |
| `CRON_SECRET` | Production | High-entropy secret token (32+ chars) |
| `RESEND_API_KEY` | Production | Resend API Key (`re_...`) |
| `EMAIL_FROM` | Production | `Brand Bucket HQ <operations@brandbucket.com.np>` |
| `WEEKLY_REPORT_RECIPIENTS` | Production | `admin@brandbucket.com.np,ceo@brandbucket.com.np` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Production, Preview | PWA Web-Push Public Key |
| `VAPID_PRIVATE_KEY` | Production | PWA Web-Push Private Key |

### Step 3: Custom Domain Setup (`command.brandbucket.com.np`)
1. In Vercel Project Settings, navigate to **Domains**.
2. Add `command.brandbucket.com.np`.
3. In your DNS Provider (Cloudflare / Mercantile / cPanel):
   - **Type**: `CNAME`
   - **Name**: `command`
   - **Target**: `cname.vercel-dns.com`
   - **TTL**: Auto / 300 seconds
4. Vercel will verify DNS within 60 seconds and auto-provision an SSL certificate via Let's Encrypt.

---

## 5. Automated Vercel Cron Scheduling (Fix 57g)

The deployment includes `vercel.json` pre-configured for automated execution:
```json
{
  "crons": [
    {
      "path": "/api/cron/daily-check",
      "schedule": "15 2 * * *"
    }
  ]
}
```

- **Execution Schedule**: `02:15 UTC` = `08:00 AM NPT` (Nepal Time) every morning.
- **Operations Performed**:
  1. **Smart Alerts**: Evaluates bounced cheques, customer karma (<20 blacklist), unassigned urgent complaints, and delayed cheques.
  2. **Friday Operations Report**: On Fridays, compiles the 7-day multi-brand summary and dispatches the HTML briefing via Resend.
  3. **Automated Database Backup Snapshot**: Exports JSON representation of active tables with row counts and checksums.

---

## 6. Security & Audit Verification Checklist (Fix 56 Pre-Flight)

Before promoting any release to live production:

- [x] **56a. Bcrypt Password Hashing**: Passwords stored as bcrypt hashes with 12 salt rounds. No plain-text passwords in DB or responses.
- [x] **56b. Session Expiration**: Sessions expire after 24 hours. Deactivated users are blocked instantly.
- [x] **56c. Row Level Security**: Enabled across all tables with role-based policies in `supabase/rls.sql`.
- [x] **56d. API Protection**: `/lib/auth-guard.ts` validates sessions and roles across all `/api/*` routes.
- [x] **56e. File Upload Verification**: Magic bytes inspected, 5MB file cap enforced, EXIF metadata stripped via canvas.
- [x] **56f. Input Sanitization**: XSS escaping and script stripping via `/lib/sanitize.ts`.
- [x] **56g. Secrets Protection**: `.gitignore` strictly ignores `.env*` local files. `.env.example` provides template.
- [x] **56h. Rate Limiting**: Max 5 login attempts per 15-minute sliding window with countdown UI.
- [x] **56i. Backups**: Database backup snapshot generated in `/api/cron/daily-check`.
- [x] **56j. Immutable Audit Trail**: `activity_logs` table allows only `INSERT` queries. `UPDATE` and `DELETE` are disallowed.
- [x] **56k. Security Headers**: Strict HSTS, CSP, X-Frame-Options, and nosniff configured in `next.config.mjs`.

---

## 7. Monitoring & Incident Response (Fix 57e)

1. **Uptime Monitoring**:
   - Register a free monitor on [Better Uptime](https://betteruptime.com) or [UptimeRobot](https://uptimerobot.com).
   - Point monitor to `https://command.brandbucket.com.np/api/cron/daily-check`.
   - Notification channel: Telegram / SMS to Ops Lead.

2. **Emergency Rollback**:
   - In Vercel Dashboard -> **Deployments**, locate the last known healthy deployment.
   - Click **Instant Rollback**. Traffic switches in ~2 seconds without rebuilding.
