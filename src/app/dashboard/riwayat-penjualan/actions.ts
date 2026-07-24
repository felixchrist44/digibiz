'use server';

import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/utils/supabase/audit';
import { canVoid } from '@/utils/permissions';

export async function nullifyPenjualanAction(penjualanId: string) {
  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user || !profile) {
    return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };
  }

  if (!canVoid(profile.role)) {
    return { error: 'Hanya Owner atau Manager yang berhak membatalkan transaksi.' };
  }

  try {
    const { data, error: rpcError } = await supabase.rpc('nullify_penjualan', {
      p_penjualan_id: penjualanId,
      p_dibuat_oleh: user.id
    });

    if (rpcError) {
      console.error('nullifyPenjualanAction RPC error:', rpcError);
      let errMsg = rpcError.message;
      let code: string | undefined = undefined;

      if (errMsg.includes('Hanya Owner atau Manager')) {
        code = 'UNAUTHORIZED';
        errMsg = 'Hanya Owner atau Manager yang berhak membatalkan transaksi.';
      } else if (errMsg.includes('Transaksi tidak ditemukan')) {
        code = 'SALE_NOT_FOUND';
        errMsg = 'Transaksi tidak ditemukan atau bukan milik toko ini.';
      } else if (errMsg.includes('Tenant ID tidak ditemukan')) {
        code = 'UNAUTHENTICATED';
        errMsg = 'Sesi kedaluwarsa atau Tenant ID tidak ditemukan. Silakan masuk kembali.';
      } else {
        errMsg = 'Gagal membatalkan transaksi karena kesalahan database.';
      }

      return { error: errMsg, code };
    }

    if (!data) {
      return { error: 'Gagal membatalkan transaksi: Transaksi tidak ditemukan.' };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.nomor_invoice) {
      return { error: 'Gagal membatalkan transaksi: Transaksi tidak ditemukan atau tidak valid.' };
    }

    const { nomor_invoice, total_harga } = row;

    // Write audit log entry
    await writeAuditLog(supabase, {
      actor_id: user.id,
      actor_name: profile.full_name || 'Owner',
      action: 'sale_nullify',
      target_type: 'penjualan',
      target_id: penjualanId,
      target_name: nomor_invoice,
      detail: {
        nomor_invoice,
        total_harga: Number(total_harga)
      },
      tenant_id: profile.tenant_id
    });

    revalidatePath('/dashboard/penjualan');
    revalidatePath('/dashboard/produk');
    revalidatePath('/dashboard/stok');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/riwayat-penjualan');

    return {
      success: true,
      nomor_invoice,
      total_harga: Number(total_harga)
    };
  } catch (err: any) {
    console.error('Error in nullifyPenjualanAction system:', err);
    return { error: 'Terjadi kesalahan sistem saat membatalkan transaksi.' };
  }
}
