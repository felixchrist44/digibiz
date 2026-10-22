BEGIN;

-- A1. Extend audit_log action check constraint preserving all 10 existing values + 2 new variance values
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check CHECK (
    action IN (
        'product_create',
        'product_delete',
        'price_change',
        'cost_change',
        'stock_adjust',
        'role_change',
        'sale_nullify',
        'settings_update',
        'shift_open',
        'shift_close',
        'sale_offline_variance',
        'price_variance_approve'
    )
);

-- A2. Schema migration
ALTER TABLE public.penjualan
  ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_variance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variance_approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS variance_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;

ALTER TABLE public.detail_penjualan
  ADD COLUMN IF NOT EXISTS harga_saat_sync NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_penjualan_variance_pending
  ON public.penjualan (tenant_id, created_at DESC)
  WHERE price_variance = true AND variance_approved_at IS NULL;

-- Drop legacy 9-parameter overload to prevent PostgREST PGRST203 ambiguous function errors
DROP FUNCTION IF EXISTS public.process_sale_transaction(text, numeric, uuid, jsonb, text, uuid, numeric, boolean, uuid);

-- A3. Replace process_sale_transaction RPC with 11-parameter signature
CREATE OR REPLACE FUNCTION public.process_sale_transaction(
  p_nomor_invoice TEXT,                        -- dead param, kept for signature compatibility
  p_total_harga NUMERIC,
  p_dibuat_oleh UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_shift_id UUID DEFAULT NULL,
  p_tax_amount NUMERIC DEFAULT 0,
  p_tax_enabled BOOLEAN DEFAULT false,
  p_idempotency_key UUID DEFAULT NULL,
  p_is_offline BOOLEAN DEFAULT false,
  p_client_created_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_penjualan_id UUID;
  v_item RECORD;
  v_harga_jual NUMERIC;
  v_harga_modal NUMERIC;
  v_charged NUMERIC;
  v_server_subtotal NUMERIC := 0;
  v_client_subtotal NUMERIC := 0;
  v_final_subtotal NUMERIC;
  v_final_tax NUMERIC;
  v_total_harga NUMERIC;
  v_store_tax_enabled BOOLEAN;
  v_tax_rate NUMERIC;
  v_effective_tax_enabled BOOLEAN;
  v_server_tax NUMERIC := 0;
  v_price_variance BOOLEAN := false;
  v_tanggal DATE;
  v_seq INTEGER;
  v_nomor_invoice TEXT;
BEGIN
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Offline sales must carry a queue key; blocks casual abuse of the offline path.
  IF p_is_offline AND p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'OFFLINE_KEY_REQUIRED: Penjualan offline membutuhkan idempotency key.';
  END IF;

  -- Idempotency PRE-CHECK: a retry returns the original and skips ALL validation.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_penjualan_id FROM public.penjualan
    WHERE tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_penjualan_id;
    END IF;
  END IF;

  -- Cash requires the cashier's own shift. Offline relaxes 'open' because the
  -- midnight auto-close cron may have run before the sale could sync.
  IF p_payment_method = 'cash' THEN
    IF p_shift_id IS NULL THEN
      RAISE EXCEPTION 'SHIFT_REQUIRED: Penjualan tunai membutuhkan shift kasir yang aktif.';
    END IF;

    IF p_is_offline THEN
      PERFORM 1 FROM public.kasir_shift
      WHERE id = p_shift_id AND tenant_id = v_tenant_id AND cashier_id = auth.uid();
    ELSE
      PERFORM 1 FROM public.kasir_shift
      WHERE id = p_shift_id AND tenant_id = v_tenant_id AND cashier_id = auth.uid()
        AND status = 'open';
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SHIFT_INVALID: Shift tidak aktif atau bukan milik kasir ini.';
    END IF;
  END IF;

  -- LOOP 1: server price authority + client-claimed totals
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(produk_id UUID, harga_satuan NUMERIC, jumlah INTEGER)
  LOOP
    IF v_item.jumlah IS NULL OR v_item.jumlah <= 0 THEN
      RAISE EXCEPTION 'QTY_INVALID: Jumlah item harus lebih dari 0.';
    END IF;

    SELECT harga INTO v_harga_jual
    FROM public.produk WHERE id = v_item.produk_id AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUK_INVALID: Produk tidak ditemukan di tenant ini.';
    END IF;

    v_server_subtotal := v_server_subtotal + (v_harga_jual * v_item.jumlah);
    v_client_subtotal := v_client_subtotal + (COALESCE(v_item.harga_satuan, 0) * v_item.jumlah);
  END LOOP;

  SELECT tax_enabled, tax_rate INTO v_store_tax_enabled, v_tax_rate
  FROM public.tenant_settings WHERE tenant_id = v_tenant_id;
  v_store_tax_enabled := COALESCE(v_store_tax_enabled, false);
  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_effective_tax_enabled := (p_tax_enabled AND v_store_tax_enabled);

  IF v_effective_tax_enabled THEN
    v_server_tax := round(v_server_subtotal * (v_tax_rate / 100.0));
  ELSE
    v_server_tax := 0;
  END IF;

  IF p_is_offline THEN
    -- Client's own numbers must be internally consistent (catches garbage payloads).
    IF p_total_harga IS DISTINCT FROM (v_client_subtotal + p_tax_amount) THEN
      RAISE EXCEPTION 'OFFLINE_TOTAL_INCONSISTENT: Total offline tidak sesuai rincian item.';
    END IF;

    -- Fraud/bug guard: an absurdly low charged price is not a stale-price case.
    IF v_server_subtotal > 0 AND v_client_subtotal < (v_server_subtotal * 0.2) THEN
      RAISE EXCEPTION 'OFFLINE_VARIANCE_TOO_LARGE: Selisih harga offline terlalu besar.';
    END IF;

    v_price_variance := (v_client_subtotal IS DISTINCT FROM v_server_subtotal)
                     OR (p_tax_amount IS DISTINCT FROM v_server_tax);
    v_final_subtotal := v_client_subtotal;   -- record what was actually charged
    v_final_tax := p_tax_amount;
  ELSE
    -- ONLINE PATH UNCHANGED: prevention stays intact. Do not soften.
    IF (p_total_harga - p_tax_amount) IS DISTINCT FROM v_server_subtotal THEN
      RAISE EXCEPTION 'PRICE_MISMATCH: Harga produk telah berubah. Silakan perbarui harga.';
    END IF;
    IF p_tax_amount IS DISTINCT FROM v_server_tax THEN
      RAISE EXCEPTION 'TAX_MISMATCH: Pengaturan pajak telah berubah. Silakan perbarui harga.';
    END IF;
    v_price_variance := false;
    v_final_subtotal := v_server_subtotal;
    v_final_tax := v_server_tax;
  END IF;

  v_total_harga := v_final_subtotal + v_final_tax;

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
    payment_method, shift_id, tax_amount, tax_enabled, idempotency_key,
    is_offline, price_variance, client_created_at
  )
  VALUES (
    v_penjualan_id, v_tenant_id, v_nomor_invoice, v_total_harga, p_dibuat_oleh,
    p_payment_method, p_shift_id, v_final_tax, v_effective_tax_enabled, p_idempotency_key,
    p_is_offline, v_price_variance, p_client_created_at
  );

  -- LOOP 2: details store charged price + server price + COGS snapshot
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(produk_id UUID, harga_satuan NUMERIC, jumlah INTEGER)
  LOOP
    SELECT harga, COALESCE(harga_modal, 0) INTO v_harga_jual, v_harga_modal
    FROM public.produk WHERE id = v_item.produk_id AND tenant_id = v_tenant_id;

    v_charged := CASE WHEN p_is_offline
                      THEN COALESCE(v_item.harga_satuan, v_harga_jual)
                      ELSE v_harga_jual END;

    INSERT INTO public.detail_penjualan (
      tenant_id, penjualan_id, produk_id, jumlah,
      harga_satuan, harga_modal_satuan, harga_saat_sync, subtotal
    )
    VALUES (
      v_tenant_id, v_penjualan_id, v_item.produk_id, v_item.jumlah,
      v_charged, v_harga_modal, v_harga_jual, (v_charged * v_item.jumlah)
    );

    INSERT INTO public.stok_log (tenant_id, produk_id, tipe, jumlah, keterangan, dibuat_oleh)
    VALUES (v_tenant_id, v_item.produk_id, 'keluar', v_item.jumlah,
            'POS Checkout: ' || v_nomor_invoice, p_dibuat_oleh);
  END LOOP;

  IF v_price_variance THEN
    INSERT INTO public.audit_log (
      tenant_id, actor_id, actor_name, action, target_type, target_id, target_name, detail
    ) VALUES (
      v_tenant_id, auth.uid(),
      coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id), 'Kasir'),
      'sale_offline_variance', 'penjualan', v_penjualan_id, v_nomor_invoice,
      jsonb_build_object(
        'charged_subtotal', v_client_subtotal,
        'server_subtotal',  v_server_subtotal,
        'charged_tax',      p_tax_amount,
        'server_tax',       v_server_tax,
        'variance',         (v_client_subtotal + p_tax_amount) - (v_server_subtotal + v_server_tax),
        'client_created_at', p_client_created_at
      )
    );
  END IF;

  RETURN v_penjualan_id;

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

