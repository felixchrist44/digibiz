'use client';

import React, { useState, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toggleUserRole } from '@/app/dashboard/users/actions';
import {
  Users,
  ShieldCheck,
  Shield,
  Calendar,
  Lock,
  UserCheck,
  UserCog
} from 'lucide-react';
import { Profile } from '@/types/database';

interface Props {
  initialProfiles: Profile[];
  currentUserId: string;
  currentUserRole: 'owner' | 'staff';
}

export default function UsersClient({ initialProfiles, currentUserId, currentUserRole }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [isPending, startTransition] = useTransition();

  const isOwner = currentUserRole === 'owner';

  const handleRoleToggle = async (profile: Profile) => {
    if (!confirm(`Apakah Anda yakin ingin mengubah peran "${profile.full_name}" menjadi ${profile.role === 'owner' ? 'Staff' : 'Owner'}?`)) return;

    startTransition(async () => {
      const res = await toggleUserRole(profile.id, profile.role);
      if (res?.error) {
        alert(res.error);
      } else {
        // Refresh local list
        const supabase = createClient();
        const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (data) setProfiles(data as Profile[]);
      }
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white font-sans">Daftar Pengguna & Staff</h1>
        <p className="text-xs text-slate-400 mt-1">Daftar seluruh personil yang memiliki akses masuk ke dasbor DigiBiz.</p>
      </div>

      {/* Role Restriction Banner for Staff */}
      {!isOwner && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-550/20 rounded-2xl text-amber-400 text-xs shadow-inner">
          <Lock className="h-4 w-4 shrink-0 animate-pulse" />
          <span>
            <strong>Akses Staff Terbatas:</strong> Anda dapat melihat daftar pengguna aktif, namun hanya <strong>Owner</strong> yang berhak mengubah peran atau tingkat wewenang akun.
          </span>
        </div>
      )}

      {/* User cards list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {profiles.map((p) => {
          const isSelf = p.id === currentUserId;
          const userIsOwner = p.role === 'owner';

          // Get initials for avatar
          const initials = p.full_name
            ? p.full_name
                .split(' ')
                .map(n => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            : 'ST';

          return (
            <div
              key={p.id}
              className={`bg-slate-900/40 backdrop-blur border rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-6 transition-all duration-200 ${
                isSelf ? 'border-indigo-500/50 shadow-indigo-950/10' : 'border-slate-800/80 hover:border-slate-700/60'
              }`}
            >
              {/* Top Section */}
              <div className="flex items-start gap-4">
                {/* Initials Avatar */}
                <div className="h-12 w-12 rounded-2xl bg-indigo-650/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-extrabold text-sm shadow-inner">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-white tracking-tight truncate">{p.full_name}</h4>
                    {isSelf && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-bold uppercase tracking-wider">
                        Anda
                      </span>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                    userIsOwner
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10'
                      : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/10'
                  }`}>
                    {userIsOwner ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                    {p.role}
                  </span>
                </div>
              </div>

              {/* Bottom stats & toggle action */}
              <div className="pt-4 border-t border-slate-850 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-450">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    Dibuat:{' '}
                    {new Date(p.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                {isOwner && !isSelf && (
                  <button
                    onClick={() => handleRoleToggle(p)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/40 border border-slate-800 hover:border-slate-700 text-slate-350 hover:text-white rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    <UserCog className="h-3.5 w-3.5 text-indigo-400" />
                    Ubah Peran
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
