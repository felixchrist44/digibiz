'use server';

import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';

interface CartItem {
  id: string; // product id
  nama: string;
  harga: number;
  jumlah: number;
}

export interface OfflineSaleSyncPayload {
  idempotency_key: string;
  items: { produk_id: string; harga_satuan: number; jumlah: number }[];
  total_harga: number;
  tax_amount: number;
  tax_enabled: boolean;
  payment_method: 'cash' | 'qris';
  shift_id: string | null;
  dibuat_oleh: string;
  client_created_at: string;
}

/**
 * Immediate Checkout Action (Online Path).
 * Enforces p_is_offline: false by default to protect payment integrity.
 */
export async function checkoutPenjualan(
  cart: CartItem[],
  payment_method: 'cash' | 'qris' = 'cash',
  shift_id: string | null = null,
  tax_amount: number = 0,
  tax_enabled: boolean = false,
  idempotency_key: string | null = null,
  is_offline: boolean = false,
  client_created_at: string | null = null
) {
  if (cart.length === 0) {
    return { error: 'Keranjang belanja kosong.' };
  }

  // Use cached auth — eliminates getUser() round-trip
  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  // Calculate total price (including tax_amount passed from client)
  const subtotal = cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0);
  const total_harga = subtotal + tax_amount;

  // Generate unique Invoice Number (e.g. INV-20260603-4819)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const nomor_invoice = `INV-${dateStr}-${randNum}`;

  try {
    // Immediate POS checkout always passes p_is_offline: is_offline (false by default)
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
      p_tax_enabled: tax_enabled,
      p_idempotency_key: idempotency_key,
      p_is_offline: is_offline,
      p_client_created_at: client_created_at
    });

    if (txError) {
      let errMsg = txError.message;
      let code: string | undefined = undefined;

      if (errMsg.includes('SHIFT_REQUIRED')) {
        code = 'SHIFT_REQUIRED';
        errMsg = 'Penjualan tunai membutuhkan shift kasir yang aktif.';
      } else if (errMsg.includes('SHIFT_INVALID')) {
        code = 'SHIFT_INVALID';
        errMsg = 'Shift tidak aktif atau bukan milik kasir ini.';
      } else if (errMsg.includes('PRICE_MISMATCH')) {
        code = 'PRICE_MISMATCH';
        errMsg = 'Harga produk di kasir telah berubah. Silakan klik tombol perbarui harga.';
      } else if (errMsg.includes('TAX_MISMATCH')) {
        code = 'TAX_MISMATCH';
        errMsg = 'Pengaturan pajak toko telah berubah. Silakan klik tombol perbarui harga.';
      } else if (errMsg.includes('PRODUK_INVALID')) {
        code = 'PRODUK_INVALID';
        errMsg = 'Produk tidak ditemukan atau tidak aktif di tenant ini.';
      } else if (errMsg.includes('QTY_INVALID')) {
        code = 'QTY_INVALID';
        errMsg = 'Jumlah item harus lebih dari 0.';
      }

      if (code) {
        logger.warn(`Checkout failed: ${errMsg}`, { action: 'checkout', code, tenant_id: profile?.tenant_id });
      } else {
        logger.error(txError, { action: 'checkout', tenant_id: profile?.tenant_id });
      }
      return { error: `Transaksi gagal: ${errMsg}`, code };
    }

    // Fetch authoritative stored truth from the database to align with idempotency-deduplicated retries
    const { data: storedSale, error: fetchError } = await supabase
      .from('penjualan')
      .select('nomor_invoice, total_harga')
      .eq('id', penjualanId)
      .single();

    if (fetchError || !storedSale) {
      const fetchErrMsg = fetchError?.message || 'Data tidak ditemukan.';
      logger.error(`Failed to verify checkout transaction: ${fetchErrMsg}`, { action: 'checkout_verify', tenant_id: profile?.tenant_id });
      return { error: `Gagal memverifikasi transaksi: ${fetchErrMsg}` };
    }

    revalidatePath('/dashboard/penjualan');
    revalidatePath('/dashboard/produk');
    revalidatePath('/dashboard/stok');
    revalidatePath('/dashboard');

    return {
      success: true,
      nomor_invoice: storedSale.nomor_invoice,
      total_harga: Number(storedSale.total_harga),
      invoice_id: penjualanId
    };
  } catch (err: any) {
    logger.error(err, { action: 'checkout_uncaught', tenant_id: profile?.tenant_id });
    return { error: err.message || 'Terjadi kesalahan sistem saat memproses transaksi.' };
  }
}

/**
 * Offline Sync Action (Sync Engine Path).
 * MUST pass p_is_offline: true to allow stale/offline price synchronization.
 * Does NOT classify retryability — returns { error, code } and lets the caller decide.
 */
