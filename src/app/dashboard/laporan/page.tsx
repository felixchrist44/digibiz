import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import LaporanClient from '@/components/LaporanClient';
import { Produk, Penjualan } from '@/types/database';

export default async function LaporanPage() {
  const supabase = await createClient();

  // 1. Retrieve session user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch user profile role to restrict access
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    // Restrict access: Redirect non-owner profiles back to main dashboard
    redirect('/dashboard');
  }

  // 3. Query sales invoices with detail items and product info
  const [productsResult, salesResult] = await Promise.all([
    supabase
      .from('produk')
      .select('*')
      .order('nama', { ascending: true }),
    supabase
      .from('penjualan')
      .select('*, profiles(full_name), detail_penjualan(*, produk(*))')
      .order('created_at', { ascending: false })
  ]);

  const products = (productsResult.data as Produk[]) || [];
  const sales = (salesResult.data as any[]) || [];

  return (
    <LaporanClient
      products={products}
      initialSales={sales}
    />
  );
}
