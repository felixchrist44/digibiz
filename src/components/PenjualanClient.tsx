'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { checkoutPenjualan } from '@/app/dashboard/penjualan/actions';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  X,
  Printer,
  History,
  Info,
  ArrowRight,
  Wifi
} from 'lucide-react';
import { Produk, Penjualan, DetailPenjualan, Profile } from '@/types/database';

interface Props {
  products: Produk[];
  initialInvoices: Penjualan[];
  hasMore: boolean;
  currentPage: number;
  profile: Profile | null;
}

interface CartItem {
  id: string;
  nama: string;
  harga: number;
  jumlah: number;
  maxStok: number;
}
interface SuccessInvoice {
  nomor_invoice: string;
  items: {
    id: string;
    nama: string;
    harga: number;
    jumlah: number;
  }[];
  total_harga: number;
  cash: number;
  change: number;
}
export default function PenjualanClient({
  products: initialProducts,
  initialInvoices,
  hasMore,
  currentPage,
  profile
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Produk[] | null>(null);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [invoices, setInvoices] = useState<Penjualan[]>(initialInvoices);
  const [isPending, startTransition] = useTransition();

  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    profile?.tenant_id ? 'connecting' : 'disconnected'
  );

  // Sync state values when props change directly in render (avoids cascading render effects)
  const [prevInitialInvoices, setPrevInitialInvoices] = useState(initialInvoices);
  if (initialInvoices !== prevInitialInvoices) {
    setPrevInitialInvoices(initialInvoices);
    setInvoices(initialInvoices);
  }

  // Autocomplete search execution from API endpoint (debounced)
  useEffect(() => {
    if (!search.trim()) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`/api/produk/search?q=${encodeURIComponent(search)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Error fetching search results:', err);
      }
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Modals state
  const [successInvoice, setSuccessInvoice] = useState<SuccessInvoice | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Penjualan | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<DetailPenjualan[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Error alert
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search logic is handled dynamically via autocomplete fetch
  const filteredProducts = search.trim() ? (searchResults ?? initialProducts) : initialProducts;

  // Add to cart
  const addToCart = (product: Produk) => {
    if (product.stok_saat_ini === 0) return;

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.jumlah >= product.stok_saat_ini) {
          alert(`Stok tidak mencukupi. Batas stok "${product.nama}" adalah ${product.stok_saat_ini} Pcs.`);
          return prev;
        }
        return prev.map(item =>
          item.id === product.id ? { ...item, jumlah: item.jumlah + 1 } : item
        );
      }
      return [...prev, { id: product.id, nama: product.nama, harga: Number(product.harga), jumlah: 1, maxStok: product.stok_saat_ini }];
    });
  };

  // Handle incoming barcode scan via Supabase Realtime channel
  const handleIncomingBarcode = async (sku: string) => {
    if (!sku) return;
    const trimmedSku = sku.trim();
    
    // 1. Search in current products list
    let matchedProduct = initialProducts.find(
      p => p.kode_produk?.toLowerCase() === trimmedSku.toLowerCase()
    );

    // 2. Fallback to direct DB query if not in initialProducts list (since initialProducts is paginated/limited)
    if (!matchedProduct) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('produk')
          .select('id, nama, kode_produk, harga, stok_saat_ini')
          .eq('kode_produk', trimmedSku)
          .maybeSingle();

        if (error) {
          console.error('Error querying product by SKU:', error);
        } else if (data) {
          matchedProduct = data as Produk;
        }
      } catch (err) {
        console.error('Error during fallback product lookup:', err);
      }
    }

    if (matchedProduct) {
      addToCart(matchedProduct);
    } else {
      console.warn(`Produk dengan SKU/Kode "${trimmedSku}" tidak ditemukan.`);
    }
  };

  const handleIncomingBarcodeRef = React.useRef(handleIncomingBarcode);
  useEffect(() => {
    handleIncomingBarcodeRef.current = handleIncomingBarcode;
  });

  useEffect(() => {
    if (!profile?.tenant_id) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase.channel(`inventory-checkout-${profile.tenant_id}`, {
        config: { broadcast: { self: false }, private: false }
      });

      channel
        .on('broadcast', { event: 'barcode-scanned' }, (payload) => {
          const sku = payload.payload?.sku;
          if (sku) {
            handleIncomingBarcodeRef.current(sku);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setSocketStatus('connected');
          } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setSocketStatus('disconnected');
            console.error(`Realtime subscription status: ${status}`);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [profile?.tenant_id]);

  // Adjust quantity
  const updateQty = (id: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.id === id) {
            const nextQty = item.jumlah + delta;
            if (nextQty > item.maxStok) {
              alert(`Stok tidak mencukupi. Batas stok adalah ${item.maxStok} Pcs.`);
              return item;
            }
            return { ...item, jumlah: nextQty };
          }
          return item;
        })
        .filter(item => item.jumlah > 0)
    );
  };

  // Remove from cart
  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // Calculations
  const totalPrice = cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0);
  const cashNum = Number(cashReceived) || 0;
  const change = cashNum >= totalPrice ? cashNum - totalPrice : 0;
  const isCashSufficient = cashNum >= totalPrice || totalPrice === 0;

  // Format currency
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Checkout submit
  const handleCheckout = () => {
    if (cart.length === 0) return;
    setErrorMsg(null);

    startTransition(async () => {
      const res = await checkoutPenjualan(cart);
      if (res?.error) {
        setErrorMsg(res.error);
      } else if (res?.success) {
        // Show success modal
        setSuccessInvoice({
          nomor_invoice: res.nomor_invoice,
          total_harga: res.total_harga,
          cash: cashNum,
          change: cashNum - Number(res.total_harga),
          items: [...cart]
        });

        // Clear cart
        setCart([]);
        setCashReceived('');

        // Refresh dynamic server routes
        router.refresh();
      }
    });
  };

  // View Invoice Detail (lazy fetch)
  const viewInvoiceDetail = async (invoice: Penjualan) => {
    setSelectedInvoice(invoice);
    setLoadingDetails(true);
    setInvoiceDetails([]);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('detail_penjualan')
      .select('*, produk(nama)')
      .eq('penjualan_id', invoice.id);

    setLoadingDetails(false);
    if (!error && data) {
      setInvoiceDetails(data as DetailPenjualan[]);
    } else {
      alert('Gagal mengambil rincian invoice.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Kelola Penjualan</h1>
          <p className="text-xs text-slate-400 mt-1">Catat transaksi kasir dan pantau riwayat penjualan toko.</p>
        </div>
        <div className="flex bg-slate-900 border border-slate-850 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'pos'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            Kasir / POS
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="h-4 w-4" />
            Riwayat Invoice
          </button>
        </div>
      </div>

      {/* ==================== TAB 1: POS SYSTEM ==================== */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Products Pane (col-span-7) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-450" />
              <input
                type="text"
                placeholder="Cari nama barang atau kode produk..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (!e.target.value.trim()) {
                    setSearchResults(null);
                  }
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            {/* Products grid */}
            {filteredProducts.length === 0 ? (
              <div className="py-16 text-center bg-slate-900/10 border border-dashed border-slate-850 rounded-2xl">
                <p className="text-sm font-semibold text-slate-400">Tidak ada produk tersedia.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1">
                {filteredProducts.map((p) => {
                  const isOut = p.stok_saat_ini === 0;
                  const isLow = p.stok_saat_ini <= 5;
                  const isItemInCart = cart.some(item => item.id === p.id);

                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={isOut}
                      className={`text-left p-4 rounded-2xl border transition-all duration-150 flex flex-col justify-between h-36 ${
                        isOut
                          ? 'bg-slate-950/20 border-slate-900 opacity-40 cursor-not-allowed'
                          : isItemInCart
                          ? 'bg-indigo-950/20 border-indigo-500/40 hover:border-indigo-500/60 shadow-lg shadow-indigo-950/10'
                          : 'bg-slate-900/30 border-slate-850 hover:border-slate-800'
                      }`}
                    >
                      <div className="w-full">
                        <span className="text-[9px] font-mono font-bold bg-slate-850 text-slate-400 px-1.5 py-0.5 rounded border border-slate-750">
                          {p.kode_produk}
                        </span>
                        <h4 className="text-sm font-bold text-white tracking-tight mt-2 line-clamp-1">{p.nama}</h4>
                        <p className="text-xs text-indigo-400 font-extrabold mt-1">{formatIDR(Number(p.harga))}</p>
                      </div>

                      <div className="w-full flex items-center justify-between pt-2 border-t border-slate-850 mt-2">
                        <span className={`text-[10px] font-semibold ${
                          isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-slate-500'
                        }`}>
                          Stok: {p.stok_saat_ini} Pcs
                        </span>
                        {!isOut && (
                          <span className="text-[10px] font-bold text-indigo-400 hover:underline">
                            + Tambah
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart & Checkout Pane (col-span-5) */}
          <div className="lg:col-span-5 bg-slate-900/40 backdrop-blur border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-850 flex-wrap">
              <ShoppingCart className="h-5 w-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white mr-auto">Keranjang Belanja</h2>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                socketStatus === 'connected'
                  ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400'
                  : socketStatus === 'connecting'
                  ? 'bg-amber-950/40 border-amber-900/50 text-amber-400'
                  : 'bg-red-950/40 border-red-900/50 text-red-400'
              }`}>
                <Wifi className="h-3.5 w-3.5" />
                {socketStatus === 'connected' ? 'Soket Online' : socketStatus === 'connecting' ? 'Menghubungkan' : 'Soket Offline'}
              </span>
              {cart.length > 0 && (
                <span className="px-2 py-0.5 bg-indigo-600 rounded-full text-[10px] font-black text-white">
                  {cart.length} Item
                </span>
              )}
            </div>

            {/* Cart Items list */}
            {cart.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs">
                Keranjang belanja masih kosong. Klik barang di sebelah kiri untuk memasukkan ke keranjang.
              </div>
            ) : (
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-850"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <h5 className="text-xs font-bold text-white truncate">{item.nama}</h5>
                      <span className="text-[10px] text-slate-450 font-bold mt-0.5 inline-block">
                        {formatIDR(item.harga)}
                      </span>
                    </div>

                    {/* Quantity Selector */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        className="p-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-350"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-xs font-bold text-white min-w-[20px] text-center">
                        {item.jumlah}
                      </span>
                      <button
                        onClick={() => updateQty(item.id, 1)}
                        className="p-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-350"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Subtotal & Delete */}
                    <div className="flex items-center gap-3 ml-4 text-right">
                      <span className="text-xs font-extrabold text-slate-200">
                        {formatIDR(item.harga * item.jumlah)}
                      </span>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Calculations & Cash Input */}
            {cart.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-850">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-450 font-semibold">Total Harga:</span>
                  <span className="text-lg font-black text-indigo-400">{formatIDR(totalPrice)}</span>
                </div>

                {/* Cash Payment received */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Uang Diterima (Cash)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Rp</span>
                    <input
                      type="number"
                      placeholder="Contoh: 50000"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold"
                    />
                  </div>
                </div>

                {/* Change return */}
                {cashReceived && (
                  <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950/40 border border-slate-800">
                    <span className="text-xs text-slate-400 font-semibold">Kembalian:</span>
                    <span className={`text-sm font-extrabold ${isCashSufficient ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isCashSufficient ? formatIDR(change) : 'Uang Kurang'}
                    </span>
                  </div>
                )}

                {/* Checkout error message */}
                {errorMsg && (
                  <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">
                    {errorMsg}
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={handleCheckout}
                  disabled={isPending || cart.length === 0 || !isCashSufficient}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Bayar & Selesaikan Transaksi
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: INVOICE HISTORY ==================== */}
      {activeTab === 'history' && (
        <div className="bg-slate-900/40 backdrop-blur border border-slate-800 rounded-2xl p-6 shadow-xl overflow-x-auto">
          {invoices.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              Belum ada riwayat transaksi penjualan tercatat.
            </div>
          ) : (
            <>
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-450 uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Nomor Invoice</th>
                  <th className="pb-3 font-semibold">Waktu / Tanggal</th>
                  <th className="pb-3 font-semibold">Total Pendapatan</th>
                  <th className="pb-3 font-semibold">Kasir</th>
                  <th className="pb-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-sm text-slate-350">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-900/10 transition-colors duration-100">
                    <td className="py-4 font-bold text-white">{inv.nomor_invoice}</td>
                    <td className="py-4 text-slate-450">
                      {new Date(inv.created_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-4 font-extrabold text-white">{formatIDR(Number(inv.total_harga))}</td>
                    <td className="py-4 text-slate-400 text-xs">{inv.profiles?.full_name || 'Kasir'}</td>
                    <td className="py-4 text-right">
                      <button
                        onClick={() => viewInvoiceDetail(inv)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-950/40 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Info className="h-3.5 w-3.5 text-indigo-400" />
                        Rincian
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Visual Pagination Footer */}
            {(() => {
              const hasPrevious = currentPage > 1;
              if (!hasPrevious && !hasMore) return null;

              const handlePageChange = (page: number) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set('page', page.toString());
                startTransition(() => {
                  router.push(`${pathname}?${params.toString()}`);
                });
              };

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
            </>
          )}
        </div>
      )}

      {/* ==================== SUCCESS MODAL RECEIPT ==================== */}
      {successInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-white text-slate-900 border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            {/* Receipt Header */}
            <div className="text-center space-y-1">
              <div className="inline-flex items-center justify-center p-2.5 bg-emerald-100 text-emerald-600 rounded-full mb-2">
                <CheckCircle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-black tracking-tight">TRANSAKSI BERHASIL</h3>
              <p className="text-[10px] text-slate-500 font-mono">{successInvoice.nomor_invoice}</p>
            </div>

            {/* Line items details */}
            <div className="border-t border-b border-dashed border-slate-300 py-3 space-y-2 text-xs">
              {successInvoice.items.map((item) => (
                <div key={item.id} className="flex justify-between font-mono">
                  <span className="truncate max-w-[200px]">{item.nama} x{item.jumlah}</span>
                  <span className="font-semibold">{formatIDR(item.harga * item.jumlah)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL AKHIR:</span>
                <span>{formatIDR(successInvoice.total_harga)}</span>
              </div>
              <div className="flex justify-between text-slate-650">
                <span>Tunai Dibayar:</span>
                <span>{formatIDR(successInvoice.cash)}</span>
              </div>
              <div className="flex justify-between text-slate-650 font-bold border-t border-slate-200 pt-1">
                <span>Kembalian:</span>
                <span>{formatIDR(successInvoice.change)}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors"
              >
                <Printer className="h-4 w-4" />
                Cetak Struk
              </button>
              <button
                onClick={() => setSuccessInvoice(null)}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Transaksi Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== INVOICE DETAILS DRAWER / MODAL ==================== */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-bold text-white mb-1">Rincian Invoice</h2>
            <p className="text-xs text-indigo-400 font-mono">{selectedInvoice.nomor_invoice}</p>

            <div className="mt-6 space-y-4">
              {/* Header stats */}
              <div className="grid grid-cols-2 gap-4 bg-slate-950/40 p-4 border border-slate-850 rounded-2xl text-xs">
                <div>
                  <span className="text-slate-450 font-semibold block">Tanggal Transaksi</span>
                  <span className="font-bold text-white mt-1 block">
                    {new Date(selectedInvoice.created_at).toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-450 font-semibold block">Operator Kasir</span>
                  <span className="font-bold text-white mt-1 block">
                    {selectedInvoice.profiles?.full_name || 'Kasir'}
                  </span>
                </div>
              </div>

              {/* Items detail */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-450 block uppercase tracking-wider mb-2">Item Terjual</span>
                {loadingDetails ? (
                  <div className="py-6 text-center text-xs text-slate-500">Memuat rincian item...</div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {invoiceDetails.map(item => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950/20 border border-slate-850 text-xs text-slate-300"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-white truncate">{item.produk?.nama || 'Produk Dihapus'}</p>
                          <p className="text-[10px] text-slate-450 mt-0.5">
                            {formatIDR(Number(item.harga_satuan))} x{item.jumlah}
                          </p>
                        </div>
                        <span className="font-bold text-white ml-2">{formatIDR(Number(item.subtotal))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Total final */}
              <div className="pt-4 border-t border-slate-850 flex items-center justify-between">
                <span className="text-sm text-slate-400 font-bold">Total Belanja:</span>
                <span className="text-lg font-black text-indigo-400">{formatIDR(Number(selectedInvoice.total_harga))}</span>
              </div>

              {/* Close Button */}
              <div className="flex items-center justify-end pt-4 border-t border-slate-850">
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="px-5 py-2 bg-slate-950/40 border border-slate-800 text-slate-450 hover:text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Tutup Rincian
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
