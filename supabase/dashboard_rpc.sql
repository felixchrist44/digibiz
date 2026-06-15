-- SQL migration script to register the get_total_revenue database RPC helper in Supabase

CREATE OR REPLACE FUNCTION get_total_revenue()
RETURNS numeric AS $$
  SELECT COALESCE(SUM(total_harga), 0) FROM public.penjualan;
$$ LANGUAGE sql SECURITY DEFINER;
