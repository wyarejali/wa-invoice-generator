-- Invoices table + row level security.
-- Run this once in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

create table if not exists public.invoices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  number     text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The client merges by invoice number, so make that uniqueness a hard rule
-- per user rather than a convention the client has to be trusted to keep.
create unique index if not exists invoices_user_number_key
  on public.invoices (user_id, lower(number));

create index if not exists invoices_user_updated_idx
  on public.invoices (user_id, updated_at desc);

-- Keep updated_at honest even for writes that forget to set it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at
  before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: a user can only ever see and write their own rows.
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;

drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own"
  on public.invoices for select
  using (auth.uid() = user_id);

drop policy if exists "invoices_insert_own" on public.invoices;
create policy "invoices_insert_own"
  on public.invoices for insert
  with check (auth.uid() = user_id);

drop policy if exists "invoices_update_own" on public.invoices;
create policy "invoices_update_own"
  on public.invoices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "invoices_delete_own" on public.invoices;
create policy "invoices_delete_own"
  on public.invoices for delete
  using (auth.uid() = user_id);
