import { cache } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Penjualan } from '@/types/database';

/**
 * Fetches recent sales, wrapped in React's cache() to deduplicate database queries
 * when multiple Server Components on the same page request the same data.
 */
export const getRecentSales = cache(async (supabase: SupabaseClient, limit: number = 7): Promise<Penjualan[]> => {
  const { data, error } = await supabase
    .from('penjualan')
    .select('id, nomor_invoice, total_harga, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent sales:', error);
    return [];
  }

  return (data as Penjualan[]) || [];
});
