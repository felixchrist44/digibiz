'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Printer, Barcode as BarcodeIcon } from 'lucide-react';

// Dynamically import react-barcode with SSR disabled since it accesses browser canvas/DOM APIs
const Barcode = dynamic(() => import('react-barcode'), { ssr: false });

interface BarcodeGeneratorProps {
  value: string; // The SKU/product code
  name: string;  // The product name
  price?: number; // Optional price to show on label
}

export default function BarcodeGenerator({ value, name, price }: BarcodeGeneratorProps) {
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-900/80 border border-slate-800 rounded-2xl max-w-md mx-auto space-y-6 print-hide shadow-xl">
      {/* Dynamic style block to isolate printing of ONLY the barcode card */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide all page content */
          body * {
            visibility: hidden !important;
          }
          /* Show ONLY the barcode container */
          #printable-barcode-content, #printable-barcode-content * {
            visibility: visible !important;
          }
          #printable-barcode-content {
            position: absolute !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 380px !important;
            background: white !important;
            color: black !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 16px !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 8px !important;
            box-shadow: none !important;
          }
          .print-hide {
            display: none !important;
          }
        }
      ` }} />

      <div className="text-center">
        <h4 className="text-sm font-semibold text-slate-455 uppercase tracking-wider flex items-center justify-center gap-1.5">
          <BarcodeIcon className="h-4 w-4 text-indigo-400" />
          Label Barcode Produk
        </h4>
      </div>

      {/* Printable Barcode Card Area */}
      <div
        id="printable-barcode-content"
        className="bg-white border border-slate-200 rounded-xl px-4 py-6 flex flex-col items-center justify-center text-black w-full"
      >
        {/* Product Meta on Label */}
        <div className="text-center mb-2 font-sans w-full">
          <p className="text-xs font-black tracking-tight uppercase truncate text-slate-900 max-w-[240px] mx-auto">
            {name}
          </p>
          {price !== undefined && (
            <p className="text-[10px] font-extrabold text-slate-600 mt-0.5">
              {formatIDR(price)}
            </p>
          )}
        </div>

        {/* The Barcode Generator */}
        <div className="bg-white p-1 rounded">
          <Barcode
            value={value}
            format="CODE128"
            width={1.6}
            height={50}
            fontSize={12}
            background="#ffffff"
            lineColor="#000000"
          />
        </div>

        {/* Company Identifier */}
        <p className="text-[8px] font-bold text-slate-400 tracking-widest mt-2 uppercase font-sans">
          DigiBiz Inventory
        </p>
      </div>

      {/* Action Button */}
      <button
        onClick={handlePrint}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98] print-hide"
      >
        <Printer className="h-4 w-4" />
        Cetak Struk Label
      </button>
    </div>
  );
}
