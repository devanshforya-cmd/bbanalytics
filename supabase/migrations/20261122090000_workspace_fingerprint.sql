-- One short hash of everything a workspace refresh returns (records, people, brands).
-- Devices refresh every minute; when the hash has not moved, the server answers
-- "unchanged" instead of reading and sending the whole workspace again.
-- Every writer bumps a record's version (and sets last_mutation_id), so those stand in
-- for the record body; people and brands are small and are hashed whole.
create or replace function public.workspace_fingerprint()
returns text
language sql stable security definer set search_path = public as $$
  select md5(
    coalesce((select string_agg(collection || ':' || id || ':' || version || ':' || coalesce(last_mutation_id, '') || ':' || coalesce(updated_at::text, ''), ',' order by collection, id) from workspace_records), '')
    || '|' || coalesce((select string_agg(md5(u::text), ',' order by u.id) from users u), '')
    || '|' || coalesce((select string_agg(md5(b::text), ',' order by b.id) from brands b), '')
  );
$$;
revoke all on function public.workspace_fingerprint() from public, anon, authenticated;
grant execute on function public.workspace_fingerprint() to service_role;
