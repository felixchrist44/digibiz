'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report client render crash to logger/Sentry once
    logger.error(error, {
      action: 'client_render_crash',
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl max-w-md w-full border border-red-100 shadow-sm">
        <h2 className="text-xl font-bold mb-2 text-red-900">Terjadi Kesalahan Sistem</h2>
        <p className="text-sm text-red-600 mb-6">
          Aplikasi mengalami kendala saat memuat halaman ini. Data transaksi Anda tetap aman.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            Coba Lagi
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-sm rounded-lg transition-colors cursor-pointer"
          >
            Muat Ulang POS
          </button>
        </div>
      </div>
    </div>
  );
}
