'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { canManageSettings } from '@/utils/permissions';
import { writeAuditLog } from '@/utils/supabase/audit';
import { revalidatePath } from 'next/cache';
import { TenantSettings } from '@/types/database';

export async function getSettings(): Promise<TenantSettings> {
  const { profile, supabase } = await getAuthenticatedUser();
  if (!profile) {
    throw new Error('Sesi kedaluwarsa. Silakan masuk kembali.');
  }

  const { data, error } = await supabase
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .single();

  const defaultSettings: TenantSettings = {
    tenant_id: profile.tenant_id,
    store_name: 'Toko Baru',
    store_address: null,
    receipt_header: null,
    receipt_footer: null,
    tax_enabled: false,
    tax_rate: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (error || !data) {
    return defaultSettings;
  }

  return {
    ...defaultSettings,
    ...data,
  } as TenantSettings;
}

export async function updateSettings(formData: FormData) {
  try {
    const { profile, supabase } = await getAuthenticatedUser();

    if (!profile || !canManageSettings(profile.role)) {
      return { error: 'Hanya Owner yang berhak mengubah pengaturan toko.' };
    }

    const store_name = formData.get('store_name') as string;
    const store_address = formData.get('store_address') as string;
    const receipt_header = formData.get('receipt_header') as string;
    const receipt_footer = formData.get('receipt_footer') as string;
    const tax_enabled = formData.get('tax_enabled') === 'true' || formData.get('tax_enabled') === 'on';
    const tax_rate_raw = formData.get('tax_rate');
    
    if (!store_name || store_name.trim() === '') {
      return { error: 'Nama toko wajib diisi.' };
    }

    let tax_rate = 0.00;
    if (tax_enabled) {
      tax_rate = parseFloat(tax_rate_raw as string);
      if (isNaN(tax_rate) || tax_rate < 0) {
        return { error: 'Persentase pajak harus berupa angka lebih besar atau sama dengan 0.' };
      }
    }

    // Read the current settings for audit logging comparison
    const { data: oldSettings } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .single();

    const updatedSettings = {
      tenant_id: profile.tenant_id,
      store_name: store_name.trim(),
      store_address: store_address ? store_address.trim() : null,
      receipt_header: receipt_header ? receipt_header.trim() : null,
      receipt_footer: receipt_footer ? receipt_footer.trim() : null,
      tax_enabled,
      tax_rate,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('tenant_settings')
      .upsert(updatedSettings, { onConflict: 'tenant_id' });

    if (upsertError) {
      return { error: `Gagal memperbarui pengaturan: ${upsertError.message}` };
    }

    // Write audit log if oldSettings exists (which it should due to backfill/owner creation)
    if (oldSettings) {
      const editedFields: string[] = [];
      const detail: Record<string, any> = {};

      if (oldSettings.store_name !== updatedSettings.store_name) editedFields.push('store_name');
      if ((oldSettings.store_address || '') !== (updatedSettings.store_address || '')) editedFields.push('store_address');
      if ((oldSettings.receipt_header || '') !== (updatedSettings.receipt_header || '')) editedFields.push('receipt_header');
      if ((oldSettings.receipt_footer || '') !== (updatedSettings.receipt_footer || '')) editedFields.push('receipt_footer');
      if (oldSettings.tax_enabled !== updatedSettings.tax_enabled) editedFields.push('tax_enabled');
      if (Number(oldSettings.tax_rate) !== Number(updatedSettings.tax_rate)) {
        editedFields.push('tax_rate');
        detail.tax_rate = {
          old: Number(oldSettings.tax_rate),
          new: Number(updatedSettings.tax_rate),
        };
      }

      if (editedFields.length > 0) {
        detail.fields = editedFields;
        // Fire and forget
        writeAuditLog(supabase, {
          actor_id: profile.id,
          actor_name: profile.full_name || 'Owner',
          action: 'settings_update',
          target_type: 'settings',
          target_id: profile.tenant_id,
          target_name: updatedSettings.store_name,
          detail,
          tenant_id: profile.tenant_id,
        }).catch((err) => console.error('Failed to dispatch audit log:', err));
      }
    }

    revalidatePath('/dashboard/pengaturan');
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Terjadi kesalahan internal server.' };
  }
}
