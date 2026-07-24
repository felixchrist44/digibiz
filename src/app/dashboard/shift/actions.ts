'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/utils/supabase/audit';
import { canManageShifts } from '@/utils/permissions';
import { logger } from '@/lib/logger';

export async function openShift(formData: FormData) {
  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user || !profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  if (!canManageShifts(profile.role)) {
    logger.warn('Unauthorized openShift attempt', { action: 'open_shift', code: 'UNAUTHORIZED', tenant_id: profile.tenant_id });
    return { error: 'Hanya Owner atau Manager yang berhak membuka shift.' };
  }

  const cashier_id = formData.get('cashier_id') as string;
  const cashier_name = formData.get('cashier_name') as string;
  const opening_cash = Number(formData.get('opening_cash') || 0);

  if (!cashier_id || !cashier_name) {
    return { error: 'Kasir dan nama kasir wajib diisi.' };
  }

  try {
    const { data: shiftId, error: rpcError } = await supabase.rpc('open_shift', {
      p_cashier_id: cashier_id,
      p_cashier_name: cashier_name,
      p_opening_cash: opening_cash
    });

    if (rpcError) {
      let errMsg = rpcError.message;
      let code: string | undefined = undefined;

      if (rpcError.code === '23505' || errMsg.includes('unique_active_cashier_shift')) {
        code = 'CASHIER_SHIFT_ACTIVE';
        errMsg = 'Kasir ini masih memiliki shift yang aktif. Harap tutup shift sebelumnya terlebih dahulu.';
      } else if (errMsg.includes('Hanya Owner atau Manager')) {
        code = 'UNAUTHORIZED';
        errMsg = 'Hanya Owner atau Manager yang berhak membuka shift.';
      }

      if (code) {
        logger.warn(`openShift failed: ${errMsg}`, { action: 'open_shift', code, tenant_id: profile.tenant_id });
      } else {
        logger.error(rpcError, { action: 'open_shift', tenant_id: profile.tenant_id });
        errMsg = 'Gagal membuka shift karena kesalahan database.';
      }

      return { error: errMsg, code };
    }

    // Write audit log entry
    await writeAuditLog(supabase, {
      actor_id: user.id,
      actor_name: profile.full_name || 'Owner/Manager',
      action: 'shift_open',
      target_type: 'kasir_shift',
      target_id: shiftId,
      target_name: cashier_name,
      detail: { opening_cash, cashier_id },
      tenant_id: profile.tenant_id
    });

    revalidatePath('/dashboard/laporan');
    return { success: true, shiftId };
  } catch (err: any) {
    logger.error(err, { action: 'open_shift_uncaught', tenant_id: profile?.tenant_id });
    return { error: 'Terjadi kesalahan internal server saat membuka shift.' };
  }
}

export async function closeShift(formData: FormData) {
  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user || !profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  if (!canManageShifts(profile.role)) {
    logger.warn('Unauthorized closeShift attempt', { action: 'close_shift', code: 'UNAUTHORIZED', tenant_id: profile.tenant_id });
    return { error: 'Hanya Owner atau Manager yang berhak menutup shift.' };
  }

  const shift_id = formData.get('shift_id') as string;
  const closing_cash = Number(formData.get('closing_cash') || 0);
  const closing_qris = Number(formData.get('closing_qris') || 0);
  const notes = formData.get('notes') as string || '';

  if (!shift_id) {
    return { error: 'Shift ID wajib diisi.' };
  }

  try {
    const { data: shiftRecord } = await supabase
      .from('kasir_shift')
      .select('cashier_name, cashier_id')
      .eq('id', shift_id)
      .single();

    const { error: rpcError } = await supabase.rpc('close_shift', {
      p_shift_id: shift_id,
      p_closing_cash: closing_cash,
      p_closing_qris: closing_qris,
      p_notes: notes || null
    });

    if (rpcError) {
      let errMsg = rpcError.message;
      let code: string | undefined = undefined;

      if (errMsg.includes('Hanya Owner atau Manager')) {
        code = 'UNAUTHORIZED';
        errMsg = 'Hanya Owner atau Manager yang berhak menutup shift.';
      } else if (errMsg.includes('Shift tidak ditemukan atau sudah ditutup')) {
        code = 'SHIFT_NOT_FOUND_OR_CLOSED';
        errMsg = 'Shift tidak ditemukan atau sudah ditutup.';
      }

      if (code) {
        logger.warn(`closeShift failed: ${errMsg}`, { action: 'close_shift', code, tenant_id: profile.tenant_id });
      } else {
        logger.error(rpcError, { action: 'close_shift', tenant_id: profile.tenant_id });
        errMsg = 'Gagal menutup shift karena kesalahan database.';
      }

      return { error: errMsg, code };
    }

    await writeAuditLog(supabase, {
      actor_id: user.id,
      actor_name: profile.full_name || 'Owner/Manager',
      action: 'shift_close',
      target_type: 'kasir_shift',
      target_id: shift_id,
      target_name: shiftRecord?.cashier_name || 'Kasir',
      detail: { closing_cash, closing_qris, notes, cashier_id: shiftRecord?.cashier_id },
      tenant_id: profile.tenant_id
    });

    revalidatePath('/dashboard/laporan');
    return { success: true };
  } catch (err: any) {
    logger.error(err, { action: 'close_shift_uncaught', tenant_id: profile?.tenant_id });
    return { error: 'Terjadi kesalahan internal server saat menutup shift.' };
  }
}

export async function getActiveShifts() {
  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user || !profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  const { data, error } = await supabase
    .from('kasir_shift')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'open')
    .order('opened_at', { ascending: false });

  if (error) {
    logger.error(error, { action: 'get_active_shifts', tenant_id: profile.tenant_id });
    return { error: 'Gagal memuat daftar shift aktif.' };
  }
  return { data };
}

export async function getShiftHistory(page: number = 1) {
  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user || !profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  const pageSize = 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('kasir_shift')
    .select('*', { count: 'exact' })
    .eq('tenant_id', profile.tenant_id)
    .neq('status', 'open')
    .order('opened_at', { ascending: false })
    .range(from, to);

  if (error) {
    logger.error(error, { action: 'get_shift_history', tenant_id: profile.tenant_id });
    return { error: 'Gagal memuat riwayat shift.' };
  }
  return { data, count, pageSize };
}
