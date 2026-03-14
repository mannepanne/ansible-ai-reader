-- Add word_count column to reader_items table
-- This stores the word count from Reader API for display in the items list

ALTER TABLE reader_items
ADD COLUMN word_count integer;

-- Add constraint to ensure non-negative values
ALTER TABLE reader_items
ADD CONSTRAINT reader_items_word_count_check CHECK (word_count >= 0);

-- Add comment for documentation
COMMENT ON COLUMN reader_items.word_count IS 'Word count from Reader API, used for display in items list';
