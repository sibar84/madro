-- Tester rækkesikkerhed og husstandsfunktioner.
-- Kør mod en database med migrationerne: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
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

-- Fanger en fejl og returnerer dens besked, så en test kan kræve den rigtige fejl.
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

-- Anna opretter en husstand.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
create temp table t (k text primary key, v text) on commit drop;
insert into t values ('household', public.create_household('Familien Test', 'Anna')::text);

select pg_temp.expect((select count(*) from public.households) = 1, 'ejer ser sin husstand');
select pg_temp.expect((select role from public.memberships) = 'owner', 'opretter bliver ejer');
select pg_temp.expect((select count(*) from public.persons) = 1, 'opretter bliver første person');

-- Anna tilføjer et barn uden konto.
insert into public.persons (household_id, display_name, birth_year)
  values ((select v::uuid from t where k = 'household'), 'Lille Ida', 2019);
select pg_temp.expect((select count(*) from public.persons) = 2, 'voksen kan tilføje et barn');

-- Carl er ikke medlem og ser intet.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.households) = 0, 'fremmed ser ingen husstand');
select pg_temp.expect((select count(*) from public.persons) = 0, 'fremmed ser ingen personer');
select pg_temp.expect(
  pg_temp.error_of(format('select public.create_invitation(%L)', (select v from t where k = 'household'))) = 'not_allowed',
  'fremmed kan ikke invitere');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.persons (household_id, display_name) values (%L, 'X')$q$,
    (select v from t where k = 'household'))) like '%row-level security%',
  'fremmed kan ikke tilføje personer');

-- Anna inviterer Bo.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into t values ('token', public.create_invitation((select v::uuid from t where k = 'household')));
select pg_temp.expect(length((select v from t where k = 'token')) = 64, 'invitationsnøgle er 256 bit');
select pg_temp.expect(
  (select token_hash from public.invitations) <> convert_to((select v from t where k = 'token'), 'UTF8'),
  'nøglen gemmes kun som hash');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.create_invitation(%L, 'owner')$q$, (select v from t where k = 'household'))) = 'invalid_role',
  'man kan ikke invitere en ejer');

-- Bo indløser invitationen og ser husstanden.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect(
  public.accept_invitation((select v from t where k = 'token'), 'Bo')::text = (select v from t where k = 'household'),
  'invitation kan indløses');
select pg_temp.expect((select count(*) from public.persons) = 3, 'ny voksen ser hele familien');
select pg_temp.expect(
  (select role from public.memberships where user_id = auth.uid()) = 'adult', 'invitation giver rollen voksen');

-- Nøglen kan ikke bruges igen.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(
  pg_temp.error_of(format('select public.accept_invitation(%L, %L)', (select v from t where k = 'token'), 'Carl')) = 'invitation_invalid',
  'brugt invitation afvises');
select pg_temp.expect(
  pg_temp.error_of(format('select public.accept_invitation(%L, %L)', repeat('0', 64), 'Carl')) = 'invitation_invalid',
  'forkert nøgle afvises');

-- Udløbet invitation afvises.
reset role;
insert into t values ('old', encode(extensions.gen_random_bytes(32), 'hex'));
insert into public.invitations (household_id, token_hash, expires_at)
  values ((select v::uuid from t where k = 'household'),
          extensions.digest((select v from t where k = 'old'), 'sha256'), now() - interval '1 day');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(
  pg_temp.error_of(format('select public.accept_invitation(%L, %L)', (select v from t where k = 'old'), 'Carl')) = 'invitation_invalid',
  'udløbet invitation afvises');

-- Kun ejeren kan omdøbe husstanden.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.households set name = 'Bos hus';
select pg_temp.expect((select name from public.households) = 'Familien Test', 'voksen kan ikke omdøbe husstanden');

-- En person kan ikke flyttes til en anden husstand, og man kan ikke gøre sig selv til ejer.
select pg_temp.expect(
  pg_temp.error_of($q$update public.persons set household_id = gen_random_uuid() where user_id = auth.uid()$q$) like '%permission denied%',
  'person kan ikke flyttes til en anden husstand');
select pg_temp.expect(
  pg_temp.error_of($q$update public.memberships set role = 'owner' where user_id = auth.uid()$q$) like '%permission denied%',
  'voksen kan ikke gøre sig selv til ejer');
update public.persons set display_name = 'Bo B.' where user_id = auth.uid();
select pg_temp.expect((select display_name from public.persons where user_id = auth.uid()) = 'Bo B.', 'man kan rette sit eget navn');

-- Brugerindstillinger er private.
insert into public.user_settings (user_id, locale) values (auth.uid(), 'en');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.user_settings) = 0, 'andres indstillinger er skjult');
select pg_temp.expect(
  pg_temp.error_of($q$insert into public.user_settings (user_id) values ('00000000-0000-0000-0000-00000000000b')$q$) like '%row-level security%',
  'man kan ikke skrive andres indstillinger');

-- Sidste ejer kan ikke forlade husstanden, men en voksen kan.
select pg_temp.expect(
  pg_temp.error_of(format('select public.leave_household(%L)', (select v from t where k = 'household'))) = 'last_owner',
  'sidste ejer kan ikke gå');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.leave_household((select v::uuid from t where k = 'household'));
select pg_temp.expect((select count(*) from public.households) = 0, 'den der går, mister adgang');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(
  (select count(*) from public.persons where user_id is null) = 2, 'personen bliver i familien uden konto');

-- Anonyme får intet.
set local role anon;
select pg_temp.expect(
  pg_temp.error_of('select count(*) from public.households') like '%permission denied%', 'anonym har ingen adgang');

rollback;
