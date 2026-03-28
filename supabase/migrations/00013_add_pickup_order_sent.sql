-- Track when the driver last sent the pickup order and which riders were included
ALTER TABLE public.carpools
  ADD COLUMN IF NOT EXISTS pickup_order_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_order_sent_riders jsonb DEFAULT '[]'::jsonb;
