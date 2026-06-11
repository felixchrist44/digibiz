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

  // 2. Query user profile role, products, and sales concurrently to eliminate waterfalls
  const [profileResult, productsResult, salesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('produk')
      .select('id, nama, kode_produk, harga, harga_modal')
      .order('nama', { ascending: true }),
    supabase
      .from('penjualan')
      .select('id, nomor_invoice, total_harga, created_at, profiles(full_name), detail_penjualan(id, jumlah, harga_satuan, subtotal, produk_id, produk(nama, harga_modal))')
      .order('created_at', { ascending: false })
  ]);

  // 3. Enforce server-side authorization check immediately
  const profile = profileResult.data;
  if (!profile || profile.role !== 'owner') {
    redirect('/dashboard');
  }

  const products = (productsResult.data as Produk[]) || [];
  const sales = (salesResult.data as any[]) || [];

  return (
    <LaporanClient
      products={products}
      initialSales={sales}
    />
  );
}
