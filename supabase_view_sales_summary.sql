-- ==========================================
-- CREATE DAILY SALES SUMMARY VIEW IN SUPABASE
-- ==========================================
-- Run this script in your Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- to build a pre-aggregated data view for faster dashboard rendering.

CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date AS tanggal,
  dp.produk_id,
  pr.nama AS nama_produk,
  pr.kode_produk AS sku_produk,
  SUM(dp.jumlah)::int AS total_terjual,
  SUM(dp.subtotal)::numeric AS total_pendapatan,
  SUM(dp.jumlah * (dp.harga_satuan - COALESCE(pr.harga_modal, 0)))::numeric AS total_laba
FROM penjualan p
JOIN detail_penjualan dp ON p.id = dp.penjualan_id
LEFT JOIN produk pr ON dp.produk_id = pr.id
GROUP BY 
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date, 
  dp.produk_id, 
  pr.nama, 
  pr.kode_produk;
