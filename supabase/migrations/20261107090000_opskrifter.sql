-- Opskrifter, hentet fra et link og gemt til en ret i husstanden.
-- Hver husstand har højst én opskrift pr. ret. Trinene kan have en tid, som
-- madlavningstilstanden bruger til en nedtælling.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  dish_id uuid references public.dishes (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  source_url text check (source_url ~ '^https://' and char_length(source_url) <= 2000),
  servings smallint check (servings between 1 and 100),
  ingredients jsonb not null
    check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) between 1 and 80),
  steps jsonb not null
    check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 60),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index recipes_household_dish_idx on public.recipes (household_id, dish_id);

alter table public.recipes enable row level security;

create policy recipes_select on public.recipes
  for select to authenticated using (public.is_member(household_id));

create policy recipes_insert on public.recipes
  for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());

create policy recipes_delete on public.recipes
  for delete to authenticated
  using (created_by = auth.uid() or public.has_role(household_id, '{owner,adult}'));

revoke all on public.recipes from anon, authenticated;
grant select, delete on public.recipes to authenticated;
grant insert (household_id, dish_id, title, source_url, servings, ingredients, steps) on public.recipes to authenticated;
