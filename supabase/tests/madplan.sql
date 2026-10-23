-- Tester retter, hensyn og ugeplaner.
-- Kør mod en database med migrationerne: psql -v ON_ERROR_STOP=1 -f supabase/tests/madplan.sql
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
  ('00000000-0000-0000-0000-00000000000c', 'carl@test.dk');

set local role authenticated;
create temp table t (k text primary key, v text) on commit drop;

-- Anna og Carl har hver sin husstand.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into t values ('carl_household', public.create_household('Carls hus', 'Carl')::text);
insert into t values ('carl_person', (select id::text from public.persons));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into t values ('household', public.create_household('Familien Test', 'Anna')::text);

select pg_temp.expect((select count(*) from public.dishes where household_id is null) = 117, 'startkataloget kan ses');

-- Hensyn pr. person.
insert into public.persons (household_id, display_name, birth_year, allergies, away_days)
  values ((select v::uuid from t where k = 'household'), 'Ida', 2021, '{jordnoedder}', '{1,2}');
update public.persons set dislikes = '{laks}' where user_id = auth.uid();
select pg_temp.expect(
  (select dislikes from public.persons where user_id = auth.uid()) = '{laks}', 'man kan gemme hvad man ikke kan lide');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.persons (household_id, display_name, allergies) values (%L, 'X', '{kiwi}')$q$,
    (select v from t where k = 'household'))) like '%violates check constraint%',
  'ukendt allergen afvises');
select pg_temp.expect(
  pg_temp.error_of($q$update public.persons set away_days = '{8}' where user_id = auth.uid()$q$) like '%violates check constraint%',
  'ugedag uden for 1-7 afvises');

-- Egne retter.
insert into public.dishes (household_id, name) values ((select v::uuid from t where k = 'household'), 'Mormors suppe')
  returning id::text as own_dish \gset
select pg_temp.expect(
  pg_temp.error_of($q$insert into public.dishes (name) values ('Snyderet')$q$) like '%row-level security%',
  'man kan ikke skrive i startkataloget');
update public.dishes set name = 'Ændret' where household_id is null;
select pg_temp.expect((select count(*) from public.dishes where name = 'Ændret') = 0, 'startkataloget kan ikke rettes');
select pg_temp.expect(
  pg_temp.error_of(format($q$update public.dishes set household_id = null where id = %L$q$, :'own_dish')) like '%permission denied%',
  'en egen ret kan ikke flyttes ind i kataloget');

-- Ugeplan.
select public.save_week_plan(
  (select v::uuid from t where k = 'household'), '2026-10-26', '{2,4}',
  jsonb_build_array(
    jsonb_build_object('day', '2026-10-26', 'dish_id', :'own_dish', 'reasons', array['hurtig_travl'],
      'eaters', (select array_agg(id) from public.persons where household_id = (select v::uuid from t where k = 'household'))),
    jsonb_build_object('day', '2026-10-27', 'dish_id', (select id from public.dishes where name = 'Fiskefingre'))
  ));
select pg_temp.expect((select count(*) from public.plan_days) = 2, 'ugeplanen gemmes');
select pg_temp.expect((select busy_days from public.week_plans) = '{2,4}', 'travle dage gemmes');

select public.save_week_plan(
  (select v::uuid from t where k = 'household'), '2026-10-26', '{}',
  jsonb_build_array(jsonb_build_object('day', '2026-10-28', 'dish_id', (select id from public.dishes where name = 'Fiskefingre'))));
select pg_temp.expect(
  (select count(*) from public.plan_days) = 1 and (select count(*) from public.week_plans) = 1, 'en ny plan for ugen erstatter den gamle');

select pg_temp.expect(
  pg_temp.error_of(format($q$select public.save_week_plan(%L, '2026-10-26', '{}', '[{"day": "2026-11-02", "dish_id": %s}]')$q$,
    (select v from t where k = 'household'), to_json(:'own_dish'::text))) = 'invalid_plan',
  'en dag uden for ugen afvises');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.save_week_plan(%L, '2026-10-26', '{}', '[{"day": "2026-10-26", "dish_id": %s, "eaters": [%s]}]')$q$,
    (select v from t where k = 'household'), to_json(:'own_dish'::text), to_json((select v from t where k = 'carl_person')))) = 'invalid_plan',
  'en person fra en anden husstand afvises');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.save_week_plan(%L, '2026-10-27', '{}', '[]')$q$,
    (select v from t where k = 'household'))) like '%violates check constraint%',
  'en uge starter om mandagen');
select pg_temp.expect(
  pg_temp.error_of(format($q$delete from public.plan_days where household_id = %L$q$, (select v from t where k = 'household'))) like '%permission denied%',
  'plandage ændres kun via funktionen');

-- Carl ser hverken Annas ret eller plan og kan ikke bruge dem.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.dishes where household_id is not null) = 0, 'egne retter er private');
select pg_temp.expect((select count(*) from public.week_plans) = 0, 'andres planer er skjulte');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.save_week_plan(%L, '2026-10-26', '{}', '[]')$q$,
    (select v from t where k = 'household'))) = 'not_allowed',
  'man kan ikke gemme en plan for en anden husstand');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.save_week_plan(%L, '2026-10-26', '{}', '[{"day": "2026-10-26", "dish_id": %s}]')$q$,
    (select v from t where k = 'carl_household'), to_json(:'own_dish'::text))) = 'invalid_plan',
  'man kan ikke bruge en anden husstands ret');

-- Anonyme får intet.
set local role anon;
select pg_temp.expect(
  pg_temp.error_of('select count(*) from public.dishes') like '%permission denied%', 'anonym ser ingen retter');

rollback;
