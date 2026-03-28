-- Add published_carpools JSONB column to events table.
-- This stores a snapshot of carpool assignments at the time the organizer
-- sends/publishes them. Users see this snapshot rather than live edits.
ALTER TABLE events ADD COLUMN published_carpools jsonb;
