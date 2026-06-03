import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Securely retrieve user
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // Fetch the user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // Profile fallbacks
  const userData = {
    email: user.email,
    full_name: profile?.full_name || user.email?.split('@')[0] || 'Staff Member',
    role: (profile?.role as 'owner' | 'staff') || 'staff',
  };

  return (
    <Sidebar user={userData}>
      {children}
    </Sidebar>
  );
}
