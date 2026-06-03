'use server';

import { createClient } from '@/utils/supabase/server';
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

  const supabase = await createClient();

  // Retrieve user session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  // Calculate total price
  const total_harga = cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0);

  // Generate unique Invoice Number (e.g. INV-20260603-4819)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const nomor_invoice = `INV-${dateStr}-${randNum}`;

  // Process checkout in sequence (ensure stock check before inserting)
  try {
    // 1. Stock verification for all items
    for (const item of cart) {
      const { data: product, error: fetchError } = await supabase
        .from('produk')
        .select('stok_saat_ini, nama')
        .eq('id', item.id)
        .single();

      if (fetchError || !product) {
        return { error: `Produk "${item.nama}" tidak ditemukan.` };
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

    // 3. Create detail items and stock logs
    for (const item of cart) {
      // Insert detail_penjualan
      const { error: detailError } = await supabase
        .from('detail_penjualan')
        .insert({
          penjualan_id: invoice.id,
          produk_id: item.id,
          jumlah: item.jumlah,
          harga_satuan: item.harga,
          subtotal: item.harga * item.jumlah
        });

      if (detailError) {
        throw new Error(`Gagal menyimpan detail penjualan untuk "${item.nama}": ${detailError.message}`);
      }

      // Insert stok_log (which triggers product table update)
      const { error: logError } = await supabase
        .from('stok_log')
        .insert({
          produk_id: item.id,
          tipe: 'keluar',
          jumlah: item.jumlah,
          keterangan: `Penjualan Invoice ${nomor_invoice}`,
          dibuat_oleh: user.id
        });

      if (logError) {
        throw new Error(`Gagal memperbarui stok untuk "${item.nama}": ${logError.message}`);
      }
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
