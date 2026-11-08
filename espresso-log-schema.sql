-- Espresso log: Supabase schema with household-based access (row-level security)
-- Run in the Supabase SQL editor. Assumes Postgres 15+ (current Supabase default).
-- Model: a "household" is a group of people who share one log. Everyone in a household
-- sees all beans and shots; each person can only edit or delete their own shots.

-- ============ TABLES ============

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- share this code so a second person can join (see join_household below)
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.beans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  roaster text,
  roast_date date,
  roast_level text check (roast_level in ('light', 'medium-light', 'medium', 'medium-dark', 'dark')),
  notes text,
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, household_id) -- lets shots prove the bean is in the same household
);

create table public.shots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid not null default auth.uid(),
  bean_id uuid,
  pulled_at timestamptz not null default now(),
  dose_g numeric(4,1) not null check (dose_g > 0),
  yield_g numeric(5,1) check (yield_g > 0),
  time_s numeric(4,1) check (time_s > 0),
  grind_setting numeric(5,2),          -- collar position, e.g. 3.40
  basket text,                          -- optional, e.g. 'VST 18g'
  puck_screen boolean,
  rating smallint check (rating between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  -- the person must belong to the household
  foreign key (household_id, user_id)
    references public.household_members (household_id, user_id),
  -- the bean must belong to the same household
  foreign key (bean_id, household_id)
    references public.beans (id, household_id)
);

create index shots_household_pulled_idx on public.shots (household_id, pulled_at desc);
create index shots_bean_idx on public.shots (bean_id);
create index beans_household_idx on public.beans (household_id);

-- ============ HELPER FUNCTIONS ============

-- True if the signed-in user belongs to the household.
-- security definer so policies can call it without recursing into household_members' own policy.
create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

-- Create a household and add yourself as the first member.
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.households (name) values (p_name) returning id into hid;
  insert into public.household_members (household_id, user_id, display_name)
    values (hid, auth.uid(), p_display_name);
  return hid;
end;
$$;

-- Join an existing household with its invite code.
create or replace function public.join_household(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select id into hid from public.households where invite_code = p_code;
  if hid is null then
    raise exception 'invalid invite code';
  end if;
  insert into public.household_members (household_id, user_id, display_name)
    values (hid, auth.uid(), p_display_name)
    on conflict do nothing;
  return hid;
end;
$$;

-- Only signed-in users may call these through the API.
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- ============ ROW-LEVEL SECURITY ============

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.beans enable row level security;
alter table public.shots enable row level security;

-- households: members can read (this is how you see the invite code). Creation goes through create_household().
create policy "members read household" on public.households
  for select to authenticated
  using (public.is_member(id));

-- household_members: see everyone in your household; edit only your own display name.
-- Rows are inserted by create_household()/join_household(), not directly.
create policy "members read members" on public.household_members
  for select to authenticated
  using (public.is_member(household_id));

create policy "update own member row" on public.household_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- beans: shared by the household.
create policy "members read beans" on public.beans
  for select to authenticated
  using (public.is_member(household_id));

create policy "members add beans" on public.beans
  for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());

create policy "members edit beans" on public.beans
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy "members delete beans" on public.beans
  for delete to authenticated
  using (public.is_member(household_id));

-- shots: everyone in the household can read; only the person who pulled it can change it.
create policy "members read shots" on public.shots
  for select to authenticated
  using (public.is_member(household_id));

create policy "add own shots" on public.shots
  for insert to authenticated
  with check (public.is_member(household_id) and user_id = auth.uid());

create policy "edit own shots" on public.shots
  for update to authenticated
  using (user_id = auth.uid() and public.is_member(household_id))
  with check (user_id = auth.uid() and public.is_member(household_id));

create policy "delete own shots" on public.shots
  for delete to authenticated
  using (user_id = auth.uid() and public.is_member(household_id));

-- ============ HOW TO TEST THE RULES ============
-- 1. Sign up two accounts, call create_household() with one and join_household() with the other.
-- 2. In the SQL editor, impersonate a user (replace the uuid with a real auth.users id):
--
--    begin;
--    set local role authenticated;
--    select set_config('request.jwt.claims', '{"sub":"<user-uuid>"}', true);
--    select * from public.shots;      -- should only show that user's household
--    rollback;
--
-- 3. Create a third account with its own household and confirm it sees none of the above.
-- 4. Try updating the other person's shot; it should affect 0 rows.