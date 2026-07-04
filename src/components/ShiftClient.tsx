'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  Clock,
  Plus,
  Calendar,
  AlertCircle,
  User,
  History,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  X,
  FileText
} from 'lucide-react';
import { Profile } from '@/types/database';
import { canManageShifts } from '@/utils/permissions';
import { openShift, closeShift, getActiveShifts, getShiftHistory } from '@/app/dashboard/shift/actions';

interface Props {
  profile: Profile;
  initialProfiles: { id: string; full_name: string | null; role: string }[];
}

export default function ShiftClient({ profile, initialProfiles }: Props) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  // List states
  const [activeShifts, setActiveShifts] = useState<any[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [historyShifts, setHistoryShifts] = useState<any[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Sales data cache per active shift
  const [shiftSales, setShiftSales] = useState<
    Record<string, { cash: number; qris: number; txCount: number; loading: boolean }>
  >({});

  // Modals state
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<any | null>(null);

  // Form input states
  const [openCashierId, setOpenCashierId] = useState('');
  const [openOpeningCash, setOpenOpeningCash] = useState('0');
  const [closeClosingCash, setCloseClosingCash] = useState('');
  const [closeClosingQris, setCloseClosingQris] = useState('0');
  const [closeNotes, setCloseNotes] = useState('');

  // Transition & Alert states
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch active shifts
  const fetchActive = async () => {
    setLoadingActive(true);
    try {
      const res = await getActiveShifts();
      if (res.data) {
        setActiveShifts(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch active shifts:', err);
    } finally {
      setLoadingActive(false);
    }
  };

  // Fetch paginated history shifts
  const fetchHistory = async (page: number) => {
    setLoadingHistory(true);
    try {
      const res = await getShiftHistory(page);
      if (res.data) {
        setHistoryShifts(res.data);
        setHistoryCount(res.count ?? 0);
        setCurrentPage(page);
      }
    } catch (err) {
      console.error('Failed to fetch shift history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Derive a stable dependency from active shifts list to prevent rendering loops
  const shiftIdsKey = activeShifts.map(s => s.id).join(',');

  // Fetch sales so far for active shifts dynamically on mount/update
  useEffect(() => {
    if (activeShifts.length === 0) return;
    let cancelled = false;

    const fetchSales = async () => {
      for (const shift of activeShifts) {
        if (cancelled) return;
        setShiftSales(prev => ({
          ...prev,
          [shift.id]: { cash: 0, qris: 0, txCount: 0, loading: true }
        }));

        try {
          const { data, error } = await supabase
            .from('penjualan')
            .select('payment_method, total_harga')
            .eq('shift_id', shift.id);

          if (cancelled) return;

          if (!error && data) {
            const cash = data
              .filter(r => r.payment_method === 'cash')
              .reduce((sum, r) => sum + Number(r.total_harga), 0);
            const qris = data
              .filter(r => r.payment_method === 'qris')
              .reduce((sum, r) => sum + Number(r.total_harga), 0);
            const txCount = data.length;

            setShiftSales(prev => ({
              ...prev,
              [shift.id]: { cash, qris, txCount, loading: false }
            }));
          } else {
            setShiftSales(prev => ({
              ...prev,
              [shift.id]: { cash: 0, qris: 0, txCount: 0, loading: false }
            }));
          }
        } catch (err) {
          console.error(`Failed to fetch sales for shift ${shift.id}:`, err);
          if (!cancelled) {
            setShiftSales(prev => ({
              ...prev,
              [shift.id]: { cash: 0, qris: 0, txCount: 0, loading: false }
            }));
          }
        }
      }
    };

    fetchSales();

    return () => {
      cancelled = true;
    };
  }, [shiftIdsKey]);

  // Initial load
  useEffect(() => {
    fetchActive();
    fetchHistory(1);
  }, []);

  // Format IDR helper
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Format date helper (Asia/Jakarta / WIB)
  const formatDateWIB = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' WIB';
  };

  // Open shift handler
  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openCashierId) {
      setErrorMsg('Silakan pilih kasir.');
      return;
    }
    const cashierProfile = initialProfiles.find(p => p.id === openCashierId);
    if (!cashierProfile) {
      setErrorMsg('Profil kasir tidak valid.');
      return;
    }

    setErrorMsg(null);
    const fd = new FormData();
    fd.append('cashier_id', openCashierId);
    fd.append('cashier_name', cashierProfile.full_name || 'Kasir');
    fd.append('opening_cash', openOpeningCash);

    startTransition(async () => {
      const res = await openShift(fd);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setOpenModalOpen(false);
        setOpenOpeningCash('0');
        setOpenCashierId('');
        fetchActive();
        router.refresh();
      }
    });
  };

  // Close shift handler
  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShift) return;

    setErrorMsg(null);
    const fd = new FormData();
    fd.append('shift_id', selectedShift.id);
    fd.append('closing_cash', closeClosingCash);
    fd.append('closing_qris', closeClosingQris);
    fd.append('notes', closeNotes);

    startTransition(async () => {
      const res = await closeShift(fd);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setCloseModalOpen(false);
        setCloseClosingCash('');
        setCloseClosingQris('0');
        setCloseNotes('');
        setSelectedShift(null);
        fetchActive();
        fetchHistory(1);
        router.refresh();
      }
    });
  };

  // Open close shift modal dialog & populate state cache
  const openCloseModalForShift = (shift: any) => {
    const cached = shiftSales[shift.id] || { cash: 0, qris: 0, txCount: 0 };
    setSelectedShift({
      ...shift,
      cash_total: cached.cash,
      qris_total: cached.qris,
      total_transactions: cached.txCount
    });
    setCloseModalOpen(true);
  };

  const isManager = canManageShifts(profile.role);
  const totalPages = Math.ceil(historyCount / 10);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Clock className="h-6 w-6 text-indigo-400" />
            Kelola Shift Kasir
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pantau status shift aktif kasir, modal awal, dan riwayat setoran uang tunai/QRIS.
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setOpenModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Buka Shift Baru
          </button>
        )}
      </div>

      {/* Active Shifts Section */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          Shift Aktif Saat Ini
        </h2>

        {loadingActive ? (
          <div className="py-8 text-center text-slate-500 text-sm">Memuat shift aktif...</div>
        ) : activeShifts.length === 0 ? (
          <div className="py-12 border border-dashed border-slate-800 rounded-2xl text-center text-slate-500 text-sm bg-slate-900/10">
            Tidak ada shift aktif saat ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeShifts.map(shift => {
              const sales = shiftSales[shift.id];
              const isLoadingSales = !sales || sales.loading;

              return (
                <div
                  key={shift.id}
                  className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-indigo-600/10 border border-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                        <h4 className="text-sm font-bold text-white truncate">{shift.cashier_name}</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 uppercase tracking-wider">
                        Buka
                      </span>
                    </div>

                    {/* Metadata details */}
                    <div className="space-y-1.5 text-xs text-slate-400 font-sans border-t border-b border-slate-850 py-3">
                      <div className="flex justify-between">
                        <span>Waktu Buka:</span>
                        <span className="font-semibold text-slate-200">{formatDateWIB(shift.opened_at)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Modal Awal:</span>
                        <span className="font-bold text-indigo-400">{formatIDR(Number(shift.opening_cash))}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-850/50 pt-2">
                        <span>Transaksi Kasir:</span>
                        <span className="font-bold text-slate-200">
                          {isLoadingSales ? 'Memuat...' : `${sales.txCount} Transaksi`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Penjualan Tunai:</span>
                        <span className="font-bold text-emerald-400">
                          {isLoadingSales ? 'Memuat...' : formatIDR(sales.cash)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Penjualan QRIS:</span>
                        <span className="font-bold text-blue-400">
                          {isLoadingSales ? 'Memuat...' : formatIDR(sales.qris)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Close button for Manager */}
                  {isManager && (
                    <button
                      onClick={() => openCloseModalForShift(shift)}
                      className="w-full mt-2 py-2 bg-slate-955 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
                    >
                      Tutup Shift
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shift History Section */}
      <div className="space-y-4 pt-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <History className="h-5 w-5 text-slate-400" />
          Riwayat Shift
        </h2>

        <div className="bg-slate-900/40 backdrop-blur border border-slate-800 rounded-2xl p-6 shadow-xl overflow-x-auto">
          {loadingHistory ? (
            <div className="py-8 text-center text-slate-500 text-sm">Memuat riwayat shift...</div>
          ) : historyShifts.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">Belum ada riwayat shift.</div>
          ) : (
            <>
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-450 uppercase tracking-wider">
                    <th className="pb-3">Kasir</th>
                    <th className="pb-3">Waktu Buka / Tutup</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Modal Awal</th>
                    <th className="pb-3 text-right">Penjualan (Tunai / QRIS)</th>
                    <th className="pb-3 text-right">Actual Count (Tunai / QRIS)</th>
                    <th className="pb-3 text-right">Selisih Kas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/50 text-xs text-slate-300 font-sans">
                  {historyShifts.map(s => {
                    const statusText = s.status === 'closed' ? 'Tutup' : 'Auto-Tutup';
                    const isAuto = s.status === 'auto_closed';
                    const cashSales = Number(s.total_sales_cash || 0);
                    const qrisSales = Number(s.total_sales_qris || 0);
                    const closingCash = Number(s.closing_cash || 0);
                    
                    // expected cash = opening float + computed cash sales
                    const expectedCash = Number(s.opening_cash) + cashSales;
                    const discrepancy = closingCash - expectedCash;

                    return (
                      <tr key={s.id} className="hover:bg-slate-900/10 transition-colors">
                        <td className="py-4 font-semibold text-white">{s.cashier_name}</td>
                        <td className="py-4 space-y-0.5 text-slate-450">
                          <div>{formatDateWIB(s.opened_at)}</div>
                          <div className="text-[10px]">{formatDateWIB(s.closed_at)}</div>
                        </td>
                        <td className="py-4">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                              isAuto
                                ? 'bg-amber-950/20 border-amber-900/30 text-amber-400'
                                : 'bg-slate-950 border-slate-800 text-slate-400'
                            }`}
                          >
                            {statusText}
                          </span>
                        </td>
                        <td className="py-4 font-semibold text-slate-350">{formatIDR(Number(s.opening_cash))}</td>
                        <td className="py-4 text-right space-y-0.5 font-semibold">
                          <div className="text-emerald-400">{formatIDR(cashSales)}</div>
                          <div className="text-blue-400 text-[10px]">{formatIDR(qrisSales)}</div>
                        </td>
                        <td className="py-4 text-right space-y-0.5 font-bold text-white">
                          <div>{formatIDR(closingCash)}</div>
                          <div className="text-slate-450 text-[10px]">{formatIDR(Number(s.closing_qris || 0))}</div>
                        </td>
                        <td className="py-4 text-right font-black">
                          {isAuto ? (
                            <span className="text-slate-500 font-mono">-</span>
                          ) : (
                            <span className={discrepancy >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {discrepancy >= 0 ? '+' : ''}
                              {formatIDR(discrepancy)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* History Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 bg-slate-950/30 p-4 border border-slate-855 rounded-2xl backdrop-blur-md mt-6">
                  <button
                    onClick={() => fetchHistory(currentPage - 1)}
                    disabled={currentPage === 1 || loadingHistory}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-450 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900/50 transition-all duration-150 active:scale-[0.98]"
                  >
                    Sebelumnya
                  </button>

                  <span className="text-xs text-slate-400 font-bold">
                    Halaman {currentPage} dari {totalPages}
                  </span>

                  <button
                    onClick={() => fetchHistory(currentPage + 1)}
                    disabled={currentPage === totalPages || loadingHistory}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-455 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900/50 transition-all duration-150 active:scale-[0.98]"
                  >
                    Selanjutnya
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ==================== MODAL 1: OPEN SHIFT ==================== */}
      {openModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <User className="h-5 w-5 text-indigo-400" />
                Mulai Shift Kasir
              </h3>
              <button
                onClick={() => setOpenModalOpen(false)}
                className="p-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4 text-sm">
              {/* Cashier selection dropdown */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Pilih Kasir / Staff
                </label>
                <select
                  value={openCashierId}
                  onChange={e => setOpenCashierId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  required
                >
                  <option value="" disabled className="bg-slate-900 text-slate-500">
                    -- Pilih cashier dari profil --
                  </option>
                  {initialProfiles.map(p => (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                      {p.full_name || 'Tanpa Nama'} ({p.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Opening cash float input */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Modal Awal Kas Laci (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Contoh: 100000"
                    value={openOpeningCash}
                    onChange={e => setOpenOpeningCash(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    required
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isPending || !openCashierId}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Membuka Shift...' : 'Buka Shift Sekarang'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: CLOSE SHIFT ==================== */}
      {closeModalOpen && selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-400" />
                Tutup Shift & Hitung Kas
              </h3>
              <button
                onClick={() => {
                  setCloseModalOpen(false);
                  setSelectedShift(null);
                }}
                className="p-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCloseShift} className="space-y-4 text-sm">
              {/* Shift Summary Metadata (Read-only) */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-400 font-sans">
                <div className="flex justify-between">
                  <span>Nama Kasir:</span>
                  <span className="font-bold text-white">{selectedShift.cashier_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Waktu Buka:</span>
                  <span className="font-semibold text-slate-350">{formatDateWIB(selectedShift.opened_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Modal Awal:</span>
                  <span className="font-semibold text-slate-300">{formatIDR(Number(selectedShift.opening_cash))}</span>
                </div>
                <div className="flex justify-between border-t border-slate-850/50 pt-2 text-slate-300">
                  <span>Total Penjualan Tunai:</span>
                  <span className="font-bold text-emerald-400">{formatIDR(selectedShift.cash_total)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Total Penjualan QRIS:</span>
                  <span className="font-bold text-blue-400">{formatIDR(selectedShift.qris_total)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-850/50 pt-2 font-bold text-indigo-400">
                  <span>Ekspektasi Uang Tunai (Drawer):</span>
                  <span>{formatIDR(Number(selectedShift.opening_cash) + selectedShift.cash_total)}</span>
                </div>
              </div>

              {/* Physical closing cash count */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Total Uang Tunai Fisik Dihitung (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Masukkan jumlah fisik laci"
                    value={closeClosingCash}
                    onChange={e => {
                      setCloseClosingCash(e.target.value);
                    }}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    required
                  />
                </div>
              </div>

              {/* Physical closing QRIS count */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Total Uang QRIS (Rekonsiliasi Bank) (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Masukkan nominal dari QRIS merchant dashboard"
                    value={closeClosingQris}
                    onChange={e => setCloseClosingQris(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    required
                  />
                </div>
              </div>

              {/* Live discrepancy calculation preview */}
              {closeClosingCash && (
                <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950/40 border border-slate-800">
                  <span className="text-xs text-slate-400 font-semibold">Selisih Kas Laci:</span>
                  {(() => {
                    const expected = Number(selectedShift.opening_cash) + selectedShift.cash_total;
                    const diff = (Number(closeClosingCash) || 0) - expected;
                    return (
                      <span className={`text-sm font-extrabold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {diff >= 0 ? '+' : ''}
                        {formatIDR(diff)}
                        {diff < 0 && ' (Kurang)'}
                        {diff > 0 && ' (Lebih)'}
                      </span>
                    );
                  })()}
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Catatan Shift</label>
                <textarea
                  placeholder="Keterangan tambahan jika terjadi selisih kas..."
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs min-h-[60px]"
                />
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isPending || !closeClosingCash}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Menutup Shift...' : 'Tutup Shift & Setor'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
