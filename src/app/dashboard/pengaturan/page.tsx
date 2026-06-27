import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/supabase/auth';
import { canManageSettings } from '@/utils/permissions';
import { getSettings } from './actions';
import PengaturanClient from '@/components/PengaturanClient';

export default async function PengaturanPage() {
  const { profile } = await getAuthenticatedUser();

  if (!profile || !canManageSettings(profile.role)) {
    redirect('/dashboard');
  }

  const settings = await getSettings();

  return <PengaturanClient initialSettings={settings} />;
}
