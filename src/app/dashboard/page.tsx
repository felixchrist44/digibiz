import React from 'react';
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  CircleDollarSign,
  ArrowUpRight,
  Plus,
  ShoppingCart
} from 'lucide-react';
import { Produk, Penjualan } from '@/types/database';

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch all products
  const { data: produkList } = await supabase
    .from('produk')
    .select('*')
    .order('created_at', { ascending: false });

  // Fetch sales
  const { data: penjualanList } = await supabase
    .from('penjualan')
    .select('*')
    .order('created_at', { ascending: false });

  const products = (produkList as Produk[]) || [];
  const sales = (penjualanList as Penjualan[]) || [];

  // Calculations
  const totalProducts = products.length;
  const lowStockProducts = products.filter(p => p.stok_saat_ini <= 5);
  const outOfStockCount = products.filter(p => p.stok_saat_ini === 0).length;

  const totalRevenue = sales.reduce((sum, item) => sum + Number(item.total_harga), 0);
  const totalSalesCount = sales.length;

  // Format currency Helper
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Process Sales Data for Custom Chart (Last 7 sales or days)
  // We can group sales by day or just show the last 7 invoices for visualization.
  const chartHeightMax = 160; // in pixels
  const recentInvoicesForChart = sales.slice(0, 7).reverse();
  const maxInvoiceValue = Math.max(...recentInvoicesForChart.map(s => Number(s.total_harga)), 100000);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Ringkasan Bisnis</h1>
          <p className="text-slate-400 mt-1">Pantau performa penjualan dan stok barang Anda secara real-time.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/produk"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-semibold hover:bg-slate-850 hover:text-white transition-all duration-150"
          >
            <Plus className="h-4 w-4" />
            Tambah Produk
          </Link>
          <Link
            href="/dashboard/penjualan"
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-semibold text-white transition-all duration-150 shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
          >
            <ShoppingCart className="h-4 w-4" />
            Catat Penjualan
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Revenue */}
        <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all duration-200 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-450 uppercase tracking-wider">Total Pendapatan</span>
            <p className="text-2xl font-bold text-white tracking-tight">{formatIDR(totalRevenue)}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CircleDollarSign className="h-6 w-6" />
          </div>
        </div>

        {/* Total Sales Invoices */}
        <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all duration-200 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-450 uppercase tracking-wider">Total Penjualan</span>
            <p className="text-2xl font-bold text-white tracking-tight">{totalSalesCount} Transaksi</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>

        {/* Total Products */}
        <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all duration-200 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-450 uppercase tracking-wider">Daftar Produk</span>
            <p className="text-2xl font-bold text-white tracking-tight">{totalProducts} Item</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Package className="h-6 w-6" />
          </div>
        </div>

        {/* Low Stock Alert Count */}
        <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 transition-all duration-200 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-450 uppercase tracking-wider">Stok Menipis / Habis</span>
            <p className="text-2xl font-bold text-white tracking-tight">
              {lowStockProducts.length} <span className="text-xs font-normal text-slate-400">({outOfStockCount} Habis)</span>
            </p>
          </div>
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
            lowStockProducts.length > 0
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse'
              : 'bg-slate-800/50 border border-slate-850 text-slate-450'
          }`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main dashboard content sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Chart Section */}
        <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 shadow-xl lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Grafik Penjualan Terbaru</h2>
              <p className="text-xs text-slate-400 mt-0.5">Nilai transaksi dari 7 transaksi terakhir.</p>
            </div>
            <span className="text-xs text-indigo-400 font-medium">Auto-updated</span>
          </div>

          {recentInvoicesForChart.length === 0 ? (
            <div className="h-[220px] bg-slate-950/20 rounded-xl border border-dashed border-slate-850 flex flex-col items-center justify-center text-center p-4">
              <TrendingUp className="h-10 w-10 text-slate-650 mb-2" />
              <p className="text-sm font-semibold text-slate-400">Belum Ada Riwayat Transaksi</p>
              <p className="text-xs text-slate-500 max-w-[240px] mt-1">Catat transaksi penjualan pertama Anda untuk memunculkan grafik.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Graphic Columns */}
              <div className="h-[200px] flex items-end justify-between gap-3 pt-6 px-2">
                {recentInvoicesForChart.map((s, idx) => {
                  const invoiceVal = Number(s.total_harga);
                  // Calculate height percent
                  const heightPercent = `${Math.max((invoiceVal / maxInvoiceValue) * chartHeightMax, 15)}px`;
                  return (
                    <div key={s.id} className="flex-1 flex flex-col items-center group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-2 bg-slate-900 border border-slate-800 text-[10px] font-bold text-white px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-xl z-20">
                        {formatIDR(invoiceVal)}
                      </div>
                      {/* Bar Column */}
                      <div
                        style={{ height: heightPercent }}
                        className="w-full max-w-[40px] bg-gradient-to-t from-indigo-650 to-indigo-500 hover:from-indigo-550 hover:to-indigo-450 rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all duration-300"
                      />
                      <span className="text-[10px] font-bold text-slate-450 mt-2 truncate w-full text-center">
                        #{s.nomor_invoice.slice(-4)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span>← Transaksi Lama</span>
                <span>Transaksi Baru →</span>
              </div>
            </div>
          )}
        </div>

        {/* Low Stock Alerts & Fast actions */}
        <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
          <h2 className="text-lg font-bold text-white">Alert Peringatan Stok</h2>

          <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1">
            {lowStockProducts.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2">
                  <Package className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-350">Stok Barang Aman</p>
                <p className="text-xs text-slate-500 mt-0.5">Semua produk memiliki stok di atas 5.</p>
              </div>
            ) : (
              lowStockProducts.map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800/50 hover:border-slate-800 transition-all duration-150"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{p.nama}</p>
                    <p className="text-[10px] font-mono text-slate-500 mt-0.5">{p.kode_produk}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    p.stok_saat_ini === 0
                      ? 'bg-red-500/15 text-red-400 border border-red-500/10'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/10'
                  }`}>
                    {p.stok_saat_ini === 0 ? 'Habis' : `${p.stok_saat_ini} Pcs`}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <Link
              href="/dashboard/produk"
              className="flex items-center justify-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:underline transition-all duration-150"
            >
              Kelola Inventaris Produk
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Sales transactions list */}
      <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Aktivitas Penjualan Terbaru</h2>
          <Link href="/dashboard/penjualan" className="text-xs font-bold text-indigo-400 hover:text-indigo-350 hover:underline">
            Lihat Semua
          </Link>
        </div>

        <div className="overflow-x-auto">
          {sales.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              Belum ada pencatatan transaksi penjualan.
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-450 uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Nomor Invoice</th>
                  <th className="pb-3 font-semibold">Tanggal</th>
                  <th className="pb-3 font-semibold">Jumlah Total</th>
                  <th className="pb-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-sm text-slate-300">
                {sales.slice(0, 5).map(sale => (
                  <tr key={sale.id} className="hover:bg-slate-900/20 transition-colors duration-100">
                    <td className="py-4 font-semibold text-white">{sale.nomor_invoice}</td>
                    <td className="py-4 text-slate-400">
                      {new Date(sale.created_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-4 font-bold text-white">{formatIDR(Number(sale.total_harga))}</td>
                    <td className="py-4 text-right">
                      <Link
                        href="/dashboard/penjualan"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-semibold text-indigo-400 hover:text-indigo-350 transition-colors"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
