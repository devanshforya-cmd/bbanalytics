# Area selling assist

Open **Offline Sales → Stores**. Each permitted retailer has an **Area selling opportunity** card; branches have an **Area selling** link under their parent chain. Select **Prioritize stores with area selling opportunities** to rank the directory by its score. Open the card to see the store's **Area Selling Assist** tab, its demand comparison and product pitches. The controls appear only when the user also has Beat Plans access, because secondary orders are protected by that feature.

## Evidence

- Only the current user's permitted workspace snapshot is read. Limited OWN/TEAM/brand grants can reduce the sample; a score never includes hidden records.
- Stores must have the same recorded **city and area**, after case, punctuation and spacing normalization. A city or area is never inferred from a default GPS location. Both retailers and branches support explicit city/area fields. On a store detail page, an authorized editor can use **Edit city & area**. Historical records with missing metadata show an insufficient-area explanation. Branches compare only with branches and retail outlets only with retail outlets, so GT demand does not inflate MT recommendations.
- Only **DELIVERED secondary orders** with an exact store entity type and ID, valid AD date and positive units for an active available catalog product contribute. Orders are deduplicated by ID. Pending, dispatched, cancelled, invalid, future and unmatched records are excluded.
- Online customer addresses and warehouse dispatches are deliberately excluded. Neither is a reliable completed purchase by a particular retailer, and adding a dispatch to its eventual secondary order would double count demand.
- Latest 30 calendar dates (including today, using recorded UTC AD dates) are compared with the preceding 30 dates. At least three recent delivered orders across two stores are needed before showing trends. A percentage is shown only when the prior product volume is positive; no prior volume is labeled explicitly.

## Pitches and scores

A product needs at least three recent delivered orders across two **other** stores before it can be recommended here.

- **Pitch a trial:** No delivered purchase at the target store in 60 days, with no positive shelf count in the last seven days. This is a purchase-history gap, not a claim that the shelf is empty.
- **Review replenishment:** A zero shelf count recorded in the last seven days, or a previous-period purchase with no recent delivered purchase. A fresh positive count suppresses a purchase-history replenishment prompt. The latest date and saved timestamp win when multiple counts exist.
- Product score (0–100): 40 points × other buying stores / other visible stores in the area; plus 25 points × other-store units / highest other-store product volume; plus 20 points × positive unit growth capped at 100%; plus 15 points for a trial/zero count or 7.5 points for a lapsed purchase. No prior-period volume earns no growth points.
- Store opportunity score: average of its highest three product scores, or zero when no pitch meets the rules. An insufficient sample has no numerical score.
- Evidence confidence: low at the minimum sample; medium at five orders across three stores; high at ten orders across five stores. It is evidence coverage, not a forecast probability.

There is no AI API, model, external service, scheduled job or credential requirement. Results recompute when workspace data changes. The user still confirms shelf stock, pricing and quantity before booking an order. The former one-tap order control with invented quantities/prices and hardcoded product gaps was removed.

## Verification and limits

`tests/area-selling.test.ts` covers area normalization and city isolation, equal periods and growth, duplicate/status/date/quantity rejection, exact store and available catalog matching, minimum peer samples, current/stale/latest shelf counts, trial versus reorder decisions, confidence, bounded deterministic scores honest empty states, separate GT/MT demand and stock evidence, historical branch metadata, and server validation of city/area fields.

Store city/area spelling must be maintained consistently; aliases are not inferred. Delivered secondary orders do not have a linked return quantity in the current model, so the metric is delivered demand rather than net consumer sell-through. The rules cannot infer current shelf stock or future revenue, and do not create orders automatically. Large-workspace client calculation has not been load tested.
