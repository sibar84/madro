-- Fase 2: indkøbslisten og faste varer.
--
-- Listen laves i appen ud fra ugens plan og de faste varer (apps/madro/src/shopping)
-- og gemmes med sync_shopping_list. Alle i husstanden kan krydse af, tilføje og
-- fjerne varer, også unge. Ændringer sendes live til de andre telefoner.

-- Butikkens gange i den rækkefølge, de fleste danske butikker har dem.
create domain public.shop_category as text check (value in (
  'frugt_groent', 'broed', 'koed_fisk', 'mejeri', 'kolonial', 'frost', 'drikke', 'husholdning', 'andet'
));

-- Faste varer ----------------------------------------------------------------

create table public.staples (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category public.shop_category not null default 'andet',
  created_at timestamptz not null default now()
);

create unique index staples_household_name_idx on public.staples (household_id, lower(btrim(name)));

alter table public.staples enable row level security;

create policy staples_select on public.staples
  for select to authenticated using (public.is_member(household_id));
create policy staples_insert on public.staples
  for insert to authenticated with check (public.has_role(household_id, '{owner,adult}'));
create policy staples_update on public.staples
  for update to authenticated
  using (public.has_role(household_id, '{owner,adult}'))
  with check (public.has_role(household_id, '{owner,adult}'));
create policy staples_delete on public.staples
  for delete to authenticated using (public.has_role(household_id, '{owner,adult}'));

revoke all on public.staples from anon;
revoke update on public.staples from authenticated;
grant update (name, category) on public.staples to authenticated;

-- Indkøbslisten ---------------------------------------------------------------

-- Én liste pr. husstand og uge. source siger, hvor varen kommer fra:
-- plan (en ret i ugens plan), staple (en fast vare) eller manual (tilføjet af jer).
-- En fjernet vare beholdes med removed_at, så den ikke kommer igen næste gang
-- listen laves ud fra planen.
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  key text generated always as (lower(btrim(name))) stored,
  category public.shop_category not null default 'andet',
  source text not null default 'manual' check (source in ('plan', 'staple', 'manual')),
  note text not null default '' check (char_length(note) <= 200),
  checked_at timestamptz,
  checked_by uuid references auth.users (id) on delete set null,
  sold_out boolean not null default false,
  -- Det oprindelige navn, når en udsolgt vare er erstattet med en anden.
  replaced_from text,
  removed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, week_start, key)
);

create index shopping_items_household_week_idx on public.shopping_items (household_id, week_start);

alter table public.shopping_items enable row level security;

create policy shopping_items_select on public.shopping_items
  for select to authenticated using (public.is_member(household_id));
create policy shopping_items_insert on public.shopping_items
  for insert to authenticated with check (public.is_member(household_id));
create policy shopping_items_update on public.shopping_items
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

revoke all on public.shopping_items from anon;
-- Varer fjernes med removed_at, så ingen sletter direkte.
revoke update, delete on public.shopping_items from authenticated;
revoke insert on public.shopping_items from authenticated;
grant insert (id, household_id, week_start, name, category, note) on public.shopping_items to authenticated;
grant update (name, category, note, checked_at, sold_out, replaced_from, removed_at)
  on public.shopping_items to authenticated;

-- Hvem der krydsede af, og hvornår varen sidst blev ændret, sættes af databasen.
create function public.shopping_items_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.checked_at is null then
    new.checked_by := null;
  elsif tg_op = 'INSERT' or old.checked_at is null then
    new.checked_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger shopping_items_touch
  before insert or update on public.shopping_items
  for each row execute function public.shopping_items_touch();

-- Lægger ugens plan og de faste varer på listen.
-- p_items: [{ "name": "Ris", "category": "kolonial", "source": "plan", "note": "mandag" }]
-- Nye varer tilføjes. En vare fra planen eller de faste varer, som ikke længere er
-- med, fjernes, hvis den ikke er krydset af. Varer, I selv har tilføjet eller
-- fjernet, røres ikke.
create function public.sync_shopping_list(p_household uuid, p_week_start date, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_household) then
    raise exception 'not_allowed';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then
    raise exception 'invalid_list';
  end if;

  with wanted as (
    select distinct on (lower(btrim(i.name)))
      btrim(i.name) as name, lower(btrim(i.name)) as key,
      coalesce(i.category, 'andet')::public.shop_category as category, i.source, coalesce(i.note, '') as note
    from jsonb_to_recordset(p_items) as i(name text, category text, source text, note text)
    where i.source in ('plan', 'staple') and char_length(btrim(coalesce(i.name, ''))) between 1 and 80
    order by lower(btrim(i.name)), i.source
  ),
  -- Opdaterer noten ("mandag og torsdag") på varer, der allerede er på listen.
  updated as (
    update public.shopping_items s
       set note = w.note, source = w.source
      from wanted w
     where s.household_id = p_household and s.week_start = p_week_start and s.key = w.key
       and s.source in ('plan', 'staple') and (s.note, s.source) is distinct from (w.note, w.source)
  ),
  -- En vare, der allerede er på listen (også fjernet eller tilføjet af jer), tilføjes ikke igen.
  inserted as (
    insert into public.shopping_items (household_id, week_start, name, category, source, note)
    select p_household, p_week_start, w.name, w.category, w.source, w.note
    from wanted w
    on conflict (household_id, week_start, key) do nothing
  )
  delete from public.shopping_items s
   where s.household_id = p_household and s.week_start = p_week_start
     and s.source in ('plan', 'staple') and s.checked_at is null and s.removed_at is null
     and not exists (select 1 from wanted w where w.key = s.key);
end;
$$;

revoke execute on function public.sync_shopping_list(uuid, date, jsonb) from public, anon;
grant execute on function public.sync_shopping_list(uuid, date, jsonb) to authenticated;

-- Andre telefoner i husstanden får ændringer med det samme. Realtime følger
-- rækkesikkerheden, så man kun får sin egen husstands varer.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end $$;
