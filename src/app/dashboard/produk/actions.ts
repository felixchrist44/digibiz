'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

async function verifyOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { isOwner: false, userId: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return { isOwner: profile?.role === 'owner', userId: user.id };
}

async function getUserProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}

export async function createProduk(formData: FormData) {
  const supabase = await createClient();
  const profile = await getUserProfile();
  if (!profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  const kode_produk = formData.get('kode_produk') as string;
  const nama = formData.get('nama') as string;
  const deskripsi = formData.get('deskripsi') as string;
  const stok_awal = Number(formData.get('stok_awal') || 0);
  
  // Enforce price change protection: staff can create but price is set to 0 or staff cannot change
  let harga = Number(formData.get('harga') || 0);
  if (profile.role !== 'owner') {
    harga = 0; // staff can only add with 0 price, owner must set it
  }

  if (!kode_produk || !nama) {
    return { error: 'Kode produk dan nama produk wajib diisi.' };
  }

  // Insert product
  const { data: newProduct, error } = await supabase
    .from('produk')
    .insert({
      kode_produk,
      nama,
      deskripsi: deskripsi || null,
      harga,
      stok_saat_ini: stok_awal
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('unique constraint')) {
      return { error: 'Kode produk sudah terdaftar.' };
    }
    return { error: error.message };
  }

  // If there's an initial stock, log it in stock logs!
  if (stok_awal > 0 && newProduct) {
    await supabase.from('stok_log').insert({
      produk_id: newProduct.id,
      tipe: 'masuk',
      jumlah: stok_awal,
      keterangan: 'Stok awal produk baru',
      dibuat_oleh: profile.id
    });
  }

  revalidatePath('/dashboard/produk');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function updateProduk(id: string, formData: FormData) {
  const supabase = await createClient();
  const profile = await getUserProfile();
  if (!profile) return { error: 'Sesi kedaluwarsa.' };

  const nama = formData.get('nama') as string;
  const deskripsi = formData.get('deskripsi') as string;
  const inputHarga = Number(formData.get('harga') || 0);

  if (!nama) {
    return { error: 'Nama produk wajib diisi.' };
  }

  // Get current product to verify price change
  const { data: currentProduct, error: fetchError } = await supabase
    .from('produk')
    .select('harga')
    .eq('id', id)
    .single();

  if (fetchError || !currentProduct) {
    return { error: 'Produk tidak ditemukan.' };
  }

  const updateData: any = {
    nama,
    deskripsi: deskripsi || null
  };

  // Enforce price change protection
  if (Number(currentProduct.harga) !== inputHarga) {
    if (profile.role !== 'owner') {
      return { error: 'Hanya Owner yang dapat mengubah harga produk.' };
    }
    updateData.harga = inputHarga;
  }

  const { error: updateError } = await supabase
    .from('produk')
    .update(updateData)
    .eq('id', id);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath('/dashboard/produk');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteProduk(id: string) {
  const { isOwner } = await verifyOwner();
  if (!isOwner) {
    return { error: 'Hanya Owner yang berhak menghapus produk.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('produk')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard/produk');
  revalidatePath('/dashboard');
  return { success: true };
}
