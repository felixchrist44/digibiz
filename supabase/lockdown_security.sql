-- Database Hardening: Revoke Direct Table Writes and Setup set_user_role RPC
-- Location: supabase/lockdown_security.sql

BEGIN;

-- 1. Revoke direct write grants on tables where SECURITY DEFINER RPCs are the only mutation paths.
--    SELECT is retained so client-side direct reads are unaffected.
REVOKE INSERT, UPDATE, DELETE ON public.penjualan        FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.detail_penjualan FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.stok_log         FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles         FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.dashboard_stats_cache FROM authenticated, anon;

-- 2. Owner-gated user role update RPC (prevents self-escalation)
CREATE OR REPLACE FUNCTION public.set_user_role(
  p_target_user_id UUID,
  p_new_role TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_actor_role TEXT;
BEGIN
  -- Securely derive tenant from JWT
  v_tenant_id := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant tidak ditemukan di sesi.';
  END IF;

  -- Get actor role directly from table (authoritative)
  SELECT role INTO v_actor_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  IF v_actor_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Hanya Owner yang berhak mengubah peran pengguna.';
  END IF;

  -- Prevent self-demotion or self-change
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak dapat mengubah peran Anda sendiri.';
  END IF;

  -- Validate target role
  IF p_new_role NOT IN ('owner', 'manager', 'staff') THEN
    RAISE EXCEPTION 'Peran tidak valid.';
  END IF;

  -- Update target profile role
  UPDATE public.profiles
  SET role = p_new_role
  WHERE id = p_target_user_id AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengguna tidak ditemukan.';
  END IF;
END;
$$;

-- Secure grants on the new RPC function
REVOKE ALL ON FUNCTION public.set_user_role(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

COMMIT;
