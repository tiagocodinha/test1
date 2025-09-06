/*
  # Initial Schema Setup for Social Media Content Approval System

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key) - matches auth.users id
      - `email` (text) - user's email
      - `full_name` (text) - user's full name
      - `is_admin` (boolean) - whether user is an admin
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `content_items`
      - `id` (uuid, primary key)
      - `caption` (text) - content caption
      - `content_type` (text) - type of content (Post/Story/Reel/TikTok)
      - `media_url` (text) - Google Drive link
      - `status` (text) - Approved/Rejected/Pending
      - `schedule_date` (timestamp)
      - `created_by` (uuid) - reference to profiles
      - `assigned_to` (uuid) - reference to profiles
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for proper access control
*/

-- Create profiles table
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE NOT NULL,
  full_name text,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create content_items table
CREATE TABLE content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caption text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('Post', 'Story', 'Reel', 'TikTok')),
  media_url text NOT NULL,
  status text DEFAULT 'Pending' CHECK (status IN ('Approved', 'Rejected', 'Pending')),
  schedule_date timestamptz,
  created_by uuid REFERENCES profiles(id),
  assigned_to uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read their own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admin users can read all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Content items policies
CREATE POLICY "Users can read assigned content"
  ON content_items
  FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can create content"
  ON content_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update content"
  ON content_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Function to handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.email = 'geral@stagelink.pt'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();