-- Database Hardening: Revoke Direct Table Writes on produk and Setup SECURITY DEFINER RPCs
-- Location: supabase/lockdown_produk.sql

BEGIN;

-- 1. Rescope unique constraint on public.produk to be tenant-scoped instead of globally unique
ALTER TABLE public.produk DROP CONSTRAINT IF EXISTS produk_kode_produk_key;
ALTER TABLE public.produk ADD CONSTRAINT produk_tenant_kode_produk_key UNIQUE (tenant_id, kode_produk);

-- 2. Drop existing write policies on public.produk
DROP POLICY IF EXISTS "Allow all write on produk for owners only" ON public.produk;
DROP POLICY IF EXISTS "Allow staff to update stock-only fields" ON public.produk;

-- 3. Revoke direct write grants on public.produk table
REVOKE INSERT, UPDATE, DELETE ON public.produk FROM authenticated, anon;

-- 4. Drop existing function signatures to avoid PostgREST overload ambiguity
DROP FUNCTION IF EXISTS public.create_produk(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.update_produk(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.delete_produk(UUID);

-- 5. Create create_produk RPC
CREATE OR REPLACE FUNCTION public.create_produk(
  p_kode_produk TEXT,
  p_nama TEXT,
  p_deskripsi TEXT,
  p_harga NUMERIC,
  p_harga_modal NUMERIC,
  p_stok_awal INTEGER,
  p_gambar_url TEXT,
  p_is_generated BOOLEAN
) RETURNS public.produk LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_new_product public.produk;
  v_final_code TEXT;
  v_retries INTEGER := 5;
  v_barcode_str TEXT;
  v_chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_loop_idx INTEGER;
BEGIN
  -- Derive tenant from JWT
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Read role from profiles (authoritative check)
  SELECT role INTO v_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Hanya Owner yang berhak menambahkan produk baru.';
  END IF;

  v_final_code := trim(p_kode_produk);

  IF p_is_generated OR v_final_code IS NULL OR v_final_code = '' THEN
    WHILE v_retries > 0 LOOP
      v_barcode_str := '';
      FOR v_loop_idx IN 1..8 LOOP
        v_barcode_str := v_barcode_str || substr(v_chars, floor(random() * 36)::integer + 1, 1);
      END LOOP;
      v_final_code := 'DB-' || v_barcode_str;

      BEGIN
        INSERT INTO public.produk (
          tenant_id,
          kode_produk,
          nama,
          deskripsi,
          harga,
          harga_modal,
          stok_saat_ini,
          gambar_url,
          is_generated
        ) VALUES (
          v_tenant_id,
          v_final_code,
          p_nama,
          p_deskripsi,
          p_harga,
          p_harga_modal,
          0, -- stock initialized to 0
          p_gambar_url,
          true -- hardcode true for generated branch
        ) RETURNING * INTO v_new_product;

        -- Success: break from retry loop
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        v_retries := v_retries - 1;
        IF v_retries = 0 THEN
          RAISE EXCEPTION 'Gagal membuat kode produk unik secara otomatis. Silakan coba lagi.';
        END IF;
      END;
    END LOOP;
  ELSE
    BEGIN
      INSERT INTO public.produk (
        tenant_id,
        kode_produk,
        nama,
        deskripsi,
        harga,
        harga_modal,
        stok_saat_ini,
        gambar_url,
        is_generated
      ) VALUES (
        v_tenant_id,
        v_final_code,
        p_nama,
        p_deskripsi,
        p_harga,
        p_harga_modal,
        0, -- stock initialized to 0
        p_gambar_url,
        false -- hardcode false for user-supplied branch
      ) RETURNING * INTO v_new_product;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Kode produk sudah terdaftar.';
    END;
  END IF;

  -- Unambiguous stock sequence: Write initial stock to stok_log if p_stok_awal > 0
  IF p_stok_awal > 0 THEN
    INSERT INTO public.stok_log (
      tenant_id,
      produk_id,
      tipe,
      jumlah,
      keterangan,
      dibuat_oleh
    ) VALUES (
      v_tenant_id,
      v_new_product.id,
      'masuk',
      p_stok_awal,
      'Stok awal produk baru',
      auth.uid()
    );

    -- Reload the updated stock to return accurate data
    SELECT * INTO v_new_product FROM public.produk WHERE id = v_new_product.id;
  END IF;

  -- Write audit log entry
  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    actor_name,
    action,
    target_type,
    target_id,
    target_name,
    detail
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id), 'Owner'),
    'product_create',
    'produk',
    v_new_product.id,
    p_nama,
    jsonb_build_object(
      'kode_produk', v_final_code,
      'harga', p_harga,
      'harga_modal', p_harga_modal,
      'stok_awal', p_stok_awal
    )
  );

  RETURN v_new_product;
