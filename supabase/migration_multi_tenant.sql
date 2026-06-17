BEGIN;

-- ==========================================================
-- MULTI-TENANT SHARED SCHEMA MIGRATION SCRIPT
-- ==========================================================

-- 1. Create Tenants Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_toko VARCHAR(255) NOT NULL,
    tipe_bisnis VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Tenant Invites Table for Secure Registration
CREATE TABLE IF NOT EXISTS public.tenant_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
);

-- 3. Create Default Tenant for Existing Data
INSERT INTO public.tenants (id, nama_toko) 
VALUES ('d3b07384-d113-4ec6-a513-333333333333', 'Default Store')
ON CONFLICT (id) DO NOTHING;

-- 4. Add nullable tenant_id columns to business tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.produk ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.penjualan ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.detail_penjualan ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.stok_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.dashboard_stats_cache ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 5. Backfill existing rows to Default Tenant
UPDATE public.profiles SET tenant_id = 'd3b07384-d113-4ec6-a513-333333333333' WHERE tenant_id IS NULL;
UPDATE public.produk SET tenant_id = 'd3b07384-d113-4ec6-a513-333333333333' WHERE tenant_id IS NULL;
UPDATE public.penjualan SET tenant_id = 'd3b07384-d113-4ec6-a513-333333333333' WHERE tenant_id IS NULL;
UPDATE public.detail_penjualan SET tenant_id = 'd3b07384-d113-4ec6-a513-333333333333' WHERE tenant_id IS NULL;
UPDATE public.stok_log SET tenant_id = 'd3b07384-d113-4ec6-a513-333333333333' WHERE tenant_id IS NULL;
UPDATE public.dashboard_stats_cache SET tenant_id = 'd3b07384-d113-4ec6-a513-333333333333' WHERE tenant_id IS NULL;

-- 6. Enforce NOT NULL constraints
ALTER TABLE public.profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.produk ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.penjualan ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.detail_penjualan ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.stok_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.dashboard_stats_cache ALTER COLUMN tenant_id SET NOT NULL;

-- 7. Reconfigure Stats Cache Primary Key to be tenant-based
ALTER TABLE public.dashboard_stats_cache DROP CONSTRAINT IF EXISTS dashboard_stats_cache_pkey;
ALTER TABLE public.dashboard_stats_cache ADD PRIMARY KEY (tenant_id);

-- 8. Configure Column Defaults so Client Inserts Automatically Resolve Tenant ID from JWT
ALTER TABLE public.profiles ALTER COLUMN tenant_id SET DEFAULT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
ALTER TABLE public.produk ALTER COLUMN tenant_id SET DEFAULT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
ALTER TABLE public.penjualan ALTER COLUMN tenant_id SET DEFAULT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
ALTER TABLE public.detail_penjualan ALTER COLUMN tenant_id SET DEFAULT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
ALTER TABLE public.stok_log ALTER COLUMN tenant_id SET DEFAULT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
ALTER TABLE public.dashboard_stats_cache ALTER COLUMN tenant_id SET DEFAULT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

-- 9. Replace Old Single-Column Indexes with Tenant-Scoped Composite Indexes
-- Note: If running on a live database with zero-downtime requirements, comment these out,
-- run the rest of the script, and create them CONCURRENTLY outside the transaction.
DROP INDEX IF EXISTS idx_produk_kode;
DROP INDEX IF EXISTS idx_produk_stok_saat_ini;
DROP INDEX IF EXISTS idx_penjualan_created_at;
DROP INDEX IF EXISTS idx_stok_log_created_at;

