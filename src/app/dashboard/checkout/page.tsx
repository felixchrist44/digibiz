'use client';

import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  AlertCircle,
  Wifi,
  Loader2,
  RefreshCw,
  Info
} from 'lucide-react';

// Product Catalog Schema matching database
interface CartItem {
  id: string;
  name: string;
  price: number;
  sku: string;
  quantity: number;
}

// Mock Product Dataset for quick prototyping
const MOCK_PRODUCTS = [
  { id: 'mock-1', nama: 'Indomie Goreng Spesial', harga: 3500, kode_produk: '8991234567890' },
  { id: 'mock-2', nama: 'Teh Botol Sosro 350ml', harga: 5000, kode_produk: '8992761001111' },
  { id: 'mock-3', nama: 'Kopi Kapal Api Mix 10s', harga: 16500, kode_produk: '8993005123456' },
  { id: 'mock-4', nama: 'Chitato Sapi Panggang 68g', harga: 12500, kode_produk: '8999999002233' },
  { id: 'mock-5', nama: 'Aqua Air Mineral 600ml', harga: 4000, kode_produk: '8991002003004' },
  { id: 'mock-6', nama: 'Pringles Original 107g', harga: 24500, kode_produk: '8991002005006' }
];

const emptySubscribe = () => () => { };
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function CheckoutPage() {
  // Supabase client instance created once at the component level
  const supabase = useMemo(() => createClient(), []);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot
  );
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Fetch tenantId on mount (reads JWT session first, fallback to profiles)
  useEffect(() => {
    if (!mounted) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const jwtTenantId = session?.user?.app_metadata?.tenant_id;
      if (jwtTenantId) {
        setTenantId(jwtTenantId);
      } else {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            supabase
              .from('profiles')
              .select('tenant_id')
              .eq('id', user.id)
              .single()
              .then(({ data }) => {
                if (data?.tenant_id) setTenantId(data.tenant_id);
              });
          }
        });
      }
    });
  }, [mounted, supabase]);

  // Track latest cartItems in a ref to avoid asynchronous race conditions in state check
  const cartItemsRef = useRef<CartItem[]>([]);
  useEffect(() => {
    cartItemsRef.current = cartItems;
  }, [cartItems]);

  // Client-Side Request Cache
  const productCacheRef = useRef<Record<string, { id: string; name: string; price: number; sku: string }>>({});

  // Cooldown dictionary to prevent rapid hardware double trigger scan signals (ghost scans)
  const lastScanTimeRef = useRef<Record<string, number>>({});

  // Keyboard Buffer references for hardware scanner emulation
  const keyBufferRef = useRef<{ char: string; time: number }[]>([]);

  // Format currency into Rupiah (IDR)
  const formatIDR = (value: number) => {
    return value.toLocaleString('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    });
  };

  // Asynchronous database and catalog query lookup matching parsed barcodes
  const handleIncomingBarcode = async (sku: string) => {
    const trimmedSku = sku.trim();
    if (!trimmedSku) return;

    // Cooldown/Debouncing check (ignore identical barcodes scanned within 500ms)
    const now = Date.now();
    const lastScan = lastScanTimeRef.current[trimmedSku.toLowerCase()] || 0;
    if (now - lastScan < 500) {
      console.log(`Duplicate scan ignored (cooldown): ${trimmedSku}`);
      return;
    }
    lastScanTimeRef.current[trimmedSku.toLowerCase()] = now;

    setErrorMsg(null);
    setInfoMsg(null);

    // 1. Check if item already exists in local cartItems state (Bug 1 Fix using latest Ref check)
    const existingIndex = cartItemsRef.current.findIndex(
      (item) => item.sku.toLowerCase() === trimmedSku.toLowerCase()
    );
    if (existingIndex > -1) {
      const existingItemName = cartItemsRef.current[existingIndex].name;
      setCartItems((prevItems) => {
        const updated = [...prevItems];
        const idx = updated.findIndex((item) => item.sku.toLowerCase() === trimmedSku.toLowerCase());
        if (idx > -1) {
          updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
        }
        return updated;
      });
      setInfoMsg(`Jumlah barang "${existingItemName}" ditambahkan.`);
      return;
    }

    // 2. Check local request cache first (instantly resolves at 0ms latency)
    const cachedItem = productCacheRef.current[trimmedSku.toLowerCase()];
    if (cachedItem) {
      setCartItems((prev) => [
        ...prev,
        {
          id: cachedItem.id,
          name: cachedItem.name,
          price: cachedItem.price,
          sku: cachedItem.sku,
          quantity: 1
        }
      ]);
      setInfoMsg(`Barang baru terbaca (Cache): ${cachedItem.name}`);
      return;
    }

    // 3. Lookup Mock catalog
    const matchedMock = MOCK_PRODUCTS.find((p) => p.kode_produk.toLowerCase() === trimmedSku.toLowerCase());
    if (matchedMock) {
      const itemInfo = {
        id: matchedMock.id,
        name: matchedMock.nama,
        price: matchedMock.harga,
        sku: matchedMock.kode_produk
      };
      // Cache the mock product
      productCacheRef.current[trimmedSku.toLowerCase()] = itemInfo;
      setCartItems((prev) => [
        ...prev,
        {
          ...itemInfo,
          quantity: 1
        }
      ]);
      setInfoMsg(`Barang baru terbaca (Mock): ${matchedMock.nama}`);
      return;
    }

    // 4. Query remote database (produk & products fallback) (Bug 2 Fix: Sequential fallback lookup)
    setIsSearching(true);
    try {
      const { data: dbData, error: produkError } = await supabase
        .from('produk')
        .select('*')
        .eq('kode_produk', trimmedSku)
        .maybeSingle();

      if (produkError) {
        console.error('Error fetching from produk table:', produkError);
      }

      let altData = null;
      if (!dbData) {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('sku', trimmedSku)
          .maybeSingle();
        if (productsError) {
          console.error('Error fetching from products table:', productsError);
        }
        altData = productsData;
      }

      if (dbData) {
        const itemInfo = {
          id: dbData.id,
          name: dbData.nama,
          price: Number(dbData.harga),
          sku: dbData.kode_produk
        };
        // Save to cache
        productCacheRef.current[trimmedSku.toLowerCase()] = itemInfo;
        setCartItems((prev) => [
          ...prev,
          {
            ...itemInfo,
            quantity: 1
          }
        ]);
        setInfoMsg(`Barang baru terbaca (Katalog): ${dbData.nama}`);
      } else if (altData) {
        const itemInfo = {
          id: altData.id,
          name: altData.name || altData.nama,
          price: Number(altData.price || altData.harga),
          sku: altData.sku
        };
        // Save to cache
        productCacheRef.current[trimmedSku.toLowerCase()] = itemInfo;
        setCartItems((prev) => [
          ...prev,
          {
            ...itemInfo,
            quantity: 1
          }
        ]);
        setInfoMsg(`Barang baru terbaca (Products DB): ${altData.name}`);
      } else {
        setErrorMsg(`SKU Barcode #${trimmedSku} tidak ditemukan di catalog produk.`);
      }
    } catch {
      setErrorMsg('Kesalahan jaringan saat melakukan lookup barcode di server database.');
    } finally {
      setIsSearching(false);
    }
  };

  // Setup ref to keep callback updated without re-subscribing WebSocket channel
  const handleIncomingBarcodeRef = useRef(handleIncomingBarcode);
  useEffect(() => {
    handleIncomingBarcodeRef.current = handleIncomingBarcode;
  });

  // Global hardware/USB barcode scanner event listener with timing checks
  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable
      );

      // Barcode scanners usually end character input stream with 'Enter' key
      if (e.key === 'Enter') {
        const now = performance.now();
        const buffer = keyBufferRef.current;

        if (buffer.length > 0) {
          // Check inter-character timings (<35ms) to verify it is scanner hardware
          let isScanner = true;
          for (let i = 1; i < buffer.length; i++) {
            if (buffer[i].time - buffer[i - 1].time > 35) {
              isScanner = false;
              break;
            }
          }

          // Ensure Enter also arrived within 35ms of last character
          if (now - buffer[buffer.length - 1].time > 35) {
            isScanner = false;
          }

          // Process barcode SKU if verified as rapid scanner hardware
          if (isScanner && buffer.length >= 3) {
            e.preventDefault();
            const sku = buffer.map(b => b.char).join('');

            // Wipe focused input fields to prevent input clogging
            if (isInputFocused && activeEl) {
              (activeEl as HTMLInputElement).value = '';
              (activeEl as HTMLInputElement).blur();
            }

            handleIncomingBarcodeRef.current(sku);
          }
        }
        keyBufferRef.current = [];
      } else if (e.key.length === 1) {
        const now = performance.now();

        // If there is an idle delay > 35ms since last key, reset buffer (it is manual typing)
        if (keyBufferRef.current.length > 0) {
          const lastTime = keyBufferRef.current[keyBufferRef.current.length - 1].time;
          if (now - lastTime > 35) {
            keyBufferRef.current = [];
          }
        }
        keyBufferRef.current.push({ char: e.key, time: now });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mounted]);

  // Realtime subscription retired: scans retargeted to Transaksi Penjualan (PenjualanClient.tsx)

  // Read URL query scan parameter on mount (redirect fallback support) (Bug 4 Fix)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const scanSku = params.get('scan');
      if (scanSku) {
        handleIncomingBarcodeRef.current(scanSku);
        // Clear params to prevent scan replication on reload
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, []);

  // Floating-point math safe financial calculator with useMemo
  const { subtotal, ppn, grandTotal } = useMemo(() => {
    const calculatedSubtotal = cartItems.reduce(
      (sum, item) => sum + Math.round(item.price) * item.quantity,
      0
    );
    const calculatedPpn = Math.round(calculatedSubtotal * 0.11);
    const calculatedGrandTotal = calculatedSubtotal + calculatedPpn;

    return {
      subtotal: calculatedSubtotal,
      ppn: calculatedPpn,
      grandTotal: calculatedGrandTotal
    };
  }, [cartItems]);

  // Adjust item quantity manually
  const updateQty = (sku: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.sku === sku) {
            const nextQty = item.quantity + delta;
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  // Delete item row from checkout list
  const deleteItem = (sku: string) => {
    setCartItems((prev) => prev.filter((item) => item.sku !== sku));
  };

  // Cancel all records
  const cancelAllOrders = () => {
    setCartItems([]);
    setErrorMsg(null);
    setInfoMsg(null);
    productCacheRef.current = {}; // clear local product details cache
    lastScanTimeRef.current = {}; // reset scan timing history
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mr-2" />
        <span>Memuat antarmuka checkout kasir...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 bg-slate-900 min-h-screen text-white p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl">

      {/* LEFT / CENTER PANELS: Ledger table (2 columns wide) */}
      <div className="lg:col-span-2 space-y-6">

        {/* Table Title and Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5 gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-indigo-400" />
              Keranjang Belanja
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Data sinkron otomatis dengan alat scanner laser maupun pemindai kamera smartphone.
            </p>
          </div>

          {/* WebSocket state tag */}
          <div className="flex items-center gap-2">
            {tenantId === null ? (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 bg-amber-950/40 border-amber-900/50 text-amber-400 animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Memuat sesi...
              </span>
            ) : (
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${socketStatus === 'connected'
                  ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400'
                  : 'bg-red-950/40 border-red-900/50 text-red-400'
                }`}>
                <Wifi className="h-3.5 w-3.5" />
                {socketStatus === 'connected' ? 'Soket Online' : 'Soket Offline'}
              </span>
            )}

            {isSearching && (
              <span className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Checking DB...
              </span>
            )}
          </div>
        </div>

        {/* Message notification banners */}
        {errorMsg && (
          <div className="p-3.5 bg-red-950/30 border border-red-900/40 rounded-xl text-xs text-red-400 flex items-center gap-2 animate-bounce">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}
        {infoMsg && (
          <div className="p-3.5 bg-indigo-950/30 border border-indigo-900/40 rounded-xl text-xs text-indigo-400 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0 text-indigo-400" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Cart items list table */}
        <div className="bg-slate-950/30 border border-slate-800/80 rounded-2xl overflow-hidden shadow-inner min-h-[350px] flex flex-col">
          {cartItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <ShoppingCart className="h-12 w-12 text-slate-800 mb-3 animate-pulse" />
              <p className="text-xs italic font-semibold text-slate-400">
                Waiting for a mobile barcode scan event...
              </p>
              <p className="text-[10px] text-slate-650 mt-1 max-w-xs leading-relaxed">
                Tembak barcode produk menggunakan scanner laser USB atau buka menu &quot;Pemindai Mobile&quot; di HP Anda untuk mensinkronisasi item.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-850 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/50">
                    <th className="py-4 px-5">Nama Barang</th>
                    <th className="py-4 px-5">SKU / Kode</th>
                    <th className="py-4 px-5 text-center">Jumlah</th>
                    <th className="py-4 px-5 text-right">Subtotal</th>
                    <th className="py-4 px-5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
                  {cartItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/10 transition-colors">
                      <td className="py-4 px-5 font-bold text-white">{item.name}</td>
                      <td className="py-4 px-5 font-mono text-[10px] text-slate-400">{item.sku}</td>

                      {/* Quantity adjusting buttons */}
                      <td className="py-4 px-5">
                        <div className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1 w-24 mx-auto">
                          <button
                            onClick={() => updateQty(item.sku, -1)}
                            className="p-0.5 rounded text-slate-400 hover:text-white"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="font-bold text-white text-xs min-w-[16px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQty(item.sku, 1)}
                            className="p-0.5 rounded text-slate-400 hover:text-white"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>

                      <td className="py-4 px-5 text-right font-black text-indigo-400">
                        {formatIDR(item.price * item.quantity)}
                      </td>

                      <td className="py-4 px-5 text-center">
                        <button
                          onClick={() => deleteItem(item.sku)}
                          className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR PANEL: Summary layout (1 column wide) */}
      <div className="space-y-6">

        {/* locked summary card component */}
        <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
          <h2 className="text-sm font-black text-slate-450 uppercase tracking-widest pb-3 border-b border-slate-850">
            Rincian Pembayaran
          </h2>

          <div className="space-y-4 text-xs font-semibold text-slate-400">

            {/* Subtotal */}
            <div className="flex justify-between items-center">
              <span>Subtotal</span>
              <span className="text-white font-bold">{formatIDR(subtotal)}</span>
            </div>

            {/* PPN (11%) */}
            <div className="flex justify-between items-center border-b border-slate-850/50 pb-4">
              <span>PPN (11%)</span>
              <span className="text-white font-bold">{formatIDR(ppn)}</span>
            </div>

            {/* High-visibility green Total Akhir */}
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] text-emerald-500 uppercase tracking-wider font-extrabold">Total Akhir</span>
              <span className="text-2xl font-black text-emerald-400">
                {formatIDR(grandTotal)}
              </span>
            </div>

          </div>

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={cancelAllOrders}
              disabled={cartItems.length === 0}
              className="w-full py-3 px-4 border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-xs font-extrabold transition-all"
            >
              Cancel All Orders
            </button>
          </div>
        </div>

        {/* Analytical guide metadata info box */}
        <div className="p-4 bg-slate-950/20 border border-slate-850 rounded-2xl flex gap-3 text-slate-450 text-[10px] leading-relaxed">
          <Info className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-350 block mb-0.5">Sistem Kasir Sinkronisasi</span>
            Aplikasi ini terhubung langsung ke WebSocket. Setiap scan barcode yang terbaca dari smartphone karyawan akan langsung memicu penambahan item di tabel sebelah kiri.
          </div>
        </div>

      </div>

    </div>
  );
}
