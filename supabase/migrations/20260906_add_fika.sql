-- Fika (spec 13, slice 1a): the daily two-item reading email, weekly reading-day dots,
-- signal provenance, and archive provenance. Also adds the drift_days setting for slice 1b
-- (default 0 = off) so the users row takes its final shape in one migration.

-- ---------------------------------------------------------------------------
-- users: Fika settings
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN fika_hour integer CHECK (fika_hour BETWEEN 0 AND 23),
  ADD COLUMN timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN weekly_target integer NOT NULL DEFAULT 5 CHECK (weekly_target BETWEEN 1 AND 7),
  ADD COLUMN drift_days integer NOT NULL DEFAULT 0 CHECK (drift_days >= 0);

COMMENT ON COLUMN users.fika_hour IS 'Local hour (0-23) to send the Fika email. NULL = Fika off (opt-in).';
COMMENT ON COLUMN users.timezone IS 'IANA zone used for Fika send time, batch date, and reading-day boundaries.';
COMMENT ON COLUMN users.weekly_target IS 'Reading days per week shown as the weekly dots target (1-7).';
COMMENT ON COLUMN users.drift_days IS 'River mode (slice 1b): unread items older than this drift to archive. 0 = off.';

-- Partial index for the hourly cron scan of users with Fika enabled
CREATE INDEX idx_users_fika_enabled ON users(fika_hour) WHERE fika_hour IS NOT NULL;

-- ---------------------------------------------------------------------------
-- reader_items: archive provenance (written by the shared archive helper)
-- ---------------------------------------------------------------------------
ALTER TABLE reader_items
  ADD COLUMN archive_reason text CHECK (archive_reason IN ('user', 'drift'));

COMMENT ON COLUMN reader_items.archive_reason IS
  'Why the item was archived: user (any user action, incl. Reader-side archives mirrored by sync) or drift (river mode). NULL on rows archived before this column existed.';

-- Make archived_at the reliable "is archived" predicate: any legacy row flagged archived without a
-- timestamp gets one now, so Fika's candidate query (archived_at IS NULL) agrees with the archived flag.
UPDATE reader_items SET archived_at = now() WHERE archived = true AND archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- item_signals: where the action came from. Existing rows were all web.
-- ---------------------------------------------------------------------------
ALTER TABLE item_signals
  ADD COLUMN source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'fika'));

COMMENT ON COLUMN item_signals.source IS 'Surface the signal was recorded from: web UI or the Fika email. Fika-sourced signals are the trial success measure.';

-- Partial: the only query that filters on source is the Fika trial measure (source = 'fika')
CREATE INDEX item_signals_source_fika_idx ON item_signals(created_at) WHERE source = 'fika';

-- ---------------------------------------------------------------------------
-- fika_batches: one row per user per local day
-- ---------------------------------------------------------------------------
CREATE TABLE fika_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_date date NOT NULL,
  sent_at timestamptz,
  send_attempts integer NOT NULL DEFAULT 0,
  resend_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, batch_date)
);

COMMENT ON TABLE fika_batches IS 'Today''s Fika for a user. batch_date is the user''s local date. sent_at is set only after Resend accepts the email.';

CREATE INDEX idx_fika_batches_user_date ON fika_batches(user_id, batch_date DESC);

-- ---------------------------------------------------------------------------
-- fika_batch_items: the (up to two) items in a batch
-- ---------------------------------------------------------------------------
CREATE TABLE fika_batch_items (
  batch_id uuid NOT NULL REFERENCES fika_batches(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES reader_items(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot IN (1, 2)),
  carried_from uuid REFERENCES fika_batches(id) ON DELETE SET NULL,
  PRIMARY KEY (batch_id, item_id),
  UNIQUE (batch_id, slot)
);

COMMENT ON TABLE fika_batch_items IS 'Slot 1 is the oldest eligible item, slot 2 the freshest. carried_from points at the batch the item was carried forward from.';

CREATE INDEX idx_fika_batch_items_item ON fika_batch_items(item_id);

-- ---------------------------------------------------------------------------
-- RLS: owner read; writes come from the service-role client (cron, action endpoint)
-- ---------------------------------------------------------------------------
ALTER TABLE fika_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fika_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own fika batches"
  ON fika_batches FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can read own fika batch items"
  ON fika_batch_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM fika_batches b WHERE b.id = batch_id AND b.user_id = auth.uid()));
