import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import LaporanClient from '@/components/LaporanClient';
import { canViewFinancials } from '@/utils/permissions';

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
  if (!profile || !canViewFinancials(profile.role)) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const range = params.range || 'month';
  const page = Number(params.page || '1');
  const ITEMS_PER_PAGE = 10;
  const from = (page - 1) * ITEMS_PER_PAGE;
  // Fetch 11 items (inclusive range) to detect if a next page exists with zero COUNT(*) overhead
  const to = from + ITEMS_PER_PAGE;

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

  // 2. Build summary query on the appropriate view
  let summaryQuery;
  
  if (range === 'all') {
    // Query monthly sales aggregates from the monthly_sales_summary view for faster load
    summaryQuery = supabase
      .from('monthly_sales_summary')
      .select('bulan, total_terjual, total_pendapatan, total_laba')
      .order('bulan', { ascending: false });
  } else {
    // Query daily detailed sales from the pre-cached materialized view daily_sales_summary_mv
    summaryQuery = supabase
      .from('daily_sales_summary_mv')
      .select('tanggal, produk_id, nama_produk, sku_produk, total_terjual, total_pendapatan, total_laba')
      .order('tanggal', { ascending: false });

    if (startDate) {
      summaryQuery = summaryQuery.gte('tanggal', startDate);
    }
    if (endDate) {
      summaryQuery = summaryQuery.lte('tanggal', endDate);
    }
  }

  // Apply pagination range (fetching 11 items to detect hasMore with zero COUNT(*) overhead)
  summaryQuery = summaryQuery.range(from, to);

  // 3. Execute query — auth already resolved via cache, no parallel profile needed
  const { data: rawSummaryData, error: summaryError } = await summaryQuery;

  if (summaryError) {
    console.error(`Failed to fetch sales summary from ${range === 'all' ? 'monthly_sales_summary' : 'daily_sales_summary_mv'}:`, summaryError.message);
  }

  let rawSummary = (rawSummaryData as any[]) || [];

  // If range is 'all', map the monthly schema format to SummaryItem interface format
  if (range === 'all') {
    rawSummary = rawSummary.map((item) => ({
      tanggal: item.bulan,
      produk_id: 'monthly-aggregate',
      nama_produk: '',
      sku_produk: '',
      total_terjual: item.total_terjual || 0,
      total_pendapatan: item.total_pendapatan || 0,
      total_laba: item.total_laba || 0,
    }));
  }

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
