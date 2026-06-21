'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Produk } from '@/types/database';

export interface CartItem {
  id: string;
  nama: string;
  harga: number;
  jumlah: number;
  maxStok: number;
}

interface CartContextType {
  cart: CartItem[];
  socketStatus: 'connecting' | 'connected' | 'disconnected';
  addToCart: (product: Produk) => void;
  updateQty: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  handleIncomingBarcode: (sku: string) => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({
  tenantId,
  children
}: {
  tenantId: string | null | undefined;
  children: React.ReactNode;
}) {
  const supabase = React.useMemo(() => createClient(), []);

  // Initialize cart state from sessionStorage
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = sessionStorage.getItem('pos-cart');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    tenantId ? 'connecting' : 'disconnected'
  );

  // Persist cart to sessionStorage on changes
  useEffect(() => {
    try {
      sessionStorage.setItem('pos-cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);

  // Add a product to the cart
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
      return [...prev, {
        id: product.id,
        nama: product.nama,
        harga: Number(product.harga),
        jumlah: 1,
        maxStok: product.stok_saat_ini
      }];
    });
  };

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

  // Remove item from cart
  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // Clear entire cart and storage
  const clearCart = () => {
    setCart([]);
    try {
      sessionStorage.removeItem('pos-cart');
    } catch {}
  };

  // Centralized barcode lookup directly querying PostgreSQL
  const handleIncomingBarcode = async (sku: string) => {
    if (!sku) return;
    const trimmedSku = sku.trim();

    try {
      const { data, error } = await supabase
        .from('produk')
        .select('id, nama, kode_produk, harga, stok_saat_ini')
        .eq('kode_produk', trimmedSku)
        .maybeSingle();

      if (error) {
        console.error('Error querying product by SKU:', error);
      } else if (data) {
        addToCart(data as Produk);
      } else {
        console.warn(`Produk dengan SKU/Kode "${trimmedSku}" tidak ditemukan.`);
      }
    } catch (err) {
      console.error('Error during product lookup:', err);
    }
  };

  // Stable ref for the lookup handler to avoid re-subscribing the Realtime listener unnecessarily
  const handleIncomingBarcodeRef = useRef(handleIncomingBarcode);
  useEffect(() => {
    handleIncomingBarcodeRef.current = handleIncomingBarcode;
  });

  // Always-on Realtime subscription for mobile scanner broadcast
  useEffect(() => {
    if (!tenantId) {
      setSocketStatus('disconnected');
      return;
    }

    setSocketStatus('connecting');
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase.channel(`inventory-checkout-${tenantId}`, {
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
          if (cancelled) return;
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
  }, [tenantId, supabase]);

  return (
    <CartContext.Provider
      value={{
        cart,
        socketStatus,
        addToCart,
        updateQty,
        removeFromCart,
        clearCart,
        handleIncomingBarcode
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
