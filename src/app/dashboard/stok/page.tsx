import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import StokClient from '@/components/StokClient';
import { StokLog, Produk } from '@/types/database';

export default async function StokPage() {
  const supabase = await createClient();

  // Retrieve user session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // Fetch stock logs and products in parallel to avoid database query waterfalls
  const [logsResult, productsResult] = await Promise.all([
    supabase
      .from('stok_log')
      .select('*, produk(nama), profiles(full_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('produk')
      .select('*')
      .order('nama', { ascending: true })
  ]);

  const logs = logsResult.data;
  const products = productsResult.data;

  return (
    <StokClient
      initialLogs={(logs as any[]) || []}
      products={(products as Produk[]) || []}
    />
  );
}
