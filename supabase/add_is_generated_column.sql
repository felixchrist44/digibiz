-- SQL migration script to add 'is_generated' column and backfill existing mock products

-- 1. Add is_generated column to public.produk table if it doesn't exist
ALTER TABLE public.produk ADD COLUMN IF NOT EXISTS is_generated boolean DEFAULT false;

-- 2. Backfill existing mock products as generated
UPDATE public.produk
SET is_generated = true
WHERE kode_produk LIKE 'DUMMY%'
   OR kode_produk LIKE 'NEW-%'
   OR kode_produk LIKE 'TEST-%'
   OR kode_produk = 'B001';
