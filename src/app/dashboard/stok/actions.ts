'use server';

import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/utils/supabase/audit';
import { canManageInventory } from '@/utils/permissions';

export async function adjustStok(formData: FormData) {
  // Use cached auth — eliminates getUser() round-trip
  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user || !profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  if (!canManageInventory(profile.role)) {
    return { error: 'Hanya Owner atau Manager yang berhak melakukan penyesuaian stok manual.' };
  }

  const produk_id = formData.get('produk_id') as string;
  const tipe = formData.get('tipe') as 'masuk' | 'keluar';
  const jumlah = Number(formData.get('jumlah') || 0);
  const keterangan = formData.get('keterangan') as string;

  if (!produk_id || !tipe || jumlah <= 0) {
    return { error: 'Semua kolom wajib diisi dengan benar. Jumlah harus lebih dari 0.' };
  }

  try {
    const { error: txError } = await supabase.rpc('adjust_stock_manual', {
      p_produk_id: produk_id,
      p_tipe: tipe,
      p_jumlah: jumlah,
      p_keterangan: keterangan || 'Penyesuaian stok manual',
      p_dibuat_oleh: user.id
    });

    if (txError) {
      return { error: `Gagal menyesuaikan stok: ${txError.message}` };
    }

    // Fetch product name for target_name in audit log
    const { data: productData } = await supabase
      .from('produk')
      .select('nama')
      .eq('id', produk_id)
      .single();
    const productName = productData?.nama || 'Produk';

    // Write audit log entry
    await writeAuditLog(supabase, {
      actor_id: user.id,
      actor_name: profile.full_name || 'Owner',
      action: 'stock_adjust',
      target_type: 'produk',
      target_id: produk_id,
      target_name: productName,
      detail: {
        tipe,
        jumlah,
        keterangan: keterangan || 'Penyesuaian stok manual'
      },
      tenant_id: profile.tenant_id
    });

    revalidatePath('/dashboard/stok');
    revalidatePath('/dashboard/produk');
    revalidatePath('/dashboard');

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { error: errorMessage || 'Terjadi kesalahan sistem saat memproses transaksi.' };
  }
}

