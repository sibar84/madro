-- Kun til lokal test uden Docker: efterligner det lille stykke af Supabase,
-- som migrationerne bygger på (auth.users, auth.uid() og rollerne).
-- Bruges ikke i CI, hvor en rigtig Supabase-database startes.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create schema extensions;
grant usage on schema auth, extensions to anon, authenticated;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
