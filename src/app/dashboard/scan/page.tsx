'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Wifi,
  Tv,
  Zap,
  Pause,
  Loader2
} from 'lucide-react';

export default function MobileScanPage() {
  const [mounted, setMounted] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<'ready' | 'paused' | 'error'>('ready');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const channelRef = useRef<any>(null);
  const cooldownRef = useRef(false);

  // Client hydration check
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize Supabase Realtime Broadcast Connection
  useEffect(() => {
    if (!mounted) return;

    const supabase = createClient();
    const channel = supabase.channel('inventory-checkout-room', {
      config: {
        broadcast: { self: false } // Do not echo broadcast to ourselves
      }
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnectionStatus('connected');
        console.log('POS Scanner: Realtime WebSocket Subscribed to inventory-checkout-room');
      } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnectionStatus('disconnected');
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [mounted]);

  // Success Scan Handler
  const handleScanSuccess = (decodedText: string) => {
    const trimmedCode = decodedText.trim();
    if (!trimmedCode) return;

    // Stop execution if scanner is in cooldown mode
    if (cooldownRef.current) return;
    cooldownRef.current = true;

    setScannedCode(trimmedCode);
    setScanStatus('paused');
    setErrorMsg(null);

    // 1. Broadcast the barcode data via Supabase Realtime Broadcast
    if (channelRef.current && connectionStatus === 'connected') {
      channelRef.current.send({
        type: 'broadcast',
        event: 'barcode-scanned',
        payload: { sku: trimmedCode }
      });
      console.log('Successfully broadcasted SKU:', trimmedCode);
    } else {
      console.warn('Realtime broadcast skipped: Not connected to socket.');
    }

    // 2. Browser vibration feedback (80ms pulse)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(80);
    }

    // 3. 1.5-second cooldown delay before resetting
    setTimeout(() => {
      setScanStatus('ready');
      cooldownRef.current = false;
    }, 1500);
  };

  // Initialize Camera Stream Automatically on mount
  useEffect(() => {
    if (!mounted) return;

    const scannerId = 'phone-camera-box-custom';
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    let isScanningActive = false;

    // Start scanner automatically on load
    scanner.start(
      { facingMode: 'environment' }, // Default to rear camera
      {
        fps: 15, // Smooth scans
        qrbox: (width, height) => {
          // Dynamic rectangular box optimized for horizontal barcode sizes
          const boxWidth = Math.min(width * 0.85, 300);
          const boxHeight = Math.min(height * 0.35, 130);
          return {
            width: Math.floor(boxWidth),
            height: Math.floor(boxHeight)
          };
        },
        aspectRatio: 1.0 // Ideal square grid positioning on mobile screens
      },
      (decodedText) => {
        handleScanSuccess(decodedText);
      },
      (errorMessage) => {
        // Silent callback to avoid browser console spamming
      }
    )
    .then(() => {
      isScanningActive = true;
      setScanStatus('ready');
    })
    .catch((err) => {
      console.error('Autostart scanner failed:', err);
      setErrorMsg('Gagal menyalakan kamera belakang secara otomatis. Pastikan izin kamera diberikan.');
      setScanStatus('error');
    });

    return () => {
      if (scannerRef.current) {
        if (isScanningActive || scannerRef.current.isScanning) {
          scannerRef.current.stop()
            .then(() => {
              console.log('Scanner stopped successfully on page exit.');
            })
            .catch((err) => {
              console.error('Error stopping scanner during cleanup:', err);
            });
        }
      }
    };
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-2" />
        <p className="text-xs">Memuat modul pemindai...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 max-w-md mx-auto rounded-3xl border border-slate-900 shadow-2xl relative overflow-hidden">
      
      {/* Header Info Panel */}
      <div className="w-full text-center space-y-2 mt-2">
        <div className="flex items-center justify-between px-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
            <Tv className="h-3.5 w-3.5 text-indigo-400" />
            PEMINDAI AUTO-START
          </span>

          {/* Connection Status Indicator */}
          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border flex items-center gap-1.5 transition-all ${
            connectionStatus === 'connected'
              ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400'
              : connectionStatus === 'connecting'
              ? 'bg-amber-950/40 border-amber-900/50 text-amber-400 animate-pulse'
              : 'bg-red-950/40 border-red-900/50 text-red-400'
          }`}>
            <Wifi className="h-3 w-3" />
            {connectionStatus === 'connected' ? 'Soket Online' : connectionStatus === 'connecting' ? 'Menghubungkan' : 'Soket Offline'}
          </span>
        </div>

        <h2 className="text-lg font-black tracking-tight text-white mt-4 flex items-center justify-center gap-1.5">
          <Camera className="h-5 w-5 text-indigo-400" />
          Kamera Kasir Mobile
        </h2>
        <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
          Dekatkan kamera ke barcode produk. Sistem memindai instan tanpa klik dan mengirimkannya langsung ke layar kasir.
        </p>
      </div>

      {/* Main Viewfinder Frame */}
      <div className="w-full my-6 flex flex-col items-center justify-center relative">
        <div
          id="phone-camera-box-custom"
          className="w-full max-w-sm rounded-2xl overflow-hidden border border-slate-900 bg-black shadow-2xl aspect-square relative"
        />

        {/* Customized HUD Viewfinder Overlay */}
        {scanStatus === 'ready' && (
          <div className="absolute pointer-events-none inset-0 flex items-center justify-center">
            {/* Viewfinder brackets */}
            <div className="w-[300px] h-[130px] border-2 border-indigo-500/40 rounded-xl relative flex items-center justify-center">
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-indigo-400 rounded-tl" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-indigo-400 rounded-tr" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-indigo-400 rounded-bl" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-indigo-400 rounded-br" />
              
              {/* Scanline Animation */}
              <div className="w-full h-[1px] bg-indigo-400/80 animate-[bounce_2s_infinite] shadow-lg shadow-indigo-500" />
            </div>
          </div>
        )}

        {/* 1.5s Cooldown Lock Overlay */}
        {scanStatus === 'paused' && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center text-center space-y-3 z-20 animate-fade-in">
            <div className="h-12 w-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Pause className="h-6 w-6 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-400 tracking-widest uppercase">PROSES SCAN BERHASIL</p>
              <p className="text-[9px] text-slate-450 mt-1">Mengunci kamera 1.5 detik sebelum scan berikutnya...</p>
            </div>
          </div>
        )}

        {/* Camera Start Error State */}
        {scanStatus === 'error' && (
          <div className="absolute inset-0 bg-slate-950/90 rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
            <AlertTriangle className="h-10 w-10 text-red-500" />
            <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider">Akses Kamera Gagal</h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {errorMsg || 'Aplikasi membutuhkan izin kamera belakang untuk melakukan scanning.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-[10px] font-bold tracking-wider uppercase transition-colors"
            >
              Muat Ulang Halaman
            </button>
          </div>
        )}
      </div>

      {/* Info Status Panel */}
      <div className="w-full bg-slate-900/30 border border-slate-900 p-4 rounded-2xl space-y-3.5">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-950/50">
          <span className="text-slate-450 font-semibold">Anti-Double Scan Cooldown:</span>
          <span className="font-extrabold text-indigo-400 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 fill-indigo-400/25" />
            Aktif (1.5s)
          </span>
        </div>

        {/* Latest Scanned Output */}
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Barcode Terakhir Terkirim</span>
          {scannedCode ? (
            <div className="flex items-center justify-between bg-slate-950/50 border border-slate-850 p-2.5 rounded-xl animate-in fade-in duration-200">
              <span className="text-xs font-mono font-extrabold text-white truncate max-w-[200px]">
                {scannedCode}
              </span>
              <span className="px-2 py-0.5 bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 rounded text-[9px] font-bold flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Terkirim
              </span>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 italic py-2.5 text-center border border-dashed border-slate-850 rounded-xl">
              Menunggu pemindaian barcode produk...
            </div>
          )}
        </div>
      </div>

      {/* Accessibility footer metadata */}
      <div className="text-[8px] text-slate-650 mt-4 flex items-center justify-between w-full px-2">
        <span>Html5Qrcode Engine (Direct Stream)</span>
        <span>Haptic Vibe: {typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? 'Supported' : 'Unsupported'}</span>
      </div>
      
    </div>
  );
}