-- A4. Approval RPC
CREATE OR REPLACE FUNCTION public.approve_price_variance(p_penjualan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_invoice TEXT;
  v_cashier UUID;
BEGIN
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  SELECT role INTO v_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  IF v_role IS DISTINCT FROM 'owner' AND v_role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'VARIANCE_FORBIDDEN: Hanya Owner atau Manager yang berhak menyetujui selisih harga.';
  END IF;

  UPDATE public.penjualan
  SET variance_approved_by = auth.uid(),
      variance_approved_at = now()
  WHERE id = p_penjualan_id AND tenant_id = v_tenant_id
    AND price_variance = true AND variance_approved_at IS NULL
  RETURNING nomor_invoice, dibuat_oleh INTO v_invoice, v_cashier;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VARIANCE_NOT_FOUND: Transaksi tidak ditemukan atau sudah disetujui.';
  END IF;

  INSERT INTO public.audit_log (
    tenant_id, actor_id, actor_name, action, target_type, target_id, target_name, detail
  ) VALUES (
    v_tenant_id, auth.uid(),
    coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id), 'Owner'),
    'price_variance_approve', 'penjualan', p_penjualan_id, v_invoice,
    jsonb_build_object('cashier_id', v_cashier, 'self_approved', (v_cashier = auth.uid()))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_price_variance(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_price_variance(UUID) TO authenticated;

COMMIT;
