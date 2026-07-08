-- Database Migration: Server-side per-tenant daily invoice sequence
-- Location: supabase/invoice_sequence.sql

-- 0. CRITICAL: nomor_invoice was globally UNIQUE (schema.sql), but the sequence
--    below is per-tenant — so every tenant generates INV-<date>-00001 for its
--    first sale of the day. Without this, only the first tenant to sell each
--    day can check out. Re-scope uniqueness to (tenant_id, nomor_invoice).
ALTER TABLE public.penjualan DROP CONSTRAINT IF EXISTS penjualan_nomor_invoice_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_penjualan_tenant_invoice
  ON public.penjualan (tenant_id, nomor_invoice);

-- 1. Counter table for daily sequential numbering per tenant
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tanggal   DATE NOT NULL,
  last_seq  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, tanggal)
);

-- Locking down access to invoice_counters
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_counters FROM authenticated, anon;

-- 2. Redefine process_sale_transaction to automatically generate sequential invoice numbers
CREATE OR REPLACE FUNCTION public.process_sale_transaction(
  p_nomor_invoice TEXT,          -- Dead parameter, kept for client signature compatibility
  p_total_harga NUMERIC,
  p_dibuat_oleh UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_shift_id UUID DEFAULT NULL,
  p_tax_amount NUMERIC DEFAULT 0,
  p_tax_enabled BOOLEAN DEFAULT false,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_penjualan_id UUID;
  v_item RECORD;
  v_harga_modal NUMERIC;
  v_tanggal DATE;
  v_seq INTEGER;
  v_nomor_invoice TEXT;
BEGIN
  -- Securely derive tenant from JWT
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Idempotency PRE-CHECK: return original sale ID if this is a retried submit
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_penjualan_id FROM public.penjualan
    WHERE tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_penjualan_id;
    END IF;
  END IF;

  -- Derive daily invoice sequence (INV-YYYYMMDD-00001 format, per-tenant, WIB timezone)
  v_tanggal := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  INSERT INTO public.invoice_counters (tenant_id, tanggal, last_seq)
  VALUES (v_tenant_id, v_tanggal, 1)
  ON CONFLICT (tenant_id, tanggal)
  DO UPDATE SET last_seq = invoice_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  v_nomor_invoice := 'INV-' || to_char(v_tanggal, 'YYYYMMDD') || '-' || lpad(v_seq::text, 5, '0');

  v_penjualan_id := gen_random_uuid();
  INSERT INTO public.penjualan (
    id, tenant_id, nomor_invoice, total_harga, dibuat_oleh,
    payment_method, shift_id, tax_amount, tax_enabled, idempotency_key
  )
  VALUES (
    v_penjualan_id, v_tenant_id, v_nomor_invoice, p_total_harga, p_dibuat_oleh,
    p_payment_method, p_shift_id, p_tax_amount, p_tax_enabled, p_idempotency_key
  );

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(produk_id UUID, harga_satuan NUMERIC, jumlah INTEGER)
  LOOP
    SELECT COALESCE(harga_modal, 0) INTO v_harga_modal
    FROM public.produk WHERE id = v_item.produk_id AND tenant_id = v_tenant_id;
    v_harga_modal := COALESCE(v_harga_modal, 0);

    INSERT INTO public.detail_penjualan (
      tenant_id, penjualan_id, produk_id, jumlah, harga_satuan, harga_modal_satuan, subtotal
    )
    VALUES (
      v_tenant_id, v_penjualan_id, v_item.produk_id,
      v_item.jumlah, v_item.harga_satuan, v_harga_modal,
      (v_item.harga_satuan * v_item.jumlah)
    );

    INSERT INTO public.stok_log (tenant_id, produk_id, tipe, jumlah, keterangan, dibuat_oleh)
    VALUES (v_tenant_id, v_item.produk_id, 'keluar', v_item.jumlah,
            'POS Checkout: ' || v_nomor_invoice, p_dibuat_oleh);
  END LOOP;

  RETURN v_penjualan_id;

-- Gracefully handle race-condition double-submits
EXCEPTION WHEN unique_violation THEN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_penjualan_id FROM public.penjualan
    WHERE tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;
    RETURN v_penjualan_id;
  END IF;
  RAISE;
END;
$$;
