import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import PenjualanClient from '@/components/PenjualanClient';
import { Produk, Penjualan } from '@/types/database';

export default async function PenjualanPage() {
  const supabase = await createClient();

  // Retrieve user session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // Fetch products and sales invoices history in parallel to avoid waterfalls
  const [productsResult, invoicesResult] = await Promise.all([
    supabase
      .from('produk')
      .select('*')
      .order('nama', { ascending: true }),
    supabase
      .from('penjualan')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
  ]);

  const products = productsResult.data;
  const invoices = invoicesResult.data;

  return (
    <PenjualanClient
      products={(products as Produk[]) || []}
      initialInvoices={(invoices as any[]) || []}
    />
  );
}
