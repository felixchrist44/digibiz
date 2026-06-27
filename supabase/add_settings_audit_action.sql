-- SQL migration script to update audit_log action check constraint to include settings_update

-- 1. Drop the existing CHECK constraint
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;

-- 2. Recreate CHECK constraint with all previous actions plus settings_update
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check CHECK (
    action IN (
        'product_create',
        'product_delete',
        'price_change',
        'cost_change',
        'stock_adjust',
        'role_change',
        'sale_nullify',
        'settings_update'
    )
);
