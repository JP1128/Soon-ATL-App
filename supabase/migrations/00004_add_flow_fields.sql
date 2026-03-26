-- Add flow-based response fields for before/after event roles
ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS before_role text CHECK (before_role IS NULL OR before_role IN ('driver', 'rider')),
  ADD COLUMN IF NOT EXISTS after_role text CHECK (after_role IS NULL OR after_role IN ('driver', 'rider')),
  ADD COLUMN IF NOT EXISTS departure_time time,
  ADD COLUMN IF NOT EXISTS note text;
