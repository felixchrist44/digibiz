-- Database Migration: Enforce Server-Side Payment Integrity
-- Location: supabase/payment_integrity.sql

BEGIN;

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
  v_harga_jual NUMERIC;
  v_harga_modal NUMERIC;
  v_tanggal DATE;
  v_seq INTEGER;
  v_nomor_invoice TEXT;
  v_shift_ok BOOLEAN;
  v_subtotal NUMERIC := 0;
  v_tax_amount NUMERIC := 0;
  v_total_harga NUMERIC := 0;
  v_tax_enabled BOOLEAN;
  v_tax_rate NUMERIC;
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

  -- Cashier Shift Gating for Cash Sales
  IF p_payment_method = 'cash' THEN
    IF p_shift_id IS NULL THEN
      RAISE EXCEPTION 'SHIFT_REQUIRED: Penjualan tunai membutuhkan shift kasir yang aktif.';
    END IF;

    SELECT true INTO v_shift_ok
    FROM public.kasir_shift
    WHERE id = p_shift_id
      AND tenant_id = v_tenant_id
      AND cashier_id = auth.uid()
      AND status = 'open';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SHIFT_INVALID: Shift tidak aktif atau bukan milik kasir ini.';
    END IF;
  END IF;

  -- Fetch tenant tax configuration
  SELECT tax_enabled, tax_rate INTO v_tax_enabled, v_tax_rate
  FROM public.tenant_settings
  WHERE tenant_id = v_tenant_id;
  
  v_tax_enabled := COALESCE(v_tax_enabled, false);
  v_tax_rate := COALESCE(v_tax_rate, 0);

  -- Loop 1: Recalculate subtotal and validate product prices server-side
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(produk_id UUID, harga_satuan NUMERIC, jumlah INTEGER)
  LOOP
    SELECT harga, COALESCE(harga_modal, 0)
    INTO v_harga_jual, v_harga_modal
    FROM public.produk
    WHERE id = v_item.produk_id AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUK_INVALID: Produk tidak ditemukan di tenant ini.';
    END IF;

    v_subtotal := v_subtotal + (v_harga_jual * v_item.jumlah);
  END LOOP;

  -- Recalculate tax server-side if tax toggle was active on client and enabled store-wide
  IF p_tax_enabled AND v_tax_enabled THEN
    v_tax_amount := round(v_subtotal * (v_tax_rate / 100.0));
  ELSE
    v_tax_amount := 0;
  END IF;

  v_total_harga := v_subtotal + v_tax_amount;

  -- Enforce Payment Integrity: Reject transaction if total or tax doesn't match server truth
  IF p_total_harga IS DISTINCT FROM v_total_harga THEN
    RAISE EXCEPTION 'PRICE_MISMATCH: Total harga transaksi (%) tidak sesuai dengan perhitungan server (%).', p_total_harga, v_total_harga;
  END IF;

  IF p_tax_amount IS DISTINCT FROM v_tax_amount THEN
    RAISE EXCEPTION 'TAX_MISMATCH: Jumlah pajak (%) tidak sesuai dengan perhitungan server (%).', p_tax_amount, v_tax_amount;
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
    v_penjualan_id, v_tenant_id, v_nomor_invoice, v_total_harga, p_dibuat_oleh,
    p_payment_method, p_shift_id, v_tax_amount, p_tax_enabled, p_idempotency_key
  );

  -- Loop 2: Insert transaction detail items and record stock movements
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(produk_id UUID, harga_satuan NUMERIC, jumlah INTEGER)
  LOOP
    SELECT harga, COALESCE(harga_modal, 0)
    INTO v_harga_jual, v_harga_modal
    FROM public.produk
    WHERE id = v_item.produk_id AND tenant_id = v_tenant_id;

    INSERT INTO public.detail_penjualan (
      tenant_id, penjualan_id, produk_id, jumlah, harga_satuan, harga_modal_satuan, subtotal
    )
    VALUES (
      v_tenant_id, v_penjualan_id, v_item.produk_id,
      v_item.jumlah, v_harga_jual, v_harga_modal,
      (v_harga_jual * v_item.jumlah)
    );

    INSERT INTO public.stok_log (tenant_id, produk_id, tipe, jumlah, keterangan, dibuat_oleh)
    VALUES (v_tenant_id, v_item.produk_id, 'keluar', v_item.jumlah,
            'POS Checkout: ' || v_nomor_invoice, p_dibuat_oleh);
  END LOOP;

  RETURN v_penjualan_id;

-- Concurrent double-submit: check if it's an idempotency match before returning the ID
EXCEPTION WHEN unique_violation THEN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_penjualan_id FROM public.penjualan
    WHERE tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;
    IF v_penjualan_id IS NOT NULL THEN
      RETURN v_penjualan_id;
    END IF;
  END IF;
  RAISE;
END;
$$;

COMMIT;
