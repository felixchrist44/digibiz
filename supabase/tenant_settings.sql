-- 1. Create tenant_settings table
DROP TABLE IF EXISTS public.tenant_settings CASCADE;

CREATE TABLE public.tenant_settings (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    store_address TEXT,
    receipt_header TEXT DEFAULT NULL,
    receipt_footer TEXT DEFAULT NULL,
    tax_enabled BOOLEAN DEFAULT false NOT NULL,
    tax_rate NUMERIC(5,2) DEFAULT 0.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Configure Column Defaults for automatic tenant ID resolution
ALTER TABLE public.tenant_settings ALTER COLUMN tenant_id SET DEFAULT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

-- 3. Enable RLS and setup tenant-isolation policy
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_settings_tenant_isolation" ON public.tenant_settings;
CREATE POLICY "tenant_settings_tenant_isolation" ON public.tenant_settings
    FOR ALL USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- 4. Backfill existing tenants into tenant_settings
INSERT INTO public.tenant_settings (tenant_id, store_name)
SELECT id, nama_toko 
FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- 5. Recreate trigger handle_new_user to automatically initialize tenant_settings upon new owner signup
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

  -- If invite_token is provided, look up the tenant and the configured role
  IF v_invite_token IS NOT NULL THEN
    SELECT tenant_id, role INTO v_tenant_id, v_role 
    FROM public.tenant_invites
    WHERE token = v_invite_token 
      AND expires_at > now()
      AND used_at IS NULL;
      
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Token undangan tidak valid atau sudah kadaluarsa.';
    END IF;
    
    -- Ensure fallback in case of NULL
    IF v_role IS NULL THEN
      v_role := 'staff';
    END IF;
    
    -- Mark invite as used
    UPDATE public.tenant_invites SET used_at = now() WHERE token = v_invite_token;

  -- If neither is provided, create a new tenant (owner signup path)
  ELSIF v_tenant_id_raw IS NULL THEN
    v_tenant_name := COALESCE(new.raw_user_meta_data->>'nama_toko', 'Toko Baru');
    INSERT INTO public.tenants (nama_toko)
    VALUES (v_tenant_name)
    RETURNING id INTO v_tenant_id;
    
    -- Seed default tenant settings for the new tenant
    INSERT INTO public.tenant_settings (tenant_id, store_name)
    VALUES (v_tenant_id, v_tenant_name);
    
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
