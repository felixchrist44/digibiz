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

  // Fetch products catalogue
  const { data: products } = await supabase
    .from('produk')
    .select('*')
    .order('nama', { ascending: true });

  // Fetch sales invoices history
  const { data: invoices } = await supabase
    .from('penjualan')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  return (
    <PenjualanClient
      products={(products as Produk[]) || []}
      initialInvoices={(invoices as any[]) || []}
    />
  );
}
