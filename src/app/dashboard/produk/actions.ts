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

  if (profile.role !== 'owner') {
    return { error: 'Hanya Owner yang berhak menambahkan produk baru.' };
  }

  const kode_produk = formData.get('kode_produk') as string;
  const nama = formData.get('nama') as string;
  const deskripsi = formData.get('deskripsi') as string;
  const stok_awal = Number(formData.get('stok_awal') || 0);
  const harga = Number(formData.get('harga') || 0);
  const harga_modal = Number(formData.get('harga_modal') || 0);

  if (!kode_produk || !nama) {
    return { error: 'Kode produk dan nama produk wajib diisi.' };
  }

  // Handle Image Upload
  let gambar_url: string | null = null;
  const imageFile = formData.get('gambar') as File | null;
  if (imageFile && imageFile.size > 0 && imageFile.name) {
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, buffer, {
          contentType: imageFile.type,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        return { error: `Gagal mengunggah gambar: ${uploadError.message}` };
      }

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      gambar_url = urlData.publicUrl;
    } catch (err: any) {
      return { error: `Error upload gambar: ${err.message || err}` };
    }
  }

  // Insert product
  const { data: newProduct, error } = await supabase
    .from('produk')
    .insert({
      kode_produk,
      nama,
      deskripsi: deskripsi || null,
      harga,
      harga_modal,
      stok_saat_ini: stok_awal,
      gambar_url
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
  const inputHargaModal = formData.get('harga_modal') !== null ? Number(formData.get('harga_modal') || 0) : null;

  if (!nama) {
    return { error: 'Nama produk wajib diisi.' };
  }

  // Get current product to verify price change
  const { data: currentProduct, error: fetchError } = await supabase
    .from('produk')
    .select('harga, harga_modal, gambar_url')
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

  // Enforce cost price change protection
  if (inputHargaModal !== null && Number(currentProduct.harga_modal || 0) !== inputHargaModal) {
    if (profile.role !== 'owner') {
      return { error: 'Hanya Owner yang dapat mengubah harga modal produk.' };
    }
    updateData.harga_modal = inputHargaModal;
  }

  // Handle Image Upload if a new file was provided
  const imageFile = formData.get('gambar') as File | null;
  if (imageFile && imageFile.size > 0 && imageFile.name) {
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, buffer, {
          contentType: imageFile.type,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        return { error: `Gagal mengunggah gambar baru: ${uploadError.message}` };
      }

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      updateData.gambar_url = urlData.publicUrl;

      // Optional: Delete old image from storage if it exists to save space
      if (currentProduct.gambar_url) {
        try {
          const oldPath = currentProduct.gambar_url.split('/').pop();
          if (oldPath) {
            await supabase.storage.from('product-images').remove([oldPath]);
          }
        } catch (e) {
          console.error('Gagal menghapus gambar lama:', e);
        }
      }
    } catch (err: any) {
      return { error: `Error upload gambar baru: ${err.message || err}` };
    }
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
