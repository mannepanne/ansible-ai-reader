-- ABOUT: Track items deleted in Reader
-- ABOUT: Adds reader_deleted flag to mark items no longer available in Reader

-- Add reader_deleted column to reader_items table
ALTER TABLE reader_items
ADD COLUMN reader_deleted boolean DEFAULT false NOT NULL;

-- Add index for filtering out deleted items
CREATE INDEX idx_reader_deleted ON reader_items(user_id, reader_deleted, archived);

-- Add comment explaining the field
COMMENT ON COLUMN reader_items.reader_deleted IS 'True if the item was deleted in Reader and no longer exists there. Used to filter out orphaned items from future functionality.';
