-- Tester opskrifter gemt til en ret.
-- Kør mod en database med migrationerne: psql -v ON_ERROR_STOP=1 -f supabase/tests/opskrifter.sql
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

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into t values ('carl_household', public.create_household('Carls hus', 'Carl')::text);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into t values ('household', public.create_household('Familien Test', 'Anna')::text);
insert into t values ('invite', public.create_invitation((select v::uuid from t where k = 'household'), 'teen'));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.accept_invitation((select v from t where k = 'invite'), 'Bo');

reset role;
insert into public.dishes (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'Boller i karry');
set local role authenticated;

-- Anna gemmer en opskrift til retten.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.recipes (household_id, dish_id, title, source_url, servings, ingredients, steps)
  values ((select v::uuid from t where k = 'household'), '00000000-0000-0000-0000-0000000000d1', 'Boller i karry',
          'https://eksempel.dk/boller', 4, '["500 g hakket svinekød", "2 dl fløde"]',
          '[{"text": "Rør farsen.", "timer_seconds": null}, {"text": "Kog i 20 minutter.", "timer_seconds": 1200}]');
select pg_temp.expect((select count(*) from public.recipes) = 1, 'en opskrift kan gemmes');
select pg_temp.expect((select created_by from public.recipes) = '00000000-0000-0000-0000-00000000000a', 'oprettelsen sættes af databasen');

-- Bo i samme husstand kan læse den, men ikke gemme en til samme ret to gange.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.recipes) = 1, 'husstandens medlemmer kan læse opskriften');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.recipes (household_id, dish_id, title, ingredients, steps) values (%L, '00000000-0000-0000-0000-0000000000d1', 'Dublet', '["x"]', '[{"text":"y"}]')$q$, (select v from t where k = 'household'))) is not null,
  'en ret har højst én opskrift pr. husstand');

-- Carl i en anden husstand ser ingenting og kan ikke skrive til Annas husstand.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.recipes) = 0, 'andre husstande kan ikke læse opskriften');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.recipes (household_id, title, ingredients, steps) values (%L, 'Snyd', '["x"]', '[{"text":"y"}]')$q$, (select v from t where k = 'household'))) is not null,
  'man kan ikke gemme i en husstand, man ikke er medlem af');
select pg_temp.expect(pg_temp.error_of($q$delete from public.recipes$q$) is null and (select count(*) from public.recipes) = 0, 'andre husstande kan ikke slette (ingen rækker berørt)');

-- Dårligt indhold afvises.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(pg_temp.error_of(format($q$insert into public.recipes (household_id, title, ingredients, steps) values (%L, 'Uden trin', '["x"]', '[]')$q$, (select v from t where k = 'household'))) is not null, 'en opskrift uden trin afvises');
select pg_temp.expect(pg_temp.error_of(format($q$insert into public.recipes (household_id, title, ingredients, steps) values (%L, 'Uden varer', '[]', '[{"text":"y"}]')$q$, (select v from t where k = 'household'))) is not null, 'en opskrift uden ingredienser afvises');
select pg_temp.expect(pg_temp.error_of(format($q$insert into public.recipes (household_id, title, ingredients, steps) values (%L, 'Forkert form', '"tekst"', '[{"text":"y"}]')$q$, (select v from t where k = 'household'))) is not null, 'ingredienser skal være en liste');
select pg_temp.expect(pg_temp.error_of(format($q$insert into public.recipes (household_id, title, source_url, ingredients, steps) values (%L, 'Http', 'http://eksempel.dk', '["x"]', '[{"text":"y"}]')$q$, (select v from t where k = 'household'))) is not null, 'kun https-links gemmes');
select pg_temp.expect(pg_temp.error_of($q$update public.recipes set title = 'ændret'$q$) is not null, 'opskrifter kan ikke rettes, kun erstattes');

-- Den, der gemte den, og voksne kan slette den; en teenager, der ikke gemte den, kan ikke.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect(pg_temp.error_of($q$delete from public.recipes$q$) is null and (select count(*) from public.recipes) = 1, 'en teenager kan ikke slette andres opskrift');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.recipes;
select pg_temp.expect((select count(*) from public.recipes) = 0, 'den, der gemte den, kan slette den');

reset role;
set local role anon;
select pg_temp.expect(pg_temp.error_of($q$select * from public.recipes$q$) is not null, 'uden login er der ingen adgang');

rollback;
