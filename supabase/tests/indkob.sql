-- Tester indkøbslisten og de faste varer.
-- Kør mod en database med migrationerne: psql -v ON_ERROR_STOP=1 -f supabase/tests/indkob.sql
-- Alt sker i én transaktion, som rulles tilbage til sidst.

begin;

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.expect(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FEJL: %', p_what; end if;
  raise notice 'ok: %', p_what;
end $$;

create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@test.dk'),
  ('00000000-0000-0000-0000-00000000000b', 'bo@test.dk'),
  ('00000000-0000-0000-0000-00000000000c', 'carl@test.dk');

set local role authenticated;
create temp table t (k text primary key, v text) on commit drop;

-- Carl har sin egen husstand. Anna har en husstand, hvor Bo er ung.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into t values ('carl_household', public.create_household('Carls hus', 'Carl')::text);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into t values ('household', public.create_household('Familien Test', 'Anna')::text);
insert into t values ('invite', public.create_invitation((select v::uuid from t where k = 'household'), 'teen'));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.accept_invitation((select v from t where k = 'invite'), 'Bo');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

-- Listen laves ud fra planen og de faste varer.
select public.sync_shopping_list((select v::uuid from t where k = 'household'), '2026-10-26', '[
  {"name": "Ris", "category": "kolonial", "source": "plan", "note": "mandag"},
  {"name": "ris ", "category": "kolonial", "source": "plan", "note": "dublet"},
  {"name": "Kyllingelår", "category": "koed_fisk", "source": "plan", "note": "tirsdag"},
  {"name": "Broccoli", "category": "frugt_groent", "source": "plan", "note": "tirsdag"},
  {"name": "Letmælk", "category": "mejeri", "source": "staple", "note": ""},
  {"name": "Smuglet", "category": "andet", "source": "manual", "note": ""}
]');
select pg_temp.expect((select count(*) from public.shopping_items) = 4, 'listen har planens og de faste varer én gang hver');

-- Afkrydsning gemmer hvem.
update public.shopping_items set checked_at = now() where key = 'kyllingelår';
select pg_temp.expect(
  (select checked_by from public.shopping_items where key = 'kyllingelår') = auth.uid(), 'afkrydsning gemmer hvem');

-- Bo er ung og kan bruge listen.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.shopping_items set removed_at = now() where key = 'broccoli';
insert into public.shopping_items (household_id, week_start, name, category)
  values ((select v::uuid from t where k = 'household'), '2026-10-26', 'Bananer', 'frugt_groent');
select pg_temp.expect((select count(*) from public.shopping_items where removed_at is null) = 4, 'en ung kan fjerne og tilføje varer');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.staples (household_id, name) values (%L, 'Kaffe')$q$,
    (select v from t where k = 'household'))) like '%row-level security%',
  'en ung kan ikke ændre de faste varer');
select pg_temp.expect(
  pg_temp.error_of('delete from public.shopping_items') like '%permission denied%', 'varer slettes ikke direkte');

-- Når planen ændres, går ikke-afkrydsede varer fra den gamle plan væk.
-- Krydsede, fjernede og egne varer bliver.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.sync_shopping_list((select v::uuid from t where k = 'household'), '2026-10-26', '[
  {"name": "Pasta", "category": "kolonial", "source": "plan", "note": "onsdag"},
  {"name": "Letmælk", "category": "mejeri", "source": "staple", "note": "hver uge"}
]');
select pg_temp.expect(
  (select array_agg(key order by key) from public.shopping_items) = '{bananer,broccoli,kyllingelår,letmælk,pasta}',
  'gamle planvarer fjernes, krydsede, fjernede og egne bliver');
select pg_temp.expect(
  (select note from public.shopping_items where key = 'letmælk') = 'hver uge', 'noten opdateres');

-- En fjernet vare kommer ikke igen, når listen laves på ny.
select public.sync_shopping_list((select v::uuid from t where k = 'household'), '2026-10-26', '[
  {"name": "Broccoli", "category": "frugt_groent", "source": "plan", "note": "torsdag"}
]');
select pg_temp.expect(
  (select removed_at is not null from public.shopping_items where key = 'broccoli'), 'en fjernet vare kommer ikke igen');

select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.shopping_items (household_id, week_start, name, category) values (%L, '2026-10-26', 'X', 'slik')$q$,
    (select v from t where k = 'household'))) like '%violates check constraint%',
  'ukendt kategori afvises');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.shopping_items (household_id, week_start, name) values (%L, '2026-10-27', 'X')$q$,
    (select v from t where k = 'household'))) like '%violates check constraint%',
  'en liste starter altid en mandag');

-- Faste varer.
insert into public.staples (household_id, name, category) values ((select v::uuid from t where k = 'household'), 'Rugbrød', 'broed');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.staples (household_id, name) values (%L, ' rugbrød')$q$,
    (select v from t where k = 'household'))) like '%duplicate key%',
  'en fast vare findes kun én gang');

-- Carl ser intet hos Anna og kan ikke ændre hendes liste.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.shopping_items) = 0, 'en anden husstand ser ikke listen');
select pg_temp.expect((select count(*) from public.staples) = 0, 'en anden husstand ser ikke de faste varer');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.sync_shopping_list(%L, '2026-10-26', '[]')$q$,
    (select v from t where k = 'household'))) = 'not_allowed',
  'man kan ikke lave listen for en anden husstand');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.shopping_items (household_id, week_start, name) values (%L, '2026-10-26', 'X')$q$,
    (select v from t where k = 'household'))) like '%row-level security%',
  'man kan ikke tilføje til en anden husstands liste');
update public.shopping_items set checked_at = now();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(
  (select count(*) from public.shopping_items where key = 'bananer' and checked_at is null) = 1,
  'man kan ikke krydse af på en anden husstands liste');

-- Anonyme får intet.
set local role anon;
select pg_temp.expect(
  pg_temp.error_of('select count(*) from public.shopping_items') like '%permission denied%', 'anonym ser ingen liste');

rollback;
