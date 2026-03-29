-- Add admin bypass to events, carpools, and carpool_riders RLS policies
-- (missed in 00015_admin_rls_bypass.sql)

-- ============================================================
-- EVENTS — SELECT, INSERT, UPDATE, DELETE
-- ============================================================

drop policy if exists "Events viewable by authenticated users" on public.events;
create policy "Events viewable by authenticated users"
  on public.events for select
  to authenticated
  using (
    status in ('open', 'closed', 'published')
    or created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

drop policy if exists "Organizers can create events" on public.events;
create policy "Organizers can create events"
  on public.events for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

drop policy if exists "Organizers can update events" on public.events;
create policy "Organizers can update events"
  on public.events for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

drop policy if exists "Organizers can delete events" on public.events;
create policy "Organizers can delete events"
  on public.events for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

-- ============================================================
-- CARPOOLS — INSERT, UPDATE, DELETE
-- ============================================================

drop policy if exists "Organizers can create carpools" on public.carpools;
create policy "Organizers can create carpools"
  on public.carpools for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

drop policy if exists "Organizers can update carpools" on public.carpools;
create policy "Organizers can update carpools"
  on public.carpools for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

drop policy if exists "Organizers can delete carpools" on public.carpools;
create policy "Organizers can delete carpools"
  on public.carpools for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

-- Also update SELECT to include admin
drop policy if exists "Carpools viewable by relevant users" on public.carpools;
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
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

-- ============================================================
-- CARPOOL_RIDERS — INSERT, UPDATE, DELETE
-- ============================================================

drop policy if exists "Organizers can create carpool riders" on public.carpool_riders;
create policy "Organizers can create carpool riders"
  on public.carpool_riders for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

drop policy if exists "Organizers can update carpool riders" on public.carpool_riders;
create policy "Organizers can update carpool riders"
  on public.carpool_riders for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

drop policy if exists "Organizers can delete carpool riders" on public.carpool_riders;
create policy "Organizers can delete carpool riders"
  on public.carpool_riders for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

-- Also update SELECT to include admin
drop policy if exists "Carpool riders viewable by relevant users" on public.carpool_riders;
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
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );
