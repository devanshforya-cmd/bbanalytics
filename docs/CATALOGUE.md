# Product catalogue and brands

Supabase is the source of truth. Brands live in `public.brands`. The application currently stores products, combos, orders and other versioned business records in `public.workspace_records`. The older `public.products` table is not the application's catalogue. An empty legacy table does not mean the connected catalogue is empty.

Inspect the current catalogue in the Supabase SQL editor:

```sql
select id, data->>'name' as name, data->>'sku' as sku,
       data->>'brandCode' as brand_code, data->>'active' as active,
       version, last_mutation_id
from public.workspace_records
where collection = 'products'
order by data->>'name';
```

On November 2, 2026, the connected database contained ten product records with `seed_products_…` mutation IDs and three saved brands. Those are existing database records. This change does not remove them automatically. Some seeded records use `PEE_SAFE` while the saved brand code is `PEESAFE`; the app does not silently merge those distinct codes. Preserve the intended brand code when importing real products. Existing history can still be archived without changing its original brand attribution.

## Manage products in the app

As Super Admin, open **Products → Delete / archive**, or the same control on a product's detail page. The app refreshes pending work and checks server records before showing the confirmation.

- **Permanently delete** is offered only for products without linked orders, combos, promotions, stock counts, other product references, or recorded warehouse stock. It requires connectivity, the current record version, and Super Admin authorization. The database rechecks links under a lock. New product references are checked by a database trigger, preventing a concurrent write from attaching to a product after deletion.
- **Archive product** removes the SKU from new sales and extraction while retaining historical records. Bundles containing an archived product are excluded from selling suggestions. Historical status updates remain available.
- **Restore product** makes an archived SKU available again. Restore is in the same management dialog.

Product deletion is denied to ordinary staff even if they have a product DELETE grant. Server checks apply to direct sync requests as well as the visible controls. The protected database functions are unavailable to public, anonymous and authenticated Supabase clients.

Brand menus, labels, cross-brand customer summaries, sharing selections and reports use saved brand records. No built-in business brand is assumed. Manual-order bundle suggestions require an active saved combo matching the exact basket and its quantities; prices come from that combo. The catalogue's combo sales figures use recorded delivered lines, and unrecorded kit stock is labelled as such.

Apply the `safe_product_deletion` migration before deploying this code. It changes no existing catalogue data.
