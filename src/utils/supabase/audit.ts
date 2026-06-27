import { SupabaseClient } from '@supabase/supabase-js';

export interface AuditLogParam {
  actor_id: string;
  actor_name: string;
  action:
    | 'product_create'
    | 'product_delete'
    | 'price_change'
    | 'cost_change'
    | 'stock_adjust'
    | 'role_change'
    | 'sale_nullify'
    | 'settings_update';
  target_type: string;
  target_id: string;
  target_name: string;
  detail: Record<string, any>;
  tenant_id?: string;
}

/**
 * Writes a single audit_log row.
 *
 * FIRE-AND-FORGET: this must NEVER throw or block the calling action.
 * If the audit insert fails, we log to the server console and return.
 * The caller's primary operation (sale void, stock adjust, product
 * edit, etc.) has already happened and must not be reported as failed
 * just because the audit write failed.
 *
 * tenant_id is optional: if omitted, the audit_log column DEFAULT
 * (derived from the JWT app_metadata.tenant_id) fills it, and RLS
 * enforces it can only be the caller's own tenant.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  log: AuditLogParam
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert(log);
    if (error) {
      // Log only — do NOT throw. Never block the primary action.
      console.error('Failed to write audit log:', error.message);
    }
  } catch (err) {
    console.error('Audit log write threw unexpectedly:', err);
  }
}
