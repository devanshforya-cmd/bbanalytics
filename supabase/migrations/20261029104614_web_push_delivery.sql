create table public.push_subscriptions (
  id text primary key check (length(id) = 64),
  user_id text not null references public.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
create table public.push_deliveries (
  notification_id text not null,
  subscription_id text not null references public.push_subscriptions(id) on delete cascade,
  state text not null check (state in ('sending','sent','failed')),
  updated_at timestamptz not null default now(),
  primary key (notification_id,subscription_id)
);
create index push_deliveries_retry_idx on public.push_deliveries(state,updated_at);
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_subscriptions, public.push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.push_deliveries to service_role;
