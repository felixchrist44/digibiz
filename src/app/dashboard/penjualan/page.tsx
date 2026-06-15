import React from 'react';
import { createClient } from '@/utils/supabase/server';
import PenjualanClient from '@/components/PenjualanClient';
import { Produk } from '@/types/database';

interface PageProps {
  searchParams: Promise<{
    page?: string;
  }>;
}

export default async function PenjualanPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  const params = await searchParams;
  const page = Number(params.page || '1');
  const ITEMS_PER_PAGE = 10;
  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE; // Fetch 11 items to check for Next page

  // Auth is handled by layout.tsx — fetch data immediately without waiting for auth
  const [productsResult, invoicesResult] = await Promise.all([
    supabase
      .from('produk')
      .select('id, nama, kode_produk, harga, stok_saat_ini')
      .order('nama', { ascending: true })
      .limit(12),
    supabase
      .from('penjualan')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .range(from, to)
  ]);

  const rawInvoices = invoicesResult.data || [];
  const hasMore = rawInvoices.length > ITEMS_PER_PAGE;
  const invoices = hasMore ? rawInvoices.slice(0, ITEMS_PER_PAGE) : rawInvoices;
  const products = productsResult.data;

  return (
    <PenjualanClient
      products={(products as Produk[]) || []}
      initialInvoices={(invoices as any[]) || []}
      hasMore={hasMore}
      currentPage={page}
    />
  );
}
