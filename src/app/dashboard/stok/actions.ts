'use server';

import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';

export async function adjustStok(formData: FormData) {
  // Use cached auth — eliminates getUser() round-trip
  const { user, supabase } = await getAuthenticatedUser();
  if (!user) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  const produk_id = formData.get('produk_id') as string;
  const tipe = formData.get('tipe') as 'masuk' | 'keluar';
  const jumlah = Number(formData.get('jumlah') || 0);
  const keterangan = formData.get('keterangan') as string;

  if (!produk_id || !tipe || jumlah <= 0) {
    return { error: 'Semua kolom wajib diisi dengan benar. Jumlah harus lebih dari 0.' };
  }

  // Double check product existence and current stock before reduction
  if (tipe === 'keluar') {
    const { data: product, error: fetchError } = await supabase
      .from('produk')
      .select('stok_saat_ini, nama')
      .eq('id', produk_id)
      .single();

    if (fetchError || !product) {
      return { error: 'Produk tidak ditemukan.' };
    }

    if (product.stok_saat_ini < jumlah) {
      return { error: `Stok tidak mencukupi. Stok saat ini untuk "${product.nama}" adalah ${product.stok_saat_ini} Pcs.` };
    }
  }

  // Insert log
  const { error } = await supabase.from('stok_log').insert({
    produk_id,
    tipe,
    jumlah,
    keterangan: keterangan || 'Penyesuaian stok manual',
    dibuat_oleh: user.id
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard/stok');
  revalidatePath('/dashboard/produk');
  revalidatePath('/dashboard');
  return { success: true };
}
