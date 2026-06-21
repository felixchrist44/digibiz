'use server';

import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

export async function createProduk(formData: FormData) {
  const { profile, supabase } = await getAuthenticatedUser();
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

  if (!nama) {
    return { error: 'Nama produk wajib diisi.' };
  }

  // Handle Image Upload
  let gambar_url: string | null = null;
  let uploadedFilePath: string | null = null;
  const imageFile = formData.get('gambar') as File | null;
  if (imageFile && imageFile.size > 0 && imageFile.name) {
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${randomUUID()}.${fileExt}`;
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

      uploadedFilePath = filePath;
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      gambar_url = urlData.publicUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { error: `Error upload gambar: ${errorMessage}` };
    }
  }

  let finalKodeProduk = kode_produk?.trim() || '';
  const isGenerated = finalKodeProduk === '';
  let newProduct = null;
  let insertError = null;

  if (isGenerated) {
    let retries = 5;
    while (retries > 0) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let barcodeStr = '';
      for (let i = 0; i < 8; i++) {
        barcodeStr += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      finalKodeProduk = `DB-${barcodeStr}`;

      const { data, error } = await supabase
        .from('produk')
        .insert({
          kode_produk: finalKodeProduk,
          nama,
          deskripsi: deskripsi || null,
          harga,
          harga_modal,
          stok_saat_ini: stok_awal,
          gambar_url,
          is_generated: true
        })
        .select()
        .single();

      if (!error) {
        newProduct = data;
        insertError = null;
        break;
      }

      insertError = error;
      const isUniqueViolation = error.code === '23505' || 
                                error.message?.toLowerCase().includes('unique') || 
                                error.message?.toLowerCase().includes('duplicate');
      if (!isUniqueViolation) {
        break;
      }
      retries--;
    }
  } else {
    const { data, error } = await supabase
      .from('produk')
      .insert({
        kode_produk: finalKodeProduk,
        nama,
        deskripsi: deskripsi || null,
        harga,
        harga_modal,
        stok_saat_ini: stok_awal,
        gambar_url,
        is_generated: false
      })
      .select()
      .single();

    newProduct = data;
    insertError = error;
  }

  if (insertError) {
    // Cleanup orphaned image if database insert fails
    if (uploadedFilePath) {
      await supabase.storage.from('product-images').remove([uploadedFilePath]);
    }
    if (insertError.message.includes('unique constraint') || insertError.code === '23505') {
      return { error: 'Kode produk sudah terdaftar.' };
    }
    return { error: insertError.message };
  }

  // If there's an initial stock, log it in stock logs!
  if (stok_awal > 0 && newProduct) {
    const { error: logError } = await supabase.from('stok_log').insert({
      produk_id: newProduct.id,
      tipe: 'masuk',
      jumlah: stok_awal,
      keterangan: 'Stok awal produk baru',
      dibuat_oleh: profile.id
    });

    if (logError) {
      console.error('Gagal memasukkan stok_log awal:', logError.message);
      // Rollback: Delete the product and cleanup the uploaded image
      await supabase.from('produk').delete().eq('id', newProduct.id);
      if (uploadedFilePath) {
        await supabase.storage.from('product-images').remove([uploadedFilePath]);
      }
      return { error: `Gagal mencatat stok awal: ${logError.message}` };
    }
  }

  revalidatePath('/dashboard/produk');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function updateProduk(id: string, formData: FormData) {
  const { profile, supabase } = await getAuthenticatedUser();
  if (!profile) return { error: 'Sesi kedaluwarsa.' };

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

  const updateData: {
    nama: string;
    deskripsi: string | null;
    harga?: number;
    harga_modal?: number | null;
    gambar_url?: string;
  } = {
    nama,
    deskripsi: deskripsi || null
  };

  if (Number(currentProduct.harga) !== inputHarga) {
    if (profile.role !== 'owner') {
      return { error: 'Hanya Owner yang dapat mengubah harga produk.' };
    }
    updateData.harga = inputHarga;
  }

  if (inputHargaModal !== null && Number(currentProduct.harga_modal || 0) !== inputHargaModal) {
    if (profile.role !== 'owner') {
      return { error: 'Hanya Owner yang dapat mengubah harga modal produk.' };
    }
    updateData.harga_modal = inputHargaModal;
  }

  const imageFile = formData.get('gambar') as File | null;
  let oldImageToDelete: string | null = null;
  let uploadedFilePath: string | null = null;

  if (imageFile && imageFile.size > 0 && imageFile.name) {
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${randomUUID()}.${fileExt}`;
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

      uploadedFilePath = filePath;
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      updateData.gambar_url = urlData.publicUrl;

      if (currentProduct.gambar_url) {
        oldImageToDelete = currentProduct.gambar_url;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { error: `Error upload gambar baru: ${errorMessage}` };
    }
  }

  const { error: updateError } = await supabase
    .from('produk')
    .update(updateData)
    .eq('id', id);

  if (updateError) {
    // Cleanup new uploaded image if database update fails
    if (uploadedFilePath) {
      await supabase.storage.from('product-images').remove([uploadedFilePath]);
    }
    return { error: updateError.message };
  }

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
  const { profile, supabase } = await getAuthenticatedUser();
  if (!profile || profile.role !== 'owner') {
    return { error: 'Hanya Owner yang berhak menghapus produk.' };
  }

  const { data: product, error: fetchError } = await supabase
    .from('produk')
    .select('gambar_url')
    .eq('id', id)
    .single();

  if (fetchError || !product) {
    return { error: 'Produk tidak ditemukan.' };
  }

  const { error: deleteError } = await supabase
    .from('produk')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return { error: deleteError.message };
  }

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
