'use client';

import React, { useState, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { createProduk, updateProduk, deleteProduk } from '@/app/dashboard/produk/actions';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  X,
  Lock,
  Package,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { Produk, Profile } from '@/types/database';

interface Props {
  initialProducts: Produk[];
  profile: Profile;
}

export default function ProdukClient({ initialProducts, profile }: Props) {
  const [products, setProducts] = useState<Produk[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'out' | 'low' | 'available'>('all');
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Produk | null>(null);

  // Form error/success alerts
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isOwner = profile.role === 'owner';

  // Search & Filter logic
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.nama.toLowerCase().includes(search.toLowerCase()) ||
      p.kode_produk.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === 'out') return p.stok_saat_ini === 0;
    if (filter === 'low') return p.stok_saat_ini > 0 && p.stok_saat_ini <= 5;
    if (filter === 'available') return p.stok_saat_ini > 5;
    return true;
  });

  // Handle Create Product
  const handleAddSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await createProduk(formData);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage('Produk berhasil ditambahkan.');
        // Refresh products list from Supabase locally
        const supabase = createClient();
        const { data } = await supabase.from('produk').select('*').order('created_at', { ascending: false });
        if (data) setProducts(data as Produk[]);
        setTimeout(() => {
          setIsAddOpen(false);
          setSuccessMessage(null);
        }, 1200);
      }
    });
  };

  // Handle Edit Product
  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentProduct) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateProduk(currentProduct.id, formData);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage('Produk berhasil diperbarui.');
        const supabase = createClient();
        const { data } = await supabase.from('produk').select('*').order('created_at', { ascending: false });
        if (data) setProducts(data as Produk[]);
        setTimeout(() => {
          setIsEditOpen(false);
          setSuccessMessage(null);
        }, 1200);
      }
    });
  };

  // Handle Delete Product
  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus produk ini? Semua riwayat stok dan transaksi item ini akan hilang.')) return;

    const res = await deleteProduk(id);
    if (res?.error) {
      alert(res.error);
    } else {
      const supabase = createClient();
      const { data } = await supabase.from('produk').select('*').order('created_at', { ascending: false });
      if (data) setProducts(data as Produk[]);
    }
  };

  // Helper to format currency
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Daftar Inventaris Produk</h1>
          <p className="text-xs text-slate-400 mt-1">Kelola dan pantau seluruh produk beserta harga jual barang.</p>
        </div>
        <button
          onClick={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
            setIsAddOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-sm font-semibold transition-all duration-150 shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Registrasi Produk Baru
        </button>
      </div>

      {/* Role Restriction Banner for Staff */}
      {!isOwner && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-550/20 rounded-2xl text-amber-400 text-xs shadow-inner">
          <Lock className="h-4 w-4 shrink-0 animate-pulse" />
          <span>
            <strong>Akses Staff Terbatas:</strong> Anda dapat mendaftarkan produk, namun hanya <strong>Owner</strong> yang berhak menentukan/mengubah harga jual dan menghapus produk dari database.
          </span>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/30 p-4 border border-slate-850 rounded-2xl backdrop-blur-md">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-450" />
          <input
            type="text"
            placeholder="Cari produk berdasarkan nama atau kode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Filter stock status */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-450 font-medium whitespace-nowrap">Filter Stok:</span>
          <select
            value={filter}
            onChange={(e: any) => setFilter(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-350 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="all">Semua Produk</option>
            <option value="out">Stok Habis (0)</option>
            <option value="low">Stok Menipis (1-5)</option>
            <option value="available">Tersedia (&gt;5)</option>
          </select>
        </div>

        <div className="flex items-center justify-end text-xs text-slate-450 font-medium px-1">
          Menampilkan {filteredProducts.length} dari {products.length} produk
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="py-20 text-center bg-slate-900/10 border border-dashed border-slate-850 rounded-2xl flex flex-col items-center">
          <Package className="h-12 w-12 text-slate-650 mb-3" />
          <p className="text-base font-bold text-slate-350">Tidak Ada Produk Ditemukan</p>
          <p className="text-xs text-slate-500 mt-1 max-w-[280px]">
            Coba ganti filter pencarian atau buat produk baru untuk memulai pencatatan.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((p) => {
            const isLow = p.stok_saat_ini <= 5;
            const isOut = p.stok_saat_ini === 0;

            return (
              <div
                key={p.id}
                className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700/60 shadow-xl transition-all duration-200 flex flex-col justify-between space-y-4"
              >
                {/* Header info */}
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md border border-slate-750">
                      {p.kode_produk}
                    </span>
                    {isLow && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isOut ? 'bg-red-500/10 text-red-400 border border-red-500/10' : 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                      }`}>
                        <AlertTriangle className="h-3 w-3" />
                        {isOut ? 'Habis' : 'Stok Tipis'}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white tracking-tight pt-1 truncate">{p.nama}</h3>
                  <p className="text-xs text-slate-450 line-clamp-2 min-h-[32px]">{p.deskripsi || 'Tidak ada deskripsi produk.'}</p>
                </div>

                {/* Price and Stock Stats */}
                <div className="pt-2 border-t border-slate-850 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-450 font-semibold uppercase tracking-wider">Harga Jual</span>
                    <p className="text-sm font-extrabold text-indigo-400">{formatIDR(Number(p.harga))}</p>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <span className="text-[10px] text-slate-450 font-semibold uppercase tracking-wider">Stok Saat Ini</span>
                    <p className={`text-sm font-extrabold ${isOut ? 'text-red-400 font-black' : isLow ? 'text-amber-400 font-bold' : 'text-slate-200'}`}>
                      {p.stok_saat_ini} Pcs
                    </p>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-4 border-t border-slate-850 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setCurrentProduct(p);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                      setIsEditOpen(true);
                    }}
                    className="p-2 rounded-lg bg-slate-950/40 border border-slate-800 hover:border-indigo-500/30 text-slate-400 hover:text-indigo-400 transition-colors"
                    title="Ubah Produk"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {isOwner && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-2 rounded-lg bg-slate-950/40 border border-slate-800 hover:border-red-500/30 text-slate-450 hover:text-red-450 transition-colors"
                      title="Hapus Produk"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== ADD PRODUCT MODAL ==================== */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setIsAddOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-2">Registrasi Produk Baru</h2>
            <p className="text-xs text-slate-400 mb-6">Masukkan data produk baru Anda secara detail ke sistem.</p>

            <form onSubmit={handleAddSubmit} className="space-y-5">
              {/* Form Status Messages */}
              {errorMessage && <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">{errorMessage}</div>}
              {successMessage && <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 flex items-center gap-2"><CheckCircle className="h-4 w-4 shrink-0" />{successMessage}</div>}

              <div className="grid grid-cols-2 gap-4">
                {/* Product Code */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Kode Produk</label>
                  <input
                    type="text"
                    name="kode_produk"
                    required
                    placeholder="PRD-001"
                    className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                {/* Stock Initial */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Stok Awal</label>
                  <input
                    type="number"
                    name="stok_awal"
                    min="0"
                    defaultValue="0"
                    className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nama Produk</label>
                <input
                  type="text"
                  name="nama"
                  required
                  placeholder="Nama barang..."
                  className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {/* Price input (Locked to 0 if not Owner) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Harga Jual (IDR)</label>
                  {!isOwner && (
                    <span className="text-[10px] text-amber-400 flex items-center gap-1 font-medium">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </div>
                <div className="relative rounded-xl">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                  <input
                    type="number"
                    name="harga"
                    min="0"
                    defaultValue="0"
                    disabled={!isOwner}
                    placeholder="Contoh: 15000"
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isOwner
                        ? 'bg-slate-950/40 border-slate-800 text-slate-200'
                        : 'bg-slate-950/20 border-slate-850 text-slate-500 cursor-not-allowed'
                    }`}
                  />
                </div>
                {!isOwner && (
                  <p className="text-[10px] text-slate-500 mt-1">Hanya Owner yang dapat menetapkan harga produk. Produk akan terbuat dengan harga Rp0.</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Deskripsi Produk (Opsional)</label>
                <textarea
                  name="deskripsi"
                  rows={3}
                  placeholder="Keterangan singkat produk..."
                  className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2.5 bg-slate-950/40 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Simpan Produk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== EDIT PRODUCT MODAL ==================== */}
      {isEditOpen && currentProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setIsEditOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-2">Ubah Data Produk</h2>
            <p className="text-xs text-slate-400 mb-6">Ubah data untuk produk berkode <span className="font-mono text-indigo-400">{currentProduct.kode_produk}</span>.</p>

            <form onSubmit={handleEditSubmit} className="space-y-5">
              {/* Form Status Messages */}
              {errorMessage && <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">{errorMessage}</div>}
              {successMessage && <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 flex items-center gap-2"><CheckCircle className="h-4 w-4 shrink-0" />{successMessage}</div>}

              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nama Produk</label>
                <input
                  type="text"
                  name="nama"
                  required
                  defaultValue={currentProduct.nama}
                  placeholder="Nama barang..."
                  className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {/* Price input (Locked to read-only if not Owner) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Harga Jual (IDR)</label>
                  {!isOwner && (
                    <span className="text-[10px] text-amber-400 flex items-center gap-1 font-medium bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                      <Lock className="h-3 w-3" /> Hanya Owner
                    </span>
                  )}
                </div>
                <div className="relative rounded-xl">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                  <input
                    type="number"
                    name="harga"
                    min="0"
                    defaultValue={Number(currentProduct.harga)}
                    disabled={!isOwner}
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isOwner
                        ? 'bg-slate-950/40 border-slate-800 text-slate-200'
                        : 'bg-slate-950/20 border-slate-850 text-slate-500 cursor-not-allowed'
                    }`}
                  />
                </div>
                {!isOwner && (
                  <p className="text-[10px] text-slate-500 mt-1">Akses Terbatas: Sebagai Staff, Anda tidak dapat mengubah harga barang. Hubungi Owner.</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Deskripsi Produk</label>
                <textarea
                  name="deskripsi"
                  rows={3}
                  defaultValue={currentProduct.deskripsi || ''}
                  placeholder="Keterangan singkat produk..."
                  className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2.5 bg-slate-950/40 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
