import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import LaporanClient from '@/components/LaporanClient';

interface PageProps {
  searchParams: Promise<{
    range?: string;
    page?: string;
  }>;
}

export default async function LaporanPage({ searchParams }: PageProps) {
  // React cache() deduplicates this — layout already called it, so this is free (0ms)
  const { profile, supabase } = await getAuthenticatedUser();

  // Owner-only page: redirect non-owners back to dashboard
  if (!profile || profile.role !== 'owner') {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const range = params.range || 'month';
  const page = Number(params.page || '1');
  const ITEMS_PER_PAGE = 10;
  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE; // Fetch 11 items to check for Next page

  // 1. Compute date boundaries based on the active filter range
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate: string | null = null;
  let endDate: string | null = null;

  if (range === 'today') {
    startDate = startOfToday.toISOString().split('T')[0];
    endDate = startDate;
  } else if (range === '7days') {
    const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate = sevenDaysAgo.toISOString().split('T')[0];
    endDate = startOfToday.toISOString().split('T')[0];
  } else if (range === '30days') {
    const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate = thirtyDaysAgo.toISOString().split('T')[0];
    endDate = startOfToday.toISOString().split('T')[0];
  } else if (range === 'month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate = startOfMonth.toISOString().split('T')[0];
    endDate = startOfToday.toISOString().split('T')[0];
  }
  // 'all' → no date filters

  // 2. Build summary query on the pre-cached materialized view daily_sales_summary_mv
  const summaryQuery = supabase
    .from('daily_sales_summary_mv')
    .select('tanggal, produk_id, nama_produk, sku_produk, total_terjual, total_pendapatan, total_laba')
    .order('tanggal', { ascending: false });

  if (startDate) {
    summaryQuery.gte('tanggal', startDate);
  }
  if (endDate) {
    summaryQuery.lte('tanggal', endDate);
  }

  // Apply pagination range (fetching 11 items)
  summaryQuery.range(from, to);

  // 3. Execute query — auth already resolved via cache, no parallel profile needed
  const summaryResult = await summaryQuery;

  const rawSummary = (summaryResult.data as any[]) || [];
  const hasMore = rawSummary.length > ITEMS_PER_PAGE;
  const salesSummary = hasMore ? rawSummary.slice(0, ITEMS_PER_PAGE) : rawSummary;

  return (
    <LaporanClient
      initialSummary={salesSummary}
      activeRange={range as any}
      hasMore={hasMore}
      currentPage={page}
    />
  );
}
