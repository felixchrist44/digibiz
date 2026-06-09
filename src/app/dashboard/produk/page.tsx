import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import ProdukClient from '@/components/ProdukClient';
import { Produk, Profile } from '@/types/database';

export default async function ProdukPage() {
  const supabase = await createClient();

  // Retrieve user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // Fetch user profile and products in parallel
  const [profileResult, productsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),
    supabase
      .from('produk')
      .select('*')
      .order('created_at', { ascending: false })
  ]);

  const profile = profileResult.data;
  const products = productsResult.data;

  // Fallback profile if not found in db yet
  const activeProfile: Profile = profile || {
    id: user.id,
    full_name: user.email?.split('@')[0] || 'Staff Member',
    role: 'staff',
    created_at: new Date().toISOString(),
  };

  return (
    <ProdukClient
      initialProducts={(products as Produk[]) || []}
      profile={activeProfile}
    />
  );
}
