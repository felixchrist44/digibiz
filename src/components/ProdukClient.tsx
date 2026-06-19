'use client';

import React, { useState, useTransition, useEffect, useRef } from 'react';
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
  Upload,
  ShoppingCart,
  Wifi,
  Minus,
  Loader2,
  Clock,
  Check
} from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Produk, Profile } from '@/types/database';
import BarcodeGenerator from '@/components/BarcodeGenerator';

interface CartItem {
  id: string;
  name: string;
  price: number;
  sku: string;
  quantity: number;
}

interface ScannedBarcode {
  barcode: string;
  timestamp: string;
  matched: boolean;
  matchedName?: string;
}

interface Props {
  initialProducts: Produk[];
  profile: Profile;
  hasMore: boolean;
  currentPage: number;
}

export default function ProdukClient({
  initialProducts,
  profile,
  hasMore,
  currentPage
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [filter, setFilter] = useState<'all' | 'out' | 'low' | 'available'>(
    (searchParams.get('filter') as 'all' | 'out' | 'low' | 'available') || 'all'
  );
  const [isPending, startTransition] = useTransition();

  // Sync search/filter inputs when URL changes (e.g., from browser back button) using render-phase updates to avoid React 19 useEffect warnings
  const currentSearch = searchParams.get('search') || '';
  const currentFilter = (searchParams.get('filter') as 'all' | 'out' | 'low' | 'available') || 'all';

  const [prevSearch, setPrevSearch] = useState(currentSearch);
  const [prevFilter, setPrevFilter] = useState(currentFilter);

  if (currentSearch !== prevSearch) {
    setPrevSearch(currentSearch);
    setSearchInput(currentSearch);
  }
  if (currentFilter !== prevFilter) {
    setPrevFilter(currentFilter);
    setFilter(currentFilter);
  }

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const trimmedSearch = searchInput.trim();
    if (trimmedSearch) {
      params.set('search', trimmedSearch);
    } else {
      params.delete('search');
    }
    params.set('page', '1'); // Reset to page 1 on new search
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

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

  // POS State Variables
  const [posModeActive, setPosModeActive] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scannedList, setScannedList] = useState<ScannedBarcode[]>([]);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [posSuccessMsg, setPosSuccessMsg] = useState<string | null>(null);
  const [includeTax, setIncludeTax] = useState(true);

  // Web Audio synth beep
  const playBeep = () => {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (err) {
      console.error('Audio beep failed:', err);
    }
  };

  const handleIncomingBarcodeRef = useRef<((sku: string) => Promise<void>) | null>(null);

  const handleIncomingBarcode = async (sku: string) => {
    const trimmedSku = sku.trim();
    if (!trimmedSku) return;

    playBeep();
    const timestamp = new Date().toLocaleTimeString('id-ID');

    // 1. Local Lookup
    const matchedLocal = initialProducts.find(p => p.kode_produk.toLowerCase() === trimmedSku.toLowerCase());

    if (matchedLocal) {
      const itemInfo = {
        id: matchedLocal.id,
        name: matchedLocal.nama,
        price: Number(matchedLocal.harga),
        sku: matchedLocal.kode_produk
      };

      setCart(prevCart => {
        const idx = prevCart.findIndex(c => c.sku.toLowerCase() === itemInfo.sku.toLowerCase());
        if (idx > -1) {
          const updated = [...prevCart];
          updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
          return updated;
        } else {
          return [...prevCart, { ...itemInfo, quantity: 1 }];
        }
      });

      setScannedList(prev => [
        { barcode: trimmedSku, timestamp, matched: true, matchedName: itemInfo.name },
        ...prev
      ]);
    } else {
      // 2. Database Lookup
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('produk')
          .select('*')
          .eq('kode_produk', trimmedSku)
          .single();

        if (!error && data) {
          const itemInfo = {
            id: data.id,
            name: data.nama,
            price: Number(data.harga),
            sku: data.kode_produk
          };

          setCart(prevCart => {
            const idx = prevCart.findIndex(c => c.sku.toLowerCase() === itemInfo.sku.toLowerCase());
            if (idx > -1) {
              const updated = [...prevCart];
              updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
              return updated;
            } else {
              return [...prevCart, { ...itemInfo, quantity: 1 }];
            }
          });

          setScannedList(prev => [
            { barcode: trimmedSku, timestamp, matched: true, matchedName: itemInfo.name },
            ...prev
          ]);
        } else {
          // Unmatched barcode
          setScannedList(prev => [
            { barcode: trimmedSku, timestamp, matched: false },
            ...prev
          ]);
        }
      } catch (err) {
        console.error('Remote DB barcode lookup error:', err);
        setScannedList(prev => [
          { barcode: trimmedSku, timestamp, matched: false },
          ...prev
        ]);
      }
    }
  };

  useEffect(() => {
    handleIncomingBarcodeRef.current = handleIncomingBarcode;
  });

  // Realtime Broadcast Channel Listener
  useEffect(() => {
    if (!posModeActive || !profile?.tenant_id) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const channelName = `inventory-checkout-${profile.tenant_id}`;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: false },
          private: false
        }
      });

      channel
        .on('broadcast', { event: 'barcode-scanned' }, (payload) => {
          const sku = payload.payload?.sku;
          if (sku && handleIncomingBarcodeRef.current) {
            handleIncomingBarcodeRef.current(sku);
          }
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            setSocketStatus('connected');
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`Realtime subscription error for channel ${channelName}:`, err);
            setSocketStatus('disconnected');
          } else {
            setSocketStatus('disconnected');
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [posModeActive, profile?.tenant_id]);

  // Cart operations
  const updateQty = (sku: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.sku.toLowerCase() === sku.toLowerCase()) {
            return { ...item, quantity: item.quantity + delta };
          }
          return item;
        })
        .filter(item => item.quantity > 0)
    );
  };

  const deleteItem = (sku: string) => {
    setCart(prev => prev.filter(item => item.sku.toLowerCase() !== sku.toLowerCase()));
  };

  const clearCart = () => {
    setCart([]);
    setPosSuccessMsg(null);
  };

  const checkoutCart = () => {
    if (cart.length === 0) return;
    setPosSuccessMsg('Transaksi berhasil diproses! Struk kasir tercetak.');
    setCart([]);
    setTimeout(() => {
      setPosSuccessMsg(null);
    }, 3500);
  };

  const { subtotal, ppn, grandTotal } = React.useMemo(() => {
    const sub = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = includeTax ? Math.round(sub * 0.11) : 0;
    const total = sub + tax;
    return { subtotal: sub, ppn: tax, grandTotal: total };
  }, [cart, includeTax]);

  // Search & Filter logic is driven by server-side pagination
  const filteredProducts = initialProducts;

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
        router.refresh();
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
        router.refresh();
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
      router.refresh();
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
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {posModeActive ? 'Kasir & POS Checkout' : 'Daftar Inventaris Produk'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {posModeActive
              ? 'Pindai barcode produk melalui smartphone untuk checkout secara otomatis.'
              : 'Kelola dan pantau seluruh produk beserta harga jual barang.'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* POS Mode Switcher Button */}
          <button
            onClick={() => {
              const nextMode = !posModeActive;
              setPosModeActive(nextMode);
              if (nextMode) {
                setSocketStatus('connecting');
              } else {
                setSocketStatus('disconnected');
              }
              clearCart();
            }}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] border ${posModeActive
              ? 'bg-indigo-650 border-indigo-600 text-white shadow-lg shadow-indigo-650/25'
              : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:bg-slate-855 hover:text-white'
              }`}
          >
            <ShoppingCart className="h-4 w-4" />
            {posModeActive ? 'Kembali ke Inventaris' : 'Mode POS Kasir'}
          </button>

          {!posModeActive && isOwner && (
            <button
              onClick={() => {
                setErrorMessage(null);
                setSuccessMessage(null);
                setImagePreviewUrl(null);
                setIsAddOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-655 hover:bg-indigo-750 text-white rounded-xl text-sm font-semibold transition-all duration-150 shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Registrasi Produk Baru
            </button>
          )}
        </div>
      </div>

      {/* Role Restriction Banner for Staff */}
      {!posModeActive && !isOwner && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-555/20 rounded-2xl text-amber-400 text-xs shadow-inner">
          <Lock className="h-4 w-4 shrink-0 animate-pulse" />
          <span>
            <strong>Akses Staff Terbatas:</strong> Hanya <strong>Owner</strong> yang berhak mendaftarkan produk baru, menentukan/mengubah harga, dan menghapus produk dari database.
          </span>
        </div>
      )}

      {posModeActive ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
          {/* Left Column: Interactive Shopping Cart (2 columns wide) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col min-h-[500px]">

              {/* Cart Header */}
              <div className="flex items-center justify-between border-b border-slate-850 pb-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <ShoppingCart className="h-5 w-5 text-indigo-400 animate-pulse" />
                  <h2 className="text-lg font-bold text-white">Keranjang POS</h2>
                </div>
                <span className="text-xs text-slate-400 bg-slate-950/40 px-3 py-1 rounded-full border border-slate-850">
                  {cart.length} Item Unik
                </span>
              </div>

              {/* Status alerts */}
              {posSuccessMsg && (
                <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 flex items-center gap-2 animate-bounce">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{posSuccessMsg}</span>
                </div>
              )}

              {/* Cart List */}
              <div className="flex-1 overflow-y-auto max-h-[350px] space-y-3 pr-1">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-center text-slate-500">
                    <div className="h-14 w-14 rounded-full bg-slate-950 border border-slate-850 flex items-center justify-center mb-3 animate-pulse">
                      <ShoppingCart className="h-6 w-6 text-slate-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-400">Keranjang Kasir Kosong</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-[280px]">
                      Arahkan kamera HP ke barcode barang pada halaman Pemindai Mobile untuk menambahkan item secara otomatis.
                    </p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 p-3 bg-slate-950/40 border border-slate-855 hover:border-slate-800 rounded-2xl transition-all animate-in slide-in-from-top-2 duration-250"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                        <p className="text-[10px] font-mono text-slate-450 mt-0.5">{item.sku}</p>
                      </div>

                      {/* Quantity Modifier */}
                      <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
                        <button
                          onClick={() => updateQty(item.sku, -1)}
                          className="p-1 rounded bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-white transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-bold text-white min-w-[20px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(item.sku, 1)}
                          className="p-1 rounded bg-slate-950 hover:bg-slate-855 text-slate-455 hover:text-white transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Item Subtotal */}
                      <div className="text-right shrink-0 min-w-[80px]">
                        <p className="text-xs font-black text-indigo-400">{formatIDR(item.price * item.quantity)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{formatIDR(item.price)} / pcs</p>
                      </div>

                      {/* Remove Button */}
                      <button
                        onClick={() => deleteItem(item.sku)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Checkout Calculation Card */}
              {cart.length > 0 && (
                <div className="mt-6 border-t border-slate-850 pt-4 space-y-4">
                  <div className="space-y-2 text-xs font-semibold text-slate-455">
                    <div className="flex justify-between items-center">
                      <span>Subtotal</span>
                      <span className="text-slate-200">{formatIDR(subtotal)}</span>
                    </div>

                    <div className="flex justify-between items-center border-t border-dashed border-slate-850/50 pt-2">
                      <div className="flex items-center gap-2">
                        <span>PPN (11%)</span>
                        <button
                          type="button"
                          onClick={() => setIncludeTax(!includeTax)}
                          className={`text-[9px] px-2 py-0.5 rounded-full border transition-all cursor-pointer ${includeTax
                            ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 font-bold'
                            : 'bg-slate-950/40 border-slate-800 text-slate-500 font-normal'
                            }`}
                        >
                          {includeTax ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </div>
                      <span className="text-slate-200">
                        {includeTax ? formatIDR(ppn) : 'Rp 0'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-950/20 border border-emerald-900/35 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-emerald-500 uppercase tracking-widest font-extrabold block">Total Akhir</span>
                      <span className="text-xl font-black text-emerald-400 animate-pulse">{formatIDR(grandTotal)}</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={clearCart}
                        className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl text-xs font-bold transition-all active:scale-95"
                      >
                        Batal
                      </button>
                      <button
                        onClick={checkoutCart}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                      >
                        <Check className="h-4 w-4" />
                        Selesai Checkout
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Running history log of raw scanned barcodes (1 column wide) */}
          <div className="space-y-6">
            <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur rounded-3xl p-6 shadow-xl flex flex-col min-h-[500px]">

              {/* Scan Log Header */}
              <div className="flex items-center justify-between border-b border-slate-855 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Live Barcode Log</h3>
                </div>

                {/* Connection Status Badge */}
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border flex items-center gap-1.5 transition-all ${socketStatus === 'connected'
                  ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400'
                  : socketStatus === 'connecting'
                    ? 'bg-amber-950/40 border-amber-900/50 text-amber-400 animate-pulse'
                    : 'bg-red-950/40 border-red-900/50 text-red-400'
                  }`}>
                  <Wifi className="h-3 w-3" />
                  {socketStatus === 'connected' ? 'Connected' : socketStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
                </span>
              </div>

              {/* Log Description */}
              <p className="text-[10px] text-slate-450 leading-relaxed mb-4">
                Daftar barcode mentah yang tertangkap dari smartphone secara real-time. Log diurutkan dari terbaru ke terlama.
              </p>

              {/* Scanned Items History List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[380px] pr-1">
                {scannedList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-center text-slate-650">
                    <Loader2 className="h-8 w-8 text-indigo-500/35 animate-spin mb-3" />
                    <p className="text-xs italic">Menunggu sinyal HP...</p>
                  </div>
                ) : (
                  scannedList.map((log, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-2xl border transition-all animate-in slide-in-from-top-4 duration-300 ${log.matched
                        ? 'bg-slate-950/40 border-slate-850/85 hover:border-slate-800'
                        : 'bg-amber-950/10 border-amber-900/20 hover:border-amber-900/30'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-black text-white">{log.barcode}</span>
                        <span className="text-[9px] text-slate-500 font-semibold">{log.timestamp}</span>
                      </div>

                      {/* Match Status Badge */}
                      <div className="mt-2 flex items-center gap-1.5">
                        {log.matched ? (
                          <span className="px-2 py-0.5 bg-emerald-950/30 border border-emerald-900/30 text-emerald-400 rounded text-[9px] font-bold flex items-center gap-1">
                            <Check className="h-2.5 w-2.5" />
                            {log.matchedName || 'Terkatalog'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-950/30 border border-amber-900/30 text-amber-400 rounded text-[9px] font-bold flex items-center gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Barcode Belum Terkatalog
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Filters & Search Toolbar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/30 p-4 border border-slate-855 rounded-2xl backdrop-blur-md">
            {/* Search Form */}
            <form onSubmit={handleSearchSubmit} className="relative md:col-span-2 flex gap-2">
              <div className="relative flex-1">
                {isPending ? (
                  <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-450 animate-spin" />
                ) : (
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-450" />
                )}
                <input
                  type="text"
                  placeholder="Cari produk berdasarkan nama atau kode..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-755 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] flex items-center gap-1.5 shadow-md shadow-indigo-650/20 shrink-0"
              >
                Cari
              </button>
            </form>

            {/* Filter stock status */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-455 font-medium whitespace-nowrap">Filter Stok:</span>
              <select
                value={filter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const val = e.target.value as 'all' | 'out' | 'low' | 'available';
                  setFilter(val);
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('filter', val);
                  params.set('page', '1'); // Reset to page 1 on filter change
                  startTransition(() => {
                    router.push(`${pathname}?${params.toString()}`);
                  });
                }}
                className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-350 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <option value="all">Semua Produk</option>
                <option value="out">Stok Habis (0)</option>
                <option value="low">Stok Menipis (1-5)</option>
                <option value="available">Tersedia (&gt;5)</option>
              </select>
            </div>

            <div className="flex items-center justify-end text-xs text-slate-455 font-medium px-1">
              Menampilkan {initialProducts.length} produk (Halaman {currentPage})
            </div>
          </div>

          {/* Remodeled Product List: Wide, Compact Horizontal Rows */}
          {filteredProducts.length === 0 ? (
            <div className={`py-20 text-center bg-slate-900/10 border border-dashed border-slate-855 rounded-2xl flex flex-col items-center transition-all duration-200 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
              <Package className="h-12 w-12 text-slate-650 mb-3" />
              <p className="text-base font-bold text-slate-350">Tidak Ada Produk Ditemukan</p>
              <p className="text-xs text-slate-500 mt-1 max-w-[280px]">
                Coba ganti filter pencarian atau buat produk baru untuk memulai pencatatan.
              </p>
            </div>
          ) : (
            <div className={`flex flex-col gap-4 w-full transition-all duration-200 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
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
                          // eslint-disable-next-line @next/next/no-img-element
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
                            <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isOut ? 'bg-red-500/10 text-red-400 border border-red-500/10' : 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
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

          {/* Visual Pagination Footer */}
          {(() => {
            const hasPrevious = currentPage > 1;
            if (!hasPrevious && !hasMore) return null;

            return (
              <div className="flex items-center justify-between gap-4 bg-slate-900/30 p-4 border border-slate-855 rounded-2xl backdrop-blur-md mt-6">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!hasPrevious || isPending}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900/50 transition-all duration-150 active:scale-[0.98]"
                >
                  Sebelumnya
                </button>

                <span className="text-xs text-slate-400 font-bold font-sans">
                  Halaman {currentPage}
                </span>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!hasMore || isPending}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900/50 transition-all duration-150 active:scale-[0.98]"
                >
                  Selanjutnya
                </button>
              </div>
            );
          })()}
        </>
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
                      // eslint-disable-next-line @next/next/no-img-element
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
                      // eslint-disable-next-line @next/next/no-img-element
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
                      className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isOwner
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
