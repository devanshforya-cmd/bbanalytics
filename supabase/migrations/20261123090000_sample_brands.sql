-- Test data can now include test brands (ids starting "sample_"); removing test data removes them too.
create or replace function public.remove_sample_records()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  removed_records bigint;
  removed_staff bigint;
  removed_brands bigint;
begin
  delete from public.workspace_records where data->>'isSample' = 'true';
  get diagnostics removed_records = row_count;
  delete from public.users where id like 'user\_sample\_%';
  get diagnostics removed_staff = row_count;
  delete from public.brands where id like 'sample\_%';
  get diagnostics removed_brands = row_count;
  return jsonb_build_object('records', removed_records, 'staff', removed_staff, 'brands', removed_brands);
end;
$$;
revoke all on function public.remove_sample_records() from public, anon, authenticated;
