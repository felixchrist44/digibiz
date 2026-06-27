-- SQL migration script to update profiles.role CHECK constraint to include 'manager'

-- 1. Drop existing CHECK constraint on role (verified to be 'profiles_role_check')
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Add the new CHECK constraint supporting 'owner', 'manager', and 'staff'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'manager', 'staff'));
