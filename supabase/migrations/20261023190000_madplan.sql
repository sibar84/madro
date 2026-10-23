-- Fase 1: hensyn pr. person, retter og ugeplaner.
--
-- Selve planen laves af regelmotoren i appen (apps/madro/src/planner). Databasen
-- gemmer resultatet og kontrollerer, at det kun bruger retter og personer, som
-- husstanden har adgang til.

-- Hensyn pr. person ---------------------------------------------------------

-- Allergenerne er de 14 EU-allergener, som en familie typisk tænker i.
create domain public.allergen as text check (value in (
  'gluten', 'skaldyr', 'aeg', 'fisk', 'jordnoedder', 'soja', 'maelk',
  'noedder', 'selleri', 'sennep', 'sesam', 'sulfit', 'lupin', 'bloeddyr'
));

alter table public.persons
  add column allergies public.allergen[] not null default '{}',
  -- Ord som "laks" eller "svin". Matcher rettens proteiner og ingredienser.
  add column dislikes text[] not null default '{}'
    check (cardinality(dislikes) <= 30),
  -- Ugedage (1 = mandag) hvor personen ikke spiser med, fx ved samvær.
  add column away_days smallint[] not null default '{}'
    check (away_days <@ '{1,2,3,4,5,6,7}');

grant update (allergies, dislikes, away_days) on public.persons to authenticated;
-- Et barn tilføjes med sine hensyn i samme omgang.
revoke insert on public.persons from authenticated;
grant insert (household_id, display_name, birth_year, allergies, dislikes, away_days)
  on public.persons to authenticated;

-- Retter --------------------------------------------------------------------

create type public.dish_effort as enum ('hurtig', 'mellem', 'lang');
create type public.kid_friendly as enum ('ja', 'delvist');

-- En ret uden husstand hører til startkataloget og kan ses af alle brugere.
create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  main_protein text not null default '',
  protein_tags text[] not null default '{}',
  vegetables text not null default '',
  ingredients text[] not null default '{}',
  -- Udledt af ingredienslisten. Appen viser altid, at opskriften skal tjekkes.
  allergens public.allergen[] not null default '{}',
  kid_friendly public.kid_friendly not null default 'ja',
  kid_favorite boolean not null default false,
  double_portion boolean not null default false,
  effort public.dish_effort not null default 'mellem',
  months smallint[] not null default '{1,2,3,4,5,6,7,8,9,10,11,12}'
    check (months <@ '{1,2,3,4,5,6,7,8,9,10,11,12}' and cardinality(months) > 0),
  recipe_url text check (recipe_url ~ '^https://'),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index dishes_household_id_idx on public.dishes (household_id);

alter table public.dishes enable row level security;

create policy dishes_select on public.dishes
  for select to authenticated
  using (household_id is null or public.is_member(household_id));
create policy dishes_insert on public.dishes
  for insert to authenticated
  with check (household_id is not null and public.has_role(household_id, '{owner,adult}'));
create policy dishes_update on public.dishes
  for update to authenticated
  using (household_id is not null and public.has_role(household_id, '{owner,adult}'))
  with check (household_id is not null and public.has_role(household_id, '{owner,adult}'));
create policy dishes_delete on public.dishes
  for delete to authenticated
  using (household_id is not null and public.has_role(household_id, '{owner,adult}'));

revoke all on public.dishes from anon;
-- En ret kan ikke flyttes til en anden husstand eller ind i startkataloget.
revoke update on public.dishes from authenticated;
grant update (name, main_protein, protein_tags, vegetables, ingredients, allergens, kid_friendly,
  kid_favorite, double_portion, effort, months, recipe_url, note) on public.dishes to authenticated;

-- Ugeplaner -----------------------------------------------------------------

create table public.week_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  busy_days smallint[] not null default '{}' check (busy_days <@ '{1,2,3,4,5,6,7}'),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

-- Én aftensmad pr. dag. reasons er koder fra regelmotoren, som appen oversætter.
create table public.plan_days (
  plan_id uuid not null references public.week_plans (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  dish_id uuid not null references public.dishes (id) on delete cascade,
  reasons text[] not null default '{}',
  eaters uuid[] not null default '{}',
  primary key (plan_id, day)
);

create index plan_days_household_day_idx on public.plan_days (household_id, day);
create index plan_days_dish_id_idx on public.plan_days (dish_id);

alter table public.week_plans enable row level security;
alter table public.plan_days enable row level security;

create policy week_plans_select on public.week_plans
  for select to authenticated using (public.is_member(household_id));
create policy plan_days_select on public.plan_days
  for select to authenticated using (public.is_member(household_id));

-- Planer gemmes kun via save_week_plan, så kontrollerne ligger ét sted.
revoke all on public.week_plans, public.plan_days from anon;
revoke insert, update, delete on public.week_plans, public.plan_days from authenticated;

-- Gemmer en hel uge og erstatter den tidligere plan for ugen.
-- p_days: [{ "day": "2026-10-26", "dish_id": "...", "reasons": ["..."], "eaters": ["..."] }]
create function public.save_week_plan(
  p_household uuid,
  p_week_start date,
  p_busy_days smallint[],
  p_days jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  if not public.has_role(p_household, '{owner,adult}') then
    raise exception 'not_allowed';
  end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 7 then
    raise exception 'invalid_plan';
  end if;

  insert into public.week_plans (household_id, week_start, busy_days, created_by)
    values (p_household, p_week_start, coalesce(p_busy_days, '{}'), auth.uid())
    on conflict (household_id, week_start)
    do update set busy_days = excluded.busy_days, updated_at = now()
    returning id into v_plan;

  delete from public.plan_days where plan_id = v_plan;

  insert into public.plan_days (plan_id, household_id, day, dish_id, reasons, eaters)
  select v_plan, p_household, d.day, d.dish_id, coalesce(d.reasons, '{}'), coalesce(d.eaters, '{}')
  from jsonb_to_recordset(p_days) as d(day date, dish_id uuid, reasons text[], eaters uuid[]);

  -- Dagene skal ligge i ugen, retterne skal være synlige for husstanden,
  -- og dem der spiser med, skal høre til husstanden.
  if exists (
    select 1 from public.plan_days pd
    left join public.dishes d on d.id = pd.dish_id
    where pd.plan_id = v_plan
      and (pd.day not between p_week_start and p_week_start + 6
           or d.id is null
           or (d.household_id is not null and d.household_id <> p_household)
           or exists (
             select 1 from unnest(pd.eaters) e
             where not exists (select 1 from public.persons p where p.id = e and p.household_id = p_household)
           ))
  ) then
    raise exception 'invalid_plan';
  end if;

  return v_plan;
end;
$$;

revoke execute on function public.save_week_plan(uuid, date, smallint[], jsonb) from public, anon;
grant execute on function public.save_week_plan(uuid, date, smallint[], jsonb) to authenticated;
