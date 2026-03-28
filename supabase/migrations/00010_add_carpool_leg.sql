-- Add leg column to carpools table to separate before/after event assignments.
-- Each carpool now belongs to a specific leg of the event trip.
ALTER TABLE carpools ADD COLUMN leg text NOT NULL DEFAULT 'before' CHECK (leg IN ('before', 'after'));

-- Update published_carpools to store leg-keyed structure.
-- The new shape is: { "before": [...], "after": [...] }
-- Drop the old column and re-add with the new structure.
-- (Existing data will be lost, which is acceptable since published_carpools was just added.)
ALTER TABLE events DROP COLUMN IF EXISTS published_carpools;
ALTER TABLE events ADD COLUMN published_carpools jsonb;
