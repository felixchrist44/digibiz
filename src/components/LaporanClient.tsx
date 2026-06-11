'use client';

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Package,
  Calendar,
  DollarSign,
  PieChart,
  Layers,
  ArrowUpRight,
  Info,
  Clock,
  ChevronRight,
  BarChart3,
  Archive
} from 'lucide-react';
import { Produk, Penjualan } from '@/types/database';

interface Props {
  products: Produk[];
  initialSales: any[];
}

type FilterRange = 'all' | 'today' | '7days' | '30days' | 'month';
type ActiveTab = 'date' | 'product' | 'transaction';

export default function LaporanClient({ products, initialSales }: Props) {
  const [filterRange, setFilterRange] = useState<FilterRange>('all');
  const [activeTab, setActiveTab] = useState<ActiveTab>('date');

  // Format currency helper
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Helper date parsing/matching checks
  const filteredSales = useMemo(() => {
    const now = new Date();
    
    // Normalize current day to local midnight for accurate day bounds comparison
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return initialSales.filter(sale => {
      const saleDate = new Date(sale.created_at);

      if (filterRange === 'today') {
        return saleDate >= startOfToday;
      }
      if (filterRange === '7days') {
        const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
        return saleDate >= sevenDaysAgo;
      }
      if (filterRange === '30days') {
        const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
        return saleDate >= thirtyDaysAgo;
      }
      if (filterRange === 'month') {
        return (
          saleDate.getFullYear() === now.getFullYear() &&
          saleDate.getMonth() === now.getMonth()
        );
      }
      return true; // 'all'
    });
  }, [initialSales, filterRange]);

  // Aggregate stats: Omset, Laba Bersih, Margins, Volumes
  const stats = useMemo(() => {
    let totalOmset = 0;
    let totalProfit = 0;
    let totalQty = 0;

    filteredSales.forEach(sale => {
      totalOmset += Number(sale.total_harga || 0);

      sale.detail_penjualan?.forEach((detail: any) => {
        const qty = Number(detail.jumlah || 0);
        const sellPrice = Number(detail.harga_satuan || 0);

        // Find modal cost
        let modalPrice = Number(detail.produk?.harga_modal || 0);
        if (!modalPrice) {
          const catProduct = products.find(p => p.id === detail.produk_id);
          modalPrice = Number(catProduct?.harga_modal || 0);
        }

        const profitPerUnit = sellPrice - modalPrice;
        totalProfit += profitPerUnit * qty;
        totalQty += qty;
      });
    });

    const marginPercent = totalOmset > 0 ? (totalProfit / totalOmset) * 100 : 0;

    return {
      omset: totalOmset,
      labaBersih: totalProfit,
      margin: marginPercent,
      volume: totalQty
    };
  }, [filteredSales, products]);

  // Tab 1: Group by date (Date Summary List)
  const salesByDate = useMemo(() => {
    const datesGroup: Record<string, { count: number; omset: number; profit: number }> = {};

    filteredSales.forEach(sale => {
      const dateKey = new Date(sale.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      if (!datesGroup[dateKey]) {
        datesGroup[dateKey] = { count: 0, omset: 0, profit: 0 };
      }

      datesGroup[dateKey].count += 1;
      datesGroup[dateKey].omset += Number(sale.total_harga || 0);

      sale.detail_penjualan?.forEach((detail: any) => {
        const qty = Number(detail.jumlah || 0);
        const sellPrice = Number(detail.harga_satuan || 0);

        let modalPrice = Number(detail.produk?.harga_modal || 0);
        if (!modalPrice) {
          const catProduct = products.find(p => p.id === detail.produk_id);
          modalPrice = Number(catProduct?.harga_modal || 0);
        }

        const profitPerUnit = sellPrice - modalPrice;
        datesGroup[dateKey].profit += profitPerUnit * qty;
      });
    });

    return Object.entries(datesGroup).map(([date, data]) => ({
      date,
      ...data,
      margin: data.omset > 0 ? (data.profit / data.omset) * 100 : 0
    }));
  }, [filteredSales, products]);

  // Tab 2: Group by product (Product breakdown list)
  const salesByProduct = useMemo(() => {
    const prodGroup: Record<string, { name: string; sku: string; qty: number; omset: number; profit: number }> = {};

    filteredSales.forEach(sale => {
      sale.detail_penjualan?.forEach((detail: any) => {
        const prodId = detail.produk_id || 'unknown';
        const qty = Number(detail.jumlah || 0);
        const sellPrice = Number(detail.harga_satuan || 0);

        let pName = detail.produk?.nama || 'Produk Dihapus';
        let pSku = detail.produk?.kode_produk || 'N/A';
        let modalPrice = Number(detail.produk?.harga_modal || 0);

        const catProduct = products.find(p => p.id === detail.produk_id);
        if (catProduct) {
          pName = catProduct.nama;
          pSku = catProduct.kode_produk;
          if (!modalPrice) {
            modalPrice = Number(catProduct.harga_modal || 0);
          }
        }

        if (!prodGroup[prodId]) {
          prodGroup[prodId] = { name: pName, sku: pSku, qty: 0, omset: 0, profit: 0 };
        }

        const itemSub = sellPrice * qty;
        const profitPerUnit = sellPrice - modalPrice;

        prodGroup[prodId].qty += qty;
        prodGroup[prodId].omset += itemSub;
        prodGroup[prodId].profit += profitPerUnit * qty;
      });
    });

    return Object.values(prodGroup)
      .map(data => ({
        ...data,
        margin: data.omset > 0 ? (data.profit / data.omset) * 100 : 0
      }))
      .sort((a, b) => b.omset - a.omset);
  }, [filteredSales, products]);

  // Tab 3: Detailed Invoices Log list
  const invoiceLogs = useMemo(() => {
    return filteredSales.map(sale => {
      let profit = 0;
      let itemsList: string[] = [];

      sale.detail_penjualan?.forEach((detail: any) => {
        const qty = Number(detail.jumlah || 0);
        const sellPrice = Number(detail.harga_satuan || 0);

        let pName = detail.produk?.nama || 'Item';
        let modalPrice = Number(detail.produk?.harga_modal || 0);

        const catProduct = products.find(p => p.id === detail.produk_id);
        if (catProduct) {
          pName = catProduct.nama;
          if (!modalPrice) {
            modalPrice = Number(catProduct.harga_modal || 0);
          }
        }

        itemsList.push(`${pName} (x${qty})`);

        const profitPerUnit = sellPrice - modalPrice;
        profit += profitPerUnit * qty;
      });

      return {
        id: sale.id,
        invoiceNo: sale.nomor_invoice,
        timestamp: new Date(sale.created_at).toLocaleString('id-ID', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        }),
        cashier: sale.profiles?.full_name || 'Kasir',
        omset: Number(sale.total_harga || 0),
        profit,
        itemsStr: itemsList.join(', ')
      };
    });
  }, [filteredSales, products]);

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
            Data rekapitulasi penjualan, laba bersih, and profit margin (Hanya Akses Owner).
          </p>
        </div>

        {/* Date Filter Buttons Option Group */}
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
              onClick={() => setFilterRange(btn.range)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                filterRange === btn.range
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
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

      {/* Main Report Details Tab Switching block */}
      <div className="space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex bg-slate-900/80 border border-slate-850 p-1 rounded-2xl max-w-md">
          {(
            [
              { id: 'date', label: 'Ringkasan Tanggal', icon: Calendar },
              { id: 'product', label: 'Rincian Produk', icon: Archive },
              { id: 'transaction', label: 'Log Transaksi', icon: Clock }
            ] as const
          ).map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Display Tab content */}
        <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur rounded-3xl p-6 shadow-xl min-h-[400px]">
          
          {/* TAB 1: GROUP BY DATE SUMMARY */}
          {activeTab === 'date' && (
            <div className="overflow-x-auto">
              {salesByDate.length === 0 ? (
                <div className="py-20 text-center text-slate-550 italic text-sm">
                  Tidak ada transaksi tercatat pada periode ini.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/20">
                      <th className="py-4 px-5">Tanggal</th>
                      <th className="py-4 px-5 text-center">Jumlah Transaksi</th>
                      <th className="py-4 px-5 text-right">Omset Kotor</th>
                      <th className="py-4 px-5 text-right">Laba Bersih</th>
                      <th className="py-4 px-5 text-center">Rata Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/60 text-xs text-slate-300">
                    {salesByDate.map((row) => (
                      <tr key={row.date} className="hover:bg-slate-950/20 transition-all">
                        <td className="py-4 px-5 font-bold text-white">{row.date}</td>
                        <td className="py-4 px-5 text-center text-slate-400 font-semibold">{row.count} Invoice</td>
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
              )}
            </div>
          )}

          {/* TAB 2: PRODUCT BREAKDOWN SALES */}
          {activeTab === 'product' && (
            <div className="overflow-x-auto">
              {salesByProduct.length === 0 ? (
                <div className="py-20 text-center text-slate-550 italic text-sm">
                  Tidak ada item terjual pada periode ini.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/20">
                      <th className="py-4 px-5">Nama Barang</th>
                      <th className="py-4 px-5">SKU / Kode</th>
                      <th className="py-4 px-5 text-center">Volume Terjual</th>
                      <th className="py-4 px-5 text-right">Total Omset</th>
                      <th className="py-4 px-5 text-right">Laba Bersih</th>
                      <th className="py-4 px-5 text-center">Margin Margin</th>
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
              )}
            </div>
          )}

          {/* TAB 3: COMPLETE SALES INVOICE LOGS */}
          {activeTab === 'transaction' && (
            <div className="overflow-x-auto">
              {invoiceLogs.length === 0 ? (
                <div className="py-20 text-center text-slate-550 italic text-sm">
                  Tidak ada invoice terdaftar pada periode ini.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/20">
                      <th className="py-4 px-5">Nomor Invoice</th>
                      <th className="py-4 px-5">Waktu Transaksi</th>
                      <th className="py-4 px-5">Operator Kasir</th>
                      <th className="py-4 px-5 max-w-[200px]">Item Terjual</th>
                      <th className="py-4 px-5 text-right">Nilai Belanja</th>
                      <th className="py-4 px-5 text-right">Laba Bersih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/60 text-xs text-slate-300">
                    {invoiceLogs.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-950/20 transition-all">
                        <td className="py-4 px-5 font-bold text-white">{row.invoiceNo}</td>
                        <td className="py-4 px-5 text-slate-450">{row.timestamp}</td>
                        <td className="py-4 px-5 text-slate-400 font-semibold">{row.cashier}</td>
                        <td className="py-4 px-5 text-slate-450 italic truncate max-w-[200px]" title={row.itemsStr}>
                          {row.itemsStr}
                        </td>
                        <td className="py-4 px-5 text-right font-semibold text-slate-100">{formatIDR(row.omset)}</td>
                        <td className="py-4 px-5 text-right font-black text-emerald-400">{formatIDR(row.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </div>
      </div>
      
    </div>
  );
}
