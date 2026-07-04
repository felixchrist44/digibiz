import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import ShiftClient from '@/components/ShiftClient';
import { createClient } from '@/utils/supabase/server';

export default async function ShiftPage() {
  const { user, profile } = await getAuthenticatedUser();
  if (!user || !profile) {
    redirect('/login');
  }

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('tenant_id', profile.tenant_id)
    .order('full_name');

  if (error) {
    console.error('Failed to fetch tenant profiles:', error.message);
  }

  return (
    <ShiftClient 
      profile={profile} 
      initialProfiles={profiles || []} 
    />
  );
}
