-- Database Migration: Reconcile Sales Stats, Live Reporting, and Checkout Idempotency
-- Location: supabase/reconcile_and_live_report.sql

-- 1. Add idempotency_key to penjualan table to prevent double checkouts.
--    Uniqueness is enforced per-tenant via a composite partial unique index:
--    NULLs are exempt, so existing rows need no backfill.
ALTER TABLE public.penjualan
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_penjualan_idempotency_key
  ON public.penjualan (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Guard: if a stray single-column UNIQUE constraint was created by an earlier
-- version of this script, remove it so only the composite index governs.
ALTER TABLE public.penjualan DROP CONSTRAINT IF EXISTS penjualan_idempotency_key_key;

-- 2. Authoritative get_total_revenue() RPC (tenant-scoped)
CREATE OR REPLACE FUNCTION public.get_total_revenue()
RETURNS numeric AS $$
  SELECT COALESCE(SUM(total_harga), 0) 
  FROM public.penjualan
  WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. Redefine process_sale_transaction RPC to support:
--    - Early return deduplication via p_idempotency_key
--    - Shift and payment method assignment
--    - Tax amount recording
--    - Cost snapshotting (COGS) at sale time into detail_penjualan
--
-- IMPORTANT: drop ALL old overloads first. CREATE OR REPLACE with a new
-- parameter list creates a SECOND function, and PostgREST then fails with
-- "could not choose the best candidate function" on every checkout.
DROP FUNCTION IF EXISTS public.process_sale_transaction(TEXT, NUMERIC, UUID, JSONB);
DROP FUNCTION IF EXISTS public.process_sale_transaction(TEXT, NUMERIC, UUID, JSONB, TEXT, UUID);
DROP FUNCTION IF EXISTS public.process_sale_transaction(TEXT, NUMERIC, UUID, JSONB, TEXT, UUID, NUMERIC, BOOLEAN);

CREATE OR REPLACE FUNCTION public.process_sale_transaction(
  p_nomor_invoice TEXT,
  p_total_harga NUMERIC,
  p_dibuat_oleh UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_shift_id UUID DEFAULT NULL,
  p_tax_amount NUMERIC DEFAULT 0,
  p_tax_enabled BOOLEAN DEFAULT false,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_penjualan_id UUID;
  v_item RECORD;
  v_harga_modal NUMERIC;
BEGIN
  -- Derive tenant identity securely from JWT metadata
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Deduplication check
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.penjualan (
      id, tenant_id, nomor_invoice, total_harga, dibuat_oleh, 
      payment_method, shift_id, tax_amount, tax_enabled, idempotency_key
    )
    VALUES (
      gen_random_uuid(), v_tenant_id, p_nomor_invoice, p_total_harga, p_dibuat_oleh, 
      p_payment_method, p_shift_id, p_tax_amount, p_tax_enabled, p_idempotency_key
    )
    ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_penjualan_id;

    -- If conflict occurred (v_penjualan_id remains null), this is a retry of an
    -- already-processed sale. Fetch the original sale ID and return early —
    -- BEFORE the item loop — so stock is never depleted a second time.
    IF v_penjualan_id IS NULL THEN
      SELECT id INTO v_penjualan_id
      FROM public.penjualan
      WHERE tenant_id = v_tenant_id
        AND idempotency_key = p_idempotency_key;

      RETURN v_penjualan_id;
    END IF;
  ELSE
    -- Fallback/legacy path for requests without an idempotency key
    v_penjualan_id := gen_random_uuid();
    INSERT INTO public.penjualan (
      id, tenant_id, nomor_invoice, total_harga, dibuat_oleh, 
      payment_method, shift_id, tax_amount, tax_enabled
    )
    VALUES (
      v_penjualan_id, v_tenant_id, p_nomor_invoice, p_total_harga, p_dibuat_oleh, 
      p_payment_method, p_shift_id, p_tax_amount, p_tax_enabled
    );
  END IF;

  -- Loop through items to record details and subtract stock
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
    AS x(produk_id UUID, harga_satuan NUMERIC, jumlah INTEGER)
  LOOP
    -- Snapshot the product's CURRENT cost at the moment of sale.
    -- Tenant-scoped lookup so cost can only come from this tenant's product.
    SELECT COALESCE(harga_modal, 0) INTO v_harga_modal
    FROM public.produk
    WHERE id = v_item.produk_id
      AND tenant_id = v_tenant_id;

    v_harga_modal := COALESCE(v_harga_modal, 0);

    -- Insert detail line WITH the snapshotted cost
    INSERT INTO public.detail_penjualan (
      tenant_id, penjualan_id, produk_id,
      jumlah, harga_satuan, harga_modal_satuan, subtotal
    )
    VALUES (
      v_tenant_id, v_penjualan_id, v_item.produk_id,
      v_item.jumlah, v_item.harga_satuan, v_harga_modal,
      (v_item.harga_satuan * v_item.jumlah)
    );

    -- Insert Stock Log (BEFORE INSERT trigger sync_product_stock validates & syncs stock;
    -- raises 'Stok tidak mencukupi' and aborts the whole transaction if inventory is insufficient)
    INSERT INTO public.stok_log (tenant_id, produk_id, tipe, jumlah, keterangan, dibuat_oleh)
    VALUES (
      v_tenant_id, v_item.produk_id, 'keluar', v_item.jumlah,
      'POS Checkout: ' || p_nomor_invoice, p_dibuat_oleh
    );
  END LOOP;

  RETURN v_penjualan_id;
END;
$$;

-- 4. Reconciliation function for dashboard stats cache to correct any drift
CREATE OR REPLACE FUNCTION public.reconcile_dashboard_sales_stats()
RETURNS void AS $$
BEGIN
  UPDATE public.dashboard_stats_cache cache
  SET
    total_sales_count = (
      SELECT COUNT(*)::int FROM public.penjualan p
      WHERE p.tenant_id = cache.tenant_id
    ),
    total_revenue = (
      SELECT COALESCE(SUM(p.total_harga), 0.00)::numeric FROM public.penjualan p
      WHERE p.tenant_id = cache.tenant_id
    ),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Schedule the reconciliation job to run once daily at 18:00 UTC using pg_cron
-- First, unschedule if the job already exists to avoid duplicate entries
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reconcile-dashboard-sales-stats-job';
SELECT cron.schedule(
  'reconcile-dashboard-sales-stats-job',
  '0 18 * * *',
  $$ SELECT public.reconcile_dashboard_sales_stats(); $$
);

-- 6. Redefine the public.daily_sales_summary_mv view to combine:
--    - Historical days (before today) cached from daily_sales_summary_mv_internal
--    - Today's data (current day) calculated live from penjualan/detail_penjualan
CREATE OR REPLACE VIEW public.daily_sales_summary_mv
WITH (security_barrier = true) AS
SELECT 
  tenant_id,
  tanggal,
  produk_id,
  nama_produk,
  sku_produk,
  total_terjual,
  total_pendapatan,
  total_laba
FROM public.daily_sales_summary_mv_internal
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  AND tanggal < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
UNION ALL
SELECT
  p.tenant_id,
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date AS tanggal,
  dp.produk_id,
  pr.nama        AS nama_produk,
  pr.kode_produk AS sku_produk,
  SUM(dp.jumlah)::int       AS total_terjual,
  SUM(dp.subtotal)::numeric AS total_pendapatan,
  SUM(dp.jumlah * (dp.harga_satuan - COALESCE(dp.harga_modal_satuan, 0)))::numeric AS total_laba
FROM public.penjualan p
JOIN public.detail_penjualan dp ON p.id = dp.penjualan_id
LEFT JOIN public.produk pr ON dp.produk_id = pr.id
WHERE p.tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
GROUP BY
  p.tenant_id,
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date,
  dp.produk_id,
  pr.nama,
  pr.kode_produk;
