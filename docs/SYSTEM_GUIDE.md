# Brand Bucket Command Center — Master System & Operations Reference Manual

> **Comprehensive Technical Architecture & Operations Guide**  
> *Platform: Brand Bucket Command Center 2.0 (Production Enterprise Edition)*  
> *Technology Stack: Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase / Modular DB Service, IndexedDB (PWA Offline Support)*  
> *Primary Market: Nepal (Kathmandu Valley & Outstations)*  
> *Calendar Systems: Dual Bikram Sambat (BS 2083) & Gregorian (AD)*  

---

## Table of Contents
1. [Executive Summary & System Architecture](#1-executive-summary--system-architecture)
2. [Dual Calendar System (Bikram Sambat & Gregorian AD)](#2-dual-calendar-system-bikram-sambat--gregorian-ad)
3. [Role-Based Access Control & User Roles](#3-role-based-access-control--user-roles)
4. [Dynamic WhatsApp Extractor Engine (Fix 67 & 72)](#4-dynamic-whatsapp-extractor-engine-fix-67--72)
5. [Daily Orders Live Cross-Check Engine (Fix 68)](#5-daily-orders-live-cross-check-engine-fix-68)
6. [Smart Selling Assist Engine (Fix 46)](#6-smart-selling-assist-engine-fix-46)
7. [Customer Karma & 360 Intelligence (Fix 69)](#7-customer-karma--360-intelligence-fix-69)
8. [Offline Field Sales & Beat Operations (Fix 44, 45, 48, 49)](#8-offline-field-sales--beat-operations-fix-44-45-48-49)
9. [Store Health Score Engine (Fix 34)](#9-store-health-score-engine-fix-34)
10. [Marketing & Influencer Seeding Pipeline (Fix 60 & 71)](#10-marketing--influencer-seeding-pipeline-fix-60--71)
11. [Product, Combo & Pricing Catalog Management (Fix 70b & 72)](#11-product-combo--pricing-catalog-management-fix-70b--72)
12. [Order Delivery Failures vs. True Returns (Fix 22 & 23)](#12-order-delivery-failures-vs-true-returns-fix-22--23)
13. [Operations Core: Tasks, Calendar & Audit Activity (Fix 37, 38, 66)](#13-operations-core-tasks-calendar--audit-activity-fix-37-38-66)
14. [Automated Cron Services & Holiday Calendar (Fix 32 & 33)](#14-automated-cron-services--holiday-calendar-fix-32--33)
15. [Excel Data Import & Master Google Sheets Export (Fix 39, 42, 43)](#15-excel-data-import--master-google-sheets-export-fix-39-42-43)
16. [Production Database Schema & Performance Indexing (Fix 59)](#16-production-database-schema--performance-indexing-fix-59)
17. [Complete Route Map & File Directory Index](#17-complete-route-map--file-directory-index)

---

## 1. Executive Summary & System Architecture

The **Brand Bucket Command Center** is a multi-brand distribution and omnichannel management platform engineered specifically for consumer FMCG and cosmetics brands operating in Nepal (including **Forya**, **Pee Safe & FURR**, and **Renée Cosmetics**). 

The platform unifies two traditionally disconnected operational worlds into a single real-time dashboard:
1. **D2C & Social Commerce**: High-volume retail orders originating from WhatsApp, Instagram DMs, Facebook Messenger, TikTok, and Web.
2. **Offline Retail & General Trade (GT / MT)**: Field sales representatives visiting retail pharmacies, modern supermarkets (Bhatbhateni, Saleways), and regional distributor stockists across Kathmandu Valley and outstation provinces.

### High-Level System Architecture

```
                               ┌────────────────────────────────────────────────────────┐
                               │                    Ingestion Layer                     │
                               │   WhatsApp Chats · Instagram/TikTok · Field Booking    │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │              Unified Database Service                  │
                               │         (db-service.ts / Supabase Client)              │
                               └──────┬───────────────────┬───────────────────┬─────────┘
                                      │                   │                   │
               ┌──────────────────────┴───────┐   ┌───────┴──────┐   ┌────────┴────────────────────┐
               ▼                              ▼   ▼              ▼   ▼                             ▼
    ┌────────────────────┐          ┌────────────────┐ ┌────────────────┐         ┌─────────────────────────┐
    │ Dynamic Extractor  │          │ Customer Karma │ │ Smart Selling  │         │    Live Pub/Sub Engine  │
    │  Catalog-Driven    │          │  Engine (0-100)│ │ (Haversine 3km)│         │ (OrderRealtimeEvents)   │
    └──────────┬─────────┘          └────────┬───────┘ └────────┬───────┘         └────────────┬────────────┘
               │                             │                  │                              │
               ▼                             ▼                  ▼                              ▼
    ┌────────────────────┐          ┌────────────────┐ ┌────────────────┐         ┌─────────────────────────┐
    │ Batch Order Review │          │ Customer 360 & │ │ Store Intel &  │         │ Daily Orders Live Table │
    │   & Validation     │          │ Brand Timeline │ │ 1-Tap Booking  │         │ (Real-Time Flash UI)    │
    └────────────────────┘          └────────────────┘ └────────────────┘         └─────────────────────────┘
```

---

## 2. Dual Calendar System (Bikram Sambat & Gregorian AD)

- **Source Code**: [`src/lib/nepali-calendar.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/lib/nepali-calendar.ts)

In Nepal, government compliance, tax filing, distributor settlements, and consumer holiday shopping follow the **Bikram Sambat (BS)** solar calendar (approx. 56.7 years ahead of Gregorian AD). The platform provides bidirectional conversions without external dependencies:

### Mathematical Conversion Model
- **Reference Anchor Point**: `2080-01-01 BS` $\leftrightarrow$ `2023-04-14 AD`.
- **Month Durations**: Nepali months (Baisakh, Jestha, Ashadh, Shrawan, Bhadra, Ashwin, Kartik, Mangsir, Poush, Magh, Falgun, Chaitra) have dynamic lengths ranging from 29 to 32 days depending on the astronomical solar transit.
- **Conversion Methods**:
  - `adToBs(dateAd: Date | string)`: Computes cumulative days elapsed from the anchor epoch and maps to the corresponding Nepali year, month, and day.
  - `bsToAd(bsYear, bsMonth, bsDay)`: Resolves exact Gregorian date.
  - `getTodayBs()`: Emits human-readable formatted string (e.g. `Bhadra 26, 2083`).
- **Data Persistence**: Every entity in the system (Orders, Cheques, Store Audits, Dispatches) stores dual timestamp properties: `orderDateAd` and `orderDateBs`.

---

## 3. Role-Based Access Control & User Roles

- **Source Code**: [`src/lib/auth.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/lib/auth.ts), [`src/components/common/PageGuard.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/components/common/PageGuard.tsx)

The application enforces role-based access at both the page route level (via `<PageGuard>`) and the data filtering layer:

| User Role | Default Landing Page | Scope of Permissions & Visibility |
|---|---|---|
| **`SUPER_ADMIN`** | `/dashboard` | Complete unconstrained read/write access to all brands, staff accounts, system settings, database migrations, and financial configurations. |
| **`ADMIN`** | `/dashboard` | Full operational management across orders, field teams, inventory dispatches, and review logs. Cannot delete brands or super admin users. |
| **`BRAND_MANAGER`** | `/dashboard` (Brand-Filtered) | Restricted strictly to their assigned brand portfolio (e.g. Forya only, or Pee Safe & FURR only). Sees filtered orders, customers, and revenue. |
| **`SALES_OFFICER`** | `/offline-sales/beat-plan` | Optimized for mobile view. Sees only their assigned beat stores, own call logs, own collected cheques, own shelf photos, and personal compliance scorecard. |
| **`DATA_ENTRY`** | `/orderflow/extractor` | Dedicated access to order intake, WhatsApp extractor, manual entry, delivery failure resolution, and returns processing. |
| **`VIEWER`** | `/dashboard` (Read-Only) | Read-only executive reporting access. All creation, editing, and status update actions are disabled. |

---

## 4. Dynamic WhatsApp Extractor Engine (Fix 67 & 72)

- **Source Code**: [`src/lib/whatsapp-extractor.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/lib/whatsapp-extractor.ts), [`src/app/orderflow/extractor/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/orderflow/extractor/page.tsx)

### Core Operating Principle
The extractor never hardcodes product names, combos, prices, or keywords in source code. On every extraction execution, it pulls live catalog definitions from `db.getProducts()` and `db.getCombos()`.

### Key Capabilities:
1. **Multi-Message Batch Ingestion**:
   - Supports pasting individual orders or batches separated by `---` dividers or WhatsApp timestamp export headers:
     `[12/09/26, 10:15:30 AM] Customer Name: ...`
2. **Customer & Delivery Info Extraction**:
   - Matches Nepali mobile numbers (`+977`, `98XXXXXXXX`, `97XXXXXXXX`).
   - Identifies address, landmarks, and delivery instructions.
   - Maps locations against standard Nepal provinces and districts.
3. **Keyword Tag Matching & Nicknames**:
   - Matches raw text against each product's `extractorKeywords` array.
   - Recognizes abbreviations and transliterated terms (e.g., `rollon`, `peach roll on`, `serum`, `acne patch`, `ph lipstick`).
4. **Mixed Orders & Price-Based Combo Collapse**:
   - Seamlessly extracts orders containing both combo bundles and standalone SKUs.
   - **Price Collapse Rule**: When a combo has `priceDetectionEnabled: true` and the customer message states a total price matching that combo (e.g. `Rs. 999`), the engine automatically collapses ambiguous item text into that combo.
5. **Price Discrepancy Validation**:
   - **Delta $< 5\%$**: Accepted automatically.
   - **Delta $5\% \text{–} 15\%$**: Displays amber warning pill (`⚠️ Stated Rs. 1,000 vs calc Rs. 1,100 (9.1% diff)`).
   - **Delta $> 15\%$**: Flagged for mandatory review (`🚨 Large Price Discrepancy`).
   - **Stated Price $>$ Calculated MRP**: Flagged (`⚠️ Stated price exceeds catalog MRP`).
6. **Live Catalog Sync Status Bar**:
   - Displays real-time status: `🟢 Catalog Synced • 14 SKUs, 6 Combos loaded • Last updated just now`.

---

## 5. Daily Orders Live Cross-Check Engine (Fix 68)

- **Source Code**: [`src/app/orderflow/daily-orders/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/orderflow/daily-orders/page.tsx)

A real-time monitoring and cross-checking dashboard designed for office order coordinators to verify incoming WhatsApp orders against warehouse dispatch slips.

### Visual & Event Feedback Architecture
- **Pub/Sub System**: Subscribes to `OrderRealtimeEvent` from `db-service.ts`.
- **Live Indicator**: Header displays `🟢 LIVE · 2 Viewers` with active listener indicators.
- **Green Slide-In Flash**: Triggers whenever an order is entered via Extractor or Manual Entry with a toast notification.
- **Amber Flash & Audit Trail**: Triggers when an order is updated, showing an audit trail tag (e.g., `Edited by Sita Sharma: Updated address`).
- **Fade-Out Animation**: Triggers when an order is cancelled or deleted.
- **Stated vs. Calculated Price Cross-Check**: Highlights price differences in dedicated comparison columns.
- **Segregated Marketing Sends**: Marketing and influencer seeding orders display with a distinct purple left border and `MARKETING` pill.
- **Sticky Metrics Footer**: Displays Total Orders, Commercial Revenue, Average Order Value (AOV), Delivery Failures, and Marketing Sends.

---

## 6. Smart Selling Assist Engine (Fix 46)

- **Source Code**: [`src/lib/db/db-service.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/lib/db/db-service.ts#L2625), [`src/app/offline-sales/stores/[id]/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/offline-sales/stores/[id]/page.tsx#L661)

Designed for field sales officers visiting retail pharmacies and grocery marts to maximize secondary order bookings using location-based intelligence.

### The 4 Analytical Layers

#### A. 3km Neighborhood Bestsellers (`getAreaBestsellers`)
Uses the spherical **Haversine formula** to measure distances to all surrounding retail outlets:
$$d = 2 R \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta \text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta \text{lon}}{2}\right)} \right)$$
where $R = 6,371\text{ km}$. It aggregates all secondary bookings within $3\text{ km}$ and ranks the Top 5 fastest-selling SKUs.

#### B. Distribution Whitespace Gaps (`getDistributionGaps`)
Cross-references the $3\text{ km}$ bestsellers against the current store's ordering history:
$$\text{Whitespace Gaps} = \{ \text{Neighborhood Bestsellers} \} \setminus \{ \text{SKUs Carried by Current Store} \}$$
Flags high-velocity products that neighboring competitors sell successfully but this store does not carry.

#### C. Shelf Depletion & Restock Forecasting (`getRestockRecommendations`)
Evaluates shelf audits over the previous 7-day audit cycle:
$$\text{Daily Depletion Rate} = \frac{\text{Previous Audit Stock} - \text{Current Shelf Stock}}{7\text{ days}}$$
$$\text{Days Until Empty} = \frac{\text{Current Shelf Stock}}{\text{Daily Depletion Rate}}$$
- **Urgent Warning**: Triggered if $\text{Days Until Empty} \le 3\text{ days}$.
- **Suggested Order**: Quantities calculated to cover a **20-day buffer**, rounded to box case sizes (6, 12, or 24 units).

#### D. 1-Tap Quick Booking
The `[⚡ Book 1-Tap Replenishment Order]` button automatically composes a balanced secondary order containing the top neighborhood bestsellers and critical restock items directly into the dispatch queue.

---

## 7. Customer Karma & 360 Intelligence (Fix 69)

- **Source Code**: [`src/lib/karma-calculator.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/lib/karma-calculator.ts), [`src/app/customers/[phone]/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/customers/[phone]/page.tsx)

### Customer Karma Score: 0 to 100 Scale
Starting baseline: **70 points** (or **85 points** upon placing first order).

$$\text{Updated Score} = \max\Big(0, \min\big(100, \text{Current Score} + \sum \Delta \text{Points}\big)\Big)$$

### Karma Scoring Rules

| Event Trigger | Points Delta | Business Impact |
|---|:---:|---|
| **Order Placed** | **+2** | Customer initiates an order |
| **Order Delivered** | **+1** | Package successfully accepted |
| **Prepaid Payment** | **+1** | Zero COD risk payment |
| **Review Submitted** | **+3** | Engaged customer feedback |
| **Positive Rating Bonus** | **+2** | 4 or 5 star rating |
| **5 Clean Orders Milestone** | **+10** | 5 consecutive delivered orders with 0 returns/failures |
| **Complaint Filed** | **-2** | Service or packaging dissatisfaction |
| **Actual Return** | **-3** | Return of delivered goods |
| **Delivery Failure** | **-5** | Phone unanswered, unreachable at door |
| **Order Cancellation** | **-5** | Cancelled after packing/dispatch |
| **COD Refusal at Doorstep** | **-8** | Rider arrives but customer refuses to accept/pay |

### Automatic Tiers & Risk Flags
- **`< 20`**: `BLACKLISTED` — Advance payment mandatory before dispatch; COD strictly disabled.
- **`20 – 39`**: `AT_RISK` — High failure risk; requires telephone confirmation call before dispatch.
- **`40 – 74`**: `REGULAR` — Standard operational handling.
- **`≥ 75` (5+ orders)**: `LOYAL` — Preferred customer status.
- **`≥ 85` (10+ orders, 0 returns)**: `VIP` — White-glove handling, free gift samples, priority dispatch.
- **Behavioral Flags**:
  - `Returns ≥ 3` $\rightarrow$ `Serial Returner`
  - `Delivery Failures ≥ 2` $\rightarrow$ `Non-Receiver`
  - `Cancellations ≥ 3` $\rightarrow$ `Order Canceller`

---

## 8. Offline Field Sales & Beat Operations (Fix 44, 45, 48, 49)

- **Source Code**: [`src/app/offline-sales/beat-plan/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/offline-sales/beat-plan/page.tsx), [`src/lib/route-optimizer.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/lib/route-optimizer.ts)

### Sales Officer Daily Workflow
1. **Morning Shift Start**: Sales officer toggles shift status (🟢 Online / ⚪ Offline). Pinned morning directives from management display at the top.
2. **Smart Day Planner (Route Optimization)**:
   - Groups stores by priority: **★★★ High Priority** (must visit today), **★★ Medium Priority**, **★ Routine**.
   - Solves the Traveling Salesperson Problem (TSP) using GPS coordinates to order visits by nearest-neighbor distance.
3. **GPS Check-In**:
   - Validates that the officer is within **100 meters** of the store’s recorded latitude/longitude.
   - If outside 100m, prompts for reason (e.g. "GPS drift", "Meeting manager at cafe") and logs an override flag for admin review.
4. **In-Store Execution Hub**:
   - **Physical Stock Count**: Audits shelf inventory against safety threshold levels.
   - **Secondary Booking**: Books new orders with Smart Selling Assist recommendations.
   - **Before/After Shelf Photos**: Captures planogram compliance and counter display placement.
   - **Cheque Collection**: Records cheque number, issuing bank, due date, amount, and photo of physical cheque.
5. **GPS Check-Out**: Records total visit duration and moves to the next route stop.
6. **End-of-Day Scorecard**:
   - Calculates beat compliance percentage, total calls made, cheques collected, and secondary revenue.
   - Automatically dispatches a daily summary push notification to admins.

---

## 9. Store Health Score Engine (Fix 34)

- **Source Code**: [`src/lib/db/db-service.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/lib/db/db-service.ts#L2540)

Evaluates the commercial relationship and financial health of distributor branches and retail accounts on a **0 to 100 scale**:

$$\text{Store Health Score} = S_{\text{Regularity}} + S_{\text{Payment}} + S_{\text{Stock}} + S_{\text{Cooperation}} + S_{\text{Issues}}$$

### The 5 Weighted Factors
1. **Order Regularity (25 pts)**: Frequency of reorders (Monthly = 25 pts, Bi-monthly = 15 pts, Irregular = 0 pts).
2. **Payment Discipline (25 pts)**: Percentage of cheques cashed on time (100% on time = 25 pts; deductions for bounced cheques).
3. **Stock Maintenance (20 pts)**: Consistency of shelf stock levels remaining above minimum threshold.
4. **Visit Cooperation (15 pts)**: Percentage of scheduled beat visits where the sales officer was permitted to conduct audits.
5. **Issue Rate (15 pts)**: Ratio of returns/complaints to total orders ($0\text{–}2\% = 15\text{ pts}$, $>10\% = 0\text{ pts}$).

---

## 10. Marketing & Influencer Seeding Pipeline (Fix 60 & 71)

- **Source Code**: [`src/app/orderflow/manual-entry/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/orderflow/manual-entry/page.tsx), [`src/app/marketing/influencers/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/marketing/influencers/page.tsx)

### Complete Commercial Segregation
1. **Zero Revenue Impact**:
   - All PR packages and influencer product seeding orders have `totalAmount: 0`.
   - Excluded from commercial delivery failure rates, return rates, average order value, and gross revenue metrics.
2. **Influencer Directory Search & Preview**:
   - Search by creator name, social handle, or niche category.
   - Preview card displays star rating (`⭐⭐⭐ Great`), platform (`Instagram`), follower count, total sends count, and content deliverables received.
3. **Delivery Defaulting**:
   - Checking "Marketing / Influencer Send" automatically defaults delivery method to `Pick-up` (or Direct Send).
4. **Auto-Increment Counter**:
   - Order submission automatically calls `db.incrementInfluencerSends(influencerId)`.

---

## 11. Product, Combo & Pricing Catalog Management (Fix 70b & 72)

- **Source Code**: [`src/app/products/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/products/page.tsx)

### Catalog Architecture
- **Odoo References**: Completely eradicated project-wide.
- **Pricing Hygiene**: Internal financial pricing fields (`wholesalePrice`, `dtpPrice`, `costPrice`) are eliminated from product creation forms. Only customer-facing catalog `mrp` and `unitPrice: mrp` are managed.
- **Extractor Keyword Tag Editor**:
  - Interactive keyword pills for every product and combo.
  - **`[🔄 Auto-Suggest]` Engine**: Generates brand-less names, individual product tokens, and transliterated terms (e.g. `roll on`, `rollon`, `peach roll on`, `serum`, `nose strips`).
- **Promotional Combo Builder**:
  - Bundles 1 to 3 component SKUs with quantities.
  - Dynamically calculates total individual MRP, bundle combo price, and consumer savings percentage.
  - **Price-Based Collapse Toggle**: Enables WhatsApp extractor to match the combo whenever total price is stated.
  - **Audit Trail**: Records date, modifier, and price change history.

---

## 12. Order Delivery Failures vs. True Returns (Fix 22 & 23)

- **Source Code**: [`src/app/orderflow/delivery-failures/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/orderflow/delivery-failures/page.tsx), [`src/app/reviews/returns/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/reviews/returns/page.tsx)

The platform strictly separates **logistical delivery attempts** from **product returns**:

### Delivery Failures (Logistics Non-Delivery)
- **Definition**: The customer never received the package (e.g. "Call Not Received", "Customer Out of Valley", "Incomplete Address", "Customer Refused COD").
- **Workflow**: Logged under `/orderflow/delivery-failures`. Supports scheduling re-attempts (Attempt 1, 2, or 3), rider reassignment, and phone follow-up logging. Deducts 5 karma points.

### Actual Returns (Delivered Product Issues)
- **Definition**: The package was delivered, but the customer returned the product due to product/order quality issues.
- **Categories**: Leaking Product, Damaged Packaging, Wrong Product Sent, Expired Product, Product Reaction/Allergy.
- **Workflow**: Logged under `/reviews/returns`. Tracks return inspection status, customer replacement dispatch, or refund issuance.

---

## 13. Operations Core: Tasks, Calendar & Audit Activity (Fix 37, 38, 66)

- **Source Code**: [`src/app/opscore/tasks/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/opscore/tasks/page.tsx), [`src/app/opscore/calendar-tasks/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/opscore/calendar-tasks/page.tsx), [`src/app/opscore/activity/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/opscore/activity/page.tsx)

1. **Predefined Task Templates (Fix 37)**:
   - Allows 1-click creation of multi-step task workflows:
     - **New Store Onboarding** (5 steps: Introduce portfolio $\rightarrow$ Photograph shelf $\rightarrow$ First stock count $\rightarrow$ Collect first order $\rightarrow$ Upload agreement).
     - **Cheque Recovery Sequence** (3 steps: Call vendor $\rightarrow$ Visit store $\rightarrow$ Escalate to Admin).
     - **Complaint Resolution** (4 steps: Contact customer $\rightarrow$ Investigate batch $\rightarrow$ Provide replacement $\rightarrow$ 3-day follow-up).
     - **Monthly Stock Audit** (3 steps: Complete stock count $\rightarrow$ Photograph shelf $\rightarrow$ Discrepancy report).
2. **Bikram Sambat Visual Calendar (Fix 66)**:
   - Day, Week, and Month matrix plotting tasks, scheduled store beats, and public holidays side-by-side.
3. **Admin Field Push Summaries (Fix 38)**:
   - When a sales officer taps "End My Day", an automated summary push notification is dispatched to all Admins summarizing stores visited, compliance percentage, calls made, cheques collected, and field time.

---

## 14. Automated Cron Services & Holiday Calendar (Fix 32 & 33)

- **Source Code**: [`src/app/api/cron/daily-alerts/route.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/api/cron/daily-alerts/route.ts), [`src/app/api/cron/weekly-report/route.ts`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/api/cron/weekly-report/route.ts)

1. **Daily Morning Alerts (8:00 AM NPT)**:
   - Evaluates system state for critical conditions:
     - 🔴 **Red Alerts**: Bounced cheques, customer karma dropped $< 20$, urgent unassigned complaints, GPS check-in overrides.
     - 🟡 **Amber Alerts**: Cheques overdue by 1 day, stores unvisited for $>10$ days, delivery failure rate $>15\%$, low distributor stock.
2. **Friday Operations Email Report (8:00 PM NPT)**:
   - Computes 7-day rolling performance: total orders by brand, delivery failure rates, actual returns breakdown, beat compliance per sales officer, and cash flow summary.
3. **Holiday Calendar Engine (Fix 33a)**:
   - Pre-loaded with Nepali public holidays (Dashain, Tihar, Chhath, Teej, Holi, etc.).
   - Adjusts field compliance expectations (e.g. a 5-day working week does not penalize officers for festival days).

---

## 15. Excel Data Import & Master Google Sheets Export (Fix 39, 42, 43)

- **Source Code**: [`src/app/settings/components/DataImport.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/settings/components/DataImport.tsx), [`src/app/opscore/export/page.tsx`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/src/app/opscore/export/page.tsx)

### Data Import Engine (Fix 39)
Seamlessly ingests legacy Excel spreadsheets across 4 standardized formats:
1. **Orders Import**: Reads monthly tabs from `FORYA_MasterOrderEntry` format.
2. **Returns Import**: Reads per-brand tabs from `BB_RETURN_SHEET` format and separates true returns from delivery failures.
3. **Offline Sales Import**: Reads stores, branches, stock counts, and dispatches from `PEESAFE_OFFLINE_SALES` format.
4. **Daily Order Counts**: Ingests historical channel tallies from `Forya_SOCIAL_ORDER_COUNT`.

### Google Sheets Aligned Export (Fix 42 & 43)
Exports data in the exact column layouts expected by corporate management:
- **Orders Export**: `S.N. | Order ID | Order Type | Order Date (BS) | Order Date (AD) | Platform | Customer Name | Phone Number | Province | District | Brand | Product Category | Product Name | Qty | Delivery Status | Remarks`
- **Daily Social Order Counts Table**: Auto-computes daily date rows with columns for Website, Instagram, Facebook, WhatsApp, TikTok, Total, and individual product volumes.

---

## 16. Production Database Schema & Performance Indexing (Fix 59)

- **Source Code**: [`supabase/schema.sql`](file:///Users/devanshagarwal/Documents/TEST/forya-admin/supabase/schema.sql)

The production Postgres database is configured with **16 specialized performance indexes** to ensure sub-10ms query times at scale:

1. `idx_orders_brand_date` ON `orders(brand_id, order_date_ad DESC)`
2. `idx_orders_customer_phone` ON `orders(customer_phone)`
3. `idx_orders_delivery_status` ON `orders(delivery_status)`
4. `idx_orders_platform` ON `orders(platform)`
5. `idx_delivery_failures_date` ON `delivery_failures(date_ad DESC)`
6. `idx_delivery_failures_reason` ON `delivery_failures(reason)`
7. `idx_returns_brand_date` ON `returns(brand_id, date_ad DESC)`
8. `idx_feedback_brand_sentiment` ON `feedback_entries(brand_id, sentiment)`
9. `idx_cheques_status_cash_date` ON `cheques(status, cash_date_ad)`
10. `idx_cheques_store` ON `cheques(store_id)`
11. `idx_beat_officer_date` ON `beat_plans(officer_id, date_ad)`
12. `idx_beat_status` ON `beat_plans(status)`
13. `idx_stock_counts_entity_date` ON `stock_counts(entity_id, date_ad DESC)`
14. `idx_customers_phone` ON `customers(phone)`
15. `idx_customers_karma` ON `customers(karma_score)`
16. `idx_activity_trail_entity` ON `activity_logs(entity_type, entity_id)`

---

## 17. Complete Route Map & File Directory Index

```
src/
├── app/
│   ├── layout.tsx                                 # Global Root Layout (Fonts, Metadata, PWA meta)
│   ├── page.tsx                                   # Root Redirect (Role-based auth redirect)
│   ├── login/page.tsx                             # Authentication Screen (Phone/Password)
│   ├── dashboard/page.tsx                         # Executive Command Dashboard (Morning Brief, KPIs)
│   ├── orderflow/
│   │   ├── extractor/page.tsx                     # Dynamic WhatsApp Extractor (Catalog-Driven)
│   │   ├── daily-orders/page.tsx                  # Daily Orders Live Cross-Check (Pub/Sub Flash)
│   │   ├── manual-entry/page.tsx                  # Manual Order Entry (Drafts, Influencers)
│   │   └── delivery-failures/page.tsx             # Delivery Failures Logging & Re-Attempts
│   ├── offline-sales/
│   │   ├── beat-plan/page.tsx                     # Sales Officer "My Day" Beat Hub
│   │   ├── stores/page.tsx                        # Store Directory & Health Badges
│   │   ├── stores/[id]/page.tsx                   # Store 360 Intel & Smart Selling Assist
│   │   ├── calls/page.tsx                         # Field & Telephonic Call Logger
│   │   ├── cheques/page.tsx                       # Cheque Tracking & Custody Handover
│   │   ├── dispatch/page.tsx                      # Warehouse Dispatches & Packing Slips
│   │   ├── documents/page.tsx                     # Field Document Vault (Invoices, Agreements)
│   │   ├── shelf-photos/page.tsx                  # Merchandising Before/After Photos
│   │   ├── live-tracking/page.tsx                 # Live GPS Field Officer Map
│   │   └── scorecard/page.tsx                     # Officer Compliance & Revenue Scorecard
│   ├── customers/
│   │   ├── page.tsx                               # Customer 360 Directory (Brand Filter Pills)
│   │   ├── [phone]/page.tsx                       # Customer Profile (Brand Engagement & Timeline)
│   │   └── insights/page.tsx                      # Retention Analytics (Cohorts, Churn, Funnel)
│   ├── products/
│   │   ├── page.tsx                               # SKU & Combo Master (Extractor Keywords)
│   │   └── [id]/page.tsx                          # Product 360 Intel & Seasonal Trend Sparklines
│   ├── reviews/
│   │   ├── feedback/page.tsx                      # Customer Reviews & Photo Evidence
│   │   ├── returns/page.tsx                       # Actual Returns Processing
│   │   └── categories/page.tsx                    # Dynamic Checkbox Categories & Tags
│   ├── marketing/
│   │   ├── influencers/page.tsx                   # Influencer Directory & Ratings
│   │   ├── influencers/[id]/page.tsx              # Influencer Portfolio & Deliverables
│   │   └── sends/page.tsx                         # PR Seeding Send Records
│   ├── opscore/
│   │   ├── tasks/page.tsx                         # Task Manager & Templates
│   │   ├── calendar-tasks/page.tsx                # Bikram Sambat Visual Calendar
│   │   ├── activity/page.tsx                      # Audit Trail & EOD Officer Logs
│   │   └── export/page.tsx                        # Excel & Google Sheets Aligned Export
│   ├── settings/page.tsx                          # System Settings, Holidays & Excel Import
│   └── shared/[token]/page.tsx                    # Tokenized External Read-Only Reports
└── lib/
    ├── db/
    │   ├── db-service.ts                          # Unified Data Layer & Real-Time Pub/Sub
    │   ├── mock-data.ts                           # Seeded Catalog, Beats, Stores & Orders
    │   ├── supabase-client.ts                     # Supabase Browser Client
    │   └── supabase-server.ts                     # Supabase Server Client
    ├── nepali-calendar.ts                         # Bikram Sambat (BS) ↔ Gregorian (AD) Engine
    ├── karma-calculator.ts                        # Customer Karma Scoring & Segmentation
    ├── whatsapp-extractor.ts                      # Catalog-Driven Order Extractor Engine
    ├── route-optimizer.ts                         # Traveling Salesperson Beat Optimizer
    ├── auth.ts                                    # Authentication & Session Handlers
    ├── validation.ts                              # Nepali Phone & Field Validators
    └── types.ts                                   # Full TypeScript Contracts & Interfaces
```

---
*Manual compiled and verified for Brand Bucket Command Center 2.0.*
