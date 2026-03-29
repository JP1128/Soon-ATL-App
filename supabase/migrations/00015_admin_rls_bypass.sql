-- Allow admins to insert/update/delete responses on behalf of any user (impersonation)

-- Update profile update policy to allow admin bypass
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    auth.uid() = id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Drop and recreate the INSERT policy on responses
drop policy if exists "Users can submit responses" on public.responses;
create policy "Users can submit responses"
  on public.responses for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Drop and recreate the UPDATE policy on responses
drop policy if exists "Users can update own responses" on public.responses;
create policy "Users can update own responses"
  on public.responses for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Drop and recreate the DELETE policy on responses
drop policy if exists "Users can delete own responses" on public.responses;
create policy "Users can delete own responses"
  on public.responses for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Drop and recreate the SELECT policy on responses to include admin
drop policy if exists "Users can view own responses, organizers view all" on public.responses;
create policy "Users can view own responses, organizers view all"
  on public.responses for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

-- Update preferences policies for admin bypass

-- DROP and recreate INSERT policy on preferences
drop policy if exists "Users can create preferences on own responses" on public.preferences;
create policy "Users can create preferences on own responses"
  on public.preferences for insert
  to authenticated
  with check (
    exists (
      select 1 from public.responses
      where responses.id = response_id and responses.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- DROP and recreate DELETE policy on preferences
drop policy if exists "Users can delete own preferences" on public.preferences;
create policy "Users can delete own preferences"
  on public.preferences for delete
  to authenticated
  using (
    exists (
      select 1 from public.responses
      where responses.id = response_id and responses.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- DROP and recreate SELECT policy on preferences to include admin
drop policy if exists "Users can view own preferences, organizers view all" on public.preferences;
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
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

-- Update push_subscriptions policies for admin bypass

-- DROP and recreate INSERT policy on push_subscriptions
drop policy if exists "Users can insert own subscriptions" on public.push_subscriptions;
create policy "Users can insert own subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- DROP and recreate DELETE policy on push_subscriptions
drop policy if exists "Users can delete own subscriptions" on public.push_subscriptions;
create policy "Users can delete own subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- DROP and recreate organizer SELECT to include admin
drop policy if exists "Organizers can view all subscriptions" on public.push_subscriptions;
create policy "Organizers can view all subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('organizer', 'admin')
    )
  );

-- Drop the old user-only SELECT policy (merged into the one above)
drop policy if exists "Users can view own subscriptions" on public.push_subscriptions;
