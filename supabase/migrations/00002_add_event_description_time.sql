-- ============================================================
-- Add description and event_time columns to events
-- ============================================================

alter table public.events
  add column description text not null default '',
  add column event_time time;
