-- Migration: Add sync_log_id column to processing_jobs table
-- Purpose: Link processing jobs to specific sync operations for status tracking
-- Phase: 3 (Reader Integration)
-- Date: 2026-03-12

-- Add sync_log_id column (nullable for backward compatibility)
ALTER TABLE processing_jobs
ADD COLUMN sync_log_id UUID REFERENCES sync_log(id) ON DELETE SET NULL;

-- Create index for faster sync status queries
CREATE INDEX idx_processing_jobs_sync_log_id ON processing_jobs(sync_log_id);

-- Add comment for documentation
COMMENT ON COLUMN processing_jobs.sync_log_id IS 'Links job to the sync operation that created it (for status polling)';
