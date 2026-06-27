import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import AktivitasClient from '@/components/AktivitasClient';
import { canViewAudit } from '@/utils/permissions';

interface PageProps {
  searchParams: Promise<{
    action?: string;
    page?: string;
  }>;
}

const VALID_ACTIONS = [
  'product_create',
  'product_delete',
  'price_change',
  'cost_change',
  'stock_adjust',
  'role_change',
  'sale_nullify',
  'settings_update',
];

export default async function AktivitasPage({ searchParams }: PageProps) {
  const { profile, supabase } = await getAuthenticatedUser();

  // Owner or Manager page
  if (!profile || !canViewAudit(profile.role)) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const actionFilter =
    params.action && VALID_ACTIONS.includes(params.action) ? params.action : null;
  const page = Number(params.page || '1');
  const ITEMS_PER_PAGE = 15;
  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE; // +1 to detect next page

  let query = supabase
    .from('audit_log')
    .select('id, actor_name, action, target_type, target_id, target_name, detail, created_at')
    .order('created_at', { ascending: false });

  if (actionFilter) {
    query = query.eq('action', actionFilter);
  }

  query = query.range(from, to);

  const { data: rawData, error } = await query;

  if (error) {
    console.error('Failed to fetch audit_log:', error.message);
  }

  const rows = (rawData as any[]) || [];
  const hasMore = rows.length > ITEMS_PER_PAGE;
  const entries = hasMore ? rows.slice(0, ITEMS_PER_PAGE) : rows;

  return (
    <AktivitasClient
      initialEntries={entries}
      activeAction={actionFilter}
      hasMore={hasMore}
      currentPage={page}
    />
  );
}
