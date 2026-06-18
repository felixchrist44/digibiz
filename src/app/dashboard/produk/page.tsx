import React from 'react';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import ProdukClient from '@/components/ProdukClient';
import { Produk, Profile } from '@/types/database';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    filter?: string;
  }>;
}

export default async function ProdukPage({ searchParams }: PageProps) {
  // React cache() deduplicates this — layout already called it, so this is free (0ms)
  const { profile, supabase } = await getAuthenticatedUser();

  // Parse parameters
  const params = await searchParams;
  const page = Number(params.page || '1');
  const search = params.search || '';
  const filter = params.filter || 'all';

  const ITEMS_PER_PAGE = 10;
  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE; // Fetch 11 items to check for Next page

  // Build the products query with filters
  let productsQuery = supabase
    .from('produk')
    .select('*');

  if (search) {
    productsQuery = productsQuery.or(`nama.ilike.%${search}%,kode_produk.ilike.%${search}%`);
  }

  if (filter === 'out') {
    productsQuery = productsQuery.eq('stok_saat_ini', 0);
  } else if (filter === 'low') {
    productsQuery = productsQuery.gt('stok_saat_ini', 0).lte('stok_saat_ini', 5);
  } else if (filter === 'available') {
    productsQuery = productsQuery.gt('stok_saat_ini', 5);
  }

  // Fetch products — profile already resolved via cache, no parallel needed
  const productsResult = await productsQuery
    .order('created_at', { ascending: false })
    .range(from, to);

  const rawProducts = productsResult.data || [];
  const hasMore = rawProducts.length > ITEMS_PER_PAGE;
  const products = hasMore ? rawProducts.slice(0, ITEMS_PER_PAGE) : rawProducts;

  // Use cached profile directly — correct user's profile with .eq('id', user.id)
  const activeProfile: Profile = profile || {
    id: '',
    tenant_id: '',
    full_name: 'Staff Member',
    role: 'staff',
    created_at: new Date().toISOString(),
  };

  return (
    <ProdukClient
      initialProducts={(products as Produk[]) || []}
      profile={activeProfile}
      hasMore={hasMore}
      currentPage={page}
    />
  );
}
