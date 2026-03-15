-- Add summary and tag columns to reader_items table
-- Stores AI-generated summaries and tags from Perplexity API

ALTER TABLE reader_items
ADD COLUMN short_summary text,
ADD COLUMN tags text[] DEFAULT '{}',
ADD COLUMN perplexity_model varchar(50);

-- Add comments for documentation
COMMENT ON COLUMN reader_items.short_summary IS 'AI-generated bullet-point summary from Perplexity API (~2000 chars max)';
COMMENT ON COLUMN reader_items.tags IS 'AI-generated tags from Perplexity API (3-5 keywords)';
COMMENT ON COLUMN reader_items.perplexity_model IS 'Perplexity model used for summary generation (e.g., sonar, sonar-pro)';
