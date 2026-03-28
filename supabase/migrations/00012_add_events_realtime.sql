-- Enable Realtime for the events table so clients can subscribe to changes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
