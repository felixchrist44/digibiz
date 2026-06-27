import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import UsersClient from '@/components/UsersClient';
import { Profile, UserRole } from '@/types/database';
import { canManageUsers } from '@/utils/permissions';

export default async function UsersPage() {
  // React cache() deduplicates this — layout already called it, so this is free (0ms)
  const { user, profile, supabase } = await getAuthenticatedUser();

  if (!profile || !canManageUsers(profile.role)) {
    redirect('/dashboard');
  }

  // Fetch all profiles — only 1 query needed, current user profile comes from cache
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  const currentUserRole = (profile?.role as UserRole) || 'staff';

  return (
    <UsersClient
      initialProfiles={(allProfiles as Profile[]) || []}
      currentUserId={user?.id || ''}
      currentUserRole={currentUserRole}
    />
  );
}

