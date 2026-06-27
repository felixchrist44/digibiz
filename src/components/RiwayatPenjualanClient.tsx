'use client';

import React, { useState, useTransition } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { nullifyPenjualanAction } from '@/app/dashboard/riwayat-penjualan/actions';
import { UserRole } from '@/types/database';
import { canVoid } from '@/utils/permissions';

interface DetailPenjualan {
  id: string;
  produk_id: string | null;
  jumlah: number;
  harga_satuan: number;
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

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const hasVoidPermission = profile ? canVoid(profile.role) : false;

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

  // Local filter for invoice search
  const filteredInvoices = initialInvoices.filter((inv) =>
    inv.nomor_invoice.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const changePage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

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
          Daftar seluruh transaksi penjualan yang tercatat dalam sistem. Owner dapat melakukan pembatalan transaksi untuk mengembalikan stok.
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
            placeholder="Cari Nomor Invoice (e.g. INV-)..."
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
          Menampilkan {filteredInvoices.length} transaksi
        </div>
      </div>

      {/* Invoices Table */}
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

              {/* Items List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Daftar Barang Belanja</h4>
                {!selectedInvoice.detail_penjualan || selectedInvoice.detail_penjualan.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                    Data barang tidak ditemukan.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedInvoice.detail_penjualan.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950/25 border border-slate-850 text-xs"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <p className="font-bold text-slate-200 truncate">{item.produk?.nama || 'Produk Dihapus'}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {formatIDR(Number(item.harga_satuan))} x{item.jumlah}
                          </p>
                        </div>
                        <span className="font-bold text-white ml-2 shrink-0">{formatIDR(Number(item.subtotal))}</span>
                      </div>
                    ))}
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
