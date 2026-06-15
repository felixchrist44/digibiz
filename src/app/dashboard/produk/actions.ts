'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';

export async function getUserAuthDetails() {
  const { profile } = await getAuthenticatedUser();
  if (!profile) return null;
  return { id: profile.id, role: profile.role };
}

async function verifyOwner() {
  const profile = await getUserAuthDetails();
  return { isOwner: profile?.role === 'owner', userId: profile?.id || null };
}

export async function createProduk(formData: FormData) {
  const supabase = await createClient();
  const profile = await getUserAuthDetails();
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
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, imageFile, {
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
  // Use cached auth — eliminates getUser() + profile query waterfall
  const { profile, supabase } = await getAuthenticatedUser();
  if (!profile) return { error: 'Sesi kedaluwarsa.' };

  // Only product query needed — profile already cached
  const { data: currentProduct, error: fetchError } = await supabase
    .from('produk')
    .select('harga, harga_modal, gambar_url')
    .eq('id', id)
    .single();

  if (fetchError || !currentProduct) {
    return { error: 'Produk tidak ditemukan.' };
  }

  const nama = formData.get('nama') as string;
  const deskripsi = formData.get('deskripsi') as string;
  const inputHarga = Number(formData.get('harga') || 0);
  const inputHargaModal = formData.get('harga_modal') !== null ? Number(formData.get('harga_modal') || 0) : null;

  if (!nama) {
    return { error: 'Nama produk wajib diisi.' };
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

  // Handle Image Upload if a new file was provided, avoiding Buffer overhead by uploading the File object directly
  const imageFile = formData.get('gambar') as File | null;
  let oldImageToDelete: string | null = null;

  if (imageFile && imageFile.size > 0 && imageFile.name) {
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, imageFile, {
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

      // Mark the old image to delete on database update success
      if (currentProduct.gambar_url) {
        oldImageToDelete = currentProduct.gambar_url;
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
    // If the database update fails, we do not delete the old image.
    // The new uploaded image remains in storage and will be pruned by the cron sweep.
    return { error: updateError.message };
  }

  // Database update succeeded! Now safely clean up the old image from storage to save space
  if (oldImageToDelete) {
    try {
      const oldPath = oldImageToDelete.split('/').pop();
      if (oldPath) {
        await supabase.storage.from('product-images').remove([oldPath]);
      }
    } catch (e) {
      console.error('Gagal menghapus gambar lama:', e);
    }
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

  // Fetch the product details first to get the gambar_url
  const { data: product, error: fetchError } = await supabase
    .from('produk')
    .select('gambar_url')
    .eq('id', id)
    .single();

  if (fetchError || !product) {
    return { error: 'Produk tidak ditemukan.' };
  }

  // Delete product row from the database
  const { error: deleteError } = await supabase
    .from('produk')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return { error: deleteError.message };
  }

  // Database delete succeeded! Now safely clean up the product image from storage
  if (product.gambar_url) {
    try {
      const fileName = product.gambar_url.split('/').pop();
      if (fileName) {
        await supabase.storage.from('product-images').remove([fileName]);
      }
    } catch (e) {
      console.error('Gagal menghapus gambar produk dari storage:', e);
    }
  }

  revalidatePath('/dashboard/produk');
  revalidatePath('/dashboard');
  return { success: true };
}

