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

  // Process checkout inside a single database transaction using a Postgres RPC function
  try {
    const { data: penjualanId, error: txError } = await supabase.rpc('process_sale_transaction', {
      p_nomor_invoice: nomor_invoice,
      p_total_harga: total_harga,
      p_dibuat_oleh: user.id,
      p_items: cart.map(item => ({
        produk_id: item.id,
        jumlah: item.jumlah,
        harga_satuan: item.harga
      }))
    });

    if (txError) {
      return { error: `Transaksi gagal: ${txError.message}` };
    }

    revalidatePath('/dashboard/penjualan');
    revalidatePath('/dashboard/produk');
    revalidatePath('/dashboard/stok');
    revalidatePath('/dashboard');

    return {
      success: true,
      nomor_invoice,
      total_harga,
      invoice_id: penjualanId
    };
  } catch (err: any) {
    return { error: err.message || 'Terjadi kesalahan sistem saat memproses transaksi.' };
  }
}
