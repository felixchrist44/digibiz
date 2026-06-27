-- SQL migration script to update RPC functions for Owner OR Manager access

-- 1. Drop existing adjust_stock_manual function overloads
DROP FUNCTION IF EXISTS public.adjust_stock_manual(UUID, VARCHAR, INTEGER, TEXT, UUID);
DROP FUNCTION IF EXISTS public.adjust_stock_manual(UUID, TEXT, INTEGER, TEXT, UUID);

-- 2. Re-create adjust_stock_manual to support both owner and manager roles
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

  -- Defense-in-depth: check if caller's profile role is owner or manager
  SELECT role INTO v_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  IF v_role IS DISTINCT FROM 'owner' AND v_role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Hanya Owner atau Manager yang berhak melakukan penyesuaian stok manual.';
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

-- 3. Update public.nullify_penjualan to allow owner OR manager
CREATE OR REPLACE FUNCTION public.nullify_penjualan(
  p_penjualan_id UUID,
  p_dibuat_oleh  UUID
) RETURNS TABLE(nomor_invoice TEXT, total_harga NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_invoice   TEXT;
  v_total     NUMERIC;
  v_item      RECORD;
BEGIN
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  SELECT role INTO v_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  IF v_role IS DISTINCT FROM 'owner' AND v_role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Hanya Owner atau Manager yang berhak membatalkan transaksi.';
  END IF;

  SELECT p.nomor_invoice, p.total_harga INTO v_invoice, v_total
  FROM public.penjualan p
  WHERE p.id = p_penjualan_id AND p.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan atau bukan milik toko ini.';
  END IF;

  FOR v_item IN
    SELECT produk_id, jumlah FROM public.detail_penjualan
    WHERE penjualan_id = p_penjualan_id AND produk_id IS NOT NULL
  LOOP
    INSERT INTO public.stok_log (tenant_id, produk_id, tipe, jumlah, keterangan, dibuat_oleh)
    VALUES (v_tenant_id, v_item.produk_id, 'masuk', v_item.jumlah,
            'Pengembalian stok dari pembatalan invoice: ' || v_invoice, p_dibuat_oleh);
  END LOOP;

  DELETE FROM public.penjualan WHERE id = p_penjualan_id AND tenant_id = v_tenant_id;

  RETURN QUERY SELECT v_invoice, v_total;
END;
$$;
