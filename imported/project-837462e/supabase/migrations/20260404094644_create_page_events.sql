CREATE TABLE public.page_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id text NOT NULL,
  session_id text NOT NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_page_events_visitor ON public.page_events(visitor_id);
CREATE INDEX idx_page_events_session ON public.page_events(session_id);
CREATE INDEX idx_page_events_type ON public.page_events(event_type);

ALTER TABLE public.page_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON public.page_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow authenticated insert" ON public.page_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated read" ON public.page_events FOR SELECT TO authenticated USING (true);