export async function syncOfflineSale(payload: OfflineSaleSyncPayload) {
  if (!payload.items || payload.items.length === 0) {
    return { error: 'Payload transaksi offline tidak valid (item kosong).', code: 'INVALID_PAYLOAD' };
  }

  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.', code: 'UNAUTHORIZED' };

  try {
    const { data: penjualanId, error: txError } = await supabase.rpc('process_sale_transaction', {
      p_nomor_invoice: 'DUMMY',
      p_total_harga: payload.total_harga,
      p_dibuat_oleh: payload.dibuat_oleh || user.id,
      p_items: payload.items,
      p_payment_method: payload.payment_method,
      p_shift_id: payload.shift_id,
      p_tax_amount: payload.tax_amount,
      p_tax_enabled: payload.tax_enabled,
      p_idempotency_key: payload.idempotency_key,
      p_is_offline: true, // ALWAYS true for offline sync
      p_client_created_at: payload.client_created_at
    });

    if (txError) {
      let errMsg = txError.message;
      let code: string | undefined = undefined;

      if (errMsg.includes('OFFLINE_KEY_REQUIRED')) {
        code = 'OFFLINE_KEY_REQUIRED';
      } else if (errMsg.includes('OFFLINE_TOTAL_INCONSISTENT')) {
        code = 'OFFLINE_TOTAL_INCONSISTENT';
      } else if (errMsg.includes('OFFLINE_VARIANCE_TOO_LARGE')) {
        code = 'OFFLINE_VARIANCE_TOO_LARGE';
      } else if (errMsg.includes('SHIFT_REQUIRED')) {
        code = 'SHIFT_REQUIRED';
      } else if (errMsg.includes('SHIFT_INVALID')) {
        code = 'SHIFT_INVALID';
      } else if (errMsg.includes('PRICE_MISMATCH')) {
        code = 'PRICE_MISMATCH';
      } else if (errMsg.includes('TAX_MISMATCH')) {
        code = 'TAX_MISMATCH';
      } else if (errMsg.includes('PRODUK_INVALID')) {
        code = 'PRODUK_INVALID';
      } else if (errMsg.includes('QTY_INVALID')) {
        code = 'QTY_INVALID';
      }

      logger.warn(`Offline sync failed: ${errMsg}`, { action: 'sync_offline_sale', code, tenant_id: profile?.tenant_id });
      return { error: errMsg, code };
    }

    // Fetch stored sale details (invoice number, etc.)
    const { data: storedSale, error: fetchError } = await supabase
      .from('penjualan')
      .select('nomor_invoice, total_harga, price_variance')
      .eq('id', penjualanId)
      .single();

    if (fetchError || !storedSale) {
      return { error: `Gagal memverifikasi hasil sync: ${fetchError?.message || 'Data tidak ditemukan.'}` };
    }

    revalidatePath('/dashboard/penjualan');
    revalidatePath('/dashboard/riwayat-penjualan');
    revalidatePath('/dashboard/produk');
    revalidatePath('/dashboard/stok');
    revalidatePath('/dashboard');

    return {
      success: true,
      invoice_id: penjualanId,
      nomor_invoice: storedSale.nomor_invoice,
      total_harga: Number(storedSale.total_harga),
      price_variance: storedSale.price_variance
    };
  } catch (err: any) {
    logger.error(err, { action: 'sync_offline_uncaught', tenant_id: profile?.tenant_id });
    return { error: err.message || 'Terjadi kesalahan sistem saat menyelaraskan transaksi offline.' };
  }
}

/**
 * Approve Price Variance Action.
 * Invokes approve_price_variance RPC for Owner/Manager approval.
 */
export async function approveVarianceAction(penjualanId: string) {
  if (!penjualanId) {
    return { error: 'ID Transaksi tidak valid.' };
  }

  const { user, profile, supabase } = await getAuthenticatedUser();
  if (!user) return { error: 'Sesi kedaluwarsa. Silakan masuk kembali.' };

  try {
    const { error: rpcError } = await supabase.rpc('approve_price_variance', {
      p_penjualan_id: penjualanId
    });

    if (rpcError) {
      let errMsg = rpcError.message;
      let code: string | undefined = undefined;

      if (errMsg.includes('VARIANCE_FORBIDDEN')) {
        code = 'VARIANCE_FORBIDDEN';
        errMsg = 'Hanya Owner atau Manager yang berhak menyetujui selisih harga.';
      } else if (errMsg.includes('VARIANCE_NOT_FOUND')) {
        code = 'VARIANCE_NOT_FOUND';
        errMsg = 'Transaksi selisih harga tidak ditemukan atau sudah disetujui.';
      }

      logger.warn(`Approve variance failed: ${errMsg}`, { action: 'approve_variance', code, tenant_id: profile?.tenant_id });
      return { error: errMsg, code };
    }

    revalidatePath('/dashboard/riwayat-penjualan');
    revalidatePath('/dashboard/penjualan');
    revalidatePath('/dashboard/aktivitas');

    return { success: true };
  } catch (err: any) {
    logger.error(err, { action: 'approve_variance_uncaught', tenant_id: profile?.tenant_id });
    return { error: err.message || 'Terjadi kesalahan saat menyetujui selisih harga.' };
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
      if (error.code === 'PGRST116') {
        logger.info('No receipt settings found for tenant (using defaults)', { action: 'get_receipt_settings', code: 'PGRST116', tenant_id: profile.tenant_id });
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
      logger.error(error, { action: 'get_receipt_settings', code: error.code, tenant_id: profile.tenant_id });
      return {
        error: `Gagal mengambil pengaturan struk: ${error.message}`
      };
    }

    return { data };
  } catch (err: any) {
    logger.error(err, { action: 'get_receipt_settings_uncaught', tenant_id: profile?.tenant_id });
    return {
      error: err.message || 'Terjadi kesalahan saat mengambil pengaturan struk.'
    };
  }
}
