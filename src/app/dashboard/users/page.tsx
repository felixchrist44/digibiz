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

  // Fetch active user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const currentUserRole = (profile?.role as 'owner' | 'staff') || 'staff';

  // Fetch all user profiles from db
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <UsersClient
      initialProfiles={(profiles as Profile[]) || []}
      currentUserId={user.id}
      currentUserRole={currentUserRole}
    />
  );
}
