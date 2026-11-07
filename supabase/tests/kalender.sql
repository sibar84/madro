-- Tester husstandens kalenderlink.
-- Kør mod en database med migrationerne: psql -v ON_ERROR_STOP=1 -f supabase/tests/kalender.sql
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

-- Anna (voksen) gemmer og ændrer linket.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.calendar_links (household_id, url) values ((select v::uuid from t where k = 'household'), 'https://kalender.eksempel.dk/hemmelig.ics');
select pg_temp.expect((select count(*) from public.calendar_links) = 1, 'en voksen kan gemme et kalenderlink');
select pg_temp.expect((select created_by from public.calendar_links) = '00000000-0000-0000-0000-00000000000a', 'oprettelsen sættes af databasen');
update public.calendar_links set url = 'https://kalender.eksempel.dk/ny.ics';
select pg_temp.expect((select url from public.calendar_links) = 'https://kalender.eksempel.dk/ny.ics', 'linket kan ændres');
select pg_temp.expect(
  pg_temp.error_of(format($q$update public.calendar_links set household_id = %L$q$, (select v from t where k = 'carl_household'))) is not null,
  'linket kan ikke flyttes til en anden husstand');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.calendar_links (household_id, url) values (%L, 'http://usikker.dk/a.ics')$q$, (select v from t where k = 'carl_household'))) is not null,
  'et link skal være https og kun for ens egen husstand');

-- Bo er teenager: ser ikke linket og kan ikke ændre det.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.calendar_links) = 0, 'en teenager kan ikke se linket');
select pg_temp.expect(
  pg_temp.error_of(format($q$delete from public.calendar_links where household_id = %L$q$, (select v from t where k = 'household'))) is null, 'en teenagers sletning giver ingen fejl, men rammer intet');

-- Carl i en anden husstand ser ingenting.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.calendar_links) = 0, 'andre husstande kan ikke se linket');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.calendar_links (household_id, url) values (%L, 'https://x.dk/y.ics')$q$, (select v from t where k = 'household'))) is not null,
  'man kan ikke gemme et link i en husstand, man ikke er medlem af');

-- Anna kan fjerne linket, og Bos sletning gjorde intet.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.calendar_links) = 1, 'linket er der stadig efter en teenagers sletning');
delete from public.calendar_links;
select pg_temp.expect((select count(*) from public.calendar_links) = 0, 'en voksen kan fjerne linket');

reset role;
set local role anon;
select pg_temp.expect(pg_temp.error_of($q$select * from public.calendar_links$q$) is not null, 'uden login er der ingen adgang');

rollback;
