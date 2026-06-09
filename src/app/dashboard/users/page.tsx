import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import UsersClient from '@/components/UsersClient';
import { Profile } from '@/types/database';

export default async function UsersPage() {
  const supabase = await createClient();

  // Retrieve user session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // Fetch active user's profile and all profiles in parallel to avoid database query waterfalls
  const [profileResult, allProfilesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
  ]);

  const profile = profileResult.data;
  const profiles = allProfilesResult.data;

  const currentUserRole = (profile?.role as 'owner' | 'staff') || 'staff';

  return (
    <UsersClient
      initialProfiles={(profiles as Profile[]) || []}
      currentUserId={user.id}
      currentUserRole={currentUserRole}
    />
  );
}
