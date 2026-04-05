-- ABOUT: Adds is_admin flag to users table for admin analytics dashboard access
-- ABOUT: Magnus is seeded as the initial admin user

ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Seed initial admin user (idempotent)
UPDATE users SET is_admin = true WHERE email = 'magnus.hultberg@gmail.com';
