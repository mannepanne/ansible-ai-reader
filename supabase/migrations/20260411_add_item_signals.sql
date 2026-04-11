-- Add item_signals table for tracking engagement signals
-- Append-only event log: each user action that signals interest generates a row
-- Phase 1 signals: click_through, note_added, rated_interesting, rated_not_interesting
-- Phase 2 signals (Reader-side): to be added after archive sync (#26) is shipped

CREATE TABLE item_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES reader_items(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'click_through',
    'note_added',
    'rated_interesting',
    'rated_not_interesting'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for pattern analysis queries (tags × signals, time-series)
CREATE INDEX item_signals_item_id_idx ON item_signals(item_id);
CREATE INDEX item_signals_user_id_idx ON item_signals(user_id);
CREATE INDEX item_signals_signal_type_idx ON item_signals(signal_type);
CREATE INDEX item_signals_created_at_idx ON item_signals(created_at);

-- RLS: authenticated users can insert and read their own signals only
-- No UPDATE or DELETE policies — table is append-only by design
ALTER TABLE item_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own signals"
  ON item_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own signals"
  ON item_signals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
