// All monetary values are pre-computed by the caller. 
// This component is display-only — no business logic.

import React from 'react';

interface InvoiceItem {
  id: string;
  nama: string;
  jumlah: number;
  harga: number;
}

interface ReceiptInvoice {
  nomor_invoice: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: 'cash' | 'qris';
  cash?: number;
  change?: number;
  created_at?: string;
}

interface ReceiptSettings {
  store_name: string;
  store_address: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  tax_enabled: boolean;
  tax_rate: number;
}

interface Props {
  invoice: ReceiptInvoice;
  settings: ReceiptSettings;
  cashierName: string;
}

export default function ReceiptDocument({ invoice, settings, cashierName }: Props) {
  // Format IDR helper
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Format Date helper (WIB)
  const formatDateWIB = (dateStr?: string) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    return date.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB';
  };

  return (
    <div className="text-black bg-white p-4 mx-auto w-[80mm] font-mono text-xs leading-relaxed">
      {/* Header Info */}
      <div className="text-center space-y-1">
        <h2 className="text-sm font-bold uppercase tracking-tight">{settings.store_name}</h2>
        {settings.store_address && (
          <p className="text-[10px] whitespace-pre-wrap">{settings.store_address}</p>
        )}
        {settings.receipt_header && (
          <p className="text-[10px] whitespace-pre-wrap pt-1 border-t border-dashed border-slate-300 mt-1">{settings.receipt_header}</p>
        )}
      </div>

      {/* Meta Info Divider */}
      <div className="border-t border-dashed border-slate-300 my-2 pt-2 text-[10px] space-y-0.5">
        <div className="flex justify-between">
          <span>No. Struk:</span>
          <span>{invoice.nomor_invoice}</span>
        </div>
        <div className="flex justify-between">
          <span>Tanggal:</span>
          <span>{formatDateWIB(invoice.created_at)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Kasir:</span>
          <span>{cashierName}</span>
        </div>
      </div>

      {/* Items Section Divider */}
      <div className="border-t border-dashed border-slate-300 my-2"></div>

      {/* Items List */}
      <div className="space-y-2 text-[11px]">
        {invoice.items.map((item) => (
          <div key={item.id} className="space-y-0.5">
            <div className="font-semibold">{item.nama}</div>
            <div className="flex justify-between pl-2 text-slate-700">
              <span>
                {item.jumlah} x {formatIDR(item.harga)}
              </span>
              <span className="font-semibold text-black">
                {formatIDR(item.harga * item.jumlah)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals Section Divider */}
      <div className="border-t border-dashed border-slate-300 my-2 pt-2 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatIDR(invoice.subtotal)}</span>
        </div>
        
        {settings.tax_enabled && (
          <div className="flex justify-between text-slate-700">
            <span>PPN {settings.tax_rate}%:</span>
            <span>{formatIDR(invoice.tax_amount)}</span>
          </div>
        )}

        <div className="flex justify-between font-bold text-xs border-t border-double border-slate-400 pt-1.5 mt-1">
          <span>TOTAL:</span>
          <span>{formatIDR(invoice.total)}</span>
        </div>
      </div>

      {/* Payment details Divider */}
      <div className="border-t border-dashed border-slate-300 my-2 pt-2 text-[11px] space-y-0.5">
        <div className="flex justify-between">
          <span>Metode Bayar:</span>
          <span className="font-bold uppercase">{invoice.payment_method}</span>
        </div>

        {invoice.payment_method === 'cash' && (
          <>
            <div className="flex justify-between">
              <span>Tunai Dibayar:</span>
              <span>{formatIDR(invoice.cash || 0)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-slate-200 pt-0.5 mt-0.5">
              <span>Kembalian:</span>
              <span>{formatIDR(invoice.change || 0)}</span>
            </div>
          </>
        )}
      </div>

      {/* Footer Info */}
      {settings.receipt_footer && (
        <div className="border-t border-dashed border-slate-300 my-2 pt-2 text-center text-[10px] whitespace-pre-wrap italic">
          {settings.receipt_footer}
        </div>
      )}
    </div>
  );
}