CREATE INDEX IF NOT EXISTS idx_produk_tenant_kode ON public.produk(tenant_id, kode_produk);
CREATE INDEX IF NOT EXISTS idx_produk_tenant_stok ON public.produk(tenant_id, stok_saat_ini);
CREATE INDEX IF NOT EXISTS idx_penjualan_tenant_created ON public.penjualan(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stok_log_tenant_created ON public.stok_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_detail_penjualan_tenant ON public.detail_penjualan(tenant_id, penjualan_id);

-- 10. Row Level Security (RLS) Rules for Multi-Tenant Isolation
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penjualan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detail_penjualan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_stats_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_tenant_isolation" ON public.profiles;
CREATE POLICY "profiles_tenant_isolation" ON public.profiles
    FOR ALL USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "produk_tenant_isolation" ON public.produk;
CREATE POLICY "produk_tenant_isolation" ON public.produk
    FOR ALL USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "penjualan_tenant_isolation" ON public.penjualan;
CREATE POLICY "penjualan_tenant_isolation" ON public.penjualan
    FOR ALL USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "detail_penjualan_tenant_isolation" ON public.detail_penjualan;
CREATE POLICY "detail_penjualan_tenant_isolation" ON public.detail_penjualan
    FOR ALL USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "stok_log_tenant_isolation" ON public.stok_log;
CREATE POLICY "stok_log_tenant_isolation" ON public.stok_log
    FOR ALL USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "stats_cache_tenant_isolation" ON public.dashboard_stats_cache;
CREATE POLICY "stats_cache_tenant_isolation" ON public.dashboard_stats_cache
    FOR ALL USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "invites_tenant_isolation" ON public.tenant_invites;
CREATE POLICY "invites_tenant_isolation" ON public.tenant_invites
    FOR ALL USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- 11. Supabase Auth custom token hook function
CREATE OR REPLACE FUNCTION public.inject_tenant_id_to_jwt(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  IF v_tenant_id IS NOT NULL THEN
    RETURN jsonb_set(
      event,
      '{claims,app_metadata,tenant_id}',
      to_jsonb(v_tenant_id::text)
    );
  END IF;

  RETURN event;
END;
$$;

-- 12. Refactor Materialized View to Support Tenant Isolation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'daily_sales_summary_mv' AND relnamespace = 'public'::regnamespace) THEN
    IF (SELECT relkind FROM pg_class WHERE relname = 'daily_sales_summary_mv' AND relnamespace = 'public'::regnamespace) = 'm' THEN
      EXECUTE 'DROP MATERIALIZED VIEW public.daily_sales_summary_mv CASCADE';
    ELSE
      EXECUTE 'DROP VIEW public.daily_sales_summary_mv CASCADE';
    END IF;
  END IF;
END
$$;

DROP MATERIALIZED VIEW IF EXISTS public.daily_sales_summary_mv_internal CASCADE;

CREATE MATERIALIZED VIEW public.daily_sales_summary_mv_internal AS
SELECT
  p.tenant_id,
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
  p.tenant_id,
  (p.created_at AT TIME ZONE 'Asia/Jakarta')::date, 
  dp.produk_id, 
  pr.nama, 
  pr.kode_produk;

-- Unique constraint required for CONCURRENT refreshing
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_summary_mv_unique ON public.daily_sales_summary_mv_internal (tenant_id, tanggal, produk_id);

-- Speed up tenant-specific filter and sort queries on the materialized view
CREATE INDEX IF NOT EXISTS idx_daily_summary_tenant ON public.daily_sales_summary_mv_internal (tenant_id, tanggal DESC);

-- Create a secure view wrapper daily_sales_summary_mv for the client application
CREATE OR REPLACE VIEW public.daily_sales_summary_mv
WITH (security_barrier = true) AS
SELECT * FROM public.daily_sales_summary_mv_internal
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

GRANT SELECT ON public.daily_sales_summary_mv TO authenticated;
REVOKE ALL ON public.daily_sales_summary_mv_internal FROM authenticated;

-- Create secure view wrapper monthly_sales_summary for the monthly aggregates
CREATE OR REPLACE VIEW public.monthly_sales_summary
WITH (security_barrier = true) AS
SELECT
  date_trunc('month', tanggal)::date AS bulan,
  SUM(total_terjual)::int AS total_terjual,
  SUM(total_pendapatan)::numeric AS total_pendapatan,
  SUM(total_laba)::numeric AS total_laba
FROM public.daily_sales_summary_mv_internal
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
GROUP BY date_trunc('month', tanggal)::date;

GRANT SELECT ON public.monthly_sales_summary TO authenticated;

-- Unschedule and reschedule cron job to concurrently refresh internal materialized view hourly
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-daily-sales-mv';
SELECT cron.schedule(
  'refresh-daily-sales-mv',
  '0 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_sales_summary_mv_internal; $$
);

-- 13. Security Definer RPC helper functions
CREATE OR REPLACE FUNCTION public.get_total_revenue()
RETURNS numeric AS $$
  SELECT COALESCE(SUM(total_harga), 0) 
  FROM public.penjualan
  WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql SECURITY DEFINER;

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
BEGIN
  -- Derive tenant identity securely from JWT metadata
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Prevent identity spoofing: Verify the operator matches the active session user
  IF p_dibuat_oleh != auth.uid() THEN
    RAISE EXCEPTION 'Akses ditolak: User ID operator tidak cocok dengan session aktif.';
  END IF;

  v_penjualan_id := gen_random_uuid();

  -- Insert Invoice record
  INSERT INTO public.penjualan (id, tenant_id, nomor_invoice, total_harga, dibuat_oleh)
  VALUES (v_penjualan_id, v_tenant_id, p_nomor_invoice, p_total_harga, p_dibuat_oleh);

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

CREATE OR REPLACE FUNCTION public.adjust_stock_manual(
  p_produk_id UUID,
  p_tipe VARCHAR,
  p_jumlah INTEGER,
  p_keterangan TEXT,
  p_dibuat_oleh UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_stok_saat_ini INTEGER;
  v_role VARCHAR;
BEGIN
  -- Derive tenant identity securely from JWT metadata
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Enforce Role-Based Access Control: Only 'owner' is permitted to manually adjust stock
  SELECT role INTO v_role 
  FROM public.profiles 
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  IF v_role IS NULL OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner yang dapat melakukan penyesuaian stok manual.';
  END IF;

  -- Lock row for concurrency check and validate ownership
  SELECT stok_saat_ini INTO v_stok_saat_ini
  FROM public.produk
  WHERE id = p_produk_id AND tenant_id = v_tenant_id
  FOR UPDATE;

  -- Fail explicitly if the product is not found or owned
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau bukan milik tenant ini.';
  END IF;

  -- Validate subtraction limits
  IF p_tipe = 'keluar' AND v_stok_saat_ini < p_jumlah THEN
    RAISE EXCEPTION 'Stok tidak mencukupi';
  END IF;

  -- Insert Stock Log (Trigger syncs produk.stok_saat_ini automatically)
  INSERT INTO public.stok_log (tenant_id, produk_id, tipe, jumlah, keterangan, dibuat_oleh)
  VALUES (v_tenant_id, p_produk_id, p_tipe, p_jumlah, p_keterangan, p_dibuat_oleh);
END;
$$;

-- 14. Upgrade Profiles Signup Trigger handle_new_user to use Secure Invitation Tokens
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant_name TEXT;
  v_role TEXT;
  v_invite_token TEXT;
  v_tenant_id_raw TEXT;
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'staff');
  v_invite_token := new.raw_user_meta_data->>'invite_token';
  v_tenant_id_raw := new.raw_user_meta_data->>'tenant_id';

  -- If invite_token is provided, look up the tenant safely
  IF v_invite_token IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id 
    FROM public.tenant_invites
    WHERE token = v_invite_token 
      AND expires_at > now()
      AND used_at IS NULL;
      
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Token undangan tidak valid atau sudah kadaluarsa.';
    END IF;
    
    -- Mark invite as used
    UPDATE public.tenant_invites SET used_at = now() WHERE token = v_invite_token;

  -- If neither is provided, create a new tenant (owner signup path)
  ELSIF v_tenant_id_raw IS NULL THEN
    v_tenant_name := COALESCE(new.raw_user_meta_data->>'nama_toko', 'Toko Baru');
    INSERT INTO public.tenants (nama_toko)
    VALUES (v_tenant_name)
    RETURNING id INTO v_tenant_id;
    
    -- Automatically promote the tenant creator to owner
    v_role := 'owner';
  ELSE
    -- Rejects manual tenant ID injections
    RAISE EXCEPTION 'Akses ditolak: Tidak dapat bergabung ke toko tanpa token undangan.';
  END IF;

  INSERT INTO public.profiles (id, tenant_id, full_name, role)
  VALUES (
    new.id,
    v_tenant_id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Staff Member'),
    v_role
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 15. Recompute low stock/out of stock counts from source on UPDATE trigger to prevent drift
CREATE OR REPLACE FUNCTION public.sync_dashboard_produk_stats()
RETURNS trigger AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_tenant_id := NEW.tenant_id;
    -- Ensure tenant's cache row exists
    INSERT INTO public.dashboard_stats_cache (tenant_id, total_products, low_stock_count, out_of_stock_count, total_sales_count, total_revenue)
    VALUES (v_tenant_id, 0, 0, 0, 0, 0.00)
    ON CONFLICT (tenant_id) DO NOTHING;

    UPDATE public.dashboard_stats_cache
    SET
      total_products = total_products + 1,
      low_stock_count = low_stock_count + (CASE WHEN NEW.stok_saat_ini <= 5 THEN 1 ELSE 0 END),
      out_of_stock_count = out_of_stock_count + (CASE WHEN NEW.stok_saat_ini = 0 THEN 1 ELSE 0 END),
      updated_at = now()
    WHERE tenant_id = v_tenant_id;
  ELSIF (TG_OP = 'DELETE') THEN
    v_tenant_id := OLD.tenant_id;
    UPDATE public.dashboard_stats_cache
    SET
      total_products = total_products - 1,
      low_stock_count = low_stock_count - (CASE WHEN OLD.stok_saat_ini <= 5 THEN 1 ELSE 0 END),
      out_of_stock_count = out_of_stock_count - (CASE WHEN OLD.stok_saat_ini = 0 THEN 1 ELSE 0 END),
      updated_at = now()
    WHERE tenant_id = v_tenant_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_tenant_id := NEW.tenant_id;
    
    -- Recompute counts directly from source to avoid drift over time under concurrent load
    UPDATE public.dashboard_stats_cache
    SET
      low_stock_count = (
        SELECT COUNT(*)::int FROM public.produk 
        WHERE tenant_id = v_tenant_id AND stok_saat_ini <= 5
      ),
      out_of_stock_count = (
        SELECT COUNT(*)::int FROM public.produk 
        WHERE tenant_id = v_tenant_id AND stok_saat_ini = 0
      ),
      updated_at = now()
    WHERE tenant_id = v_tenant_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sync_dashboard_sales_stats()
RETURNS trigger AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_tenant_id := NEW.tenant_id;
    INSERT INTO public.dashboard_stats_cache (tenant_id, total_products, low_stock_count, out_of_stock_count, total_sales_count, total_revenue)
    VALUES (v_tenant_id, 0, 0, 0, 0, 0.00)
    ON CONFLICT (tenant_id) DO NOTHING;

    UPDATE public.dashboard_stats_cache
    SET
      total_sales_count = total_sales_count + 1,
      total_revenue = total_revenue + NEW.total_harga,
      updated_at = now()
    WHERE tenant_id = v_tenant_id;
  ELSIF (TG_OP = 'DELETE') THEN
    v_tenant_id := OLD.tenant_id;
    UPDATE public.dashboard_stats_cache
    SET
      total_sales_count = total_sales_count - 1,
      total_revenue = total_revenue - OLD.total_harga,
      updated_at = now()
    WHERE tenant_id = v_tenant_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_tenant_id := NEW.tenant_id;
    UPDATE public.dashboard_stats_cache
    SET
      total_revenue = total_revenue - OLD.total_harga + NEW.total_harga,
      updated_at = now()
    WHERE tenant_id = v_tenant_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 16. Enforce Stock Pre-Checks on sync_product_stock() trigger to throw friendly exceptions on stock insufficiency
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger AS $$
DECLARE
  v_stok_saat_ini INT;
  v_nama_produk TEXT;
BEGIN
  -- Fetch current stock and name for user-friendly error messages
  SELECT stok_saat_ini, nama INTO v_stok_saat_ini, v_nama_produk
  FROM public.produk
  WHERE id = NEW.produk_id;

  IF (NEW.tipe = 'masuk') THEN
    UPDATE public.produk
    SET stok_saat_ini = stok_saat_ini + NEW.jumlah
    WHERE id = NEW.produk_id;
  ELSIF (NEW.tipe = 'keluar' OR NEW.tipe = 'penyesuaian') THEN
    -- Prevent transaction inserts when stock is insufficient
    IF v_stok_saat_ini < NEW.jumlah THEN
      RAISE EXCEPTION 'Stok tidak mencukupi untuk produk: % (Stok saat ini: %, Dibutuhkan: %)', 
        v_nama_produk, v_stok_saat_ini, NEW.jumlah;
    END IF;

    UPDATE public.produk
    SET stok_saat_ini = stok_saat_ini - NEW.jumlah
    WHERE id = NEW.produk_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 17. Recreate trigger_sync_product_stock as a BEFORE INSERT trigger to enforce validation prior to insertion
DROP TRIGGER IF EXISTS trigger_sync_product_stock ON public.stok_log;
CREATE TRIGGER trigger_sync_product_stock
BEFORE INSERT ON public.stok_log
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();

COMMIT;
