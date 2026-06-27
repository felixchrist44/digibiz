import React from 'react';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { CartProvider } from '@/components/CartProvider';
import { UserRole } from '@/types/database';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  // Profile fallbacks for the sidebar display
  const userData = {
    email: user.email,
    full_name: profile?.full_name || user.email?.split('@')[0] || 'Staff Member',
    role: (profile?.role as UserRole) || 'staff',
  };

  return (
    <Sidebar user={userData}>
      <CartProvider tenantId={profile?.tenant_id}>
        {children}
      </CartProvider>
    </Sidebar>
  );
}
