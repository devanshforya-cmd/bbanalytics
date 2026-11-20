-- Records still holding photos as image data (taken with no signal), for the hourly job that
-- moves them into Google Drive. Only the server's service role can call it.
create or replace function public.records_with_inline_files(max_rows integer default 40)
returns table (collection text, id text, data jsonb, version integer, created_by text)
language sql
stable
security invoker
set search_path = public
as $$
  select r.collection, r.id, r.data, r.version, r.created_by::text
  from public.workspace_records r
  where r.collection in ('beatItems','visits','secondaryOrders','facingAudits','shelfPhotos','cheques','documents','dispatches','callLogs','returns','feedbackEntries','orders')
    and (r.data::text like '%"data:image/%' or r.data::text like '%"data:application/pdf%')
    and coalesce(r.updated_at, now()) < now() - interval '10 minutes'
  order by r.updated_at nulls first
  limit greatest(1, least(max_rows, 200));
$$;

revoke all on function public.records_with_inline_files(integer) from public, anon, authenticated;
grant execute on function public.records_with_inline_files(integer) to service_role;
