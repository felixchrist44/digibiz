'use client';

import React, { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  History,
  Search,
  X,
  User,
  Calendar,
  DollarSign,
  Info,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  WifiOff,
  Check
} from 'lucide-react';
import { nullifyPenjualanAction } from '@/app/dashboard/riwayat-penjualan/actions';
import { approveVarianceAction } from '@/app/dashboard/penjualan/actions';
import { getAllOfflineSales, markPendingForRetry, OfflineSaleRecord } from '@/lib/offline-db';
import { useSyncManager } from '@/components/SyncProvider';
import { UserRole } from '@/types/database';
import { canVoid } from '@/utils/permissions';

interface DetailPenjualan {
  id: string;
  produk_id: string | null;
  jumlah: number;
  harga_satuan: number;
  harga_saat_sync?: number | null;
  subtotal: number;
  produk?: {
    nama: string;
  };
}

interface Invoice {
  id: string;
  nomor_invoice: string;
  total_harga: number;
  dibuat_oleh: string | null;
  created_at: string;
  is_offline?: boolean;
  price_variance?: boolean;
  variance_approved_by?: string | null;
  variance_approved_at?: string | null;
  profiles?: {
    full_name: string | null;
  } | null;
  detail_penjualan?: DetailPenjualan[] | null;
}

interface Props {
  initialInvoices: Invoice[];
  hasMore: boolean;
  currentPage: number;
  profile: {
    role: UserRole;
  } | null;
}

