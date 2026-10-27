CREATE UNIQUE INDEX IF NOT EXISTS workspace_flag_name_unique ON public.workspace_records ((data->>'name')) WHERE collection='featureFlags';
CREATE UNIQUE INDEX IF NOT EXISTS workspace_share_token_unique ON public.workspace_records ((data->>'token')) WHERE collection='sharedAccessLinks';

WITH administrator AS (SELECT id FROM public.users WHERE is_active IS NOT FALSE AND (is_super_admin OR role='SUPER_ADMIN') ORDER BY created_at LIMIT 1),
defaults(collection,data) AS (VALUES
('documentTypes','{"id":"doc_po","name":"Purchase Order","isActive":true}'::jsonb),
('documentTypes','{"id":"doc_inv","name":"Signed Invoice","isActive":true}'::jsonb),
('documentTypes','{"id":"doc_receipt","name":"Delivery Receipt","isActive":true}'::jsonb),
('documentTypes','{"id":"doc_stock","name":"Stock Acknowledgment","isActive":true}'::jsonb),
('documentTypes','{"id":"doc_credit","name":"Credit Note","isActive":true}'::jsonb),
('documentTypes','{"id":"doc_ret","name":"Return Authorization","isActive":true}'::jsonb),
('storeCategories','{"id":"cat_supermarket","name":"Supermarket","isActive":true}'::jsonb),
('storeCategories','{"id":"cat_pharmacy","name":"Pharmacy","isActive":true}'::jsonb),
('storeCategories','{"id":"cat_kirana","name":"Kirana","isActive":true}'::jsonb),
('storeCategories','{"id":"cat_cosmetics","name":"Cosmetics Store","isActive":true}'::jsonb),
('storeCategories','{"id":"cat_wholesale","name":"Wholesale","isActive":true}'::jsonb),
('storeCategories','{"id":"cat_general","name":"General Store","isActive":true}'::jsonb),
('storeCategories','{"id":"cat_dept","name":"Department Store","isActive":true}'::jsonb),
('workspaceConfig','{"id":"workspace","requireStorePhotoAtCheckIn":false}'::jsonb))
INSERT INTO public.workspace_records(collection,id,data,created_by,version,last_mutation_id)
SELECT collection,data->>'id',data,administrator.id,1,'initial_configuration_v1' FROM defaults CROSS JOIN administrator
ON CONFLICT (collection,id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_shared_access(p_link_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE link public.workspace_records%ROWTYPE;
BEGIN
  SELECT * INTO link FROM public.workspace_records WHERE collection='sharedAccessLinks' AND id=p_link_id;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.workspace_records(collection,id,data,created_by,version,last_mutation_id)
  VALUES('sharedLinkAccess',p_link_id,jsonb_build_object('id',p_link_id,'accessCount',1,'lastAccessedAt',now()),link.created_by,1,'shared_access')
  ON CONFLICT(collection,id) DO UPDATE SET
    data=jsonb_build_object('id',p_link_id,'accessCount',coalesce((public.workspace_records.data->>'accessCount')::bigint,0)+1,'lastAccessedAt',now()),
    version=public.workspace_records.version+1,updated_at=now();
END $$;
REVOKE EXECUTE ON FUNCTION public.record_shared_access(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_shared_access(text) TO service_role;
