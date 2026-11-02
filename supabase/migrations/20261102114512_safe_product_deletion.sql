-- A rare catalogue deletion takes a short table lock so a concurrent order,
-- stock count, or combo cannot create a reference between checking and deleting.
CREATE OR REPLACE FUNCTION public.delete_workspace_product(p_id text, p_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE product public.workspace_records%ROWTYPE;
BEGIN
  LOCK TABLE public.workspace_records IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO product FROM public.workspace_records WHERE collection = 'products' AND id = p_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF product.version <> p_expected_version THEN
    RAISE EXCEPTION 'Product changed on another device' USING ERRCODE = '40001';
  END IF;
  IF coalesce((product.data->>'stockQty')::numeric, 0) <> 0 OR EXISTS (
    SELECT 1 FROM public.workspace_records r
    WHERE r.collection NOT IN ('activityLogs', 'notifications', 'importHistory')
      AND NOT (r.collection = 'products' AND r.id = p_id)
      AND (jsonb_path_exists(r.data, '$.**.productId ? (@ == $id)', jsonb_build_object('id', p_id))
        OR jsonb_path_exists(r.data, '$.**.productIds[*] ? (@ == $id)', jsonb_build_object('id', p_id))
        OR jsonb_path_exists(r.data, '$.**.componentProductIds[*] ? (@ == $id)', jsonb_build_object('id', p_id)))
  ) THEN
    RAISE EXCEPTION 'Product has linked records or stock; archive it instead' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.workspace_records WHERE collection = 'products' AND id = p_id;
  RETURN 0;
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_workspace_product(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_workspace_product(text, integer) TO service_role;

-- Lock referenced SKUs until the write commits. A request that read a product
-- just before its deletion cannot insert a dangling order afterwards.
CREATE OR REPLACE FUNCTION public.guard_workspace_product_references()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE reference_id text; found_id text;
BEGIN
  IF NEW.collection IN ('activityLogs', 'notifications', 'importHistory') THEN RETURN NEW; END IF;
  FOR reference_id IN
    SELECT DISTINCT value #>> '{}' FROM (
      SELECT value FROM jsonb_path_query(NEW.data, '$.**.productId') AS value
      UNION ALL SELECT value FROM jsonb_path_query(NEW.data, '$.**.productIds[*]') AS value
      UNION ALL SELECT value FROM jsonb_path_query(NEW.data, '$.**.componentProductIds[*]') AS value
    ) refs WHERE jsonb_typeof(value) = 'string' AND value #>> '{}' <> ''
  LOOP
    IF TG_OP = 'UPDATE' AND (
      jsonb_path_exists(OLD.data, '$.**.productId ? (@ == $id)', jsonb_build_object('id', reference_id))
      OR jsonb_path_exists(OLD.data, '$.**.productIds[*] ? (@ == $id)', jsonb_build_object('id', reference_id))
      OR jsonb_path_exists(OLD.data, '$.**.componentProductIds[*] ? (@ == $id)', jsonb_build_object('id', reference_id))
    ) THEN CONTINUE; END IF;
    SELECT id INTO found_id FROM public.workspace_records
      WHERE collection IN ('products', 'combos') AND id = reference_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Referenced product no longer exists' USING ERRCODE = '23503'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_workspace_product_references() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_workspace_product_references() TO service_role;
CREATE TRIGGER workspace_product_references BEFORE INSERT OR UPDATE ON public.workspace_records
FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_product_references();
