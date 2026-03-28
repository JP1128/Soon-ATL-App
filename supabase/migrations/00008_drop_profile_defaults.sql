-- Remove default_role and university from profiles
alter table profiles
  drop column if exists default_role,
  drop column if exists university;
