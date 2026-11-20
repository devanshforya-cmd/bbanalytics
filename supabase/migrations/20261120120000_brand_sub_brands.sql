-- Sub-brands inside a brand (Pee Safe → FURR, Comfort, Domina), for reporting splits.
alter table public.brands add column if not exists sub_brands jsonb not null default '[]'::jsonb;
