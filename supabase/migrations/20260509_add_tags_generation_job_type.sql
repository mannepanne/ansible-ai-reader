-- Add 'tags_generation' to job_type_enum so the queue consumer can branch
-- on a tags-only path that reuses the existing summary instead of regenerating it.
-- Resolves TD-002 (wasteful tag regeneration).
--
-- Note: ALTER TYPE ... ADD VALUE must live in its own migration. Postgres allows
-- the statement inside a transaction, but the new value cannot be referenced until
-- that transaction commits — so subsequent migrations or application code can use
-- it only after this migration has been applied.

ALTER TYPE job_type_enum ADD VALUE IF NOT EXISTS 'tags_generation';
