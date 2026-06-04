'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, RefreshCw, AlertCircle, Laptop } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isActive?: boolean;
  onActiveChange?: (active: boolean) => void;
}

export default function BarcodeScanner({ 
  onScanSuccess, 
  isActive, 
  onActiveChange 
}: BarcodeScannerProps) {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCamera, setHasCamera] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cooldownRef = useRef(false);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const cameraRunning = isActive !== undefined ? isActive : isCameraActive;

  // Buffer for physical hardware USB scanner tracking
  const keyboardBufferRef = useRef<{ char: string; time: number }[]>([]);

  // 1. Camera Barcode Scanner Logic
  useEffect(() => {
    let isMounted = true;
    let html5Qrcode: Html5Qrcode | null = null;
    let startPromise: Promise<any> | null = null;

    if (!cameraRunning) {
      const stopCurrent = async () => {
        try {
          if (scannerRef.current && scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
        } catch (err) {
          console.error('Error stopping scanner on deactivate:', err);
        }
      };
      stopCurrent();
      return;
    }

    const scannerId = 'reader-viewfinder';

    const startScanner = async () => {
      try {
        setErrorMsg(null);
        
        // Initialize HTML5 QR Code instance
        html5Qrcode = new Html5Qrcode(scannerId);
        scannerRef.current = html5Qrcode;

        startPromise = html5Qrcode.start(
          { facingMode },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.777778 // 16:9 aspect ratio for standard viewfinder
          },
          (decodedText) => {
            if (!isMounted) return;
            // Successful scan
            if (cooldownRef.current) return;
            cooldownRef.current = true;

            // Trigger success callback
            onScanSuccess(decodedText);

            // Cooldown 2 seconds to prevent duplicates
            setTimeout(() => {
              cooldownRef.current = false;
            }, 2000);
          },
          () => {
            // Scanning failure is triggered on every frame check, ignore it to keep logs clean
          }
        );

        await startPromise;

        if (!isMounted) {
          if (html5Qrcode.isScanning) {
            await html5Qrcode.stop();
          }
          return;
        }

        setHasCamera(true);
      } catch (err: any) {
        if (isMounted) {
          console.error('Gagal memulai kamera:', err);
          setHasCamera(false);
          setErrorMsg(err.message || 'Gagal mengakses kamera. Pastikan izin kamera telah diberikan.');
        }
      }
    };

    // Slight delay to ensure DOM is fully rendered
    const timer = setTimeout(() => {
      if (isMounted) {
        startScanner();
      }
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      
      const stopScanner = async () => {
        if (startPromise) {
          try {
            await startPromise;
          } catch (e) {
            // Ignore start errors during cleanup
          }
        }
        try {
          if (html5Qrcode && html5Qrcode.isScanning) {
            await html5Qrcode.stop();
          } else if (scannerRef.current && scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
        } catch (err) {
          console.log('Cleanup stop error:', err);
        }
      };
      stopScanner();
    };
  }, [facingMode, cameraRunning, onScanSuccess]);

  // 2. Global Hardware Laser Barcode Scanner Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      
      // We skip structural modifier keys
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      const buffer = keyboardBufferRef.current;

      // Reset buffer if the last keypress was too long ago (e.g. human typing speed)
      if (buffer.length > 0 && now - buffer[buffer.length - 1].time > 100) {
        keyboardBufferRef.current = [];
      }

      if (e.key === 'Enter') {
        // If Enter is pressed, check if the typed keys were fast enough to be a hardware scanner
        if (buffer.length >= 3) {
          // Calculate average interval
          let totalInterval = 0;
          for (let i = 1; i < buffer.length; i++) {
            totalInterval += (buffer[i].time - buffer[i - 1].time);
          }
          const averageInterval = totalInterval / (buffer.length - 1);

          // Standard laser scanner types extremely fast (intervals < 30ms)
          if (averageInterval < 40) {
            const barcodeText = buffer.map(item => item.char).join('');
            console.log('Hardware scanner detected:', barcodeText);
            
            e.preventDefault();
            onScanSuccess(barcodeText);
          }
        }
        // Clear buffer on Enter
        keyboardBufferRef.current = [];
      } else {
        // Add character to buffer
        if (e.key.length === 1) { // Only single characters
          keyboardBufferRef.current.push({ char: e.key, time: now });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onScanSuccess]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="flex flex-col items-center bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md mx-auto shadow-xl space-y-6">
      {/* Viewer Header */}
      <div className="w-full flex items-center justify-between">
        <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
          <Camera className="h-4 w-4 text-indigo-400" />
          Kamera Pemindai Barcode
        </h4>
        <div className="flex items-center gap-2">
          {hasCamera && cameraRunning && (
            <button
              onClick={toggleCamera}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-350 hover:text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
              title="Ganti Kamera Depan/Belakang"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Switch Kamera
            </button>
          )}
          {cameraRunning && (
            <button
              onClick={() => {
                if (onActiveChange) {
                  onActiveChange(false);
                } else {
                  setIsCameraActive(false);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 border border-red-900/40 hover:border-red-800 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
            >
              Matikan
            </button>
          )}
        </div>
      </div>

      {/* Camera Viewfinder Overlay area */}
      <div className="relative w-full aspect-[4/3] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex flex-col items-center justify-center">
        {cameraRunning ? (
          <>
            <div id="reader-viewfinder" className="w-full h-full" />
            
            {/* Viewfinder scanner box overlays */}
            {hasCamera && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Viewfinder rectangle scanner box */}
                <div className="w-[280px] h-[160px] border-2 border-indigo-500/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(10,10,10,0.5)]">
                  {/* Glowing corners */}
                  <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-4 border-l-4 border-indigo-400 rounded-tl-md" />
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-4 border-r-4 border-indigo-400 rounded-tr-md" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-4 border-l-4 border-indigo-400 rounded-bl-md" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-4 border-r-4 border-indigo-400 rounded-br-md" />

                  {/* Scanning animation laser red line */}
                  <div className="absolute left-1 right-1 h-0.5 bg-indigo-500/70 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)] animate-laser-move rounded" />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 w-full h-full bg-slate-950/50">
            <div className="h-12 w-12 rounded-2xl bg-slate-900/80 flex items-center justify-center border border-slate-800 text-indigo-400 shadow-inner animate-pulse">
              <Camera className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-350">Kamera Pemindai Nonaktif</p>
              <p className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed mx-auto">
                Aktifkan kamera perangkat Anda untuk mulai memindai barcode menggunakan kamera.
              </p>
            </div>
            <button
              onClick={() => {
                if (onActiveChange) {
                  onActiveChange(true);
                } else {
                  setIsCameraActive(true);
                }
              }}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-[0.98]"
            >
              Aktifkan Kamera Pemindai
            </button>
          </div>
        )}

        {/* Viewfinder Error fallback banner */}
        {errorMsg && cameraRunning && (
          <div className="absolute inset-0 bg-slate-950 p-6 flex flex-col items-center justify-center text-center space-y-3 z-10">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-xs text-slate-400 max-w-[240px]">{errorMsg}</p>
          </div>
        )}
      </div>

      {/* Hardware Scanner active tip */}
      <div className="w-full p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl flex items-start gap-3">
        <Laptop className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-white">Scanner Fisik Aktif</p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Anda dapat langsung menembakkan scanner laser USB / wireless fisik Anda ke layar untuk membaca barcode secara instan kapan saja.
          </p>
        </div>
      </div>
    </div>
  );
}
