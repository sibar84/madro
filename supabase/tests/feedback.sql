-- Tester fejl og forslag fra appen.
-- Kør mod en database med migrationerne: psql -v ON_ERROR_STOP=1 -f supabase/tests/feedback.sql
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
  ('00000000-0000-0000-0000-00000000000b', 'bo@test.dk');

set local role authenticated;
create temp table t (k text primary key, v text) on commit drop;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into t values ('household', public.create_household('Familien Test', 'Anna')::text);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t values ('bo_household', public.create_household('Bos hus', 'Bo')::text);

-- Anna skriver to beskeder, den ene med husstand.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.feedback (household_id, message, platform)
  values ((select v::uuid from t where k = 'household'), 'Knappen er for lille', 'web');
insert into public.feedback (message) values ('Jeg savner en dark mode');
select pg_temp.expect((select count(*) from public.feedback) = 2, 'man kan skrive og læse sine egne beskeder');
select pg_temp.expect((select user_id from public.feedback limit 1) = '00000000-0000-0000-0000-00000000000a', 'afsenderen sættes af databasen');

-- Bo ser ikke Annas beskeder.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.feedback) = 0, 'andre kan ikke læse beskederne');

-- Man kan ikke skrive på en andens husstand, udgive sig for en anden eller rette og slette.
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.feedback (household_id, message) values (%L, 'x')$q$, (select v from t where k = 'household'))) is not null,
  'man kan ikke skrive på en husstand, man ikke er medlem af');
select pg_temp.expect(
  pg_temp.error_of($q$insert into public.feedback (user_id, message) values ('00000000-0000-0000-0000-00000000000a', 'x')$q$) is not null,
  'man kan ikke skrive i en andens navn');
select pg_temp.expect(pg_temp.error_of($q$update public.feedback set message = 'ændret'$q$) is not null, 'beskeder kan ikke rettes');
select pg_temp.expect(pg_temp.error_of($q$delete from public.feedback$q$) is not null, 'beskeder kan ikke slettes');

-- Tomme og for lange beskeder afvises.
select pg_temp.expect(pg_temp.error_of($q$insert into public.feedback (message) values ('   ')$q$) is not null, 'en tom besked afvises');
select pg_temp.expect(pg_temp.error_of($q$insert into public.feedback (message) values (repeat('a', 2001))$q$) is not null, 'en for lang besked afvises');

-- Uden login er der ingen adgang.
reset role;
set local role anon;
select pg_temp.expect(pg_temp.error_of($q$select * from public.feedback$q$) is not null, 'uden login er der ingen adgang');

rollback;
