-- Storage tenant isolation for bucket 'product-images' (#3)
-- Restricts INSERT/UPDATE/DELETE to the caller's own folder: {tenant_id}/...
-- tenant_id is derived from the JWT (custom access token hook -> app_metadata.tenant_id),
-- never from client input. Missing claim => NULL comparison => denied (fails closed).
-- SELECT ("Allow public to read product images") is intentionally left bucket-wide:
-- storage UPDATE/DELETE require a SELECT policy that can see the row. If SELECT is ever
-- narrowed, scope it to the tenant folder; do NOT remove it.
-- Idempotent: safe to re-run.

BEGIN;

-- Legacy permissive policies (live names verified via pg_policies on 2026-10-23)
DROP POLICY IF EXISTS "Allow authenticated users to upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update product images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete product images" ON storage.objects;

-- New policies (dropped first for idempotency)
DROP POLICY IF EXISTS "product_images_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_tenant_delete" ON storage.objects;

CREATE POLICY "product_images_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

CREATE POLICY "product_images_tenant_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

CREATE POLICY "product_images_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

COMMIT;

-- Verify:
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY cmd;
