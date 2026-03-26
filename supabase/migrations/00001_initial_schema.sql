-- ============================================================
-- Soon ATL Carpool App — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- Synced from Google OAuth via trigger on auth.users
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  role text not null default 'member' check (role in ('organizer', 'member')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Everyone can read profiles (needed for preference picker, carpool display)
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- EVENTS
-- Each Friday event created by an organizer
-- ============================================================
create table public.events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  event_date date not null,
  location text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'published')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

-- Authenticated users can view events that are open/closed/published
-- Organizers can view all events
create policy "Events viewable by authenticated users"
  on public.events for select
  to authenticated
  using (
    status in ('open', 'closed', 'published')
    or created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- Only organizers can create events
create policy "Organizers can create events"
  on public.events for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- Only organizers can update events
create policy "Organizers can update events"
  on public.events for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- Only organizers can delete events
create policy "Organizers can delete events"
  on public.events for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- ============================================================
-- RESPONSES
-- Form submissions per event
-- ============================================================
create table public.responses (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('driver', 'rider', 'attending')),
  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_address text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  needs_return_ride boolean not null default false,
  return_address text,
  return_lat double precision,
  return_lng double precision,
  available_seats integer check (available_seats is null or available_seats > 0),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One response per user per event
  unique (event_id, user_id)
);

alter table public.responses enable row level security;

-- Users can view their own responses; organizers can view all
create policy "Users can view own responses, organizers view all"
  on public.responses for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- Users can insert their own response
create policy "Users can submit responses"
  on public.responses for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can update their own response
create policy "Users can update own responses"
  on public.responses for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can delete their own response
create policy "Users can delete own responses"
  on public.responses for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- PREFERENCES
-- Avoid/prefer relationships between users
-- ============================================================
create table public.preferences (
  id uuid primary key default uuid_generate_v4(),
  response_id uuid not null references public.responses(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('prefer', 'avoid'))
);

alter table public.preferences enable row level security;

-- Users can view preferences on their own responses; organizers can view all
create policy "Users can view own preferences, organizers view all"
  on public.preferences for select
  to authenticated
  using (
    exists (
      select 1 from public.responses
      where responses.id = response_id and responses.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- Users can insert preferences on their own responses
create policy "Users can create preferences on own responses"
  on public.preferences for insert
  to authenticated
  with check (
    exists (
      select 1 from public.responses
      where responses.id = response_id and responses.user_id = auth.uid()
    )
  );

-- Users can delete preferences on their own responses
create policy "Users can delete own preferences"
  on public.preferences for delete
  to authenticated
  using (
    exists (
      select 1 from public.responses
      where responses.id = response_id and responses.user_id = auth.uid()
    )
  );

-- ============================================================
-- CARPOOLS
-- Generated carpool groups
-- ============================================================
create table public.carpools (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  route_summary jsonb not null default '{}'::jsonb,
  total_distance_meters integer not null default 0,
  status text not null default 'auto' check (status in ('auto', 'manual')),
  created_at timestamptz not null default now()
);

alter table public.carpools enable row level security;

-- Authenticated users can view carpools for published events;
-- organizers and assigned drivers can view all
create policy "Carpools viewable by relevant users"
  on public.carpools for select
  to authenticated
  using (
    driver_id = auth.uid()
    or exists (
      select 1 from public.events
      where events.id = event_id and events.status = 'published'
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- Only organizers can create/update/delete carpools
create policy "Organizers can create carpools"
  on public.carpools for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

create policy "Organizers can update carpools"
  on public.carpools for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

create policy "Organizers can delete carpools"
  on public.carpools for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- ============================================================
-- CARPOOL_RIDERS
-- Riders assigned to each carpool with pickup order
-- ============================================================
create table public.carpool_riders (
  id uuid primary key default uuid_generate_v4(),
  carpool_id uuid not null references public.carpools(id) on delete cascade,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  pickup_order integer not null,
  -- Each rider can only be in one carpool
  unique (carpool_id, rider_id)
);

alter table public.carpool_riders enable row level security;

-- Riders can view their own assignments; organizers and drivers can view theirs
create policy "Carpool riders viewable by relevant users"
  on public.carpool_riders for select
  to authenticated
  using (
    rider_id = auth.uid()
    or exists (
      select 1 from public.carpools
      where carpools.id = carpool_id and carpools.driver_id = auth.uid()
    )
    or exists (
      select 1 from public.events
      join public.carpools on carpools.event_id = events.id
      where carpools.id = carpool_id and events.status = 'published'
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- Only organizers can manage carpool riders
create policy "Organizers can create carpool riders"
  on public.carpool_riders for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

create policy "Organizers can update carpool riders"
  on public.carpool_riders for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

create policy "Organizers can delete carpool riders"
  on public.carpool_riders for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'organizer'
    )
  );

-- ============================================================
-- Enable Realtime for organizer dashboard
-- ============================================================
alter publication supabase_realtime add table public.responses;
alter publication supabase_realtime add table public.carpools;
alter publication supabase_realtime add table public.carpool_riders;
