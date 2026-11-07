-- Husstandens kalenderlink (iCal), som bruges til at finde de travle aftener.
-- Linket er en hemmelig adresse: den, der kender den, kan læse kalenderen. Derfor kan
-- kun voksne i husstanden se og ændre den. Funktionen read-calendar læser linket med
-- servicenøglen og giver kun ugens travle dage tilbage til appen.

create table public.calendar_links (
  household_id uuid primary key references public.households (id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 2000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.calendar_links enable row level security;

create policy calendar_links_select on public.calendar_links
  for select to authenticated using (public.has_role(household_id, '{owner,adult}'));
create policy calendar_links_insert on public.calendar_links
  for insert to authenticated
  with check (public.has_role(household_id, '{owner,adult}') and created_by = auth.uid());
create policy calendar_links_update on public.calendar_links
  for update to authenticated
  using (public.has_role(household_id, '{owner,adult}'))
  with check (public.has_role(household_id, '{owner,adult}'));
create policy calendar_links_delete on public.calendar_links
  for delete to authenticated using (public.has_role(household_id, '{owner,adult}'));

revoke all on public.calendar_links from anon, authenticated;
grant select, delete on public.calendar_links to authenticated;
grant insert (household_id, url) on public.calendar_links to authenticated;
grant update (url) on public.calendar_links to authenticated;
