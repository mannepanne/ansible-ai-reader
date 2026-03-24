-- Migration: Add automated sync settings
-- Date: 2026-03-24
-- Description: Adds sync_interval and last_auto_sync_at columns to users table,
--              and triggered_by column to sync_log for tracking manual vs automated syncs

-- Add sync settings to users table
ALTER TABLE users
  ADD COLUMN sync_interval INTEGER DEFAULT 0
    CHECK (sync_interval >= 0 AND sync_interval <= 24),
  ADD COLUMN last_auto_sync_at TIMESTAMP WITH TIME ZONE;

-- Create partial index for efficient cron queries (only indexes users with auto-sync enabled)
CREATE INDEX idx_users_auto_sync
  ON users(sync_interval, last_auto_sync_at)
  WHERE sync_interval > 0;

-- Track sync trigger source in sync_log (manual button click vs cron trigger)
ALTER TABLE sync_log
  ADD COLUMN triggered_by VARCHAR(10) DEFAULT 'manual'
    CHECK (triggered_by IN ('manual', 'cron'));

-- Add helpful documentation comments
COMMENT ON COLUMN users.sync_interval IS '0=disabled (opt-in), 1-24=hours between automatic syncs';
COMMENT ON COLUMN users.last_auto_sync_at IS 'Timestamp of last successful automated sync (not manual sync)';
COMMENT ON COLUMN sync_log.triggered_by IS 'Source of sync: manual (user clicked button) or cron (automated schedule)';
