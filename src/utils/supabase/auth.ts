import { cache } from 'react';
import { createClient } from './server';
import { Profile } from '@/types/database';

/**
 * Cached auth helper — React's cache() deduplicates this function
 * within a single server request. If layout.tsx and page.tsx both
 * call getAuthenticatedUser(), React executes it only once and
 * returns the memoized result to the second caller.
 *
 * This eliminates duplicate getUser() + profile queries across
 * layout → page → server action within the same render pass.
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, profile: null, supabase };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .eq('id', user.id)
    .single();

  return {
    user,
    profile: profile as Profile | null,
    supabase,
  };
});
