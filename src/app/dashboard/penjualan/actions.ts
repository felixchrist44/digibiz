'use server';

import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';

interface CartItem {
  id: string; // product id
  nama: string;
  harga: number;
  jumlah: number;
}

export async function checkoutPenjualan(cart: CartItem[]) {
  if (cart.length === 0) {
    return { error: 'Keranjang belanja kosong.' };
  }

  // Use cached auth — eliminates getUser() round-trip
  const { user, supabase } = await getAuthenticatedUser();
  if (!user) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  // Calculate total price
  const total_harga = cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0);

  // Generate unique Invoice Number (e.g. INV-20260603-4819)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const nomor_invoice = `INV-${dateStr}-${randNum}`;

  // Process checkout optimizing network requests by fetching products and inserting details in bulk
  try {
    // 1. Stock verification for all items in a single bulk query
    const productIds = cart.map(item => item.id);
    const { data: products, error: fetchError } = await supabase
      .from('produk')
      .select('id, stok_saat_ini, nama')
      .in('id', productIds);

    if (fetchError || !products) {
      return { error: `Gagal memverifikasi stok produk: ${fetchError?.message || 'Produk tidak ditemukan'}` };
    }

    const productMap = new Map(products.map(p => [p.id, p]));

    for (const item of cart) {
      const product = productMap.get(item.id);
      if (!product) {
        return { error: `Produk "${item.nama}" tidak ditemukan di database.` };
      }
      if (product.stok_saat_ini < item.jumlah) {
        return { error: `Stok tidak mencukupi untuk "${item.nama}". Stok saat ini: ${product.stok_saat_ini} Pcs, diminta: ${item.jumlah} Pcs.` };
      }
    }

    // 2. Create invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from('penjualan')
      .insert({
        nomor_invoice,
        total_harga,
        dibuat_oleh: user.id
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      return { error: `Gagal membuat invoice: ${invoiceError?.message}` };
    }

    // 3. Bulk insert detail items
    const detailInserts = cart.map(item => ({
      penjualan_id: invoice.id,
      produk_id: item.id,
      jumlah: item.jumlah,
      harga_satuan: item.harga,
      subtotal: item.harga * item.jumlah
    }));

    const { error: detailError } = await supabase
      .from('detail_penjualan')
      .insert(detailInserts);

    if (detailError) {
      throw new Error(`Gagal menyimpan detail penjualan: ${detailError.message}`);
    }

    // 4. Bulk insert stock logs
    const logInserts = cart.map(item => ({
      produk_id: item.id,
      tipe: 'keluar',
      jumlah: item.jumlah,
      keterangan: `Penjualan Invoice ${nomor_invoice}`,
      dibuat_oleh: user.id
    }));

    const { error: logError } = await supabase
      .from('stok_log')
      .insert(logInserts);

    if (logError) {
      throw new Error(`Gagal memperbarui stok: ${logError.message}`);
    }

    revalidatePath('/dashboard/penjualan');
    revalidatePath('/dashboard/produk');
    revalidatePath('/dashboard/stok');
    revalidatePath('/dashboard');

    return {
      success: true,
      nomor_invoice,
      total_harga,
      invoice_id: invoice.id
    };
  } catch (err: any) {
    return { error: err.message || 'Terjadi kesalahan sistem saat memproses transaksi.' };
  }
}
