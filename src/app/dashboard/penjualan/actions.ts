'use server';

import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';

interface CartItem {
  id: string; // product id
  nama: string;
  harga: number;
  jumlah: number;
}

export async function checkoutPenjualan(
  cart: CartItem[],
  payment_method: 'cash' | 'qris' = 'cash',
  shift_id: string | null = null,
  tax_amount: number = 0,
  tax_enabled: boolean = false
) {
  if (cart.length === 0) {
    return { error: 'Keranjang belanja kosong.' };
  }

  // Use cached auth — eliminates getUser() round-trip
  const { user, supabase } = await getAuthenticatedUser();
  if (!user) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  // Calculate total price (including tax_amount passed from client)
  const subtotal = cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0);
  const total_harga = subtotal + tax_amount;

  // Generate unique Invoice Number (e.g. INV-20260603-4819)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const nomor_invoice = `INV-${dateStr}-${randNum}`;

  // p_total_harga = subtotal + tax_amount (tax-inclusive, actual amount collected)
  // p_tax_amount stored separately so pre-tax subtotal = total_harga - tax_amount
  try {
    const { data: penjualanId, error: txError } = await supabase.rpc('process_sale_transaction', {
      p_nomor_invoice: nomor_invoice,
      p_total_harga: total_harga,
      p_dibuat_oleh: user.id,
      p_items: cart.map(item => ({
        produk_id: item.id,
        jumlah: item.jumlah,
        harga_satuan: item.harga
      })),
      p_payment_method: payment_method,
      p_shift_id: shift_id,
      p_tax_amount: tax_amount,
      p_tax_enabled: tax_enabled
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

export async function getReceiptSettings() {
  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user || !profile) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  try {
    const { data, error } = await supabase
      .from('tenant_settings')
      .select('store_name, store_address, receipt_header, receipt_footer, tax_enabled, tax_rate')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (error) {
      return {
        data: {
          store_name: 'Toko DigiBiz',
          store_address: null,
          receipt_header: null,
          receipt_footer: null,
          tax_enabled: false,
          tax_rate: 0
        }
      };
    }

    return { data };
  } catch (err: any) {
    return {
      error: err.message || 'Terjadi kesalahan saat mengambil pengaturan struk.'
    };
  }
}
