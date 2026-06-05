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
  Barcode as BarcodeIcon,
  Upload
} from 'lucide-react';
import { Produk, Profile } from '@/types/database';
import BarcodeGenerator from '@/components/BarcodeGenerator';

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

  // Barcode modal state
  const [isBarcodeOpen, setIsBarcodeOpen] = useState(false);
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState<Produk | null>(null);

  // Form error/success alerts
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Live Image Preview state for forms
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

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

  // Handle image file selection preview helper
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreviewUrl(url);
    } else {
      setImagePreviewUrl(null);
    }
  };

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
          setImagePreviewUrl(null);
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
          setImagePreviewUrl(null);
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
        {isOwner && (
          <button
            onClick={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
              setImagePreviewUrl(null);
              setIsAddOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-sm font-semibold transition-all duration-150 shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Registrasi Produk Baru
          </button>
        )}
      </div>

      {/* Role Restriction Banner for Staff */}
      {!isOwner && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-555/20 rounded-2xl text-amber-400 text-xs shadow-inner">
          <Lock className="h-4 w-4 shrink-0 animate-pulse" />
          <span>
            <strong>Akses Staff Terbatas:</strong> Hanya <strong>Owner</strong> yang berhak mendaftarkan produk baru, menentukan/mengubah harga, dan menghapus produk dari database.
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

      {/* Remodeled Product List: Wide, Compact Horizontal Rows */}
      {filteredProducts.length === 0 ? (
        <div className="py-20 text-center bg-slate-900/10 border border-dashed border-slate-850 rounded-2xl flex flex-col items-center">
          <Package className="h-12 w-12 text-slate-650 mb-3" />
          <p className="text-base font-bold text-slate-350">Tidak Ada Produk Ditemukan</p>
          <p className="text-xs text-slate-500 mt-1 max-w-[280px]">
            Coba ganti filter pencarian atau buat produk baru untuk memulai pencatatan.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 w-full">
          {filteredProducts.map((p) => {
            const isLow = p.stok_saat_ini <= 5;
            const isOut = p.stok_saat_ini === 0;

            return (
              <div
                key={p.id}
                className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-4 hover:border-slate-700/60 shadow-xl transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full"
              >
                {/* Left Side: Thumbnail & Title Metadata */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* Thumbnail Image from Supabase Storage */}
                  <div className="h-14 w-14 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                    {p.gambar_url ? (
                      <img
                        src={p.gambar_url}
                        alt={p.nama}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-slate-550" />
                    )}
                  </div>

                  {/* Title details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-mono font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-750">
                        {p.kode_produk}
                      </span>
                      {isLow && (
                        <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          isOut ? 'bg-red-500/10 text-red-400 border border-red-500/10' : 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                        }`}>
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {isOut ? 'Habis' : 'Stok Tipis'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white tracking-tight mt-1.5 truncate">{p.nama}</h3>
                    <p className="text-xs text-slate-450 line-clamp-1 mt-0.5">{p.deskripsi || 'Tidak ada deskripsi produk.'}</p>
                  </div>
                </div>

                {/* Middle Section: Price & Stock side by side */}
                <div className="flex items-center gap-6 md:gap-12 shrink-0 border-t border-slate-850/50 pt-3 md:pt-0 md:border-0 justify-between md:justify-end">
                  {isOwner && (
                    <div className="space-y-0.5 min-w-[100px]">
                      <span className="text-[9px] text-slate-450 font-semibold uppercase tracking-wider block">Harga Modal</span>
                      <p className="text-sm font-extrabold text-emerald-400">{formatIDR(Number(p.harga_modal || 0))}</p>
                    </div>
                  )}
                  <div className="space-y-0.5 min-w-[100px]">
                    <span className="text-[9px] text-slate-450 font-semibold uppercase tracking-wider block">Harga Jual</span>
                    <p className="text-sm font-extrabold text-indigo-400">{formatIDR(Number(p.harga))}</p>
                  </div>
                  <div className="space-y-0.5 text-right md:text-left min-w-[80px]">
                    <span className="text-[9px] text-slate-450 font-semibold uppercase tracking-wider block">Stok Saat Ini</span>
                    <p className={`text-sm font-extrabold ${isOut ? 'text-red-400 font-black' : isLow ? 'text-amber-400 font-bold' : 'text-slate-200'}`}>
                      {p.stok_saat_ini} Pcs
                    </p>
                  </div>
                </div>

                {/* Right Side: Printing, Editing & Deleting Actions */}
                <div className="flex items-center justify-end gap-2 shrink-0 border-t border-slate-850/50 pt-3 md:pt-0 md:border-0">
                  {/* Barcode Print trigger */}
                  <button
                    onClick={() => {
                      setSelectedBarcodeProduct(p);
                      setIsBarcodeOpen(true);
                    }}
                    className="p-2 rounded-lg bg-slate-950/40 border border-slate-800 hover:border-indigo-500/30 text-slate-400 hover:text-indigo-400 transition-colors"
                    title="Cetak Barcode Label"
                  >
                    <BarcodeIcon className="h-4 w-4" />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => {
                      setCurrentProduct(p);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                      setImagePreviewUrl(p.gambar_url);
                      setIsEditOpen(true);
                    }}
                    className="p-2 rounded-lg bg-slate-950/40 border border-slate-800 hover:border-indigo-500/30 text-slate-400 hover:text-indigo-400 transition-colors"
                    title="Ubah Produk"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>

                  {/* Delete */}
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
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-2">Registrasi Produk Baru</h2>
            <p className="text-xs text-slate-400 mb-6">Masukkan data produk baru Anda secara detail ke sistem.</p>

            <form onSubmit={handleAddSubmit} encType="multipart/form-data" className="space-y-5">
              {/* Form Status Messages */}
              {errorMessage && <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">{errorMessage}</div>}
              {successMessage && <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 flex items-center gap-2"><CheckCircle className="h-4 w-4 shrink-0" />{successMessage}</div>}

              {/* Image upload selector & preview */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Gambar Produk (Opsional)</label>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                    {imagePreviewUrl ? (
                      <img src={imagePreviewUrl} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-8 w-8 text-slate-700" />
                    )}
                  </div>
                  <label className="flex flex-col items-center justify-center px-4 py-2 border border-slate-800 hover:border-slate-700 rounded-xl bg-slate-950/40 hover:bg-slate-950/80 cursor-pointer text-slate-350 hover:text-white transition-all text-xs font-semibold gap-1.5 active:scale-[0.98]">
                    <Upload className="h-4 w-4 text-indigo-400" />
                    Pilih File Gambar
                    <input
                      type="file"
                      name="gambar"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

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

              {/* Prices grid (Harga Modal & Harga Jual) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Harga Modal */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Harga Modal (IDR)</label>
                  <div className="relative rounded-xl">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                    <input
                      type="number"
                      name="harga_modal"
                      min="0"
                      defaultValue="0"
                      placeholder="Contoh: 10000"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-950/40 border border-slate-800 text-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Harga Jual */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Harga Jual (IDR)</label>
                  <div className="relative rounded-xl">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                    <input
                      type="number"
                      name="harga"
                      min="0"
                      defaultValue="0"
                      placeholder="Contoh: 15000"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-950/40 border border-slate-800 text-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
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
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsEditOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-2">Ubah Data Produk</h2>
            <p className="text-xs text-slate-400 mb-6">Ubah data untuk produk berkode <span className="font-mono text-indigo-400">{currentProduct.kode_produk}</span>.</p>

            <form onSubmit={handleEditSubmit} encType="multipart/form-data" className="space-y-5">
              {/* Form Status Messages */}
              {errorMessage && <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">{errorMessage}</div>}
              {successMessage && <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 flex items-center gap-2"><CheckCircle className="h-4 w-4 shrink-0" />{successMessage}</div>}

              {/* Image upload selector & preview */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Gambar Produk</label>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                    {imagePreviewUrl ? (
                      <img src={imagePreviewUrl} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-8 w-8 text-slate-700" />
                    )}
                  </div>
                  <label className="flex flex-col items-center justify-center px-4 py-2 border border-slate-800 hover:border-slate-700 rounded-xl bg-slate-950/40 hover:bg-slate-950/80 cursor-pointer text-slate-350 hover:text-white transition-all text-xs font-semibold gap-1.5 active:scale-[0.98]">
                    <Upload className="h-4 w-4 text-indigo-400" />
                    Pilih File Gambar Baru
                    <input
                      type="file"
                      name="gambar"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

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

              {/* Prices grid (Harga Modal & Harga Jual) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Harga Modal - Only shown and editable by Owner */}
                {isOwner && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Harga Modal (IDR)</label>
                    <div className="relative rounded-xl">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                      <input
                        type="number"
                        name="harga_modal"
                        min="0"
                        defaultValue={Number(currentProduct.harga_modal || 0)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-950/40 border border-slate-800 text-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {/* Harga Jual */}
                <div className={isOwner ? '' : 'sm:col-span-2'}>
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

      {/* ==================== BARCODE GENERATOR MODAL ==================== */}
      {isBarcodeOpen && selectedBarcodeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 print:bg-transparent print:backdrop-blur-none">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-850 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-150 print:border-0 print:shadow-none print:p-0 print:bg-transparent">
            {/* Close Button */}
            <button
              onClick={() => setIsBarcodeOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg print:hidden z-30"
            >
              <X className="h-5 w-5" />
            </button>

            <BarcodeGenerator
              value={selectedBarcodeProduct.kode_produk}
              name={selectedBarcodeProduct.nama}
              price={Number(selectedBarcodeProduct.harga)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
