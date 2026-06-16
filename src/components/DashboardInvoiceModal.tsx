'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { X, Loader2, Info } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

interface DetailItem {
  id: string;
  jumlah: number;
  harga_satuan: number;
  subtotal: number;
  produk: {
    nama: string;
    kode_produk: string;
    harga_modal: number;
  } | {
    nama: string;
    kode_produk: string;
    harga_modal: number;
  }[] | null;
}

interface InvoiceData {
  id: string;
  nomor_invoice: string;
  total_harga: number;
  created_at: string;
  profiles: {
    full_name: string | null;
  }[] | {
    full_name: string | null;
  } | null;
  detail_penjualan: DetailItem[] | null;
}

const formatIDR = (value: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('id-ID');
};

export default function DashboardInvoiceModal() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const invoiceNumber = searchParams.get('invoice');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync state values when url query changes directly in render to avoid React 19 useEffect warnings
  const [prevInvoiceNumber, setPrevInvoiceNumber] = useState(invoiceNumber);
  if (invoiceNumber !== prevInvoiceNumber) {
    setPrevInvoiceNumber(invoiceNumber);
    setSelectedInvoice(null);
  }

  useEffect(() => {
    if (!invoiceNumber) return;

    let active = true;

    const fetchInvoiceDetails = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('penjualan')
          .select(`
            id,
            nomor_invoice,
            total_harga,
            created_at,
            profiles(full_name),
            detail_penjualan(
              id,
              jumlah,
              harga_satuan,
              subtotal,
              produk(nama, kode_produk, harga_modal)
            )
          `)
          .eq('nomor_invoice', invoiceNumber)
          .maybeSingle();

        if (!active) return;

        if (!error && data) {
          setSelectedInvoice(data as InvoiceData);
        } else if (error) {
          console.error('Error fetching invoice details:', error.message);
        }
      } catch (err) {
        if (active) {
          console.error('Failed to execute invoice details fetch:', err);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchInvoiceDetails();

    return () => {
      active = false;
    };
  }, [invoiceNumber, supabase]);

  if (!invoiceNumber) return null;

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('invoice');
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold text-white mb-1">Rincian Invoice</h2>
        <p className="text-xs text-indigo-400 font-mono">{invoiceNumber}</p>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-3" />
              Memuat rincian transaksi...
            </div>
          ) : !selectedInvoice ? (
            <div className="py-12 text-center text-slate-500 italic text-xs">
              Data invoice tidak ditemukan.
            </div>
          ) : (
            <>
              {/* Header stats */}
              <div className="grid grid-cols-2 gap-4 bg-slate-950/40 p-4 border border-slate-855 rounded-2xl text-xs">
                <div>
                  <span className="text-slate-450 font-semibold block">Tanggal Transaksi</span>
                  <span className="font-bold text-white mt-1 block">
                    {formatDate(selectedInvoice.created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-450 font-semibold block">Operator Kasir</span>
                  <span className="font-bold text-white mt-1 block">
                    {(Array.isArray(selectedInvoice.profiles)
                      ? selectedInvoice.profiles[0]?.full_name
                      : selectedInvoice.profiles?.full_name) || 'Kasir'}
                  </span>
                </div>
              </div>

              {/* Items detail */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-455 block uppercase tracking-wider mb-2">Item Terjual</span>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {selectedInvoice.detail_penjualan?.map(item => {
                    const productObj = Array.isArray(item.produk) ? item.produk[0] : item.produk;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950/20 border border-slate-850 text-xs text-slate-350"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="font-bold text-white truncate">{productObj?.nama || 'Produk Dihapus'}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            SKU: {productObj?.kode_produk || 'N/A'} • {formatIDR(Number(item.harga_satuan))} x{item.jumlah}
                          </p>
                        </div>
                        <span className="font-bold text-slate-200 shrink-0">{formatIDR(Number(item.subtotal))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total final */}
              <div className="pt-4 border-t border-slate-850 flex items-center justify-between">
                <span className="text-sm text-slate-400 font-bold">Total Belanja:</span>
                <span className="text-lg font-black text-indigo-400">{formatIDR(Number(selectedInvoice.total_harga))}</span>
              </div>
            </>
          )}

          {/* Close Button */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-850 text-xs">
            <div className="flex items-center gap-1.5 text-slate-455">
              <Info className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>Klik silang untuk menutup detail.</span>
            </div>
            <button
              onClick={handleClose}
              className="px-5 py-2.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl font-bold cursor-pointer transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
