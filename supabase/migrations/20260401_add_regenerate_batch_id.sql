-- Add regenerate_batch_id column to processing_jobs table
-- This enables tracking progress for "Regenerate Tags" operations

-- Add column (nullable to support existing jobs)
ALTER TABLE processing_jobs
ADD COLUMN regenerate_batch_id TEXT;

-- Create index for fast status queries
-- Partial index (only rows with batch ID) for better performance
CREATE INDEX idx_processing_jobs_regenerate_batch_id
ON processing_jobs(regenerate_batch_id)
WHERE regenerate_batch_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN processing_jobs.regenerate_batch_id IS
  'UUID linking jobs from a single regenerate tags operation (for progress tracking)';
