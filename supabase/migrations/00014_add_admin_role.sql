-- Add 'admin' to the role check constraint on profiles
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('organizer', 'member', 'admin'));

-- Set jp1004.1040@gmail.com as admin
update public.profiles
  set role = 'admin'
  where email = 'jp1004.1040@gmail.com';
