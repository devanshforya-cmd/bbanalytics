CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_unique ON public.users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_mobile_unique ON public.users (right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)) WHERE phone IS NOT NULL AND phone <> '';
CREATE UNIQUE INDEX IF NOT EXISTS workspace_product_sku_unique ON public.workspace_records (lower(data->>'sku')) WHERE collection = 'products' AND data->>'sku' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_order_number_unique ON public.workspace_records ((data->>'orderNumber')) WHERE collection = 'orders' AND data->>'orderNumber' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_customer_phone_unique ON public.workspace_records ((data->>'phone')) WHERE collection = 'customers' AND data->>'phone' IS NOT NULL;
ALTER TABLE public.workspace_records ADD CONSTRAINT workspace_record_id_present CHECK (data ? 'id');

CREATE OR REPLACE FUNCTION public.update_staff_user(p_actor text, p_id text, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor public.users%ROWTYPE; previous public.users%ROWTYPE; updated public.users%ROWTYPE;
BEGIN
  -- Serialize staff privilege changes so two administrators cannot concurrently
  -- deactivate each other and leave the workspace without an administrator.
  PERFORM pg_advisory_xact_lock(hashtext('bb-staff-management'));
  SELECT * INTO actor FROM public.users WHERE id = p_actor FOR UPDATE;
  IF NOT FOUND OR actor.is_active IS FALSE OR NOT (actor.is_super_admin OR actor.role = 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Only an active Super Admin can manage staff' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO previous FROM public.users WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff account not found' USING ERRCODE = '22023'; END IF;
  SELECT * INTO updated FROM jsonb_populate_record(previous, p_patch - 'id' - 'created_at');
  UPDATE public.users SET
    name=updated.name, full_name=updated.full_name, email=updated.email, phone=updated.phone,
    password_hash=updated.password_hash, role=updated.role, is_super_admin=updated.is_super_admin,
    reports_to_id=updated.reports_to_id, assigned_brands=updated.assigned_brands,
    assigned_territory=updated.assigned_territory, territory=updated.territory,
    permissions=updated.permissions, custom_permissions=updated.custom_permissions,
    calendar_preference=updated.calendar_preference, is_active=updated.is_active,
    deactivated_at=updated.deactivated_at, updated_at=now()
    WHERE id=p_id RETURNING * INTO updated;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE is_active IS NOT FALSE AND (is_super_admin OR role='SUPER_ADMIN')) THEN
    RAISE EXCEPTION 'The last active Super Admin cannot be deactivated or demoted' USING ERRCODE='22023';
  END IF;
  RETURN to_jsonb(updated) - 'password_hash';
END $$;
REVOKE EXECUTE ON FUNCTION public.update_staff_user(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_user(text,text,jsonb) TO service_role;
