import { cache } from 'react';
import { createClient } from './server';
import { Profile, UserRole } from '@/types/database';
import { headers } from 'next/headers';

/**
 * Cached auth helper — React's cache() deduplicates this function
 * within a single server request. If layout.tsx and page.tsx both
 * call getAuthenticatedUser(), React executes it only once.
 *
 * Optimization: This function first checks if user and profile data
 * were already fetched and injected into the request headers by the proxy.
 * If present, it skips the slow Supabase Auth & Database roundtrips.
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient();

  try {
    const headersList = await headers();
    const userId = headersList.get('x-user-id');

    if (userId) {
      const email = headersList.get('x-user-email') || '';
      const fullName = headersList.get('x-user-full-name') || '';
      const role = headersList.get('x-user-role') || 'staff';
      const createdAt = headersList.get('x-user-created-at') || '';
      const tenantId = headersList.get('x-user-tenant-id') || '';

      const user = {
        id: userId,
        email: email,
      } as any;

      const profile: Profile = {
        id: userId,
        tenant_id: tenantId,
        full_name: fullName,
        role: role as UserRole,
        created_at: createdAt,
      };

      return {
        user,
        profile,
        supabase,
      };
    }
  } catch (error) {
    // headers() might throw during static site generation or build time.
    // Fall back to direct fetching if that happens.
  }

  // Fallback: Direct network queries if headers are missing
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, profile: null, supabase };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, tenant_id, full_name, role, created_at')
    .eq('id', user.id)
    .single();

  return {
    user,
    profile: profile as Profile | null,
    supabase,
  };
});
