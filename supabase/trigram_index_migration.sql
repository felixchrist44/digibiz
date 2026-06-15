-- SQL migration script to set up PostgreSQL Trigram Index and optimize write performance

-- 1. Enable the pg_trgm extension if not already present
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 2. Create GIN (Generalized Inverted Index) Trigram Index ONLY on the 'nama' column
-- This enables fast wildcard/fuzzy keyword searches (e.g., matching "Gel" inside "Pulpen Gel Hitam")
CREATE INDEX IF NOT EXISTS idx_produk_nama_trgm ON public.produk USING gin (nama gin_trgm_ops);

-- Note: 'kode_produk' is defined as UNIQUE in the schema, meaning PostgreSQL automatically 
-- creates a standard B-Tree index for it. This is highly efficient for exact/prefix matching.
-- We purposely avoid a GIN trigram index on 'kode_produk' to prevent index-write overhead.

-- 3. Optimize table storage fillfactor to 90%
-- This leaves 10% free space on database pages to allow PostgreSQL to perform HOT (Heap-Only Tuple)
-- updates during stock level changes, completely bypassing index updates during cashier checkouts.
ALTER TABLE public.produk SET (fillfactor = 90);
