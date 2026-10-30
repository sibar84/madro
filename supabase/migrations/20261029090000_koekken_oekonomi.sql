-- Fase 3: spisetid, madbudget og kvitteringer.
--
-- Kvitteringsbilleder ligger i lageret "receipts" under husstandens id. Edge-
-- funktionen read-receipt læser billedet med Claude og skriver linjerne. Linjer,
-- Claude er under 90 % sikker på, havner i en indbakke, hvor I vælger kategori.

-- Husstandens indstillinger ----------------------------------------------------

alter table public.households
  add column dinner_time time not null default '17:30',
  -- Madbudget i hele kroner pr. budgetperiode. Null betyder intet budget endnu.
  add column food_budget integer check (food_budget between 1 and 1000000),
  -- Dagen i måneden, hvor budgetperioden starter. 31 betyder sidste dag i måneden.
  add column payday smallint not null default 1 check (payday between 1 and 31);

-- Voksne kan ændre spisetid og budget. Navnet kan stadig kun ejeren ændre.
create function public.update_household_settings(
  p_household uuid,
  p_dinner_time time,
  p_food_budget integer,
  p_payday smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_household, '{owner,adult}') then
    raise exception 'not_allowed';
  end if;
  update public.households
     set dinner_time = p_dinner_time, food_budget = p_food_budget, payday = p_payday
   where id = p_household;
end;
$$;

revoke execute on function public.update_household_settings(uuid, time, integer, smallint) from public, anon;
grant execute on function public.update_household_settings(uuid, time, integer, smallint) to authenticated;

-- Kvitteringer ------------------------------------------------------------------

-- Kategorierne er butikkens gange plus "ikke_mad", som ikke tæller i madbudgettet.
create domain public.receipt_category as text check (value in (
  'frugt_groent', 'broed', 'koed_fisk', 'mejeri', 'kolonial', 'frost', 'drikke', 'husholdning', 'andet', 'ikke_mad'
));

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Stien i lageret: <husstand>/<kvittering>.jpg
  image_path text not null check (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'),
  status text not null default 'reading' check (status in ('reading', 'done', 'failed')),
  store text not null default '' check (char_length(store) <= 80),
  purchased_on date,
  total numeric(10, 2),
  error text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (split_part(image_path, '/', 1) = household_id::text)
);

create index receipts_household_idx on public.receipts (household_id, purchased_on);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  position smallint not null,
  text text not null check (char_length(text) <= 120),
  -- Rabatter er linjer med negativt beløb.
  amount numeric(10, 2) not null,
  category public.receipt_category not null default 'andet',
  -- Claude var mindst 90 % sikker på kategorien.
  certain boolean not null default true,
  -- Sat, når en i husstanden har tjekket en usikker linje.
  confirmed_at timestamptz,
  unique (receipt_id, position)
);

create index receipt_lines_receipt_idx on public.receipt_lines (receipt_id);
create index receipt_lines_inbox_idx on public.receipt_lines (household_id) where not certain and confirmed_at is null;

alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;

create policy receipts_select on public.receipts
  for select to authenticated using (public.is_member(household_id));
create policy receipts_insert on public.receipts
  for insert to authenticated with check (public.is_member(household_id));
create policy receipts_update on public.receipts
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy receipts_delete on public.receipts
  for delete to authenticated
  using (created_by = auth.uid() or public.has_role(household_id, '{owner,adult}'));

create policy receipt_lines_select on public.receipt_lines
  for select to authenticated using (public.is_member(household_id));
create policy receipt_lines_update on public.receipt_lines
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

revoke all on public.receipts, public.receipt_lines from anon;
-- Linjerne skrives kun af edge-funktionen. I kan rette kategori og butik, dato og total.
revoke insert, update on public.receipts from authenticated;
grant insert (id, household_id, image_path) on public.receipts to authenticated;
grant update (store, purchased_on, total) on public.receipts to authenticated;
revoke insert, update, delete on public.receipt_lines from authenticated;
grant update (category, confirmed_at) on public.receipt_lines to authenticated;

-- Lager til kvitteringsbilleder -----------------------------------------------------

-- Kun husstandens medlemmer kan lægge og se billeder i deres egen mappe.
-- Lageret findes ikke i den lokale testdatabase uden Supabase, så det springes over der.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('receipts', 'receipts', false, 10485760, '{image/jpeg,image/png}')
      on conflict (id) do nothing;

    execute $p$
      create policy receipts_objects_insert on storage.objects
        for insert to authenticated
        with check (bucket_id = 'receipts' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy receipts_objects_select on storage.objects
        for select to authenticated
        using (bucket_id = 'receipts' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy receipts_objects_delete on storage.objects
        for delete to authenticated
        using (bucket_id = 'receipts' and public.has_role(((storage.foldername(name))[1])::uuid, '{owner,adult}'))
    $p$;
  end if;
end $$;
