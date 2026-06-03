'use client';

import React, { useState, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { adjustStok } from '@/app/dashboard/stok/actions';
import {
  Search,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  X,
  History,
  CheckCircle,
  TrendingDown
} from 'lucide-react';
import { StokLog, Produk } from '@/types/database';

interface Props {
  initialLogs: StokLog[];
  products: Produk[];
}

export default function StokClient({ initialLogs, products }: Props) {
  const [logs, setLogs] = useState<StokLog[]>(initialLogs);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'masuk' | 'keluar'>('all');
  const [isPending, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filter Logic
  const filteredLogs = logs.filter(log => {
    const productName = log.produk?.nama || '';
    const matchesSearch = productName.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filter === 'masuk') return log.tipe === 'masuk';
    if (filter === 'keluar') return log.tipe === 'keluar';
    return true;
  });

  const handleAdjustSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await adjustStok(formData);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage('Mutasi stok berhasil dicatat.');
        // Refresh logs list locally
        const supabase = createClient();
        const { data } = await supabase
          .from('stok_log')
          .select('*, produk(nama), profiles(full_name)')
          .order('created_at', { ascending: false });
        if (data) setLogs(data as any[]);
        
        setTimeout(() => {
          setIsOpen(false);
          setSuccessMessage(null);
        }, 1200);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Riwayat Mutasi Stok</h1>
          <p className="text-xs text-slate-400 mt-1">Pantau dan catat seluruh pergerakan masuk dan keluar barang.</p>
        </div>
        <button
          onClick={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
            setIsOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-sm font-semibold transition-all duration-150 shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Catat Mutasi Stok
        </button>
      </div>

      {/* Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/30 p-4 border border-slate-850 rounded-2xl backdrop-blur-md">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-450" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Filter type */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-450 font-medium whitespace-nowrap">Filter Arah:</span>
          <select
            value={filter}
            onChange={(e: any) => setFilter(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-350 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="all">Semua Mutasi</option>
            <option value="masuk">Masuk (Stok Bertambah)</option>
            <option value="keluar">Keluar (Stok Berkurang)</option>
          </select>
        </div>

        <div className="flex items-center justify-end text-xs text-slate-455 font-medium px-1">
          Menampilkan {filteredLogs.length} riwayat
        </div>
      </div>

      {/* History table list */}
      <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 shadow-xl overflow-x-auto">
        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center justify-center text-slate-500">
            <History className="h-10 w-10 text-slate-650 mb-2 animate-spin-slow" />
            <p className="font-semibold text-slate-400">Tidak ada riwayat mutasi stok ditemukan.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-semibold text-slate-450 uppercase tracking-wider">
                <th className="pb-3 font-semibold">Waktu / Tanggal</th>
                <th className="pb-3 font-semibold">Nama Produk</th>
                <th className="pb-3 font-semibold">Arah</th>
                <th className="pb-3 font-semibold">Jumlah</th>
                <th className="pb-3 font-semibold">Keterangan</th>
                <th className="pb-3 font-semibold">Petugas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/50 text-sm text-slate-300">
              {filteredLogs.map((log) => {
                const isMasuk = log.tipe === 'masuk';
                return (
                  <tr key={log.id} className="hover:bg-slate-900/10 transition-colors duration-100">
                    <td className="py-4 text-slate-450">
                      {new Date(log.created_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-4 font-semibold text-white">{log.produk?.nama || 'Produk dihapus'}</td>
                    <td className="py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                        isMasuk
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                          : 'bg-red-500/10 text-red-400 border border-red-500/10'
                      }`}>
                        {isMasuk ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                        {isMasuk ? 'Masuk' : 'Keluar'}
                      </span>
                    </td>
                    <td className={`py-4 font-bold ${isMasuk ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isMasuk ? '+' : '-'}{log.jumlah} Pcs
                    </td>
                    <td className="py-4 text-slate-400 text-xs italic">{log.keterangan || '-'}</td>
                    <td className="py-4 text-slate-400 text-xs">{log.profiles?.full_name || 'Sistem / Operator'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ==================== ADJUST STOCK MODAL ==================== */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-2">Catat Mutasi Stok</h2>
            <p className="text-xs text-slate-400 mb-6">Tambahkan data penyesuaian produk masuk atau keluar secara manual.</p>

            <form onSubmit={handleAdjustSubmit} className="space-y-5">
              {errorMessage && <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">{errorMessage}</div>}
              {successMessage && <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 flex items-center gap-2"><CheckCircle className="h-4 w-4 shrink-0" />{successMessage}</div>}

              {/* Select Product */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pilih Produk</label>
                <select
                  name="produk_id"
                  required
                  className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="">-- Pilih Barang --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nama} (Stok: {p.stok_saat_ini} Pcs)
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjust Direction */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Arah Mutasi</label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="relative flex items-center justify-center p-3 rounded-xl border border-slate-800 bg-slate-950/20 hover:bg-slate-950/40 cursor-pointer text-slate-350 has-checked:border-indigo-500 has-checked:bg-indigo-600/10 has-checked:text-white transition-all">
                    <input
                      type="radio"
                      name="tipe"
                      value="masuk"
                      defaultChecked
                      className="peer sr-only"
                    />
                    <ArrowUpCircle className="h-4 w-4 mr-2 text-emerald-400" />
                    <span className="text-sm font-semibold">Stok Masuk</span>
                  </label>
                  <label className="relative flex items-center justify-center p-3 rounded-xl border border-slate-800 bg-slate-950/20 hover:bg-slate-950/40 cursor-pointer text-slate-350 has-checked:border-indigo-500 has-checked:bg-indigo-600/10 has-checked:text-white transition-all">
                    <input
                      type="radio"
                      name="tipe"
                      value="keluar"
                      className="peer sr-only"
                    />
                    <ArrowDownCircle className="h-4 w-4 mr-2 text-red-400" />
                    <span className="text-sm font-semibold">Stok Keluar</span>
                  </label>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Jumlah Barang</label>
                <input
                  type="number"
                  name="jumlah"
                  min="1"
                  defaultValue="1"
                  required
                  className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Keterangan / Alasan</label>
                <textarea
                  name="keterangan"
                  rows={2}
                  required
                  placeholder="Contoh: Kulakan baru, barang rusak, retur pelanggan..."
                  className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2.5 bg-slate-950/40 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Simpan Mutasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
