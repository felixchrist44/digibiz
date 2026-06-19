'use client';

import React, { useState, useEffect, useRef, useSyncExternalStore, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  Camera,
  CheckCircle,
  AlertCircle,
  Wifi,
  Tv,
  Zap,
  Pause,
  Loader2
} from 'lucide-react';

const emptySubscribe = () => () => { };
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function MobileScannerPage() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot
  );
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<'ready' | 'paused' | 'error'>('ready');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cooldownRef = useRef(false);
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectionStatusRef = useRef(connectionStatus);
  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);


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

  // Supabase Realtime WebSocket Connection
  useEffect(() => {
    if (!mounted || !tenantId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase.channel(`inventory-checkout-${tenantId}`, {
        config: {
          broadcast: { self: false, ack: true },
          private: false
        }
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [mounted, tenantId, supabase]);

  // Main callback for successful barcode scans
  const handleScanSuccess = async (decodedText: string) => {
    const trimmedCode = decodedText.trim();
    if (!trimmedCode) return;

    // Guard to prevent multiple simultaneous scan triggers during cooldown
    if (cooldownRef.current) return;
    cooldownRef.current = true;

    setScannedCode(trimmedCode);
    setScanStatus('paused');

    // 1. Broadcast the scanned SKU via Supabase Realtime channel
    if (channelRef.current && connectionStatusRef.current === 'connected') {
      const res = await channelRef.current.send({
        type: 'broadcast',
        event: 'barcode-scanned',
        payload: { sku: trimmedCode }
      });
      setBroadcastSuccess(res === 'ok');
    } else {
      setBroadcastSuccess(false);
    }

    // 2. Mobile Haptic Vibration feedback (80ms pulse)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(80);
    }

    // 3. Stage-Gate 1-Second Camera pause to prevent ghost scan repetitions
    if (scannerRef.current) {
      try {
        // Pauses video scanning capture frames (keeps stream alive but frozen)
        scannerRef.current.pause(true);
      } catch (err) {
        console.error('Failed to pause html5-qrcode camera:', err);
      }
    }

    // 4. Set a 1000ms delay timeout to resume scanner
    cooldownTimeoutRef.current = setTimeout(() => {
      if (scannerRef.current) {
        try {
          scannerRef.current.resume();
          setScanStatus('ready');
          cooldownRef.current = false;
        } catch (err) {
          console.error('Failed to resume html5-qrcode camera:', err);
          cooldownRef.current = false;
        }
      } else {
        cooldownRef.current = false;
      }
    }, 1000);
  };

  const handleScanSuccessRef = useRef(handleScanSuccess);
  useEffect(() => {
    handleScanSuccessRef.current = handleScanSuccess;
  });

  // Initializing Camera Scanner Render
  useEffect(() => {
    if (!mounted || !tenantId) return;

    const scannerId = 'phone-camera-box';

    // Create a new Html5QrcodeScanner instance
    const scanner = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 10,
        qrbox: { width: 250, height: 160 },
        aspectRatio: 1.0, // Square aspect ratio fits mobile viewports
        showTorchButtonIfSupported: true,
        rememberLastUsedCamera: true
      },
      /* verbose= */ false
    );

    scannerRef.current = scanner;

    // Render viewfinder on mount
    scanner.render(
      (decodedText) => {
        handleScanSuccessRef.current(decodedText);
      },
      () => {
        // Avoid spamming error console logs on every scan attempt
      }
    );

    return () => {
      // Clear timeout and reset lock state
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
      }
      cooldownRef.current = false;

      // Safe clear unmount release of camera streams
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (err) {
          console.error('Failed to clear camera stream on unmount:', err);
        }
      }
    };
  }, [mounted, tenantId]);

  if (!mounted || !tenantId) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-2" />
        <p className="text-xs">{!mounted ? 'Memuat modul pemindai kamera...' : 'Memuat sesi...'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 max-w-md mx-auto rounded-3xl border border-slate-900 shadow-2xl relative overflow-hidden">

      {/* Top Header Panel */}
      <div className="w-full text-center space-y-2 mt-2">
        <div className="flex items-center justify-between px-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
            <Tv className="h-3.5 w-3.5 text-indigo-400" />
            MODUL KAMERA MOBILE
          </span>

          {/* WebSocket Connection Status Tag */}
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border flex items-center gap-1 ${connectionStatus === 'connected'
            ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400'
            : connectionStatus === 'connecting'
              ? 'bg-amber-950/40 border-amber-900/50 text-amber-400 animate-pulse'
              : 'bg-red-950/40 border-red-900/50 text-red-400'
            }`}>
            <Wifi className="h-3 w-3" />
            {connectionStatus === 'connected' ? 'Soket Online' : connectionStatus === 'connecting' ? 'Menghubungkan' : 'Soket Offline'}
          </span>
        </div>

        <h2 className="text-lg font-black tracking-tight text-white mt-3 flex items-center justify-center gap-1.5">
          <Camera className="h-5 w-5 text-indigo-400 animate-pulse" />
          Pemindai Kamera Smartphone
        </h2>
        <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
          Posisikan barcode produk di dalam kotak pemindai. Sistem akan memindai dan mengirimkannya ke layar checkout secara instan.
        </p>
      </div>

      {/* Camera Viewfinder Box Container */}
      <div className="w-full my-6 flex flex-col items-center justify-center relative">
        <div
          id="phone-camera-box"
          className="w-full max-w-sm rounded-xl overflow-hidden border border-slate-800 bg-black shadow-inner"
        />

        {/* State-Gate Lock Banner Overlay */}
        {scanStatus === 'paused' && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center text-center space-y-2 z-10 animate-fade-in">
            <Pause className="h-8 w-8 text-amber-400 animate-pulse" />
            <div>
              <p className="text-xs font-black text-amber-400 tracking-widest uppercase">AUTO-LOCK COOLDOWN</p>
              <p className="text-[9px] text-slate-400 mt-1">Mengunci kamera 1 detik untuk menghindari double-scan.</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Details */}
      <div className="w-full bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between text-xs border-b border-slate-950 pb-2">
          <span className="text-slate-450 font-bold">Lock Anti-Repeat:</span>
          <span className="font-extrabold text-indigo-400 flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 fill-indigo-400/20" />
            Aktif (1 Detik)
          </span>
        </div>

        {/* Latest scanned item display details */}
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Barang Terakhir Terbaca</span>
          {scannedCode ? (
            <div className="flex items-center justify-between bg-slate-950/60 border border-slate-850 p-2.5 rounded-xl animate-fade-in">
              <span className="text-xs font-mono font-black text-white truncate max-w-[200px]">
                {scannedCode}
              </span>
              {broadcastSuccess ? (
                <span className="px-2 py-0.5 bg-emerald-950/50 border border-emerald-900/30 text-emerald-400 rounded text-[9px] font-bold flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Terkirim
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-red-950/50 border border-red-900/30 text-red-400 rounded text-[9px] font-bold flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Gagal Kirim (Offline)
                </span>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 italic py-2 text-center border border-dashed border-slate-850 rounded-xl">
              Belum ada barcode terpindai.
            </div>
          )}
        </div>
      </div>

      {/* Small accessibility check status */}
      <div className="text-[9px] text-slate-600 mt-4 flex items-center justify-between w-full px-2">
        <span>html5-qrcode engine v2.3</span>
        <span>Haptic Vibe: {typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? 'Supported' : 'Unsupported'}</span>
      </div>

    </div>
  );
}
