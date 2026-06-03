'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

async function verifyOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'owner';
}

export async function toggleUserRole(targetUserId: string, currentRole: 'owner' | 'staff') {
  const isOwner = await verifyOwner();
  if (!isOwner) {
    return { error: 'Hanya Owner yang berhak mengubah peran pengguna.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === targetUserId) {
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
