import React from 'react';
import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="h-[60vh] w-full flex flex-col items-center justify-center gap-4 text-slate-400">
      {/* Visual pulse spinner indicator */}
      <div className="relative flex items-center justify-center">
        <div className="absolute h-16 w-16 rounded-full bg-indigo-500/10 border border-indigo-500/25 animate-ping duration-[1200ms]" />
        <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-950/20">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </div>
      <div className="space-y-1 text-center animate-pulse">
        <h3 className="text-sm font-bold text-white tracking-tight">Menghubungkan Database</h3>
        <p className="text-xs text-slate-550">Memproses queries data secara real-time...</p>
      </div>
    </div>
  );
}
