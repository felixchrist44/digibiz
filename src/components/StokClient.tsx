'use client';

import React, { useState, useTransition, useEffect, useRef } from 'react';
import { adjustStok } from '@/app/dashboard/stok/actions';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Search,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  X,
  History,
  CheckCircle,
  TrendingDown,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { StokLog, Produk } from '@/types/database';

interface Props {
  initialLogs: StokLog[];
  products: Produk[];
  hasMore: boolean;
  currentPage: number;
}

interface AutocompleteProduct {
  id: string;
  nama: string;
  kode_produk: string;
  harga: number;
  stok_saat_ini: number;
}

export default function StokClient({
  initialLogs,
  products,
  hasMore,
  currentPage
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [logs, setLogs] = useState<StokLog[]>(initialLogs);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'masuk' | 'keluar'>('all');
  const [isPending, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Autocomplete states for product selector in modal
  const [productSearch, setProductSearch] = useState('');
  const [autocompleteResults, setAutocompleteResults] = useState<AutocompleteProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<AutocompleteProduct | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync logs from server props
  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Autocomplete API fetcher with debounce
  useEffect(() => {
    if (!productSearch.trim()) {
      setAutocompleteResults(products.map(p => ({
        id: p.id,
        nama: p.nama,
        kode_produk: (p as any).kode_produk || '',
        harga: Number((p as any).harga || 0),
        stok_saat_ini: p.stok_saat_ini
      })));
      return;
    }

    setAutocompleteLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/produk/search?q=${encodeURIComponent(productSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setAutocompleteResults(data);
        }
      } catch (err) {
        console.error('Autocomplete fetch error:', err);
      } finally {
        setAutocompleteLoading(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [productSearch, products]);

  // Search & Filter Logic (client-side filter over the server-paginated results)
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

    if (!selectedProduct) {
      setErrorMessage('Silakan pilih produk terlebih dahulu.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set('produk_id', selectedProduct.id);

    startTransition(async () => {
      const res = await adjustStok(formData);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage('Mutasi stok berhasil dicatat.');

        // Refresh server-side data
        router.refresh();

        setTimeout(() => {
          setIsOpen(false);
          setSuccessMessage(null);
          setSelectedProduct(null);
          setProductSearch('');
        }, 1200);
      }
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
            setSelectedProduct(null);
            setProductSearch('');
            setIsOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-sm font-semibold transition-all duration-150 shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Catat Mutasi Stok
        </button>
      </div>

      {/* Toolbar */}
      <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/30 p-4 border border-slate-850 rounded-2xl backdrop-blur-md transition-opacity duration-200 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
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
          Menampilkan {filteredLogs.length} riwayat (Halaman {currentPage})
        </div>
      </div>

      {/* History table list */}
      <div className={`bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 shadow-xl overflow-x-auto transition-opacity duration-200 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
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

        {/* Pagination Controls */}
        {(() => {
          const hasPrevious = currentPage > 1;
          if (!hasPrevious && !hasMore) return null;

          return (
            <div className="flex items-center justify-between gap-4 bg-slate-950/30 p-4 border border-slate-855 rounded-2xl backdrop-blur-md mt-6">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={!hasPrevious || isPending}
                className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-450 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900/50 transition-all duration-150 active:scale-[0.98]"
              >
                Sebelumnya
              </button>

              <span className="text-xs text-slate-400 font-bold font-sans">
                Halaman {currentPage}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!hasMore || isPending}
                className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-455 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900/50 transition-all duration-150 active:scale-[0.98]"
              >
                Selanjutnya
              </button>
            </div>
          );
        })()}
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

              {/* Searchable Product Selector */}
              <div ref={dropdownRef}>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pilih Produk</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Ketik nama atau kode produk..."
                    value={selectedProduct ? `${selectedProduct.nama} (Stok: ${selectedProduct.stok_saat_ini})` : productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setSelectedProduct(null);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (selectedProduct) {
                        setProductSearch('');
                        setSelectedProduct(null);
                      }
                      setIsDropdownOpen(true);
                    }}
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  {autocompleteLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-400 animate-spin" />
                  )}
                  {!autocompleteLoading && (
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  )}

                  {/* Dropdown Results */}
                  {isDropdownOpen && !selectedProduct && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl shadow-2xl">
                      {autocompleteResults.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 italic text-center">
                          {autocompleteLoading ? 'Mencari...' : 'Produk tidak ditemukan.'}
                        </div>
                      ) : (
                        autocompleteResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProduct(p);
                              setProductSearch('');
                              setIsDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-800/60 text-sm text-slate-300 transition-colors flex items-center justify-between gap-2 border-b border-slate-850/50 last:border-b-0"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-white block truncate">{p.nama}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{p.kode_produk}</span>
                            </div>
                            <span className={`text-[10px] font-bold whitespace-nowrap ${
                              p.stok_saat_ini === 0 ? 'text-red-400' : p.stok_saat_ini <= 5 ? 'text-amber-400' : 'text-slate-450'
                            }`}>
                              Stok: {p.stok_saat_ini}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {/* Hidden input for form validation */}
                <input type="hidden" name="produk_id" value={selectedProduct?.id || ''} />
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
                  disabled={isPending || !selectedProduct}
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
