/*
  # Add rejection notes to content items

  1. Changes
    - Add `rejection_notes` column to `content_items` table
    - Add `rejected_at` timestamp column to track when items were rejected

  2. Security
    - Update RLS policies to allow reading and writing rejection notes
*/

-- Add new columns to content_items table
ALTER TABLE content_items 
ADD COLUMN IF NOT EXISTS rejection_notes text,
ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- Update RLS policies to allow writing rejection notes
CREATE POLICY "Users can update rejection notes on assigned content"
ON content_items
FOR UPDATE
TO authenticated
USING (auth.uid() = assigned_to)
WITH CHECK (auth.uid() = assigned_to);