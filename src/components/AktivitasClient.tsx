'use client';

import React, { useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  History,
  Loader2,
  PlusCircle,
  Trash2,
  Tag,
  Coins,
  Boxes,
  UserCog,
  Filter,
  XCircle,
  Settings
} from 'lucide-react';

interface AuditEntry {
  id: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  detail: Record<string, any> | null;
  created_at: string;
}

interface Props {
  initialEntries: AuditEntry[];
  activeAction: string | null;
  hasMore: boolean;
  currentPage: number;
}

const ACTION_META: Record<
  string,
  { label: string; icon: React.ElementType; cls: string }
> = {
  product_create: { label: 'Produk Dibuat', icon: PlusCircle, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  product_delete: { label: 'Produk Dihapus', icon: Trash2, cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  price_change:   { label: 'Ubah Harga', icon: Tag, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  cost_change:    { label: 'Ubah Modal', icon: Coins, cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  stock_adjust:   { label: 'Penyesuaian Stok', icon: Boxes, cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  role_change:    { label: 'Ubah Peran', icon: UserCog, cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  sale_nullify:   { label: 'Transaksi Dibatalkan', icon: XCircle, cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  settings_update: { label: 'Pengaturan Diperbarui', icon: Settings, cls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
};

const FILTERS: { value: string | null; label: string }[] = [
  { value: null, label: 'Semua' },
  { value: 'price_change', label: 'Harga' },
  { value: 'cost_change', label: 'Modal' },
  { value: 'product_create', label: 'Dibuat' },
  { value: 'product_delete', label: 'Dihapus' },
  { value: 'stock_adjust', label: 'Stok' },
  { value: 'role_change', label: 'Peran' },
  { value: 'sale_nullify', label: 'Pembatalan' },
  { value: 'settings_update', label: 'Pengaturan Struk' },
];

const formatIDR = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

function describeDetail(entry: AuditEntry): string {
  const d = entry.detail || {};
  switch (entry.action) {
    case 'price_change':
      if (d.harga) return `${formatIDR(Number(d.harga.old))} → ${formatIDR(Number(d.harga.new))}`;
      return '';
    case 'cost_change':
      if (d.harga_modal) return `${formatIDR(Number(d.harga_modal.old))} → ${formatIDR(Number(d.harga_modal.new))}`;
      return '';
    case 'role_change':
      if (d.role) return `${d.role.old} → ${d.role.new}`;
      return '';
    case 'stock_adjust':
      return `${d.tipe === 'masuk' ? '+' : '−'}${d.jumlah ?? ''} (${d.keterangan ?? ''})`;
    case 'product_create':
      return d.kode_produk ? `SKU: ${d.kode_produk}` : '';
    case 'product_delete':
      return 'Dihapus permanen';
    case 'sale_nullify':
      return d.total_harga != null
        ? `${d.nomor_invoice ?? ''} • ${formatIDR(Number(d.total_harga))} dikembalikan`
        : (d.nomor_invoice ?? 'Transaksi dibatalkan');
    case 'settings_update': {
      const changes = [];
      if (d.tax_rate) {
        changes.push(`Pajak: ${d.tax_rate.old}% → ${d.tax_rate.new}%`);
      }
      if (d.fields && Array.isArray(d.fields)) {
        changes.push(`Edit: [${d.fields.join(', ')}]`);
      }
      return changes.join(' • ') || 'Pengaturan diperbarui';
    }
    default:
      return '';
  }
}

export default function AktivitasClient({
  initialEntries,
  activeAction,
  hasMore,
  currentPage,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const setFilter = (action: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (action) params.set('action', action);
    else params.delete('action');
    params.delete('page');
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  const changePage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  const hasPrevious = currentPage > 1;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <History className="h-6 w-6 text-indigo-400" />
          Riwayat Aktivitas
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Catatan permanen setiap perubahan penting: harga, modal, stok, produk, peran pengguna, dan pembatalan transaksi (Hanya Akses Owner).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">
          <Filter className="h-3.5 w-3.5" /> Filter
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            disabled={isPending}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeAction === f.value || (f.value === null && !activeAction)
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-indigo-400 ml-1" />}
      </div>

      <div className={`bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 shadow-xl overflow-x-auto transition-opacity ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
        {initialEntries.length === 0 ? (
          <div className="py-20 text-center text-slate-550 italic text-sm">
            Belum ada aktivitas tercatat pada filter ini.
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/20">
                <th className="py-4 px-5">Waktu</th>
                <th className="py-4 px-5">Pelaku</th>
                <th className="py-4 px-5">Aksi</th>
                <th className="py-4 px-5">Objek</th>
                <th className="py-4 px-5">Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60 text-xs text-slate-300">
              {initialEntries.map((e) => {
                const meta = ACTION_META[e.action] || { label: e.action, icon: History, cls: 'bg-slate-700/20 text-slate-300 border-slate-700/30' };
                const Icon = meta.icon;
                return (
                  <tr key={e.id} className="hover:bg-slate-950/20 transition-all">
                    <td className="py-4 px-5 text-slate-450 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="py-4 px-5 font-bold text-white">{e.actor_name || 'Pengguna'}</td>
                    <td className="py-4 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.cls}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-slate-200 font-semibold">{e.target_name || '—'}</td>
                    <td className="py-4 px-5 font-mono text-[11px] text-slate-400">{describeDetail(e)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {(hasPrevious || hasMore) && (
          <div className="flex items-center justify-between gap-4 bg-slate-950/30 p-4 border border-slate-855 rounded-2xl mt-6">
            <button
              onClick={() => changePage(currentPage - 1)}
              disabled={!hasPrevious || isPending}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-450 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Sebelumnya
            </button>
            <span className="text-xs text-slate-400 font-bold">Halaman {currentPage}</span>
            <button
              onClick={() => changePage(currentPage + 1)}
              disabled={!hasMore || isPending}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-455 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Selanjutnya
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
