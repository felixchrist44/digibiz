<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architectural Roots of Trust & Guidelines

Whenever modifying the authentication, database schema, RLS policies, or transaction patterns, please notify the user about what will be affected and ensure the following core integrity mechanisms remain completely intact:

1. **Server-Side Tenant Derivation**: Always derive `tenant_id` from the custom access token claims via `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` inside SECURITY DEFINER RPCs and RLS USING clauses. Never trust tenant parameters sent directly from the client.
2. **Server-Authoritative Role Assignment**: Role check validations on user signup must remain database-authoritative (verified against `tenant_invites` table or set as `owner` on new tenant creation). Do not trust any user-supplied role parameters in the client metadata payload.
3. **Database-level Role Verification**: Always fetch user roles directly from `profiles` within state-changing/financial RPCs (`SELECT role FROM profiles WHERE id = auth.uid()`) to ensure instant propagation of role changes.
4. **Proxy Header Stripping**: The middleware/proxy must continue to strip client-supplied `x-user-*` headers before forwarding its own verified headers to prevent request header spoofing.
5. **No Direct Writes Bypass**: Mutations (sales, stock log adjustments, voids, prices, etc.) should only flow through server actions invoking SECURITY DEFINER RPCs. Direct PostgREST table writes (`INSERT`/`UPDATE`/`DELETE`) must remain locked down.
6. **Pre-Aggregated/Cached Reporting Freshness**: Dashboard counters (O(1)) are trigger-maintained via `dashboard_stats_cache`. Past date analytics must use cached materialized views on a schedule. Only the current period (today/this week) queries live database tables.
7. **COGS Snapshotting**: Standardize historical cost tracking by freezing `harga_modal_satuan` at sale time in the detail table to prevent financial drift from restocking actions.
8. **Realtime Broadcast Isolation**: Enforce single connection/channel-level isolation per tab centralized via the `CartProvider` component, scoped to `inventory-checkout-${tenantId}`.
