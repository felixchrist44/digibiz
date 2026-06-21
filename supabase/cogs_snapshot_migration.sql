-- ============================================================
-- COGS CORRECTNESS & MARGIN REPORTING MIGRATION
-- ============================================================
-- Purpose: Snapshot product cost (harga_modal) at checkout time
-- into detail_penjualan.harga_modal_satuan, so historical profit
-- is frozen and unaffected by later restocks/cost changes.
--
-- This replaces the live-cost join (pr.harga_modal) in the
-- materialized view with the snapshotted cost (dp.harga_modal_satuan).
--
-- Wrapped in a single transaction: if any step fails, nothing is
-- left half-applied (critical because the Laporan page depends on
-- the matview being present).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Add snapshotted cost column to detail_penjualan
--    (nullable, no default -> existing rows become NULL so the
--    backfill below can target them)
-- ------------------------------------------------------------
ALTER TABLE public.detail_penjualan
  ADD COLUMN IF NOT EXISTS harga_modal_satuan numeric(12,2) CHECK (harga_modal_satuan >= 0);

-- ------------------------------------------------------------
-- 2. Backfill existing rows from the product's CURRENT cost.
--    NOTE: pre-migration profit is approximate (true historical
--    cost was never recorded). Post-migration sales are exact.
-- ------------------------------------------------------------
UPDATE public.detail_penjualan dp
SET harga_modal_satuan = COALESCE(p.harga_modal, 0)
FROM public.produk p
WHERE dp.produk_id = p.id
  AND dp.harga_modal_satuan IS NULL;

-- ------------------------------------------------------------
-- 3. Update process_sale_transaction to SNAPSHOT cost at sale time.
--    Preserves existing behavior:
--      - tenant derived from JWT
--      - stok_log insert (BEFORE INSERT trigger sync_product_stock
--        still enforces the "Stok tidak mencukupi" pre-check)
--    Adds:
--      - per-item harga_modal lookup -> harga_modal_satuan
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale_transaction(
  p_nomor_invoice TEXT,
  p_total_harga NUMERIC,
  p_dibuat_oleh UUID,
  p_items JSONB
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

  v_penjualan_id := gen_random_uuid();

  -- Insert Invoice record (tenant_id explicit; stats cache trigger fires)
  INSERT INTO public.penjualan (id, tenant_id, nomor_invoice, total_harga, dibuat_oleh)
  VALUES (v_penjualan_id, v_tenant_id, p_nomor_invoice, p_total_harga, p_dibuat_oleh);

  -- Loop through items
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

    -- If product not found for this tenant, v_harga_modal stays NULL ->
    -- coalesce to 0 so the insert's CHECK (>= 0) never fails.
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

    -- Insert Stock Log (BEFORE INSERT trigger validates & syncs stock;
    -- raises 'Stok tidak mencukupi' and aborts the whole tx if short)
    INSERT INTO public.stok_log (tenant_id, produk_id, tipe, jumlah, keterangan, dibuat_oleh)
    VALUES (
      v_tenant_id, v_item.produk_id, 'keluar', v_item.jumlah,
      'POS Checkout: ' || p_nomor_invoice, p_dibuat_oleh
    );
  END LOOP;

  RETURN v_penjualan_id;
END;
$$;

-- ------------------------------------------------------------
-- 4. Rebuild materialized view using SNAPSHOTTED cost.
--    KEY FIX: total_laba now uses dp.harga_modal_satuan,
--    NOT the live pr.harga_modal.
--
--    Dropping/recreating preserves the matview NAME, so the
--    existing hourly cron ('refresh-daily-sales-mv') keeps working.
-- ------------------------------------------------------------

-- Drop dependent wrapper views first, then the internal matview
DROP VIEW IF EXISTS public.monthly_sales_summary;
DROP VIEW IF EXISTS public.daily_sales_summary_mv;
DROP MATERIALIZED VIEW IF EXISTS public.daily_sales_summary_mv_internal CASCADE;

CREATE MATERIALIZED VIEW public.daily_sales_summary_mv_internal AS
SELECT
  p.tenant_id,
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date AS tanggal,
  dp.produk_id,
  pr.nama        AS nama_produk,
  pr.kode_produk AS sku_produk,
  SUM(dp.jumlah)::int       AS total_terjual,
  SUM(dp.subtotal)::numeric AS total_pendapatan,
  -- SNAPSHOT cost (frozen at sale time), not live pr.harga_modal
  SUM(dp.jumlah * (dp.harga_satuan - COALESCE(dp.harga_modal_satuan, 0)))::numeric AS total_laba
FROM public.penjualan p
JOIN public.detail_penjualan dp ON p.id = dp.penjualan_id
LEFT JOIN public.produk pr ON dp.produk_id = pr.id
GROUP BY
  p.tenant_id,
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date,
  dp.produk_id,
  pr.nama,
  pr.kode_produk;

-- Unique index REQUIRED for REFRESH ... CONCURRENTLY (cron uses it)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_summary_mv_unique
  ON public.daily_sales_summary_mv_internal (tenant_id, tanggal, produk_id);

-- Speed up tenant-scoped filter/sort
CREATE INDEX IF NOT EXISTS idx_daily_summary_tenant
  ON public.daily_sales_summary_mv_internal (tenant_id, tanggal DESC);

-- ------------------------------------------------------------
-- 5. Recreate tenant-secured wrapper views (same shape as before,
--    so LaporanPage's existing .select() contract is unchanged)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.daily_sales_summary_mv
WITH (security_barrier = true) AS
SELECT *
FROM public.daily_sales_summary_mv_internal
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

CREATE OR REPLACE VIEW public.monthly_sales_summary
WITH (security_barrier = true) AS
SELECT
  date_trunc('month', tanggal)::date AS bulan,
  SUM(total_terjual)::int       AS total_terjual,
  SUM(total_pendapatan)::numeric AS total_pendapatan,
  SUM(total_laba)::numeric       AS total_laba
FROM public.daily_sales_summary_mv_internal
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
GROUP BY date_trunc('month', tanggal)::date;

-- ------------------------------------------------------------
-- 6. Grants (authenticated reads wrappers only; internal matview locked)
-- ------------------------------------------------------------
GRANT SELECT ON public.daily_sales_summary_mv TO authenticated;
GRANT SELECT ON public.monthly_sales_summary TO authenticated;
REVOKE ALL ON public.daily_sales_summary_mv_internal FROM authenticated;

-- ------------------------------------------------------------
-- 7. Ensure the hourly refresh cron still targets the rebuilt matview.
--    (Idempotent: unschedule if present, reschedule by same name.)
-- ------------------------------------------------------------
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-daily-sales-mv';
SELECT cron.schedule(
  'refresh-daily-sales-mv',
  '0 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_sales_summary_mv_internal; $$
);

COMMIT;
