import React from 'react';
import { createClient } from '@/utils/supabase/server';
import StokClient from '@/components/StokClient';
import { Produk } from '@/types/database';

interface PageProps {
  searchParams: Promise<{
    page?: string;
  }>;
}

export default async function StokPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  const params = await searchParams;
  const page = Number(params.page || '1');
  const ITEMS_PER_PAGE = 10;
  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE; // Fetch 11 items to check for Next page

  // Auth is handled by layout.tsx — fetch data immediately without waiting for auth
  const [logsResult, productsResult] = await Promise.all([
    supabase
      .from('stok_log')
      .select('*, produk(nama), profiles(full_name)')
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase
      .from('produk')
      .select('id, nama, stok_saat_ini')
      .order('nama', { ascending: true })
      .limit(12)
  ]);

  const rawLogs = logsResult.data || [];
  const hasMore = rawLogs.length > ITEMS_PER_PAGE;
  const logs = hasMore ? rawLogs.slice(0, ITEMS_PER_PAGE) : rawLogs;
  const products = productsResult.data;

  return (
    <StokClient
      initialLogs={(logs as any[]) || []}
      products={(products as Produk[]) || []}
      hasMore={hasMore}
      currentPage={page}
    />
  );
}
