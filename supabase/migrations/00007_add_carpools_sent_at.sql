-- Track when carpool assignments were sent out to members
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS carpools_sent_at timestamptz;
