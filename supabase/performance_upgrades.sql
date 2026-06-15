-- ==========================================================
-- PERFORMANCE UPGRADE MIGRATION FOR DIGIBIZ POS
-- ==========================================================
-- Run this script in your Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- 1. Create B-Tree indexes for fast sorting and low-stock lookups
CREATE INDEX IF NOT EXISTS idx_produk_stok_saat_ini ON public.produk(stok_saat_ini);
CREATE INDEX IF NOT EXISTS idx_penjualan_created_at ON public.penjualan(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stok_log_created_at ON public.stok_log(created_at DESC);

-- 2. Ensure the harga_modal column exists on the produk table
ALTER TABLE public.produk ADD COLUMN IF NOT EXISTS harga_modal numeric(12,2) CHECK (harga_modal >= 0);

-- 3. Clean up any existing conflicting views of the same name
-- (Prevents "relation already exists" or "is not a materialized view" errors)
DROP VIEW IF EXISTS public.daily_sales_summary_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.daily_sales_summary_mv CASCADE;

-- 4. Create Materialized View for instant pre-cached reads
CREATE MATERIALIZED VIEW public.daily_sales_summary_mv AS
SELECT
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date AS tanggal,
  dp.produk_id,
  pr.nama AS nama_produk,
  pr.kode_produk AS sku_produk,
  SUM(dp.jumlah)::int AS total_terjual,
  SUM(dp.subtotal)::numeric AS total_pendapatan,
  SUM(dp.jumlah * (dp.harga_satuan - COALESCE(pr.harga_modal, 0)))::numeric AS total_laba
FROM public.penjualan p
JOIN public.detail_penjualan dp ON p.id = dp.penjualan_id
LEFT JOIN public.produk pr ON dp.produk_id = pr.id
GROUP BY 
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date, 
  dp.produk_id, 
  pr.nama, 
  pr.kode_produk;

-- 5. Create unique index on the materialized view (required for CONCURRENT refreshes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_summary_mv_unique ON public.daily_sales_summary_mv (tanggal, produk_id);

-- 6. Create B-Tree index on MV tanggal for fast date-range filtering
CREATE INDEX IF NOT EXISTS idx_daily_sales_mv_tanggal ON public.daily_sales_summary_mv (tanggal DESC);

-- 7. Remove old synchronous triggers/functions if they exist
DROP TRIGGER IF EXISTS refresh_mv_on_detail_penjualan_change ON public.detail_penjualan;
DROP FUNCTION IF EXISTS public.refresh_daily_sales_summary_mv();

-- 8. Enable pg_cron and schedule background refreshes
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Safe unschedule: will NOT fail even if the job doesn't exist yet
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-daily-sales-mv';
-- Schedule the 1-hour background refresh
SELECT cron.schedule(
  'refresh-daily-sales-mv',
  '0 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_sales_summary_mv; $$
);
