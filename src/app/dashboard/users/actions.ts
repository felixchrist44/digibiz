'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/utils/supabase/audit';
import { randomUUID } from 'crypto';
import { headers } from 'next/headers';
import { UserRole } from '@/types/database';
import { canManageUsers } from '@/utils/permissions';

export async function updateUserRole(targetUserId: string, targetRole: UserRole) {
  // Single cached call replaces: verifyOwner() [getUser + profile] + getUser() again = 3 calls → 1
  const { user, profile, supabase } = await getAuthenticatedUser();

  if (!user || !profile || !canManageUsers(profile.role)) {
    return { error: 'Hanya Owner yang berhak mengubah peran pengguna.' };
  }

  if (user.id === targetUserId) {
    return { error: 'Anda tidak dapat mengubah peran Anda sendiri.' };
  }

  const allowedRoles: UserRole[] = ['owner', 'manager', 'staff'];
  if (!allowedRoles.includes(targetRole)) {
    return { error: 'Peran tidak valid.' };
  }

  // BEFORE the update — fetch target name & current role for the snapshot
  const { data: targetProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', targetUserId)
    .single();

  if (fetchError || !targetProfile) {
    return { error: 'Pengguna tidak ditemukan.' };
  }

  const currentRole = targetProfile.role as UserRole;

  const { error } = await supabase
    .from('profiles')
    .update({ role: targetRole })
    .eq('id', targetUserId);

  if (error) {
    return { error: error.message };
  }

  // AFTER the update succeeds, before revalidatePath:
  await writeAuditLog(supabase, {
    actor_id: user.id,
    actor_name: profile.full_name || 'Owner',
    action: 'role_change',
    target_type: 'profile',
    target_id: targetUserId,
    target_name: targetProfile.full_name || 'Pengguna',
    detail: { role: { old: currentRole, new: targetRole } },
    tenant_id: profile.tenant_id,
  });

  revalidatePath('/dashboard/users');
  return { success: true };
}

export async function createInvite(formData: FormData) {
  const { user, profile, supabase } = await getAuthenticatedUser();

  if (!user || !profile) {
    return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };
  }

  if (!canManageUsers(profile.role)) {
    return { error: 'Hanya Owner yang berhak mengundang staff.' };
  }

  const email = formData.get('email') as string;
  const role = (formData.get('role') as string) || 'staff';

  if (!email) {
    return { error: 'Email wajib diisi.' };
  }

  if (role !== 'staff' && role !== 'manager') {
    return { error: 'Peran undangan tidak valid.' };
  }

  const token = 'DB-INV-' + randomUUID();
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Insert into tenant_invites with the configured role
  const { error } = await supabase.from('tenant_invites').insert({
    email,
    token,
    tenant_id: profile.tenant_id,
    expires_at,
    role,
  });

  if (error) {
    return { error: error.message };
  }

  const h = await headers();
  const host = h.get('host');
  const proto = host?.includes('localhost') ? 'http' : 'https';
  const inviteLink = `${proto}://${host}/login?invite=${token}`;

  return {
    success: true,
    token,
    inviteLink,
  };
}
