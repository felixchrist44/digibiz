'use server';

import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

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

  // Handle Image Upload with Strict Validation
  let gambar_url: string | null = null;
  let uploadedFilePath: string | null = null;
  const imageFile = formData.get('gambar') as File | null;
  if (imageFile && imageFile.size > 0 && imageFile.name) {
    // 1. Size cap: 2MB
    if (imageFile.size > 2 * 1024 * 1024) {
      return { error: 'Ukuran gambar maksimal 2MB.' };
    }

    // 2. Extension validation
    const fileExt = imageFile.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
    if (!fileExt || !allowedExts.includes(fileExt)) {
      return { error: 'Format gambar tidak valid. Hanya JPG, JPEG, PNG, dan WEBP yang diizinkan.' };
    }

    // 3. MIME mapping (don't trust client-side MIME)
    let mimeType = 'image/jpeg';
    if (fileExt === 'png') mimeType = 'image/png';
    else if (fileExt === 'webp') mimeType = 'image/webp';

    try {
      const fileName = `${randomUUID()}.${fileExt}`;
      const filePath = `${profile.tenant_id}/${fileName}`; // Partitioned by tenant_id

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, imageFile, {
          contentType: mimeType,
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

  const finalKodeProduk = kode_produk?.trim() || '';
  const isGenerated = finalKodeProduk === '';

  // Call the create_produk RPC
  const { error: insertError } = await supabase.rpc('create_produk', {
    p_kode_produk: finalKodeProduk,
    p_nama: nama,
    p_deskripsi: deskripsi || null,
    p_harga: harga,
    p_harga_modal: harga_modal,
    p_stok_awal: stok_awal,
    p_gambar_url: gambar_url,
    p_is_generated: isGenerated
  });

  if (insertError) {
    console.error('createProduk RPC error:', insertError);
    // Cleanup uploaded image on database failure
    if (uploadedFilePath) {
      await supabase.storage.from('product-images').remove([uploadedFilePath]);
    }

    let errMsg = insertError.message;
    let code: string | undefined = undefined;

    if (insertError.code === '23505' || errMsg.includes('unique constraint') || errMsg.includes('produk_tenant_kode_produk_key')) {
      code = 'KODE_DUPLICATE';
      errMsg = 'Kode produk sudah terdaftar.';
    } else if (errMsg.includes(':')) {
      const parts = errMsg.split(':');
      const potentialCode = parts[0].trim();
      if (/^[A-Z0-9_]+$/.test(potentialCode)) {
        code = potentialCode;
        errMsg = parts.slice(1).join(':').trim();
      }
    }

    if (insertError.code && !code && (errMsg.includes('violates') || errMsg.includes('null value') || errMsg.includes('permission denied') || errMsg.includes('relation'))) {
      errMsg = 'Gagal menyimpan produk karena kesalahan database.';
    }

    if (code) {
      logger.warn(`createProduk failed: ${errMsg}`, { action: 'create_produk', code, tenant_id: profile.tenant_id });
    } else {
      logger.error(insertError, { action: 'create_produk', tenant_id: profile.tenant_id });
    }

    return { error: errMsg, code };
  }

  revalidatePath('/dashboard/produk');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function updateProduk(id: string, formData: FormData) {
  const { profile, supabase } = await getAuthenticatedUser();
  if (!profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  // Fetch current product values to manage old image cleanup
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

  // Handle Image Upload with Strict Validation
  const imageFile = formData.get('gambar') as File | null;
  let oldImageToDelete: string | null = null;
  let uploadedFilePath: string | null = null;
  let gambar_url: string | null = null;

  if (imageFile && imageFile.size > 0 && imageFile.name) {
    // 1. Size cap: 2MB
    if (imageFile.size > 2 * 1024 * 1024) {
      return { error: 'Ukuran gambar maksimal 2MB.' };
    }

    // 2. Extension validation
    const fileExt = imageFile.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
    if (!fileExt || !allowedExts.includes(fileExt)) {
      return { error: 'Format gambar tidak valid. Hanya JPG, JPEG, PNG, dan WEBP yang diizinkan.' };
    }

    // 3. MIME mapping (don't trust client-side MIME)
    let mimeType = 'image/jpeg';
    if (fileExt === 'png') mimeType = 'image/png';
    else if (fileExt === 'webp') mimeType = 'image/webp';

    try {
      const fileName = `${randomUUID()}.${fileExt}`;
      const filePath = `${profile.tenant_id}/${fileName}`; // Partitioned by tenant_id

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, imageFile, {
          contentType: mimeType,
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

      gambar_url = urlData.publicUrl;

      if (currentProduct.gambar_url) {
        oldImageToDelete = currentProduct.gambar_url;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { error: `Error upload gambar baru: ${errorMessage}` };
    }
  }

  // Call the update_produk RPC (null fields will be COALESCE'd in database)
  const { error: updateError } = await supabase.rpc('update_produk', {
    p_id: id,
    p_nama: nama,
    p_deskripsi: deskripsi || null,
    p_harga: inputHarga,
    p_harga_modal: inputHargaModal,
    p_gambar_url: gambar_url
  });

  if (updateError) {
    console.error('updateProduk RPC error:', updateError);
    // Cleanup newly uploaded image if database update fails
    if (uploadedFilePath) {
      await supabase.storage.from('product-images').remove([uploadedFilePath]);
    }

    let errMsg = updateError.message;
    let code: string | undefined = undefined;

    if (updateError.code === '23505' || errMsg.includes('unique constraint') || errMsg.includes('produk_tenant_kode_produk_key')) {
      code = 'KODE_DUPLICATE';
      errMsg = 'Kode produk sudah terdaftar.';
    } else if (errMsg.includes(':')) {
      const parts = errMsg.split(':');
      const potentialCode = parts[0].trim();
      if (/^[A-Z0-9_]+$/.test(potentialCode)) {
        code = potentialCode;
        errMsg = parts.slice(1).join(':').trim();
      }
    }

    if (updateError.code && !code && (errMsg.includes('violates') || errMsg.includes('null value') || errMsg.includes('permission denied') || errMsg.includes('relation'))) {
      errMsg = 'Gagal memperbarui produk karena kesalahan database.';
    }

    if (code) {
      logger.warn(`updateProduk failed: ${errMsg}`, { action: 'update_produk', code, tenant_id: profile.tenant_id });
    } else {
      logger.error(updateError, { action: 'update_produk', tenant_id: profile.tenant_id });
    }

    return { error: errMsg, code };
  }

  // Cleanup old image on success
  if (oldImageToDelete) {
    try {
      const oldPath = oldImageToDelete.split('/').slice(-2).join('/'); // Get tenant_id/filename
      if (oldPath) {
        await supabase.storage.from('product-images').remove([oldPath]);
      }
    } catch (e) {
      logger.error(e, { action: 'cleanup_old_product_image', tenant_id: profile.tenant_id });
    }
  }

  revalidatePath('/dashboard/produk');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteProduk(id: string) {
  const { profile, supabase } = await getAuthenticatedUser();
  if (!profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  // Call the delete_produk RPC, which will return the image URL to delete from storage
  const { data: deletedImgUrl, error: deleteError } = await supabase.rpc('delete_produk', {
    p_id: id
  });

  if (deleteError) {
    let errMsg = deleteError.message;
    let code: string | undefined = undefined;

    if (errMsg.includes(':')) {
      const parts = errMsg.split(':');
      const potentialCode = parts[0].trim();
      if (/^[A-Z0-9_]+$/.test(potentialCode)) {
        code = potentialCode;
        errMsg = parts.slice(1).join(':').trim();
      }
    }

    if (deleteError.code && !code && (errMsg.includes('violates') || errMsg.includes('permission denied') || errMsg.includes('relation'))) {
      errMsg = 'Gagal menghapus produk karena kesalahan database.';
    }

    if (code) {
      logger.warn(`deleteProduk failed: ${errMsg}`, { action: 'delete_produk', code, tenant_id: profile.tenant_id });
    } else {
      logger.error(deleteError, { action: 'delete_produk', tenant_id: profile.tenant_id });
    }

    return { error: errMsg, code };
  }

  // Clean up product image from storage
  if (deletedImgUrl) {
    try {
      const fileName = deletedImgUrl.split('/').slice(-2).join('/'); // Get tenant_id/filename
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

