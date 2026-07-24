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

  try {
    const settings = await getSettings();
    return <PengaturanClient initialSettings={settings} />;
  } catch (err: any) {
    return (
      <div className="p-6 max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-3xl mt-12 text-center space-y-4 shadow-2xl relative">
        <h2 className="text-xl font-bold text-red-400">Gagal Memuat Pengaturan</h2>
        <p className="text-sm text-slate-400">
          {err.message || 'Terjadi kesalahan sistem saat memuat pengaturan toko.'}
        </p>
        <div className="pt-2">
          <a
            href="/dashboard"
            className="inline-block px-5 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md active:scale-[0.98]"
          >
            Kembali ke Dashboard
          </a>
        </div>
      </div>
    );
  }
}
