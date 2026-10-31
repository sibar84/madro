-- Fejl og forslag fra testerne, skrevet i appen. Alle kan skrive sine egne
-- og læse sine egne. Ejeren af projektet læser dem alle i Supabase.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  platform text check (char_length(platform) <= 20),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy feedback_select on public.feedback
  for select to authenticated using (user_id = auth.uid());

create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid() and (household_id is null or public.is_member(household_id)));

revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (household_id, message, platform) on public.feedback to authenticated;
