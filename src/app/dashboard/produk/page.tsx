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

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // Fallback profile if not found in db yet
  const activeProfile: Profile = profile || {
    id: user.id,
    full_name: user.email?.split('@')[0] || 'Staff Member',
    role: 'staff',
    created_at: new Date().toISOString(),
  };

  // Fetch products
  const { data: products } = await supabase
    .from('produk')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <ProdukClient
      initialProducts={(products as Produk[]) || []}
      profile={activeProfile}
    />
  );
}
