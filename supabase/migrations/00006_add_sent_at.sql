-- Add sent_at timestamp to track when event was sent out (status changed to 'open')
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
