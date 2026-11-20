-- Hourly Google Drive backup, driven by the database scheduler (works on any Vercel plan).
-- A random token is made here and kept in the vault; the app stores only its SHA-256 hash.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  token text := encode(extensions.gen_random_bytes(32), 'hex');
  existing uuid;
begin
  select id into existing from vault.secrets where name = 'backup_trigger_token';
  if existing is null then
    perform vault.create_secret(token, 'backup_trigger_token', 'Bearer token the hourly Drive backup job sends to /api/cron/backup');
  else
    perform vault.update_secret(existing, token);
  end if;
  insert into public.system_settings (key, value, updated_at)
  values ('backup_trigger_v1', jsonb_build_object('sha256', encode(extensions.digest(token, 'sha256'), 'hex')), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

select cron.unschedule('hourly-drive-backup') where exists (select 1 from cron.job where jobname = 'hourly-drive-backup');
select cron.schedule('hourly-drive-backup', '7 * * * *', $job$
  select net.http_get(
    url := 'https://bbanalytics-three.vercel.app/api/cron/backup',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backup_trigger_token')),
    timeout_milliseconds := 115000
  );
$job$);
