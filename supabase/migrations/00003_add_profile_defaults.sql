-- ============================================================
-- Add default_role and university to profiles
-- ============================================================

alter table public.profiles
  add column default_role text check (default_role is null or default_role in ('driver', 'rider', 'attending')),
  add column university text;
