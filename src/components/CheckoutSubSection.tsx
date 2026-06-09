'use client';

import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { checkoutPenjualan } from '@/app/dashboard/penjualan/actions';
import {
  Barcode,
  Trash2,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Calculator,
  CreditCard,
  ArrowLeft,
  Printer,
  Search,
  Package,
  Layers,
  HelpCircle
} from 'lucide-react';
import { Produk } from '@/types/database';

// Mock Product Dataset for prototyping scanner
const MOCK_PRODUCTS: Produk[] = [
  {
    id: 'mock-p1',
    kode_produk: '8991234567890',
    nama: 'Indomie Goreng Spesial',
    deskripsi: 'Mie instan goreng rasa spesial premium',
    harga: 3500,
    stok_saat_ini: 50,
    gambar_url: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'mock-p2',
    kode_produk: '8992761001111',
    nama: 'Teh Botol Sosro 350ml',
    deskripsi: 'Teh melati manis dalam kemasan botol plastik',
    harga: 5000,
    stok_saat_ini: 24,
    gambar_url: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'mock-p3',
    kode_produk: '8993005123456',
    nama: 'Kopi Kapal Api Mix 10s',
    deskripsi: 'Kopi bubuk instan plus gula isi 10 sachet',
    harga: 16500,
    stok_saat_ini: 15,
    gambar_url: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'mock-p4',
    kode_produk: '8999999002233',
    nama: 'Chitato Sapi Panggang 68g',
    deskripsi: 'Keripik kentang gelombang rasa sapi panggang',
    harga: 12500,
    stok_saat_ini: 8,
    gambar_url: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'mock-p5',
    kode_produk: '8991002003004',
    nama: 'Aqua Air Mineral 600ml',
    deskripsi: 'Air minum dalam kemasan botol higienis',
    harga: 4000,
    stok_saat_ini: 100,
    gambar_url: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'mock-p6',
    kode_produk: '8991002005006',
    nama: 'Pringles Original 107g',
    deskripsi: 'Keripik kentang tabung rasa original gurih',
    harga: 24500,
    stok_saat_ini: 12,
    gambar_url: null,
    created_at: new Date().toISOString()
  }
];

interface ScannedItem {
  item: Produk;
  quantity: number;
}

