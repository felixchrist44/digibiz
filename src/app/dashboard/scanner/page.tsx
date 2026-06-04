'use client';

import React, { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { adjustStok } from '@/app/dashboard/stok/actions';
import {
  Barcode,
  Search,
  Package,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  Plus,
  Minus,
  CheckCircle,
  Loader2,
  Barcode as BarcodeIcon,
  DollarSign,
  Layers
} from 'lucide-react';
import { Produk } from '@/types/database';

// Dynamically import BarcodeScanner with SSR disabled to prevent browser navigator errors on Server side
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

export default function ScannerPage() {
  const [scannedText, setScannedText] = useState<string>('');
  const [product, setProduct] = useState<Produk | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Stock mutation feedback messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search product by barcode/SKU
  const handleBarcodeLookup = async (code: string) => {
    if (!code) return;
    setScannedText(code);
    setSearching(true);
    setSearchError(null);
    setProduct(null);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('produk')
        .select('*')
        .eq('kode_produk', code)
        .single();

      if (error || !data) {
        setSearchError(`Produk dengan kode "${code}" tidak ditemukan di database.`);
      } else {
        setProduct(data as Produk);
      }
    } catch (err) {
      setSearchError('Terjadi kesalahan koneksi saat mencari produk.');
    } finally {
      setSearching(false);
    }
  };

  // Fast stock increment/decrement trigger
  const handleQuickAdjust = (tipe: 'masuk' | 'keluar', amount: number) => {
    if (!product) return;
    setSuccessMsg(null);
    setErrorMsg(null);

    if (tipe === 'keluar' && product.stok_saat_ini < amount) {
      setErrorMsg(`Stok tidak mencukupi untuk dikurangi. Stok saat ini: ${product.stok_saat_ini} Pcs.`);
      return;
    }

    const formData = new FormData();
    formData.append('produk_id', product.id);
    formData.append('tipe', tipe);
    formData.append('jumlah', String(amount));
    formData.append('keterangan', `Penyeseuaian cepat via modul barcode scanner`);

    startTransition(async () => {
      const res = await adjustStok(formData);
      if (res?.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(`Stok berhasil diperbarui (${tipe === 'masuk' ? '+' : '-'}${amount} Pcs).`);
        // Refresh product info locally
        const supabase = createClient();
        const { data } = await supabase.from('produk').select('*').eq('id', product.id).single();
        if (data) setProduct(data as Produk);
      }
    });
  };

  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <BarcodeIcon className="h-7 w-7 text-indigo-400" />
          Modul Barcode Scanner & Hardware
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Gunakan kamera HP/laptop Anda atau tembakan scanner laser USB fisik untuk mencari dan menyesuaikan stok secara instan.
        </p>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Camera Viewport (col-span-5) */}
        <div className="lg:col-span-5 space-y-4">
          <BarcodeScanner onScanSuccess={handleBarcodeLookup} />

          {/* Manual Input Fallback */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Cari SKU Manual</h4>
            <div className="relative">
              <input
                type="text"
                placeholder="Ketik kode produk (contoh: PRD-001) lalu Enter..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBarcodeLookup(e.currentTarget.value);
                  }
                }}
                className="w-full pl-4 pr-10 py-3 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold"
              />
              <button
                onClick={(e) => {
                  const input = e.currentTarget.previousSibling as HTMLInputElement;
                  handleBarcodeLookup(input.value);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-450 hover:text-white"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Search Results Lookup Card (col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/40 backdrop-blur border border-slate-800 rounded-3xl p-8 shadow-xl min-h-[440px] flex flex-col justify-between">
            {/* Header info */}
            <div>
              <h2 className="text-lg font-bold text-white border-b border-slate-850 pb-3 flex items-center justify-between">
                Rincian Barang Terpindai
                {product && (
                  <span className="text-xs font-mono font-bold bg-slate-850 text-indigo-400 px-2 py-0.5 rounded border border-slate-800">
                    {product.kode_produk}
                  </span>
                )}
              </h2>
            </div>

            {/* Results body */}
            <div className="flex-1 flex flex-col items-center justify-center py-6">
              {searching ? (
                <div className="text-center space-y-2">
                  <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mx-auto" />
                  <p className="text-xs text-slate-400">Mencari item SKU #{scannedText}...</p>
                </div>
              ) : searchError ? (
                <div className="text-center space-y-4 max-w-sm">
                  <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto animate-bounce" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-350">Barang Tidak Ditemukan</h3>
                    <p className="text-xs text-slate-500 mt-1">{searchError}</p>
                  </div>
                  <a
                    href="/dashboard/produk"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded-xl text-xs font-bold transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    Registrasikan SKU `{scannedText}` Baru
                  </a>
                </div>
              ) : product ? (
                /* Product detail layout with image thumbnail, description, price, stock */
                <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-start animate-in fade-in duration-200">
                  {/* Left part: Image */}
                  <div className="md:col-span-4 flex justify-center">
                    <div className="h-32 w-32 rounded-3xl bg-slate-950 border border-slate-800/80 flex items-center justify-center overflow-hidden shadow-inner">
                      {product.gambar_url ? (
                        <img
                          src={product.gambar_url}
                          alt={product.nama}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-12 w-12 text-slate-700" />
                      )}
                    </div>
                  </div>

                  {/* Right part: details metadata */}
                  <div className="md:col-span-8 space-y-4">
                    <div>
                      <h4 className="text-lg font-bold text-white">{product.nama}</h4>
                      <p className="text-xs text-slate-450 mt-1 leading-relaxed">
                        {product.deskripsi || 'Tidak ada deskripsi produk.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-b border-slate-850 py-3">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">Harga Jual</span>
                        <p className="text-base font-extrabold text-indigo-400 mt-0.5">{formatIDR(Number(product.harga))}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">Stok Saat Ini</span>
                        <p className={`text-base font-extrabold mt-0.5 ${product.stok_saat_ini <= 5 ? 'text-amber-400 font-bold' : 'text-slate-200'}`}>
                          {product.stok_saat_ini} Pcs
                        </p>
                      </div>
                    </div>

                    {/* Stock adjustments feedback messages */}
                    {successMsg && <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle className="h-4 w-4 shrink-0" /> {successMsg}</div>}
                    {errorMsg && <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">{errorMsg}</div>}

                    {/* Quick Mutation triggers */}
                    <div className="space-y-2 pt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-450 block">Atur Mutasi Cepat</span>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleQuickAdjust('masuk', 1)}
                          disabled={isPending}
                          className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all active:scale-[0.98]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Tambah 1
                        </button>
                        <button
                          onClick={() => handleQuickAdjust('keluar', 1)}
                          disabled={isPending || product.stok_saat_ini <= 0}
                          className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-red-650 hover:bg-red-750 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all active:scale-[0.98]"
                        >
                          <Minus className="h-3.5 w-3.5" />
                          Kurangi 1
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-slate-500 max-w-[280px]">
                  <Barcode className="h-12 w-12 text-slate-750 mx-auto mb-3 animate-pulse" />
                  <p className="text-xs font-semibold text-slate-400">Menunggu Input Pemindaian</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Tembak barcode produk menggunakan scanner atau posisikan barcode di depan kamera untuk melihat rincian produk.
                  </p>
                </div>
              )}
            </div>

            {/* Helper active scanner status bar */}
            <div className="border-t border-slate-850/50 pt-4 flex items-center justify-between text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                Sistem Pemindai Siap
              </span>
              <span>DigiBiz Scanner v1.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
