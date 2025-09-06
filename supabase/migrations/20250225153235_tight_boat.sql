/*
  # Fix RLS Policies - Final Version

  1. Changes
    - Implement simplified RLS policies without self-referential queries
    - Use direct auth.uid() checks for basic access control
    - Separate admin checks into a secure function

  2. Security
    - Maintain strict access control
    - Prevent infinite recursion
    - Preserve data privacy
*/

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can read assigned content" ON content_items;
DROP POLICY IF EXISTS "Admin users can create content" ON content_items;
DROP POLICY IF EXISTS "Users can update assigned content" ON content_items;

-- Create new policies for profiles
CREATE POLICY "Allow users to read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Allow admins to read all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Create new policies for content items
CREATE POLICY "Allow users to read assigned content"
  ON content_items
  FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid() OR is_admin());

CREATE POLICY "Allow admins to create content"
  ON content_items
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Allow content management"
  ON content_items
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid() OR is_admin());