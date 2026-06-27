'use client';

import React, { useState, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { updateUserRole, createInvite } from '@/app/dashboard/users/actions';
import {
  Users,
  ShieldCheck,
  Shield,
  Calendar,
  Lock,
  UserCheck,
  UserCog,
  UserPlus,
  X,
  CheckCircle,
  Copy
} from 'lucide-react';
import { Profile, UserRole } from '@/types/database';

interface Props {
  initialProfiles: Profile[];
  currentUserId: string;
  currentUserRole: UserRole;
}

export default function UsersClient({ initialProfiles, currentUserId, currentUserRole }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [isPending, startTransition] = useTransition();

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInvitePending, startInviteTransition] = useTransition();

  const isOwner = currentUserRole === 'owner';

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setInviteError(null);
    setInviteLink('');
    setCopied(false);

    const formData = new FormData(e.currentTarget);
    startInviteTransition(async () => {
      const res = await createInvite(formData);
      if (res?.error) {
        setInviteError(res.error);
      } else if (res?.success && res.inviteLink) {
        setInviteLink(res.inviteLink);
      }
    });
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert('Gagal menyalin tautan.');
    }
  };

  const handleRoleChange = async (profile: Profile, targetRole: UserRole) => {
    if (profile.role === targetRole) return;

    const formatRole = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

    if (!confirm(`Apakah Anda yakin ingin mengubah peran "${profile.full_name}" dari ${formatRole(profile.role)} menjadi ${formatRole(targetRole)}?`)) {
      return;
    }

    startTransition(async () => {
      const res = await updateUserRole(profile.id, targetRole);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-sans">Daftar Pengguna & Staff</h1>
          <p className="text-xs text-slate-400 mt-1">Daftar seluruh personil yang memiliki akses masuk ke dasbor DigiBiz.</p>
        </div>
        {isOwner && (
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-semibold shadow-lg hover:shadow-indigo-500/20 transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Undang Staff
          </button>
        )}
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
                  <div className="flex items-center gap-2">
                    <UserCog className="h-3.5 w-3.5 text-indigo-400" />
                    <select
                      value={p.role}
                      onChange={(e) => handleRoleChange(p, e.target.value as UserRole)}
                      disabled={isPending}
                      className="px-2 py-1.5 bg-slate-950/60 border border-slate-800 text-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="staff">Staff</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ==================== INVITE STAFF MODAL ==================== */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setIsInviteModalOpen(false);
                setInviteError(null);
                setInviteLink('');
                setCopied(false);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-2">Undang Staff Baru</h2>
            <p className="text-xs text-slate-400 mb-6">Undang anggota staff baru untuk bergabung ke toko Anda.</p>

            {inviteLink ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-450" />
                    Undangan Berhasil Dibuat
                  </div>
                  <span>Undangan ini hanya berlaku selama 7 hari dari sekarang.</span>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Tautan Undangan</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteLink}
                      className="flex-1 px-3 py-2.5 bg-slate-950/60 border border-slate-850 rounded-xl text-slate-300 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer"
                    >
                      {copied ? 'Tersalin' : 'Salin'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-850">
                  <button
                    type="button"
                    onClick={() => {
                      setIsInviteModalOpen(false);
                      setInviteError(null);
                      setInviteLink('');
                      setCopied(false);
                    }}
                    className="px-4 py-2.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-5">
                {inviteError && (
                  <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">
                    {inviteError}
                  </div>
                )}

                <div>
                  <label htmlFor="invite-email" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Email Tujuan
                  </label>
                  <input
                    id="invite-email"
                    name="email"
                    type="email"
                    required
                    placeholder="nama.staff@email.com"
                    className="w-full px-3 py-2.5 bg-slate-955/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="invite-role" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Peran / Jabatan
                  </label>
                  <select
                    id="invite-role"
                    name="role"
                    className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-350 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-850">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-950/40 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isInvitePending}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isInvitePending ? 'Membuat...' : 'Buat Undangan'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
