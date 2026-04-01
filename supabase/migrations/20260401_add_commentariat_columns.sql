-- Add commentariat columns to reader_items
-- Stores on-demand intellectual critique generated via Perplexity

ALTER TABLE reader_items
  ADD COLUMN commentariat_summary text,
  ADD COLUMN commentariat_generated_at timestamptz;
