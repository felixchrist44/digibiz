import React from 'react';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import RiwayatPenjualanClient from '@/components/RiwayatPenjualanClient';

interface PageProps {
  searchParams: Promise<{
    page?: string;
  }>;
}

export default async function RiwayatPenjualanPage({ searchParams }: PageProps) {
  const { profile, supabase } = await getAuthenticatedUser();

  const params = await searchParams;
  const page = Number(params.page || '1');
  const ITEMS_PER_PAGE = 15;
  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE; // Fetch +1 item to check if hasMore is true

  // Fetch sales records with cashier names and item details (including product names)
  const { data: rawInvoices, error } = await supabase
    .from('penjualan')
    .select('*, profiles(full_name), detail_penjualan(id, jumlah, harga_satuan, subtotal, produk(id, nama))')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching penjualan history:', error.message);
  }

  const list = (rawInvoices as any[]) || [];
  const hasMore = list.length > ITEMS_PER_PAGE;
  const invoices = hasMore ? list.slice(0, ITEMS_PER_PAGE) : list;

  return (
    <RiwayatPenjualanClient
      initialInvoices={invoices}
      hasMore={hasMore}
      currentPage={page}
      profile={profile}
    />
  );
}
