-- November 2026 change 8: each short document ID (FOR-0421, MS-0012, SO-0108,
-- DP-0045) is unique within its document type. The server's atomic counter
-- already hands out distinct numbers; these indexes make the database refuse
-- a duplicate even if a bug or a manual edit ever tried to write one.
--
-- A duplicate that already exists (for example two old long IDs copied by an
-- import) would make CREATE UNIQUE INDEX fail and block the deploy. Instead
-- this migration skips that one index and reports it. Run Settings -> Data
-- Upgrade, resolve the reported IDs, then run this file again: it is safe to
-- repeat.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('orders',          'orderNumber',    'workspace_records_order_number_unique_idx'),
      ('marketingSends',  'sendNumber',     'workspace_records_send_number_unique_idx'),
      ('secondaryOrders', 'orderNumber',    'workspace_records_field_order_number_unique_idx'),
      ('dispatches',      'dispatchNumber', 'workspace_records_dispatch_number_unique_idx')
    ) AS t(collection, field, index_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.workspace_records
      WHERE collection = target.collection AND COALESCE(data->>target.field, '') <> ''
      GROUP BY UPPER(data->>target.field)
      HAVING COUNT(*) > 1
    ) THEN
      RAISE WARNING 'Skipped %: duplicate % values exist in %. Resolve them, then rerun this migration.',
        target.index_name, target.field, target.collection;
    ELSE
      EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.workspace_records (UPPER(data->>%L)) WHERE collection = %L AND COALESCE(data->>%L, '''') <> ''''',
        target.index_name, target.field, target.collection, target.field);
    END IF;
  END LOOP;
END $$;

-- Phone lookups (change 9) and short-ID search read these fields often.
CREATE INDEX IF NOT EXISTS workspace_records_customer_phone_idx
  ON public.workspace_records ((data->>'phone')) WHERE collection = 'customers';
CREATE INDEX IF NOT EXISTS workspace_records_order_phone_idx
  ON public.workspace_records ((data->>'customerPhone')) WHERE collection = 'orders';
