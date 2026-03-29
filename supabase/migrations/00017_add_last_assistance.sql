-- Store the last carpool assistance result so users see it when revisiting the page
ALTER TABLE events ADD COLUMN last_assistance jsonb;
