-- Tester spisetid, madbudget og kvitteringer.
-- Kør mod en database med migrationerne: psql -v ON_ERROR_STOP=1 -f supabase/tests/oekonomi.sql
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

-- Indstillinger.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(
  (select dinner_time = '17:30' and payday = 1 and food_budget is null from public.households
    where id = (select v::uuid from t where k = 'household')),
  'en ny husstand spiser 17.30 og har intet budget');
select public.update_household_settings((select v::uuid from t where k = 'household'), '18:00', 4500, 25::smallint);
select pg_temp.expect(
  (select dinner_time = '18:00' and payday = 25 and food_budget = 4500 from public.households
    where id = (select v::uuid from t where k = 'household')),
  'en voksen kan gemme spisetid, budget og lønningsdag');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.update_household_settings(%L, '18:00', 4500, 32::smallint)$q$,
    (select v from t where k = 'household'))) like '%violates check constraint%',
  'en lønningsdag efter den 31. afvises');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.update_household_settings(%L, '19:00', 100, 1::smallint)$q$,
    (select v from t where k = 'household'))) = 'not_allowed',
  'en ung kan ikke ændre budgettet');

-- Kvitteringer.
insert into t values ('receipt', '00000000-0000-0000-0000-0000000000f1');
insert into public.receipts (id, household_id, image_path)
  select v::uuid, (select v::uuid from t where k = 'household'),
    (select v from t where k = 'household') || '/' || v || '.jpg'
  from t where k = 'receipt';
select pg_temp.expect(
  (select status = 'reading' and created_by = auth.uid() from public.receipts), 'en ung kan scanne en kvittering');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.receipts (household_id, image_path) values (%L, %L)$q$,
    (select v from t where k = 'household'),
    (select v from t where k = 'carl_household') || '/00000000-0000-0000-0000-0000000000f2.jpg')) like '%violates check constraint%',
  'et billede skal ligge i husstandens egen mappe');
select pg_temp.expect(
  pg_temp.error_of(format($q$update public.receipts set status = 'done' where id = %L$q$,
    (select v from t where k = 'receipt'))) like '%permission denied%',
  'status sættes kun af funktionen');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.receipt_lines (receipt_id, household_id, position, text, amount) values (%L, %L, 1, 'X', 1)$q$,
    (select v from t where k = 'receipt'), (select v from t where k = 'household'))) like '%permission denied%',
  'linjer skrives kun af funktionen');

-- Funktionen skriver linjerne (her som databaseejer).
reset role;
insert into public.receipt_lines (receipt_id, household_id, position, text, amount, category, certain)
  select r.id, r.household_id, l.position, l.text, l.amount, l.category, l.certain
  from public.receipts r,
    (values (1, 'LETMÆLK', 12.95, 'mejeri', true), (2, 'GR. BL. 400G', 22.00, 'andet', false)) as l(position, text, amount, category, certain);
update public.receipts set status = 'done', store = 'Netto', purchased_on = '2026-10-28', total = 34.95;
set local role authenticated;

select pg_temp.expect(
  (select count(*) from public.receipt_lines where not certain and confirmed_at is null) = 1, 'en usikker linje er i indbakken');
update public.receipt_lines set category = 'frost', confirmed_at = now() where position = 2;
select pg_temp.expect(
  (select count(*) from public.receipt_lines where not certain and confirmed_at is null) = 0, 'en ung kan tjekke linjen');
select pg_temp.expect(
  pg_temp.error_of($q$update public.receipt_lines set amount = 0$q$) like '%permission denied%', 'beløbet kan ikke ændres');
select pg_temp.expect(
  pg_temp.error_of($q$update public.receipt_lines set category = 'slik'$q$) like '%violates check constraint%',
  'ukendt kategori afvises');

-- Carl ser intet og kan intet ændre hos Anna.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.receipts) = 0, 'en anden husstand ser ikke kvitteringerne');
select pg_temp.expect((select count(*) from public.receipt_lines) = 0, 'en anden husstand ser ikke linjerne');
select pg_temp.expect(
  pg_temp.error_of(format($q$insert into public.receipts (household_id, image_path) values (%L, %L)$q$,
    (select v from t where k = 'household'),
    (select v from t where k = 'household') || '/00000000-0000-0000-0000-0000000000f3.jpg')) like '%row-level security%',
  'man kan ikke lægge kvitteringer i en anden husstand');
select pg_temp.expect(
  pg_temp.error_of(format($q$select public.update_household_settings(%L, '19:00', 100, 1::smallint)$q$,
    (select v from t where k = 'household'))) = 'not_allowed',
  'man kan ikke ændre en anden husstands budget');
delete from public.receipts;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.receipts) = 1, 'en anden husstand kan ikke slette kvitteringen');
delete from public.receipts;
select pg_temp.expect((select count(*) from public.receipt_lines) = 0, 'ejeren kan slette kvitteringen med linjer');

-- Anonyme får intet.
set local role anon;
select pg_temp.expect(
  pg_temp.error_of('select count(*) from public.receipts') like '%permission denied%', 'anonym ser ingen kvitteringer');

rollback;
