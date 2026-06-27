-- 1. Add role column to tenant_invites with a default value of 'staff'
ALTER TABLE public.tenant_invites ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'staff';

-- 2. Backfill existing null values to 'staff'
UPDATE public.tenant_invites SET role = 'staff' WHERE role IS NULL;

-- 3. Add CHECK constraint to restrict invite roles to 'manager' or 'staff' only
ALTER TABLE public.tenant_invites DROP CONSTRAINT IF EXISTS tenant_invites_role_check;
ALTER TABLE public.tenant_invites ADD CONSTRAINT tenant_invites_role_check CHECK (role IN ('manager', 'staff'));

-- 4. Recreate trigger handle_new_user to fetch the role from tenant_invites and override raw metadata
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
