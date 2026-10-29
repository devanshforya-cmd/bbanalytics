-- Prevent case or whitespace variants of the same brand code from creating
-- duplicate portfolio entries. Resolve any reported duplicates before retrying.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.brands
    GROUP BY UPPER(BTRIM(code))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate brand codes exist after normalization. Resolve them before adding the unique index.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS brands_code_normalized_unique_idx
  ON public.brands (UPPER(BTRIM(code)));
