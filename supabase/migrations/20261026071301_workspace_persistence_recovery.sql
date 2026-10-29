-- Durable business records retain the application's camelCase payloads.
-- A row per entity avoids process-local storage and whole-workspace lost updates.
CREATE TABLE IF NOT EXISTS public.workspace_records (
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND data->>'id' = id),
  created_by text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_mutation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS workspace_records_creator_idx ON public.workspace_records (created_by, collection);
ALTER TABLE public.workspace_records ENABLE ROW LEVEL SECURITY;

-- GPS keeps the latest actual position per officer, rather than an arbitrary
-- window of recent history that can omit officers from the map.
CREATE TABLE IF NOT EXISTS public.gps_pings (
  officer_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  officer_name text NOT NULL,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  status text NOT NULL CHECK (status IN ('IN_TRANSIT','AT_STORE','IDLE','DAY_ENDED')),
  current_store_name text,
  battery_level double precision CHECK (battery_level BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gps_pings ENABLE ROW LEVEL SECURITY;

-- The application uses signed, HttpOnly application sessions, not Supabase Auth
-- JWTs. Only authenticated server routes may use the privileged database key.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'Allow authenticated read/write%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', item.policyname, item.tablename);
  END LOOP;
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', item.tablename);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', item.tablename);
  END LOOP;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- Server API operations can affect several records (for example an order and
-- its customer). Commit their version checks and writes as one transaction.
CREATE OR REPLACE FUNCTION public.commit_workspace_mutations(p_mutations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item jsonb; previous public.workspace_records%ROWTYPE; present boolean; next_version integer; result jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_mutations) <> 'array' OR jsonb_array_length(p_mutations) > 500 THEN
    RAISE EXCEPTION 'Invalid mutation batch' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_mutations) ORDER BY value->>'collection', value->>'id'
  LOOP
    SELECT * INTO previous FROM public.workspace_records
      WHERE collection = item->>'collection' AND id = item->>'id' FOR UPDATE;
    present := FOUND;
    IF present AND previous.last_mutation_id = item->>'mutationId' THEN
      next_version := previous.version;
    ELSIF NOT present AND item->>'operation' = 'delete' THEN
      next_version := 0;
    ELSE
      IF coalesce(previous.version, 0) <> (item->>'expectedVersion')::integer THEN
        RAISE EXCEPTION 'Workspace record changed on another device' USING ERRCODE = '40001';
      END IF;
      next_version := coalesce(previous.version, 0) + 1;
      IF item->>'operation' = 'delete' THEN
        DELETE FROM public.workspace_records WHERE collection = item->>'collection' AND id = item->>'id';
        next_version := 0;
      ELSIF present THEN
        UPDATE public.workspace_records SET data = item->'data', version = next_version,
          last_mutation_id = item->>'mutationId', updated_at = now()
          WHERE collection = item->>'collection' AND id = item->>'id';
      ELSE
        INSERT INTO public.workspace_records(collection,id,data,created_by,version,last_mutation_id)
          VALUES(item->>'collection',item->>'id',item->'data',item->>'createdBy',next_version,item->>'mutationId');
      END IF;
    END IF;
    result := result || jsonb_build_array(jsonb_build_object('collection',item->>'collection','id',item->>'id','version',next_version));
  END LOOP;
  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.commit_workspace_mutations(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_workspace_mutations(jsonb) TO service_role;
