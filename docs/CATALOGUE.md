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

**Products** opens the **Active products** section. **Archived products** is a separate tab and never appears mixed into Active. The archive tab includes Restore and Delete controls. Search and brand filters apply within the selected section.

As Super Admin, use **Delete / archive** on the list or detail page:

- **Delete product** removes the SKU from both Active and Archived, including products linked to orders, combos or stock. Type `DELETE` to confirm. It cannot be restored through the app. Existing orders, stock counts, returns and their saved line details are unchanged. A private `deletedProducts` snapshot retains original product metadata and recorded warehouse quantity for historical integrity; it is excluded from client snapshots and sync writes.
- **Archive product** moves the SKU to Archived and excludes it from new sales/extraction. It remains restorable.
- **Restore product** moves an archived SKU back to Active.

Deletion requires connectivity, the current record version and Super Admin authorization. The existing database transaction API version-checks the product, retains the historical snapshot and removes the live row atomically. The complete snapshot is saved as `snapshotJson` in private history. Deleted IDs are rejected by server sync so stale browser queues cannot restore the catalogue entry. New sales cannot reference deleted products; existing historical records can still change status. Bundles with missing or archived components cannot be sold.

Product deletion is denied to ordinary staff even if they have a product DELETE grant. Server checks apply to direct sync requests as well as the visible controls. The protected database functions are unavailable to public, anonymous and authenticated Supabase clients.

Brand menus, labels, cross-brand customer summaries, sharing selections and reports use saved brand records. No built-in business brand is assumed. Manual-order bundle suggestions require an active saved combo matching the exact basket and its quantities; prices come from that combo. The catalogue's combo sales figures use recorded delivered lines, and unrecorded kit stock is labelled as such.

This release uses the existing `commit_workspace_mutations` transaction and reference guard; no new database migration or public grant is required. Catalogue deletion is an explicit application action.
