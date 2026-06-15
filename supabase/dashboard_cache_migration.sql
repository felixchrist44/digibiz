-- SQL migration script to set up the dashboard stats cache table and database triggers

-- 1. Create Dashboard Stats Cache Table
CREATE TABLE IF NOT EXISTS public.dashboard_stats_cache (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_products integer NOT NULL DEFAULT 0,
  low_stock_count integer NOT NULL DEFAULT 0,
  out_of_stock_count integer NOT NULL DEFAULT 0,
  total_sales_count integer NOT NULL DEFAULT 0,
  total_revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable Row Level Security (RLS) on dashboard_stats_cache
ALTER TABLE public.dashboard_stats_cache ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for select/read operations for authenticated users
DROP POLICY IF EXISTS "Allow read dashboard cache for all authenticated users" ON public.dashboard_stats_cache;
CREATE POLICY "Allow read dashboard cache for all authenticated users" 
ON public.dashboard_stats_cache FOR SELECT TO authenticated USING (true);

-- 2. Create Trigger Function for produk modifications
CREATE OR REPLACE FUNCTION public.sync_dashboard_produk_stats()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.dashboard_stats_cache
    SET
      total_products = total_products + 1,
      low_stock_count = low_stock_count + (CASE WHEN NEW.stok_saat_ini <= 5 THEN 1 ELSE 0 END),
      out_of_stock_count = out_of_stock_count + (CASE WHEN NEW.stok_saat_ini = 0 THEN 1 ELSE 0 END),
      updated_at = now()
    WHERE id = 1;
  ELIF (TG_OP = 'DELETE') THEN
    UPDATE public.dashboard_stats_cache
    SET
      total_products = total_products - 1,
      low_stock_count = low_stock_count - (CASE WHEN OLD.stok_saat_ini <= 5 THEN 1 ELSE 0 END),
      out_of_stock_count = out_of_stock_count - (CASE WHEN OLD.stok_saat_ini = 0 THEN 1 ELSE 0 END),
      updated_at = now()
    WHERE id = 1;
  ELIF (TG_OP = 'UPDATE') THEN
    UPDATE public.dashboard_stats_cache
    SET
      low_stock_count = low_stock_count 
        - (CASE WHEN OLD.stok_saat_ini <= 5 THEN 1 ELSE 0 END)
        + (CASE WHEN NEW.stok_saat_ini <= 5 THEN 1 ELSE 0 END),
      out_of_stock_count = out_of_stock_count 
        - (CASE WHEN OLD.stok_saat_ini = 0 THEN 1 ELSE 0 END)
        + (CASE WHEN NEW.stok_saat_ini = 0 THEN 1 ELSE 0 END),
      updated_at = now()
    WHERE id = 1;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to produk
DROP TRIGGER IF EXISTS trigger_sync_dashboard_produk_stats ON public.produk;
CREATE TRIGGER trigger_sync_dashboard_produk_stats
AFTER INSERT OR DELETE OR UPDATE OF stok_saat_ini ON public.produk
FOR EACH ROW EXECUTE FUNCTION public.sync_dashboard_produk_stats();

-- 3. Create Trigger Function for penjualan modifications
CREATE OR REPLACE FUNCTION public.sync_dashboard_sales_stats()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.dashboard_stats_cache
    SET
      total_sales_count = total_sales_count + 1,
      total_revenue = total_revenue + NEW.total_harga,
      updated_at = now()
    WHERE id = 1;
  ELIF (TG_OP = 'DELETE') THEN
    UPDATE public.dashboard_stats_cache
    SET
      total_sales_count = total_sales_count - 1,
      total_revenue = total_revenue - OLD.total_harga,
      updated_at = now()
    WHERE id = 1;
  ELIF (TG_OP = 'UPDATE') THEN
    UPDATE public.dashboard_stats_cache
    SET
      total_revenue = total_revenue - OLD.total_harga + NEW.total_harga,
      updated_at = now()
    WHERE id = 1;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to penjualan
DROP TRIGGER IF EXISTS trigger_sync_dashboard_sales_stats ON public.penjualan;
CREATE TRIGGER trigger_sync_dashboard_sales_stats
AFTER INSERT OR DELETE OR UPDATE OF total_harga ON public.penjualan;
CREATE TRIGGER trigger_sync_dashboard_sales_stats
AFTER INSERT OR DELETE OR UPDATE OF total_harga ON public.penjualan
FOR EACH ROW EXECUTE FUNCTION public.sync_dashboard_sales_stats();

-- 4. Seed Query to compile initial stats cache row
INSERT INTO public.dashboard_stats_cache (id, total_products, low_stock_count, out_of_stock_count, total_sales_count, total_revenue)
SELECT 
  1,
  (SELECT COUNT(*)::int FROM public.produk),
  (SELECT COUNT(*)::int FROM public.produk WHERE stok_saat_ini <= 5),
  (SELECT COUNT(*)::int FROM public.produk WHERE stok_saat_ini = 0),
  (SELECT COUNT(*)::int FROM public.penjualan),
  (SELECT COALESCE(SUM(total_harga), 0.00)::numeric FROM public.penjualan)
ON CONFLICT (id) DO UPDATE SET
  total_products = EXCLUDED.total_products,
  low_stock_count = EXCLUDED.low_stock_count,
  out_of_stock_count = EXCLUDED.out_of_stock_count,
  total_sales_count = EXCLUDED.total_sales_count,
  total_revenue = EXCLUDED.total_revenue;
