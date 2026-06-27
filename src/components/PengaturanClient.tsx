'use client';

import React, { useState, useTransition } from 'react';
import { updateSettings } from '@/app/dashboard/pengaturan/actions';
import { TenantSettings } from '@/types/database';
import {
  Settings,
  Store,
  MapPin,
  FileText,
  Percent,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface Props {
  initialSettings: TenantSettings;
}

const formatIDR = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

export default function PengaturanClient({ initialSettings }: Props) {
  const [storeName, setStoreName] = useState(initialSettings.store_name);
  const [storeAddress, setStoreAddress] = useState(initialSettings.store_address || '');
  const [receiptHeader, setReceiptHeader] = useState(initialSettings.receipt_header || '');
  const [receiptFooter, setReceiptFooter] = useState(initialSettings.receipt_footer || '');
  const [taxEnabled, setTaxEnabled] = useState(initialSettings.tax_enabled);
  const [taxRate, setTaxRate] = useState(initialSettings.tax_rate);

  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTaxToggle = () => {
    const nextVal = !taxEnabled;
    setTaxEnabled(nextVal);
    if (!nextVal) {
      setTaxRate(0);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccess(false);
    setError(null);

    if (!storeName.trim()) {
      setError('Nama toko tidak boleh kosong.');
      return;
    }

    const formData = new FormData();
    formData.append('store_name', storeName);
    formData.append('store_address', storeAddress);
    formData.append('receipt_header', receiptHeader);
    formData.append('receipt_footer', receiptFooter);
    formData.append('tax_enabled', taxEnabled ? 'true' : 'false');
    formData.append('tax_rate', taxRate.toString());

    startTransition(async () => {
      const res = await updateSettings(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        // Clear success message after 4 seconds
        setTimeout(() => setSuccess(false), 4000);
      }
    });
  };

  // Sample items for receipt preview
  const sampleSubtotal = 50000;
  const computedTax = taxEnabled ? Math.round(sampleSubtotal * (taxRate / 100)) : 0;
  const computedTotal = sampleSubtotal + computedTax;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Title */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="h-6 w-6 text-indigo-400" />
          Pengaturan Struk
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Konfigurasi identitas toko, detail struk belanja fisik, dan opsi perpajakan (Akses khusus Owner).
        </p>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Settings Form (Left Panel) */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-6">
          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs flex items-center gap-2 shadow-inner">
              <CheckCircle className="h-4.5 w-4.5 shrink-0" />
              <span>Pengaturan toko berhasil diperbarui.</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs flex items-center gap-2 shadow-inner">
              <AlertCircle className="h-4.5 w-4.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
            {/* Store Identity */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Store className="h-4 w-4 text-indigo-400" />
                Identitas Toko
              </h3>
              
              <div className="space-y-1">
                <label className="block text-xs text-slate-405 font-medium">Nama Toko *</label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Masukkan nama toko..."
                  className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-850 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-slate-405 font-medium">Alamat Toko</label>
                <textarea
                  rows={3}
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="Masukkan alamat toko lengkap..."
                  className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-850 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm transition-all resize-none"
                />
              </div>
            </div>

            {/* Receipt Settings */}
            <div className="space-y-4 pt-4 border-t border-slate-850">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-400" />
                Header & Footer Struk
              </h3>

              <div className="space-y-1">
                <label className="block text-xs text-slate-405 font-medium">Teks Header Struk</label>
                <textarea
                  rows={2}
                  value={receiptHeader}
                  onChange={(e) => setReceiptHeader(e.target.value)}
                  placeholder="cth: Terima kasih atas kunjungan Anda"
                  className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-850 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm transition-all resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-slate-405 font-medium">Teks Footer Struk</label>
                <textarea
                  rows={2}
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  placeholder="cth: Barang yang sudah dibeli tidak dapat ditukar"
                  className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-850 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm transition-all resize-none"
                />
              </div>
            </div>

            {/* Tax Settings */}
            <div className="space-y-4 pt-4 border-t border-slate-850">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Percent className="h-4 w-4 text-indigo-400" />
                Pengaturan Pajak (PPN)
              </h3>

              <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-slate-850/80 rounded-2xl">
                <div className="space-y-0.5">
                  <label htmlFor="tax-enabled-toggle" className="text-xs font-bold text-white block">Aktifkan Pajak (PPN)</label>
                  <span className="text-[10px] text-slate-400">Terapkan pajak pertambahan nilai pada struk dan perhitungan kasir.</span>
                </div>
                
                {/* Switch Toggle */}
                <button
                  type="button"
                  id="tax-enabled-toggle"
                  onClick={handleTaxToggle}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    taxEnabled ? 'bg-indigo-600' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      taxEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-slate-405 font-medium">Persentase Pajak (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!taxEnabled}
                    value={taxRate === 0 ? '' : taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    placeholder={taxEnabled ? "Masukkan tarif pajak (cth: 11)" : "Pajak dinonaktifkan"}
                    className={`w-full pl-3 pr-8 py-2.5 bg-slate-950/60 border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all ${
                      taxEnabled 
                        ? 'border-slate-850 text-slate-200 placeholder-slate-600' 
                        : 'border-slate-900 text-slate-500 bg-slate-950/20 cursor-not-allowed placeholder-slate-700'
                    }`}
                  />
                  <div className={`absolute inset-y-0 right-3 flex items-center text-xs font-bold ${taxEnabled ? 'text-slate-400' : 'text-slate-705'}`}>
                    %
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-slate-850 flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] flex items-center gap-2 cursor-pointer shadow-lg hover:shadow-indigo-550/10"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  'Simpan Perubahan'
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Receipt Live Preview (Right Panel) */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            Pratinjau Struk Kasir
          </h3>
          
          {/* Thermal Paper Styling */}
          <div className="bg-slate-100 text-slate-900 p-6 md:p-8 rounded-3xl shadow-xl font-mono text-[11px] leading-relaxed border-2 border-slate-300 relative overflow-hidden select-none">
            {/* Top jagged edge effect */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-250 to-slate-200 border-b border-dashed border-slate-350" />
            
            <div className="space-y-4 text-center">
              {/* Receipt Header Text */}
              {receiptHeader ? (
                <p className="text-[10px] text-slate-500 italic break-words whitespace-pre-wrap">{receiptHeader}</p>
              ) : (
                <p className="text-[9px] text-slate-400 italic font-sans">[Baris Teks Header Struk]</p>
              )}

              {/* Store Name & Address */}
              <div>
                <h4 className="text-sm font-black tracking-tight text-black break-words leading-tight">{storeName || 'Nama Toko'}</h4>
                {storeAddress ? (
                  <p className="text-[9px] text-slate-600 mt-1 break-words whitespace-pre-wrap leading-snug">{storeAddress}</p>
                ) : (
                  <p className="text-[9px] text-slate-400 italic mt-1 font-sans">[Alamat Toko Belum Diatur]</p>
                )}
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dashed border-slate-400 my-4" />

            {/* Meta details placeholders */}
            <div className="space-y-0.5 text-slate-500 text-[10px]">
              <div className="flex justify-between">
                <span>Waktu</span>
                <span>[Waktu Transaksi (Otomatis)]</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir</span>
                <span>[Nama Staff]</span>
              </div>
              <div className="flex justify-between">
                <span>Invoice</span>
                <span>INV/20260627/0001</span>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dashed border-slate-400 my-4" />

            {/* Placeholder Items */}
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div className="max-w-[70%]">
                  <p className="text-slate-600 italic">[Contoh Item 1]</p>
                  <span className="text-[10px] text-slate-400">1 x Rp 20.000</span>
                </div>
                <span>Rp 20.000</span>
              </div>
              <div className="flex justify-between items-start">
                <div className="max-w-[70%]">
                  <p className="text-slate-600 italic">[Contoh Item 2]</p>
                  <span className="text-[10px] text-slate-400">2 x Rp 15.000</span>
                </div>
                <span>Rp 30.000</span>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dashed border-slate-400 my-4" />

            {/* Summary details */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Subtotal</span>
                <span>{formatIDR(sampleSubtotal)}</span>
              </div>
              
              {taxEnabled ? (
                <div className="flex justify-between text-indigo-700 font-semibold">
                  <span className="font-sans">Pajak (PPN {taxRate}%)</span>
                  <span>{formatIDR(computedTax)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-slate-400 italic">
                  <span className="font-sans">Pajak dinonaktifkan</span>
                  <span>—</span>
                </div>
              )}

              <div className="flex justify-between text-xs font-black text-black pt-1">
                <span className="font-sans">TOTAL</span>
                <span>{formatIDR(computedTotal)}</span>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dashed border-slate-400 my-4" />

            {/* Receipt Footer Text */}
            <div className="text-center">
              {receiptFooter ? (
                <p className="text-[10px] text-slate-500 break-words whitespace-pre-wrap">{receiptFooter}</p>
              ) : (
                <p className="text-[9px] text-slate-400 italic font-sans">[Baris Teks Footer Struk]</p>
              )}
            </div>

            {/* Bottom jagged edge effect */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-200 to-slate-250 border-t border-dashed border-slate-350" />
          </div>

          <div className="flex items-center gap-2 p-3 bg-slate-900/20 border border-slate-800/60 rounded-2xl text-[10px] text-slate-400 leading-relaxed shadow-inner">
            <span className="text-indigo-400 font-bold uppercase shrink-0">Info:</span>
            <span>Bagian struk kasir yang ditandai tanda kurung siku `[...]` adalah data contoh. Hanya nama, alamat, header, footer, dan pajak yang mencerminkan konfigurasi aktual Anda.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
