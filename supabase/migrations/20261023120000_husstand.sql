-- Fase 0: husstand, medlemmer, personer, invitationer og brugerindstillinger.
--
-- Husstanden er sikkerhedsgrænsen. Alle tabeller med husstandsdata har et
-- household_id, og rækkesikkerheden afviser alt, der ikke tilhører en husstand,
-- brugeren er medlem af. Oprettelse af husstande og invitationer sker kun via
-- funktionerne nederst, så reglerne ligger ét sted.

create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('owner', 'adult', 'teen');

-- Husstande ----------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  timezone text not null default 'Europe/Copenhagen',
  created_at timestamptz not null default now()
);

create table public.memberships (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- En person er et familiemedlem, med eller uden konto. Børn har ingen konto.
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  birth_year int check (birth_year between 1900 and 2100),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create index persons_household_id_idx on public.persons (household_id);

-- Invitationer gemmer kun en hash af nøglen. Selve nøglen vises én gang.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token_hash bytea not null unique,
  role public.member_role not null default 'adult' check (role <> 'owner'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index invitations_household_id_idx on public.invitations (household_id);

-- Brugerindstillinger følger brugeren, ikke husstanden.
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'da' check (locale in ('da', 'en')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  simple_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Hjælpefunktioner til rækkesikkerhed ---------------------------------------
-- security definer, så politikkerne kan læse memberships uden at ramme
-- memberships' egen politik i en løkke.

create function public.is_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where household_id = p_household and user_id = auth.uid()
  );
$$;

create function public.has_role(p_household uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where household_id = p_household and user_id = auth.uid() and role = any (p_roles)
  );
$$;

-- Rækkesikkerhed -------------------------------------------------------------

alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.persons enable row level security;
alter table public.invitations enable row level security;
alter table public.user_settings enable row level security;

create policy households_select on public.households
  for select to authenticated using (public.is_member(id));
create policy households_update on public.households
  for update to authenticated
  using (public.has_role(id, '{owner}'))
  with check (public.has_role(id, '{owner}'));
create policy households_delete on public.households
  for delete to authenticated using (public.has_role(id, '{owner}'));

create policy memberships_select on public.memberships
  for select to authenticated using (public.is_member(household_id));

create policy persons_select on public.persons
  for select to authenticated using (public.is_member(household_id));
create policy persons_insert on public.persons
  for insert to authenticated
  with check (public.has_role(household_id, '{owner,adult}') and user_id is null);
create policy persons_update on public.persons
  for update to authenticated
  using (public.has_role(household_id, '{owner,adult}') or user_id = auth.uid())
  with check (public.has_role(household_id, '{owner,adult}') or user_id = auth.uid());
create policy persons_delete on public.persons
  for delete to authenticated
  using (public.has_role(household_id, '{owner,adult}') and user_id is null);

create policy invitations_select on public.invitations
  for select to authenticated using (public.has_role(household_id, '{owner,adult}'));

create policy user_settings_all on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Anonyme brugere får intet.
revoke all on public.households, public.memberships, public.persons,
  public.invitations, public.user_settings from anon;

-- Medlemskaber og invitationer ændres kun via funktionerne nedenfor, og en
-- person kan ikke flyttes til en anden husstand eller kobles på en anden konto.
revoke insert, update, delete on public.memberships, public.invitations from authenticated;
revoke update on public.households, public.persons from authenticated;
grant update (name, timezone) on public.households to authenticated;
grant update (display_name, birth_year) on public.persons to authenticated;

-- Funktioner ----------------------------------------------------------------

-- Opretter en husstand med brugeren som ejer og som første person.
create function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.households (name) values (p_name) returning id into v_household;
  insert into public.memberships (household_id, user_id, role) values (v_household, v_user, 'owner');
  insert into public.persons (household_id, user_id, display_name)
    values (v_household, v_user, p_display_name);

  return v_household;
end;
$$;

-- Laver en invitation og returnerer nøglen. Kun ejer og voksne kan invitere.
create function public.create_invitation(
  p_household uuid,
  p_role public.member_role default 'adult'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not public.has_role(p_household, '{owner,adult}') then
    raise exception 'not_allowed';
  end if;
  if p_role = 'owner' then
    raise exception 'invalid_role';
  end if;

  insert into public.invitations (household_id, token_hash, role, created_by)
    values (p_household, extensions.digest(v_token, 'sha256'), p_role, auth.uid());

  return v_token;
end;
$$;

-- Indløser en invitation. Nøglen kan kun bruges én gang og udløber efter 7 dage.
create function public.accept_invitation(p_token text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invitation public.invitations;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_invitation
  from public.invitations
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if v_invitation.id is null
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at < now() then
    raise exception 'invitation_invalid';
  end if;

  insert into public.memberships (household_id, user_id, role)
    values (v_invitation.household_id, v_user, v_invitation.role)
    on conflict (household_id, user_id) do nothing;
  insert into public.persons (household_id, user_id, display_name)
    values (v_invitation.household_id, v_user, p_display_name)
    on conflict (household_id, user_id) do nothing;

  update public.invitations
    set accepted_by = v_user, accepted_at = now()
    where id = v_invitation.id;

  return v_invitation.household_id;
end;
$$;

-- Trækker en invitation tilbage.
create function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.invitations where id = p_invitation;
  if v_household is null or not public.has_role(v_household, '{owner,adult}') then
    raise exception 'not_allowed';
  end if;
  update public.invitations set revoked_at = now()
    where id = p_invitation and accepted_at is null and revoked_at is null;
end;
$$;

-- Forlader en husstand med det samme. Den sidste ejer kan ikke gå, før
-- ejerskabet er givet videre, eller husstanden er slettet.
create function public.leave_household(p_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_member(p_household) then
    raise exception 'not_allowed';
  end if;
  if public.has_role(p_household, '{owner}')
     and (select count(*) from public.memberships
          where household_id = p_household and role = 'owner') = 1 then
    raise exception 'last_owner';
  end if;

  update public.persons set user_id = null
    where household_id = p_household and user_id = v_user;
  delete from public.memberships where household_id = p_household and user_id = v_user;
end;
$$;

revoke execute on function
  public.is_member(uuid),
  public.has_role(uuid, public.member_role[]),
  public.create_household(text, text),
  public.create_invitation(uuid, public.member_role),
  public.accept_invitation(text, text),
  public.revoke_invitation(uuid),
  public.leave_household(uuid)
from public, anon;

grant execute on function
  public.is_member(uuid),
  public.has_role(uuid, public.member_role[]),
  public.create_household(text, text),
  public.create_invitation(uuid, public.member_role),
  public.accept_invitation(text, text),
  public.revoke_invitation(uuid),
  public.leave_household(uuid)
to authenticated;
