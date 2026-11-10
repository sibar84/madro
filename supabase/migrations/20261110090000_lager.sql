-- Lageret: hvad der er i køleskab, fryser og skab, og hvornår det skal bruges.
-- Alle i husstanden kan lægge varer i lageret og tage dem ud igen, også unge.
-- En vare, der er brugt op, slettes. Lageret er en huskeliste, ikke et regnskab.

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  place text not null default 'koleskab' check (place in ('koleskab', 'fryser', 'skab')),
  -- Sidste dag, varen skal bruges. Tom, hvis den ikke har en dato.
  expires_on date,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create index pantry_items_household_idx on public.pantry_items (household_id, expires_on);

alter table public.pantry_items enable row level security;

create policy pantry_items_select on public.pantry_items
  for select to authenticated using (public.is_member(household_id));
create policy pantry_items_insert on public.pantry_items
  for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy pantry_items_update on public.pantry_items
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy pantry_items_delete on public.pantry_items
  for delete to authenticated using (public.is_member(household_id));

revoke all on public.pantry_items from anon, authenticated;
grant select, delete on public.pantry_items to authenticated;
grant insert (household_id, name, place, expires_on) on public.pantry_items to authenticated;
grant update (name, place, expires_on) on public.pantry_items to authenticated;
