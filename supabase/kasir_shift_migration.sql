-- 1. Create kasir_shift table
CREATE TABLE public.kasir_shift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES auth.users(id),
  cashier_name TEXT NOT NULL,  -- snapshot, survives user deletion
  opened_by UUID NOT NULL REFERENCES auth.users(id),
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  closed_at TIMESTAMP WITH TIME ZONE,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,  -- float given to cashier
  closing_cash NUMERIC(12,2),     -- counted at close
  closing_qris NUMERIC(12,2),     -- counted at close
  total_sales_cash NUMERIC(12,2), -- computed from penjualan on close
  total_sales_qris NUMERIC(12,2), -- computed from penjualan on close
  total_transactions INTEGER,     -- computed on close
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'auto_closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 2. Add payment_method and shift_id to penjualan
ALTER TABLE public.penjualan
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash'
  CHECK (payment_method IN ('cash', 'qris'));

ALTER TABLE public.penjualan
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.kasir_shift(id) ON DELETE SET NULL;

-- 3. Enable RLS and define tenant isolation policy on kasir_shift
ALTER TABLE public.kasir_shift ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kasir_shift_tenant_isolation" ON public.kasir_shift
  FOR ALL USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );

-- 4. Create indexes to optimize queries
CREATE INDEX idx_kasir_shift_tenant_status ON public.kasir_shift(tenant_id, status);
CREATE INDEX idx_kasir_shift_tenant_opened ON public.kasir_shift(tenant_id, opened_at DESC);
CREATE INDEX idx_penjualan_shift ON public.penjualan(shift_id);

-- 5. pg_cron schedule for midnight auto-close
SELECT cron.schedule(
  'auto-close-shifts-midnight',
  '0 17 * * *',  -- 17:00 UTC = midnight WIB (Asia/Jakarta = UTC+7)
  $$
    UPDATE public.kasir_shift
    SET
      status = 'auto_closed',
      closed_at = timezone('utc', now()),
      notes = COALESCE(notes || ' | ', '') || 'Auto-closed at midnight WIB'
    WHERE status = 'open'
      AND opened_at < date_trunc('day', timezone('Asia/Jakarta', now())) AT TIME ZONE 'Asia/Jakarta';
  $$
);

-- 6. Update process_sale_transaction RPC
CREATE OR REPLACE FUNCTION public.process_sale_transaction(
  p_nomor_invoice TEXT,
  p_total_harga NUMERIC,
  p_dibuat_oleh UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_shift_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_penjualan_id UUID;
  v_item RECORD;
BEGIN
  -- Derive tenant identity securely from JWT metadata
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  v_penjualan_id := gen_random_uuid();

  -- Insert Invoice record (now includes payment_method and shift_id)
  INSERT INTO public.penjualan (id, tenant_id, nomor_invoice, total_harga, dibuat_oleh, payment_method, shift_id)
  VALUES (v_penjualan_id, v_tenant_id, p_nomor_invoice, p_total_harga, p_dibuat_oleh, p_payment_method, p_shift_id);

  -- Loop through items
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(produk_id UUID, harga_satuan NUMERIC, jumlah INTEGER)
  LOOP
    -- Insert Detail item
    INSERT INTO public.detail_penjualan (tenant_id, penjualan_id, produk_id, jumlah, harga_satuan, subtotal)
    VALUES (v_tenant_id, v_penjualan_id, v_item.produk_id, v_item.jumlah, v_item.harga_satuan, (v_item.harga_satuan * v_item.jumlah));

    -- Insert Stock Log (Sync trigger handles stock validation and updates)
    INSERT INTO public.stok_log (tenant_id, produk_id, tipe, jumlah, keterangan, dibuat_oleh)
    VALUES (v_tenant_id, v_item.produk_id, 'keluar', v_item.jumlah, 'POS Checkout: ' || p_nomor_invoice, p_dibuat_oleh);
  END LOOP;

  RETURN v_penjualan_id;
END;
$$;

-- 7. Create open_shift RPC
CREATE OR REPLACE FUNCTION public.open_shift(
  p_cashier_id UUID,
  p_cashier_name TEXT,
  p_opening_cash NUMERIC DEFAULT 0
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_shift_id UUID;
BEGIN
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id;
  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Hanya Owner atau Manager yang dapat membuka shift.';
  END IF;

  INSERT INTO public.kasir_shift (tenant_id, cashier_id, cashier_name, opened_by, opening_cash)
  VALUES (v_tenant_id, p_cashier_id, p_cashier_name, auth.uid(), p_opening_cash)
  RETURNING id INTO v_shift_id;

  RETURN v_shift_id;
END;
$$;

-- 8. Create close_shift RPC
CREATE OR REPLACE FUNCTION public.close_shift(
  p_shift_id UUID,
  p_closing_cash NUMERIC,
  p_closing_qris NUMERIC,
  p_notes TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_cash_total NUMERIC;
  v_qris_total NUMERIC;
  v_tx_count INTEGER;
BEGIN
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id;
  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Hanya Owner atau Manager yang dapat menutup shift.';
  END IF;

  -- Compute actuals from penjualan
  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_harga ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'qris' THEN total_harga ELSE 0 END), 0),
    COUNT(*)
  INTO v_cash_total, v_qris_total, v_tx_count
  FROM public.penjualan
  WHERE shift_id = p_shift_id AND tenant_id = v_tenant_id;

  UPDATE public.kasir_shift SET
    status = 'closed',
    closed_at = timezone('utc', now()),
    closing_cash = p_closing_cash,
    closing_qris = p_closing_qris,
    total_sales_cash = v_cash_total,
    total_sales_qris = v_qris_total,
    total_transactions = v_tx_count,
    notes = p_notes
  WHERE id = p_shift_id AND tenant_id = v_tenant_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift tidak ditemukan atau sudah ditutup.';
  END IF;
END;
$$;
