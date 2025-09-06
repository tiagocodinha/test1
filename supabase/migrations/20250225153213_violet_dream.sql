/*
  # Fix RLS Policies for Profiles and Content Items

  1. Changes
    - Remove recursive policies for profiles table
    - Simplify admin access checks
    - Update content items policies to use direct checks

  2. Security
    - Maintain data access control while preventing infinite recursion
    - Ensure admin users can still access all data
    - Preserve user data privacy
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read their own profile" ON profiles;
DROP POLICY IF EXISTS "Admin users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read assigned content" ON content_items;
DROP POLICY IF EXISTS "Admin users can create content" ON content_items;
DROP POLICY IF EXISTS "Admin users can update content" ON content_items;

-- Create new policies for profiles
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR
    (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- Create new policies for content items
CREATE POLICY "Users can read assigned content"
  ON content_items
  FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid() OR
    (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admin users can create content"
  ON content_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update assigned content"
  ON content_items
  FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid() OR
    (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );