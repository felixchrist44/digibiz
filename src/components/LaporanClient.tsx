'use client';

import React, { useState, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Calendar,
  DollarSign,
  PieChart,
  Package,
  Loader2,
  X,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Archive,
  Info
} from 'lucide-react';

interface SummaryItem {
  tanggal: string;
  produk_id: string;
  nama_produk: string;
  sku_produk: string;
  total_terjual: number;
  total_pendapatan: number;
  total_laba: number;
}

interface Props {
  initialSummary: SummaryItem[];
  activeRange: FilterRange;
  hasMore: boolean;
  currentPage: number;
}

type FilterRange = 'all' | 'today' | '7days' | '30days' | 'month';
type ActiveTab = 'date' | 'product';

interface DrillDownInvoice {
  id: string;
  nomor_invoice: string;
  created_at: string;
  total_harga: number;
  profiles: {
    full_name: string | null;
  }[] | {
    full_name: string | null;
  } | null;
  detail_penjualan: {
    id: string;
    harga_satuan: number;
    harga_modal_satuan: number | null;
    jumlah: number;
    subtotal: number;
    produk: {
      nama: string;
      kode_produk: string;
    }[] | {
      nama: string;
      kode_produk: string;
    } | null;
  }[] | null;
}

interface PaginationControlsProps {
  currentPage: number;
  hasMore: boolean;
  isPending: boolean;
  onPageChange: (page: number) => void;
}

const PaginationControls = ({ currentPage, hasMore, isPending, onPageChange }: PaginationControlsProps) => {
  const hasPrevious = currentPage > 1;
  if (!hasPrevious && !hasMore) return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-slate-950/30 p-4 border border-slate-855 rounded-2xl backdrop-blur-md mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPrevious || isPending}
        className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-450 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900/50 transition-all duration-150 active:scale-[0.98]"
      >
        Sebelumnya
      </button>

      <span className="text-xs text-slate-400 font-bold font-sans">
        Halaman {currentPage}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasMore || isPending}
        className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-455 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900/50 transition-all duration-150 active:scale-[0.98]"
      >
        Selanjutnya
      </button>
    </div>
  );
};

export default function LaporanClient({
  initialSummary,
  activeRange,
  hasMore,
  currentPage
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<ActiveTab>('date');

  // Drill-down states
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownData, setDrillDownData] = useState<DrillDownInvoice[]>([]);

  // Format currency helper
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Since data is now pre-filtered server-side, compute aggregates directly
  const stats = (() => {
    let totalOmset = 0;
    let totalProfit = 0;
    let totalQty = 0;

    initialSummary.forEach(item => {
      totalOmset += Number(item.total_pendapatan || 0);
      totalProfit += Number(item.total_laba || 0);
      totalQty += Number(item.total_terjual || 0);
    });

    const marginPercent = totalOmset > 0 ? (totalProfit / totalOmset) * 100 : 0;

    return {
      omset: totalOmset,
      labaBersih: totalProfit,
      margin: marginPercent,
      volume: totalQty
    };
  })();

  // Tab 1: Group by date (Date Summary List)
  const salesByDate = (() => {
    const datesGroup: Record<string, { omset: number; profit: number; volume: number; rawDate: string }> = {};

    initialSummary.forEach(item => {
      const dateKey = activeRange === 'all'
        ? new Date(item.tanggal).toLocaleDateString('id-ID', {
            month: 'long',
            year: 'numeric'
          })
        : new Date(item.tanggal).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });

      if (!datesGroup[dateKey]) {
        datesGroup[dateKey] = { omset: 0, profit: 0, volume: 0, rawDate: item.tanggal };
      }

      datesGroup[dateKey].omset += Number(item.total_pendapatan || 0);
      datesGroup[dateKey].profit += Number(item.total_laba || 0);
      datesGroup[dateKey].volume += Number(item.total_terjual || 0);
    });

    return Object.entries(datesGroup).map(([formattedDate, data]) => ({
      dateLabel: formattedDate,
      rawDate: data.rawDate,
      omset: data.omset,
      profit: data.profit,
      volume: data.volume,
      margin: data.omset > 0 ? (data.profit / data.omset) * 100 : 0
    })).sort((a, b) => b.rawDate.localeCompare(a.rawDate));
  })();

  // Tab 2: Group by product (Product breakdown list)
  const salesByProduct = (() => {
    const prodGroup: Record<string, { name: string; sku: string; qty: number; omset: number; profit: number }> = {};

    initialSummary.forEach(item => {
      const prodId = item.produk_id || 'unknown';

      if (!prodGroup[prodId]) {
        prodGroup[prodId] = {
          name: item.nama_produk || 'Produk Dihapus',
          sku: item.sku_produk || 'N/A',
          qty: 0,
          omset: 0,
          profit: 0
        };
      }

      prodGroup[prodId].qty += Number(item.total_terjual || 0);
      prodGroup[prodId].omset += Number(item.total_pendapatan || 0);
      prodGroup[prodId].profit += Number(item.total_laba || 0);
    });

    return Object.values(prodGroup)
      .map(data => ({
        ...data,
        margin: data.omset > 0 ? (data.profit / data.omset) * 100 : 0
      }))
      .sort((a, b) => b.omset - a.omset);
  })();

  // Navigate with URL params (server-side filtering)
  const handleRangeChange = (range: FilterRange) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', range);
    params.delete('page'); // Reset to page 1 on filter change
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Pagination handler
  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Dynamic Drill-Down Details Fetching (Lazy-loaded on click)
  const handleViewDateDetails = async (dateStr: string, formattedLabel: string) => {
    setSelectedDate(formattedLabel);
    setDrillDownLoading(true);
    setDrillDownData([]);

    try {
      const supabase = createClient();
      
      // Select exact invoices list generated on the specific date bounds
      const { data, error } = await supabase
        .from('penjualan')
        .select(`
          id,
          nomor_invoice,
          total_harga,
          created_at,
          profiles(full_name),
          detail_penjualan(
            id,
            jumlah,
            harga_satuan,
            harga_modal_satuan,
            subtotal,
            produk(nama, kode_produk)
          )
        `)
        .gte('created_at', `${dateStr}T00:00:00.000Z`)
        .lte('created_at', `${dateStr}T23:59:59.999Z`)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setDrillDownData(data);
      } else if (error) {
        console.error('Error fetching details:', error.message);
      }
    } catch (err) {
      console.error('Failed to execute drilldown lookup:', err);
    } finally {
      setDrillDownLoading(false);
    }
  };



  return (
    <div className="space-y-8">
      
      {/* Top Header & Date Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-400" />
            Laporan Analitik Keuangan
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Data pre-agregasi database penjualan, laba bersih, and profit margin (Hanya Akses Owner).
          </p>
        </div>

        {/* Date Filter Buttons */}
        <div className="flex flex-wrap items-center bg-slate-900 border border-slate-850 p-1.5 rounded-2xl gap-1 shrink-0 self-start xl:self-center">
          {(
            [
              { range: 'all', label: 'Semua Waktu' },
              { range: 'today', label: 'Hari Ini' },
              { range: '7days', label: '7 Hari' },
              { range: '30days', label: '30 Hari' },
              { range: 'month', label: 'Bulan Ini' }
            ] as const
          ).map(btn => (
            <button
              key={btn.range}
              onClick={() => handleRangeChange(btn.range)}
              disabled={isPending}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                activeRange === btn.range
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              } ${isPending ? 'opacity-60' : ''}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 transition-opacity duration-200 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
        
        {/* Omset / Gross Revenue */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Omset Kotor</span>
            <p className="text-xl font-black text-white">{formatIDR(stats.omset)}</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        {/* COGS / Harga Pokok Penjualan */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">HPP (COGS)</span>
            <p className="text-xl font-black text-amber-400">{formatIDR(stats.omset - stats.labaBersih)}</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
            <Archive className="h-5 w-5" />
          </div>
        </div>

        {/* Laba Bersih / Net Profit */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Laba Bersih</span>
            <p className="text-xl font-black text-emerald-400">{formatIDR(stats.labaBersih)}</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        {/* Profit Margin % */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Margin Keuntungan</span>
            <p className="text-xl font-black text-purple-400">{stats.margin.toFixed(1)}%</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400">
            <PieChart className="h-5 w-5" />
          </div>
        </div>

        {/* Total Volume Sold */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Volume Terjual</span>
            <p className="text-xl font-black text-blue-400">{stats.volume} Pcs</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400">
            <Package className="h-5 w-5" />
          </div>
        </div>

      </div>

      {/* Record count info */}
      <div className="flex items-center justify-between text-xs text-slate-455 font-medium px-1">
        <span>Menampilkan {initialSummary.length} data ringkasan (Halaman {currentPage})</span>
        {isPending && (
          <span className="flex items-center gap-1.5 text-indigo-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Memuat...
          </span>
        )}
      </div>

      {/* Main Tab Panels */}
      <div className="space-y-6">
        
        {/* Navigation Tabs */}
        {activeRange !== 'all' && (
          <div className="flex bg-slate-900/80 border border-slate-850 p-1 rounded-2xl max-w-[320px]">
            {(
              [
                { id: 'date', label: 'Ringkasan Tanggal', icon: Calendar },
                { id: 'product', label: 'Rincian Produk', icon: Archive }
              ] as const
            ).map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Display Tab Content */}
        <div className={`bg-slate-900/40 border border-slate-800/80 backdrop-blur rounded-3xl p-6 shadow-xl min-h-[400px] transition-opacity duration-200 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
          
          {/* TAB 1: DATE SUMMARY LIST */}
          {activeTab === 'date' && (
            <div className="overflow-x-auto">
              {salesByDate.length === 0 ? (
                <div className="py-20 text-center text-slate-550 italic text-sm">
                  Tidak ada transaksi tercatat pada periode ini.
                </div>
              ) : (
                <>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/20">
                        <th className="py-4 px-5">{activeRange === 'all' ? 'Bulan' : 'Tanggal'}</th>
                        <th className="py-4 px-5 text-center">Volume Terjual</th>
                        <th className="py-4 px-5 text-right">Omset Kotor</th>
                        <th className="py-4 px-5 text-right">Laba Bersih</th>
                        <th className="py-4 px-5 text-center">Margin</th>
                        {activeRange !== 'all' && <th className="py-4 px-5 text-right">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/60 text-xs text-slate-300">
                      {salesByDate.map((row) => (
                        <tr key={row.rawDate} className="hover:bg-slate-950/20 transition-all">
                          <td className="py-4 px-5 font-bold text-white">{row.dateLabel}</td>
                          <td className="py-4 px-5 text-center font-semibold text-slate-400">{row.volume} Pcs</td>
                          <td className="py-4 px-5 text-right font-semibold text-slate-100">{formatIDR(row.omset)}</td>
                          <td className="py-4 px-5 text-right font-black text-emerald-400">{formatIDR(row.profit)}</td>
                          <td className="py-4 px-5 text-center">
                            <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/10 text-purple-400 font-extrabold text-[10px]">
                              {row.margin.toFixed(1)}%
                            </span>
                          </td>
                          {activeRange !== 'all' && (
                            <td className="py-4 px-5 text-right">
                              <button
                                onClick={() => handleViewDateDetails(row.rawDate, row.dateLabel)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/40 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                Rincian Hari
                                <ChevronRight className="h-3 w-3 text-indigo-400" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <PaginationControls currentPage={currentPage} hasMore={hasMore} isPending={isPending} onPageChange={handlePageChange} />
                </>
              )}
            </div>
          )}

          {/* TAB 2: PRODUCT SALES BREAKDOWN */}
          {activeTab === 'product' && (
            <div className="overflow-x-auto">
              {salesByProduct.length === 0 ? (
                <div className="py-20 text-center text-slate-550 italic text-sm">
                  Tidak ada item terjual pada periode ini.
                </div>
              ) : (
                <>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/20">
                        <th className="py-4 px-5">Nama Barang</th>
                        <th className="py-4 px-5">SKU / Kode</th>
                        <th className="py-4 px-5 text-center">Volume Terjual</th>
                        <th className="py-4 px-5 text-right">Total Omset</th>
                        <th className="py-4 px-5 text-right">Laba Bersih</th>
                        <th className="py-4 px-5 text-center">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/60 text-xs text-slate-300">
                      {salesByProduct.map((row) => (
                        <tr key={row.sku} className="hover:bg-slate-950/20 transition-all">
                          <td className="py-4 px-5 font-bold text-white">{row.name}</td>
                          <td className="py-4 px-5 font-mono text-slate-450 text-[10px]">{row.sku}</td>
                          <td className="py-4 px-5 text-center font-bold text-indigo-400">{row.qty} Pcs</td>
                          <td className="py-4 px-5 text-right font-semibold text-slate-100">{formatIDR(row.omset)}</td>
                          <td className="py-4 px-5 text-right font-black text-emerald-400">{formatIDR(row.profit)}</td>
                          <td className="py-4 px-5 text-center">
                            <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/10 text-purple-400 font-extrabold text-[10px]">
                              {row.margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <PaginationControls currentPage={currentPage} hasMore={hasMore} isPending={isPending} onPageChange={handlePageChange} />
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ==================== LAZY-LOADED DRILL-DOWN INVOICES MODAL ==================== */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            
            {/* Modal Close Button */}
            <button
              onClick={() => setSelectedDate(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Header */}
            <div className="border-b border-slate-800 pb-3 mb-6">
              <h2 className="text-lg font-bold text-white">Rincian Transaksi POS</h2>
              <p className="text-xs text-indigo-400 font-mono mt-0.5">{selectedDate}</p>
            </div>

            {/* Drilldown Body */}
            <div className="flex-1 overflow-y-auto min-h-[250px] space-y-6 pr-1">
              {drillDownLoading ? (
                <div className="h-full py-20 flex flex-col items-center justify-center text-slate-500 text-xs">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-3" />
                  Memuat data transaksi dari server...
                </div>
              ) : drillDownData.length === 0 ? (
                <div className="py-20 text-center text-slate-500 italic text-xs">
                  Tidak ditemukan record invoice pada tanggal ini.
                </div>
              ) : (
                <div className="space-y-6">
                  {drillDownData.map((inv) => {
                    return (
                      <div
                        key={inv.id}
                        className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl space-y-4 hover:border-slate-800 transition-all"
                      >
                        {/* Invoice Header Details */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs pb-3 border-b border-slate-850">
                          <div>
                            <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-950/20 border border-indigo-900/30 px-2 py-0.5 rounded">
                              {inv.nomor_invoice}
                            </span>
                            <span className="text-slate-400 font-semibold ml-2.5">
                              Pukul {new Date(inv.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="text-slate-455 font-medium">
                            Operator: <span className="font-bold text-slate-300">{(Array.isArray(inv.profiles) ? inv.profiles[0]?.full_name : inv.profiles?.full_name) || 'Kasir'}</span>
                          </div>
                        </div>

                        {/* Sold Items Table */}
                        <div className="space-y-2">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Item Terjual</span>
                          <div className="space-y-2">
                            {inv.detail_penjualan?.map((item) => {
                              const sellPrice = Number(item.harga_satuan || 0);
                              const modalCost = Number(item.harga_modal_satuan || 0);
                              const profitRow = (sellPrice - modalCost) * item.jumlah;
                              const isNegativeMargin = profitRow < 0;
                              const productObj = Array.isArray(item.produk) ? item.produk[0] : item.produk;

                              return (
                                <div
                                  key={item.id}
                                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border text-xs gap-2 ${
                                    isNegativeMargin
                                      ? 'bg-red-950/20 border-red-900/40'
                                      : 'bg-slate-900/40 border-slate-850/50'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="font-bold text-white truncate">
                                      {productObj?.nama || 'Produk Dihapus'}
                                      {isNegativeMargin && (
                                        <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-black rounded uppercase">Rugi</span>
                                      )}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                      SKU: {productObj?.kode_produk || 'N/A'} · HPP: {formatIDR(modalCost)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-6 text-right self-end sm:self-auto shrink-0">
                                    <div className="text-slate-400">
                                      {formatIDR(sellPrice)} x{item.jumlah}
                                    </div>
                                    <div className="font-bold text-slate-200 min-w-[90px]">
                                      {formatIDR(Number(item.subtotal))}
                                    </div>
                                    <div className={`font-bold min-w-[90px] border-l border-slate-850 pl-4 text-right ${
                                      isNegativeMargin ? 'text-red-400' : 'text-emerald-400'
                                    }`}>
                                      {isNegativeMargin ? '− ' : '+ '}{formatIDR(Math.abs(profitRow))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Invoice Summary Totals */}
                        <div className="pt-3 border-t border-slate-850/50 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-450 font-semibold">Laba Invoice:</span>
                            <span className={`font-black ${
                              (inv.detail_penjualan?.reduce((sum: number, it) => {
                                const cost = Number(it.harga_modal_satuan || 0);
                                return sum + (Number(it.harga_satuan) - cost) * it.jumlah;
                              }, 0) || 0) < 0 ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                                {formatIDR(inv.detail_penjualan?.reduce((sum: number, it) => {
                                  const cost = Number(it.harga_modal_satuan || 0);
                                  return sum + (Number(it.harga_satuan) - cost) * it.jumlah;
                                }, 0) || 0)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-bold">Total Belanja:</span>
                            <span className="text-sm font-black text-indigo-400">
                              {formatIDR(Number(inv.total_harga))}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-800 pt-4 mt-6 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-slate-450">
                <Info className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>Klik tanda silang atau di luar modal untuk menutup rincian.</span>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="px-5 py-2.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl font-bold cursor-pointer transition-colors"
              >
                Tutup Rincian
              </button>
            </div>

          </div>
        </div>
      )}
      
    </div>
  );
}
