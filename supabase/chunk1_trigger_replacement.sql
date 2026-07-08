-- SQL Migration: Chunk 1 - Dashboard Trigger Replacement
-- Location: supabase/chunk1_trigger_replacement.sql

-- 1. Drop the sync trigger on penjualan to eliminate write contention during checkout
DROP TRIGGER IF EXISTS trigger_sync_dashboard_sales_stats ON public.penjualan;

-- 2. Create the reconciliation function to compute stats directly from source
CREATE OR REPLACE FUNCTION public.reconcile_dashboard_sales_stats()
RETURNS void AS $$
BEGIN
  UPDATE public.dashboard_stats_cache cache
  SET
    total_sales_count = (
      SELECT COUNT(*)::int FROM public.penjualan p
      WHERE p.tenant_id = cache.tenant_id
    ),
    total_revenue = (
      SELECT COALESCE(SUM(p.total_harga), 0.00)::numeric FROM public.penjualan p
      WHERE p.tenant_id = cache.tenant_id
    ),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Schedule pg_cron to run the reconciliation every 1 minute
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reconcile-dashboard-sales-stats-job';
SELECT cron.schedule(
  'reconcile-dashboard-sales-stats-job',
  '* * * * *',
  $$ SELECT public.reconcile_dashboard_sales_stats(); $$
);
