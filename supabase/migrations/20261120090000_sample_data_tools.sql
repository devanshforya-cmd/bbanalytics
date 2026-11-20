-- Test data for the staging period: count it and remove it in one transaction.
-- Test records carry data.isSample = true; test staff ids start with user_sample_.

create or replace function public.sample_record_counts()
returns table(collection text, count bigint)
language sql security definer set search_path = public as $$
  select w.collection, count(*) from public.workspace_records w
  where w.data->>'isSample' = 'true' group by w.collection order by w.collection;
$$;

create or replace function public.remove_sample_records()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  removed_records bigint;
  removed_staff bigint;
begin
  delete from public.workspace_records where data->>'isSample' = 'true';
  get diagnostics removed_records = row_count;
  delete from public.users where id like 'user\_sample\_%';
  get diagnostics removed_staff = row_count;
  return jsonb_build_object('records', removed_records, 'staff', removed_staff);
end;
$$;

revoke all on function public.sample_record_counts() from public, anon, authenticated;
revoke all on function public.remove_sample_records() from public, anon, authenticated;
grant execute on function public.sample_record_counts() to service_role;
grant execute on function public.remove_sample_records() to service_role;
