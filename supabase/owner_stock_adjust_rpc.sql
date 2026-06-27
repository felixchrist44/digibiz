-- ============================================================
-- DEFENSE-IN-DEPTH OWNER-ONLY STOCK ADJUST RPC
-- ============================================================

BEGIN;

-- Drop both overloaded functions to clear function ambiguity
DROP FUNCTION IF EXISTS public.adjust_stock_manual(UUID, VARCHAR, INTEGER, TEXT, UUID);
DROP FUNCTION IF EXISTS public.adjust_stock_manual(UUID, TEXT, INTEGER, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.adjust_stock_manual(
  p_produk_id UUID,
  p_tipe VARCHAR,
  p_jumlah INTEGER,
  p_keterangan TEXT,
  p_dibuat_oleh UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_stok_saat_ini INTEGER;
BEGIN
  -- Derive tenant identity securely from JWT metadata
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Defense-in-depth: check if caller's profile role is owner
  SELECT role INTO v_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Hanya Owner yang berhak melakukan penyesuaian stok manual.';
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

COMMIT;
