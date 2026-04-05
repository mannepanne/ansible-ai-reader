-- ABOUT: Adds is_admin flag to users table for admin analytics dashboard access
-- ABOUT: Magnus is seeded as the initial admin user

ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Seed initial admin user (idempotent)
UPDATE users SET is_admin = true WHERE email = 'magnus.hultberg@gmail.com';

-- Tighten the UPDATE policy to prevent users from self-escalating is_admin.
-- The existing broad policy allows any column to be updated by the row owner.
-- This replacement prevents changes to is_admin via RLS-authenticated clients
-- (e.g. direct Supabase JS calls with the public anon key).
-- Service role client bypasses RLS entirely and is unaffected.
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin IS NOT DISTINCT FROM (SELECT is_admin FROM users WHERE id = auth.uid())
  );