export default function RiwayatPenjualanClient({
  initialInvoices,
  hasMore,
  currentPage,
  profile
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const { lastSyncTime, triggerManualSync } = useSyncManager();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [outboxSales, setOutboxSales] = useState<OfflineSaleRecord[]>([]);

  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const hasVoidPermission = profile ? canVoid(profile.role) : false;
  const canApproveVariance = profile?.role === 'owner' || profile?.role === 'manager';

  // Load outbox sales from IndexedDB
  const fetchOutboxSales = useCallback(async () => {
    try {
      const records = await getAllOfflineSales();
      // Filter out synced records that were already processed and present in server list
      const activeOutbox = records.filter(r => r.status !== 'synced');
      setOutboxSales(activeOutbox);
    } catch (err) {
      console.warn('Gagal membaca outbox sales:', err);
    }
  }, []);

  useEffect(() => {
    fetchOutboxSales();
  }, [fetchOutboxSales, lastSyncTime]);

  // Format IDR helper
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Format Date helper
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  // Local filter for invoice search (matches server nomor_invoice and offline_invoice_number placeholder)
  const filteredInvoices = initialInvoices.filter((inv) =>
    inv.nomor_invoice.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOutboxSales = outboxSales.filter((sale) =>
    sale.offline_invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sale.items.some(i => i.nama.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const changePage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Void transaction handler
  const handleVoidTransaction = async () => {
    if (!selectedInvoice) return;
    setIsVoiding(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await nullifyPenjualanAction(selectedInvoice.id);
      if (res.error) {
        setActionError(res.error);
      } else {
        setActionSuccess(`Transaksi ${res.nomor_invoice} berhasil dibatalkan. Stok barang telah dikembalikan.`);
        setIsVoidConfirmOpen(false);
        setSelectedInvoice(null);
        router.refresh();
      }
    } catch (err: any) {
      setActionError(err.message || 'Terjadi kesalahan sistem saat memproses pembatalan.');
    } finally {
      setIsVoiding(false);
    }
  };

  // Approve price variance handler
  const handleApproveVariance = async (penjualanId: string) => {
    setIsApproving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await approveVarianceAction(penjualanId);
      if (res.error) {
        setActionError(res.error);
      } else {
        setActionSuccess('Selisih harga transaksi berhasil disetujui.');
        setSelectedInvoice(null);
        router.refresh();
      }
    } catch (err: any) {
      setActionError(err.message || 'Terjadi kesalahan saat menyetujui selisih harga.');
    } finally {
      setIsApproving(false);
    }
  };

  // Retry handler for needs_review outbox items
  const handleRetryOutboxSale = async (key: string) => {
    try {
      await markPendingForRetry(key);
      await fetchOutboxSales();
      await triggerManualSync();
    } catch (err: any) {
      setActionError(err.message || 'Gagal menyetel ulang status transaksi.');
    }
  };

  const hasPrevious = currentPage > 1;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <History className="h-6 w-6 text-indigo-400" />
          Riwayat Penjualan
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Daftar seluruh transaksi penjualan yang tercatat dalam sistem. Owner/Manager dapat menyetujui selisih harga atau membatalkan transaksi.
        </p>
      </div>

      {/* Alert Banner */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-950/45 border border-emerald-800/40 text-emerald-400 text-xs rounded-2xl flex items-center gap-3 animate-in fade-in duration-200">
          <CheckCircle className="h-4.5 w-4.5 shrink-0" />
          <span className="font-semibold">{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="ml-auto p-1 hover:bg-emerald-900/20 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-red-950/45 border border-red-800/40 text-red-400 text-xs rounded-2xl flex items-center gap-3 animate-in fade-in duration-200">
          <AlertCircle className="h-4.5 w-4.5 shrink-0" />
          <span className="font-semibold">{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto p-1 hover:bg-red-900/20 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-900/30 p-4 border border-slate-850 rounded-2xl">
        <form onSubmit={handleSearch} className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-450" />
          <input
            type="text"
            placeholder="Cari Invoice (e.g. INV- atau OFFLINE-)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2 text-xs font-semibold rounded-xl bg-slate-950/60 border border-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 p-0.5 text-slate-400 hover:text-white rounded"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </form>
        <div className="text-[11px] text-slate-400 font-bold self-end sm:self-auto">
          Menampilkan {filteredInvoices.length + filteredOutboxSales.length} transaksi
        </div>
      </div>

      {/* OUTBOX SECTION: Pending / Needs Review / Rejected Offline Sales */}
      {filteredOutboxSales.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 text-amber-400" />
            Transaksi Outbox Offline ({filteredOutboxSales.length})
          </h3>
          <div className="bg-slate-900/30 border border-amber-500/30 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-850 bg-slate-950/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-5">Kode Outbox</th>
                    <th className="py-3.5 px-5">Waktu Checkout</th>
                    <th className="py-3.5 px-5">Status Outbox</th>
                    <th className="py-3.5 px-5 text-right">Total</th>
                    <th className="py-3.5 px-5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-xs">
                  {filteredOutboxSales.map((sale) => (
                    <tr key={sale.idempotency_key} className="hover:bg-slate-900/20 transition-colors">
                      <td className="py-3.5 px-5 font-mono text-[11px] font-bold text-amber-400">
                        {sale.offline_invoice_number}
                      </td>
                      <td className="py-3.5 px-5 text-slate-300">
                        {formatDate(sale.client_created_at)}
                      </td>
                      <td className="py-3.5 px-5">
                        {sale.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/60 border border-amber-500/40 text-amber-300">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            Menunggu Sync
                          </span>
                        )}
                        {sale.status === 'needs_review' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-950/60 border border-red-500/40 text-red-300">
                            <AlertTriangle className="h-3 w-3" />
                            Perlu Tindakan ({sale.error_code || 'Gagal'})
                          </span>
                        )}
                        {sale.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-400">
                            <X className="h-3 w-3" />
                            Ditolak ({sale.error_code || 'Batal'})
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-white">
                        {formatIDR(sale.total_harga)}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        {sale.status === 'needs_review' ? (
                          <button
                            onClick={() => handleRetryOutboxSale(sale.idempotency_key)}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Coba Lagi
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">
                            {sale.last_error || '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SERVER INVOICES TABLE */}
      <div className="bg-slate-900/20 border border-slate-850 rounded-2xl overflow-hidden shadow-xl">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-450 space-y-2">
            <AlertCircle className="h-8 w-8 text-slate-550 mx-auto" />
            <p className="font-semibold text-sm">Tidak ada transaksi ditemukan</p>
            <p className="text-xs">Coba ubah kata kunci pencarian Anda atau periksa halaman lainnya.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-850 bg-slate-950/40 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-4 px-5">Nomor Invoice</th>
                  <th className="py-4 px-5">Status Transaksi</th>
                  <th className="py-4 px-5">Waktu Transaksi</th>
                  <th className="py-4 px-5">Kasir</th>
                  <th className="py-4 px-5 text-right">Total Transaksi</th>
                  <th className="py-4 px-5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-xs">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-900/10 transition-colors">
                    <td className="py-4 px-5 font-mono text-[11px] font-bold text-indigo-400">
                      {inv.nomor_invoice}
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {inv.is_offline && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-950/60 border border-amber-500/40 text-amber-300">
                            Offline
                          </span>
                        )}
                        {inv.price_variance && !inv.variance_approved_at && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-950/60 border border-red-500/40 text-red-300 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Selisih Harga
                          </span>
                        )}
                        {inv.price_variance && inv.variance_approved_at && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            Selisih Disetujui
                          </span>
                        )}
                        {!inv.is_offline && !inv.price_variance && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-850 text-slate-400">
                            Online Normal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-5 text-slate-300">
                      {formatDate(inv.created_at)}
                    </td>
                    <td className="py-4 px-5 text-slate-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-450" />
                        {inv.profiles?.full_name || 'Staff / Kasir'}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right font-bold text-white">
                      {formatIDR(inv.total_harga)}
                    </td>
                    <td className="py-4 px-5 text-center">
                      <button
                        onClick={() => {
                          setActionError(null);
                          setActionSuccess(null);
                          setSelectedInvoice(inv);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-950/40 border border-slate-800 text-indigo-400 hover:text-indigo-350 hover:bg-slate-950/80 text-[11px] font-bold transition-all"
                      >
                        Detail Rincian
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {(hasPrevious || hasMore) && (
        <div className="flex items-center justify-between gap-4 bg-slate-950/30 p-4 border border-slate-850 rounded-2xl">
          <button
            onClick={() => changePage(currentPage - 1)}
            disabled={!hasPrevious || isPending}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Sebelumnya
          </button>
          <span className="text-xs text-slate-400 font-bold">Halaman {currentPage}</span>
          <button
            onClick={() => changePage(currentPage + 1)}
            disabled={!hasMore || isPending}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Selanjutnya
          </button>
        </div>
      )}

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-955/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-slate-850 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Info className="h-4.5 w-4.5 text-indigo-400" />
                  Rincian Invoice
                </h3>
                <p className="text-[10px] text-slate-450 font-mono mt-0.5">{selectedInvoice.nomor_invoice}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedInvoice(null);
                  setIsVoidConfirmOpen(false);
                }}
                className="p-1 text-slate-450 hover:text-white hover:bg-slate-850 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable details */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 bg-slate-950/20 p-4 border border-slate-850 rounded-2xl text-[11px] text-slate-350">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Waktu Transaksi</span>
                  <span className="font-semibold text-slate-200 flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-450" />
                    {formatDate(selectedInvoice.created_at)}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Kasir</span>
                  <span className="font-semibold text-slate-200 flex items-center gap-1">
                    <User className="h-3 w-3 text-slate-450" />
                    {selectedInvoice.profiles?.full_name || 'Staff'}
                  </span>
                </div>
              </div>

              {/* PRICE VARIANCE WARNING & COMPARISON TABLE */}
              {selectedInvoice.price_variance && (
                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      Transaksi Memiliki Selisih Harga Offline
                    </span>
                    {selectedInvoice.variance_approved_at ? (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500 text-emerald-300">
                        Disetujui
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-red-950 border border-red-500 text-red-300">
                        Belum Disetujui
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Daftar Barang Belanja</h4>
                {!selectedInvoice.detail_penjualan || selectedInvoice.detail_penjualan.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                    Data barang tidak ditemukan.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedInvoice.detail_penjualan.map((item) => {
                      const hasVar = selectedInvoice.price_variance && item.harga_saat_sync !== undefined && item.harga_saat_sync !== null && Number(item.harga_satuan) !== Number(item.harga_saat_sync);

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border text-xs ${
                            hasVar ? 'bg-amber-950/20 border-amber-500/40' : 'bg-slate-950/25 border-slate-850'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1 pr-3">
                              <p className="font-bold text-slate-200 truncate">{item.produk?.nama || 'Produk Dihapus'}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {formatIDR(Number(item.harga_satuan))} x{item.jumlah}
                              </p>
                            </div>
                            <span className="font-bold text-white ml-2 shrink-0">{formatIDR(Number(item.subtotal))}</span>
                          </div>

                          {/* Variance Detail Comparison */}
                          {hasVar && (
                            <div className="mt-2 pt-2 border-t border-amber-900/40 grid grid-cols-2 gap-2 text-[10px]">
                              <div>
                                <span className="text-slate-400 block">Ditinggalkan Saat Offline:</span>
                                <span className="font-bold text-amber-300">{formatIDR(Number(item.harga_satuan))}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Harga Server Saat Sync:</span>
                                <span className="font-bold text-slate-200">{formatIDR(Number(item.harga_saat_sync!))}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Total final */}
              <div className="pt-4 border-t border-slate-850 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Total Transaksi:</span>
                <span className="text-lg font-black text-indigo-400">{formatIDR(Number(selectedInvoice.total_harga))}</span>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-6 border-t border-slate-850 bg-slate-950/20 flex flex-col gap-3">
              {/* SETUJUI SELISIH HARGA BUTTON (Owner / Manager UX Conditional) */}
              {selectedInvoice.price_variance && !selectedInvoice.variance_approved_at && (
                canApproveVariance ? (
                  <button
                    onClick={() => handleApproveVariance(selectedInvoice.id)}
                    disabled={isApproving}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 disabled:opacity-40"
                  >
                    {isApproving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Menyetujui...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Setujui Selisih Harga (Owner/Manager)
                      </>
                    )}
                  </button>
                ) : (
                  <div className="p-3 bg-amber-950/40 border border-amber-900/40 rounded-xl text-center">
                    <p className="text-[11px] text-amber-300 font-semibold">
                      Membutuhkan persetujuan selisih harga dari Owner atau Manager.
                    </p>
                  </div>
                )
              )}

              {isVoidConfirmOpen ? (
                <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-2xl space-y-3">
                  <p className="text-xs font-semibold text-red-400">
                    Apakah Anda yakin ingin membatalkan transaksi ini? Tindakan ini akan mengembalikan stok seluruh barang di invoice ini dan menghapus data invoice secara permanen.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setIsVoidConfirmOpen(false)}
                      disabled={isVoiding}
                      className="px-3.5 py-1.5 bg-slate-950/40 border border-slate-800 text-slate-350 hover:text-white rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleVoidTransaction}
                      disabled={isVoiding}
                      className="px-4 py-1.5 bg-red-650 hover:bg-red-750 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {isVoiding ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Memproses...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-3.5 w-3.5" />
                          Konfirmasi Batalkan
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  {hasVoidPermission ? (
                    <button
                      onClick={() => setIsVoidConfirmOpen(true)}
                      className="px-4 py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 text-red-450 hover:text-red-400 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Batalkan Transaksi (Void)
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    onClick={() => {
                      setSelectedInvoice(null);
                      setIsVoidConfirmOpen(false);
                    }}
                    className="px-5 py-2.5 bg-slate-950/40 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    Tutup Rincian
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
