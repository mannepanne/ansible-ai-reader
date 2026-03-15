-- Add content_truncated flag to track when summaries are based on truncated content
-- This provides transparency to users about summary quality/completeness

ALTER TABLE reader_items
ADD COLUMN content_truncated boolean DEFAULT false;

COMMENT ON COLUMN reader_items.content_truncated IS 'True if article content was truncated (>30k chars) before generating summary';