END;
$$;

-- 6. Create update_produk RPC
CREATE OR REPLACE FUNCTION public.update_produk(
  p_id UUID,
  p_nama TEXT,
  p_deskripsi TEXT,
  p_harga NUMERIC,
  p_harga_modal NUMERIC,
  p_gambar_url TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_old_harga NUMERIC;
  v_old_harga_modal NUMERIC;
  v_old_nama TEXT;
BEGIN
  -- Derive tenant from JWT
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Read role from profiles
  SELECT role INTO v_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  -- Lock product row and retrieve old values
  SELECT harga, harga_modal, nama INTO v_old_harga, v_old_harga_modal, v_old_nama
  FROM public.produk
  WHERE id = p_id AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau bukan milik tenant ini.';
  END IF;

  -- Role-based checks: Owner+Manager can change price (harga), Owner-only can change cost (harga_modal)
  IF p_harga IS DISTINCT FROM v_old_harga THEN
    IF v_role IS DISTINCT FROM 'owner' AND v_role IS DISTINCT FROM 'manager' THEN
      RAISE EXCEPTION 'Hanya Owner atau Manager yang dapat mengubah harga produk.';
    END IF;
  END IF;

  -- COALESCE both sides to 0 to prevent false-triggers on NULL/0 comparison when manager edits name
  IF COALESCE(p_harga_modal, 0) IS DISTINCT FROM COALESCE(v_old_harga_modal, 0) THEN
    IF v_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Hanya Owner yang dapat mengubah harga modal produk.';
    END IF;
  END IF;

  -- Perform UPDATE (use COALESCE to keep existing image/cost if action passes null)
  UPDATE public.produk
  SET
    nama = p_nama,
    deskripsi = p_deskripsi,
    harga = p_harga,
    harga_modal = COALESCE(p_harga_modal, harga_modal),
    gambar_url = COALESCE(p_gambar_url, gambar_url)
  WHERE id = p_id AND tenant_id = v_tenant_id;

  -- Write audit log entries (only when prices change, just like the original action)
  IF p_harga IS DISTINCT FROM v_old_harga THEN
    INSERT INTO public.audit_log (
      tenant_id,
      actor_id,
      actor_name,
      action,
      target_type,
      target_id,
      target_name,
      detail
    ) VALUES (
      v_tenant_id,
      auth.uid(),
      coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id), 'User'),
      'price_change',
      'produk',
      p_id,
      p_nama,
      jsonb_build_object(
        'harga', jsonb_build_object('old', v_old_harga, 'new', p_harga)
      )
    );
  END IF;

  -- Use COALESCE on compared values to log correctly
  IF COALESCE(p_harga_modal, 0) IS DISTINCT FROM COALESCE(v_old_harga_modal, 0) THEN
    INSERT INTO public.audit_log (
      tenant_id,
      actor_id,
      actor_name,
      action,
      target_type,
      target_id,
      target_name,
      detail
    ) VALUES (
      v_tenant_id,
      auth.uid(),
      coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id), 'User'),
      'cost_change',
      'produk',
      p_id,
      p_nama,
      jsonb_build_object(
        'harga_modal', jsonb_build_object('old', coalesce(v_old_harga_modal, 0), 'new', coalesce(p_harga_modal, 0))
      )
    );
  END IF;
END;
$$;

-- 7. Create delete_produk RPC
CREATE OR REPLACE FUNCTION public.delete_produk(
  p_id UUID
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_nama TEXT;
  v_gambar_url TEXT;
BEGIN
  -- Derive tenant from JWT
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID tidak ditemukan di session JWT. Silakan login kembali.';
  END IF;

  -- Read role from profiles
  SELECT role INTO v_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  -- Verify role
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Hanya Owner yang berhak menghapus produk.';
  END IF;

  -- Get product name & image URL before deleting
  SELECT nama, gambar_url INTO v_nama, v_gambar_url
  FROM public.produk
  WHERE id = p_id AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau bukan milik tenant ini.';
  END IF;

  -- Delete product
  DELETE FROM public.produk
  WHERE id = p_id AND tenant_id = v_tenant_id;

  -- Write audit log
  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    actor_name,
    action,
    target_type,
    target_id,
    target_name,
    detail
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id), 'Owner'),
    'product_delete',
    'produk',
    p_id,
    v_nama,
    jsonb_build_object(
      'nama', v_nama,
      'deleted_at', timezone('utc'::text, now())
    )
  );

  -- Return the image URL so the server action can delete it from storage
  RETURN v_gambar_url;
END;
$$;

-- 8. Grant EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION public.create_produk(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_produk(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_produk(UUID) TO authenticated;

COMMIT;
