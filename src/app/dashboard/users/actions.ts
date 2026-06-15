'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';

export async function toggleUserRole(targetUserId: string, currentRole: 'owner' | 'staff') {
  // Single cached call replaces: verifyOwner() [getUser + profile] + getUser() again = 3 calls → 1
  const { user, profile, supabase } = await getAuthenticatedUser();

  if (!user || !profile || profile.role !== 'owner') {
    return { error: 'Hanya Owner yang berhak mengubah peran pengguna.' };
  }

  if (user.id === targetUserId) {
    return { error: 'Anda tidak dapat mengubah peran Anda sendiri.' };
  }

  const newRole = currentRole === 'owner' ? 'staff' : 'owner';

  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', targetUserId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard/users');
  return { success: true };
}
