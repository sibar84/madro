-- Tester lageret.
-- Kør mod en database med migrationerne: psql -v ON_ERROR_STOP=1 -f supabase/tests/lager.sql
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

-- Anna lægger varer i lageret.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.pantry_items (household_id, name, place, expires_on)
  values ((select v::uuid from t where k = 'household'), 'Hakket oksekød', 'koleskab', current_date + 2),
         ((select v::uuid from t where k = 'household'), 'Ærter', 'fryser', null);
select pg_temp.expect((select count(*) from public.pantry_items) = 2, 'en voksen kan lægge varer i lageret');
select pg_temp.expect((select bool_and(created_by = '00000000-0000-0000-0000-00000000000a') from public.pantry_items), 'oprettelsen sættes af databasen');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.pantry_items (household_id, name, place) values (%L, 'Mælk', 'bilen')$q$, (select v from t where k = 'household'))) is not null,
  'stedet skal være køleskab, fryser eller skab');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.pantry_items (household_id, name) values (%L, '   ')$q$, (select v from t where k = 'household'))) is not null,
  'en vare skal have et navn');

-- Bo er teenager og må både se, rette og tage varer ud.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.pantry_items) = 2, 'en teenager kan se lageret');
update public.pantry_items set expires_on = current_date + 5 where name = 'Ærter';
select pg_temp.expect((select expires_on from public.pantry_items where name = 'Ærter') = current_date + 5, 'en teenager kan rette en dato');
select pg_temp.expect(
  pg_temp.error_of(format($q$update public.pantry_items set household_id = %L$q$, (select v from t where k = 'carl_household'))) is not null,
  'en vare kan ikke flyttes til en anden husstand');
delete from public.pantry_items where name = 'Ærter';
select pg_temp.expect((select count(*) from public.pantry_items) = 1, 'en teenager kan tage en vare ud');

-- Carl i en anden husstand ser og rører ingenting.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.pantry_items) = 0, 'andre husstande kan ikke se lageret');
delete from public.pantry_items;
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.pantry_items (household_id, name) values (%L, 'Snyd')$q$, (select v from t where k = 'household'))) is not null,
  'man kan ikke lægge varer i en husstand, man ikke er medlem af');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.pantry_items) = 1, 'andres sletning rammer ikke lageret');

reset role;
set local role anon;
select pg_temp.expect(pg_temp.error_of($q$select * from public.pantry_items$q$) is not null, 'uden login er der ingen adgang');

rollback;