export default function CheckoutSubSection() {
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [manualSku, setManualSku] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Receipt Modal State
  const [receipt, setReceipt] = useState<{
    nomor_invoice: string;
    total_harga: number;
    subtotal: number;
    tax: number;
    items: { id: string; nama: string; harga: number; jumlah: number }[];
    isMock: boolean;
  } | null>(null);

  // Keyboard Buffer references
  const keyBufferRef = useRef<{ char: string; time: number }[]>([]);
  const lastScannedSkuRef = useRef<string | null>(null);

  // Sound feedback simulation (Flash visual effect flag)
  const [flashOnScan, setFlashOnScan] = useState(false);

  // Format IDR Rupiah
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Main Item Handler called when a barcode is scanned successfully
  const handleItemScanned = async (sku: string) => {
    const trimmedSku = sku.trim();
    if (!trimmedSku) return;

    setErrorMsg(null);
    setInfoMsg(null);

    // Visual feedback trigger
    setFlashOnScan(true);
    setTimeout(() => setFlashOnScan(false), 250);

    // 1. Search in Mock Database first
    const mockProduct = MOCK_PRODUCTS.find(
      p => p.kode_produk.toLowerCase() === trimmedSku.toLowerCase()
    );

    if (mockProduct) {
      addItemToCart(mockProduct);
      setInfoMsg(`Terpindai (Mock): ${mockProduct.nama}`);
      lastScannedSkuRef.current = trimmedSku;
      return;
    }

    // 2. Fallback to Supabase Database
    setSearching(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('produk')
        .select('*')
        .eq('kode_produk', trimmedSku)
        .single();

      if (error || !data) {
        setErrorMsg(`Produk SKU #${trimmedSku} tidak ditemukan di katalog lokal maupun server.`);
      } else {
        const dbProduct = data as Produk;
        if (dbProduct.stok_saat_ini <= 0) {
          setErrorMsg(`Produk "${dbProduct.nama}" ditemukan tetapi stok habis.`);
        } else {
          addItemToCart(dbProduct);
          setInfoMsg(`Terpindai (Database): ${dbProduct.nama}`);
          lastScannedSkuRef.current = trimmedSku;
        }
      }
    } catch (err) {
      setErrorMsg('Koneksi terganggu saat mencari barcode di server.');
    } finally {
      setSearching(false);
    }
  };

  // Helper to add/update item logic in cart state
  const addItemToCart = (product: Produk) => {
    setScannedItems(prev => {
      const existingIdx = prev.findIndex(i => i.item.id === product.id);
      if (existingIdx > -1) {
        // Increment quantity automatically
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + 1;
        
        // Stock cap check
        if (newQty > product.stok_saat_ini) {
          setErrorMsg(`Peringatan: Stok maksimal untuk "${product.nama}" tercapai (${product.stok_saat_ini} Pcs).`);
          return prev;
        }

        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty
        };
        return updated;
      } else {
        return [...prev, { item: product, quantity: 1 }];
      }
    });
  };

  // Keyboard Scanner listener hook with 30ms filter
  const handleItemScannedRef = useRef(handleItemScanned);
  useEffect(() => {
    handleItemScannedRef.current = handleItemScanned;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable
      );

      if (e.key === 'Enter') {
        const now = performance.now();
        const buffer = keyBufferRef.current;
        
        if (buffer.length > 0) {
          // Check inter-character timings (<30ms)
          let isScanner = true;
          for (let i = 1; i < buffer.length; i++) {
            if (buffer[i].time - buffer[i - 1].time > 30) {
              isScanner = false;
              break;
            }
          }

          // Ensure Enter also arrived within 30ms of last char
          if (now - buffer[buffer.length - 1].time > 30) {
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

            handleItemScannedRef.current(sku);
          }
        }
        keyBufferRef.current = [];
      } else if (e.key.length === 1) {
        const now = performance.now();
        
        // If there is an idle delay > 30ms since the last key, reset buffer
        if (keyBufferRef.current.length > 0) {
          const lastTime = keyBufferRef.current[keyBufferRef.current.length - 1].time;
          if (now - lastTime > 30) {
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
  }, []);

  // Check for automatic scan URL queries on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const scanSku = params.get('scan');
      if (scanSku) {
        handleItemScanned(scanSku);
        // Clear parameter from URL to prevent duplicated scan on page refreshes
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, []);

  // Logical handlers
  const updateQty = (id: string, delta: number) => {
    setScannedItems(prev =>
      prev
        .map(si => {
          if (si.item.id === id) {
            const nextQty = si.quantity + delta;
            if (nextQty > si.item.stok_saat_ini) {
              setErrorMsg(`Stok tidak mencukupi untuk "${si.item.nama}". Batas maksimum: ${si.item.stok_saat_ini} Pcs.`);
              return si;
            }
            return { ...si, quantity: nextQty };
          }
          return si;
        })
        .filter(si => si.quantity > 0)
    );
  };

  const removeItem = (id: string) => {
    setScannedItems(prev => prev.filter(si => si.item.id !== id));
  };

  const cancelAllOrders = () => {
    setScannedItems([]);
    setErrorMsg(null);
    setInfoMsg(null);
    lastScannedSkuRef.current = null;
  };

  // Real-time calculations with useMemo
  const subtotal = useMemo(() => {
    return scannedItems.reduce((sum, si) => sum + si.item.harga * si.quantity, 0);
  }, [scannedItems]);

  const tax = useMemo(() => {
    return Math.round(subtotal * 0.11);
  }, [subtotal]);

  const grandTotal = useMemo(() => {
    return subtotal + tax;
  }, [subtotal, tax]);

  // Finalize checkout handler
  const finalizeTransaction = () => {
    if (scannedItems.length === 0) return;
    setErrorMsg(null);

    // Identify if transaction contains prototype mock products
    const hasMock = scannedItems.some(si => si.item.id.startsWith('mock-'));

    if (hasMock) {
      // Simulation mode
      startTransition(async () => {
        await new Promise(resolve => setTimeout(resolve, 800)); // simulate latency
        setReceipt({
          nomor_invoice: `INV-MOCK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
          total_harga: grandTotal,
          subtotal,
          tax,
          items: scannedItems.map(si => ({
            id: si.item.id,
            nama: si.item.nama,
            harga: si.item.harga,
            jumlah: si.quantity
          })),
          isMock: true
        });
        setScannedItems([]);
        setInfoMsg('Transaksi simulasi berhasil diselesaikan.');
      });
    } else {
      // Real database execution
      startTransition(async () => {
        const cartData = scannedItems.map(si => ({
          id: si.item.id,
          nama: si.item.nama,
          harga: Number(si.item.harga),
          jumlah: si.quantity
        }));

        const res = await checkoutPenjualan(cartData);
        if (res?.error) {
          setErrorMsg(res.error);
        } else if (res?.success) {
          setReceipt({
            nomor_invoice: res.nomor_invoice!,
            total_harga: Number(res.total_harga!),
            subtotal,
            tax,
            items: scannedItems.map(si => ({
              id: si.item.id,
              nama: si.item.nama,
              harga: si.item.harga,
              jumlah: si.quantity
            })),
            isMock: false
          });
          setScannedItems([]);
          setInfoMsg('Transaksi berhasil disimpan ke database.');
        }
      });
    }
  };

  return (
    <div className={`space-y-6 ${flashOnScan ? 'ring-2 ring-indigo-500 rounded-3xl duration-100 transition-all' : ''}`}>
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <Barcode className="h-7 w-7 text-indigo-400 animate-pulse" />
            Checkout Kasir Barcode
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tekan barcode produk menggunakan alat pemindai laser USB/Bluetooth kapan saja secara instan.
          </p>
        </div>

        {/* Live scanner status indicator */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-indigo-950/40 border border-indigo-900/40 rounded-full flex items-center gap-2 text-[10px] font-bold text-indigo-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            PEMINDAI AKTIF (SIAP SCAN)
          </div>

          {/* Quick Manual input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Cari SKU manual..."
              value={manualSku}
              onChange={(e) => setManualSku(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleItemScanned(manualSku);
                  setManualSku('');
                }
              }}
              className="pl-3 pr-8 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 font-bold"
            />
            <button
              onClick={() => {
                handleItemScanned(manualSku);
                setManualSku('');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <Search className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Message alerts */}
      {errorMsg && (
        <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-xl text-xs text-red-400 flex items-center gap-2 animate-bounce">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}
      {infoMsg && (
        <div className="p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{infoMsg}</span>
        </div>
      )}

      {/* Layout transition logic based on item status */}
      {scannedItems.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center p-8 bg-slate-900/20 border border-slate-850 rounded-3xl min-h-[420px] relative overflow-hidden shadow-2xl">
          {/* Glowing scanner box simulation */}
          <div className="w-64 h-36 border border-indigo-900/30 bg-slate-950/60 rounded-2xl relative flex flex-col items-center justify-center p-4 shadow-inner">
            <Barcode className="h-16 w-16 text-slate-800 animate-pulse" />
            {/* Moving laser scan simulation line */}
            <div className="absolute left-2 right-2 h-0.5 bg-red-500/80 shadow-[0_0_10px_#ef4444] animate-laser-move" />
            
            <div className="mt-2 text-[9px] font-mono font-bold tracking-widest text-indigo-400 animate-pulse">
              AWAITING SCAN
            </div>
          </div>

          <div className="text-center mt-6 max-w-sm space-y-2 z-10">
            <h3 className="text-sm font-bold text-slate-350">System ready. Awaiting barcode scan...</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tembakkan pemindai laser ke barcode fisik barang, atau gunakan area demo di bawah untuk menguji alur secara cepat.
            </p>
          </div>

          {/* Quick Demo Simulator Section (Click to scan mockup values) */}
          <div className="mt-8 border-t border-slate-850/80 pt-6 w-full max-w-xl text-center">
            <h4 className="text-[10px] uppercase font-bold tracking-widest text-slate-450 mb-3 flex items-center justify-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Demo Barcode SKU Simulator (Klik untuk Simulasi Pindai)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4">
              {MOCK_PRODUCTS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleItemScanned(p.kode_produk)}
                  className="p-2 bg-slate-950/40 hover:bg-indigo-950/30 border border-slate-850 hover:border-indigo-800/40 rounded-xl text-left transition-all duration-150 group"
                >
                  <div className="text-[9px] font-mono text-indigo-400 group-hover:text-indigo-300 font-bold truncate">
                    {p.kode_produk}
                  </div>
                  <div className="text-[10px] text-slate-300 font-medium truncate mt-0.5">
                    {p.nama}
                  </div>
                  <div className="text-[9px] text-slate-500 font-semibold mt-0.5">
                    {formatIDR(p.harga)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Active Two-Column Checkout View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left panel: Product List (65% width) */}
          <div className="lg:col-span-8 bg-slate-900/20 border border-slate-850 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-850">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Keranjang Checkout ({scannedItems.length} Item)
              </span>
              {searching && (
                <span className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Mencari katalog...
                </span>
              )}
            </div>

            {/* List block */}
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {scannedItems.map(({ item, quantity }, idx) => {
                const subTotalItem = item.harga * quantity;
                const isLatest = item.kode_produk === lastScannedSkuRef.current;
                
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-950/40 border transition-all ${
                      isLatest
                        ? 'border-indigo-500 bg-indigo-950/10 shadow-[0_0_15px_rgba(99,102,241,0.08)]'
                        : 'border-slate-850 hover:border-slate-800'
                    }`}
                  >
                    {/* Left details */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Fake Thumbnail */}
                      <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                        <Package className={`h-5 w-5 ${isLatest ? 'text-indigo-400' : 'text-slate-650'}`} />
                      </div>
                      
                      {/* Name & SKU */}
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate max-w-[240px] sm:max-w-[180px] md:max-w-xs">
                          {item.nama}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-mono bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-black">
                            {item.kode_produk}
                          </span>
                          {item.id.startsWith('mock-') && (
                            <span className="text-[8px] bg-slate-900 border border-slate-800 text-yellow-500 px-1 rounded uppercase font-black tracking-wider">
                              Mock
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quantity modifier and pricing */}
                    <div className="flex items-center justify-between sm:justify-end gap-6 mt-3 sm:mt-0 ml-0 sm:ml-4">
                      
                      {/* Unit Price */}
                      <div className="text-left sm:text-right">
                        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block">Harga</span>
                        <span className="text-xs font-semibold text-slate-350">{formatIDR(Number(item.harga))}</span>
                      </div>

                      {/* +/- Qty Badge buttons */}
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
                        <button
                          onClick={() => updateQty(item.id, -1)}
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-black text-white min-w-[24px] text-center">
                          {quantity}
                        </span>
                        <button
                          onClick={() => updateQty(item.id, 1)}
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Calculated subtotal for item */}
                      <div className="text-right min-w-[90px]">
                        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block">Subtotal</span>
                        <span className="text-xs font-black text-indigo-400">{formatIDR(subTotalItem)}</span>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1.5 text-slate-650 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel: Sticky calculations summary card (35% width) */}
          <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
            <div className="bg-slate-900/20 border border-slate-850 rounded-3xl p-6 shadow-xl space-y-5">
              <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider pb-3 border-b border-slate-850 flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-indigo-400" />
                Ringkasan Pembayaran
              </h3>

              {/* Price Details */}
              <div className="space-y-3 text-xs font-semibold">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal Item</span>
                  <span>{formatIDR(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Pajak PPN (11%)</span>
                  <span>{formatIDR(tax)}</span>
                </div>
                
                <div className="pt-4 border-t border-slate-850/50 flex justify-between items-center text-sm">
                  <span className="text-slate-300 font-bold">Total Pembayaran</span>
                  <span className="text-lg font-black text-white">{formatIDR(grandTotal)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <button
                  onClick={finalizeTransaction}
                  disabled={isPending || scannedItems.length === 0}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  {isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {isPending ? 'Memproses Transaksi...' : 'Finalisasi Transaksi'}
                </button>

                <button
                  onClick={cancelAllOrders}
                  className="w-full py-3 px-4 border border-red-500/25 text-red-400 hover:bg-red-500/5 hover:text-red-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  Batal Semua Pesanan
                </button>
              </div>
            </div>

            {/* Quick Helper card */}
            <div className="p-4 bg-slate-900/10 border border-slate-850 rounded-2xl flex gap-3 text-slate-450 text-[10px] leading-relaxed">
              <HelpCircle className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-350 block mb-0.5">Petunjuk Hardware Scanner</span>
                Keyboard listener aktif secara background. Cukup dekatkan scanner dan scan. Interval tombol scanner akan diisolasi otomatis untuk mencegah crash input.
              </div>
            </div>
          </div>

        </div>
      )}

      {/* SUCCESS RECEIPT MODAL */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-white text-slate-900 border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            {/* Stamp Icon */}
            <div className="text-center space-y-1 flex flex-col items-center">
              <div className="inline-flex items-center justify-center p-3 bg-emerald-100 text-emerald-600 rounded-full mb-1">
                <CheckCircle className="h-6 w-6" />
              </div>
              <h3 className="text-base font-black tracking-tight text-slate-900">TRANSAKSI SELESAI</h3>
              <p className="text-[10px] text-slate-500 font-mono tracking-wider">{receipt.nomor_invoice}</p>
              {receipt.isMock && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 border border-amber-200 text-amber-800 rounded text-[9px] font-bold uppercase tracking-wider">
                  Simulasi (Mock Item)
                </span>
              )}
            </div>

            {/* Invoiced items list */}
            <div className="border-t border-b border-dashed border-slate-300 py-3 space-y-2 text-xs">
              {receipt.items.map((item) => (
                <div key={item.id} className="flex justify-between font-mono">
                  <span className="truncate max-w-[200px] text-slate-700">{item.nama} x{item.jumlah}</span>
                  <span className="font-semibold text-slate-900">{formatIDR(item.harga * item.jumlah)}</span>
                </div>
              ))}
            </div>

            {/* Calculations breakdown */}
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{formatIDR(receipt.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Pajak (11%):</span>
                <span>{formatIDR(receipt.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-200 pt-1.5 mt-1">
                <span>TOTAL TRANSAKSI:</span>
                <span>{formatIDR(receipt.total_harga)}</span>
              </div>
            </div>

            {/* Warning if mock notice */}
            {receipt.isMock && (
              <p className="text-[9px] text-amber-700 bg-amber-50/50 p-2.5 rounded-lg border border-amber-100 leading-relaxed font-semibold">
                * Note: Transaksi menggunakan produk prototype (Mock). Pembelian ini disimulasikan dan tidak mengurangi stok database server asli.
              </p>
            )}

            {/* Footers buttons */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors"
              >
                <Printer className="h-4 w-4" />
                Cetak Receipt
              </button>
              <button
                onClick={() => setReceipt(null)}
                className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-colors shadow-md shadow-indigo-600/10"
              >
                Transaksi Baru
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
