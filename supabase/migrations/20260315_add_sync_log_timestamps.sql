-- ABOUT: Add started_at and completed_at columns to sync_log table
-- ABOUT: Tracks sync operation lifecycle (created, started, completed)

ALTER TABLE sync_log
ADD COLUMN started_at timestamp with time zone,
ADD COLUMN completed_at timestamp with time zone;

COMMENT ON COLUMN sync_log.started_at IS 'When the sync operation began processing';
COMMENT ON COLUMN sync_log.completed_at IS 'When the sync operation completed (success or failure)';
