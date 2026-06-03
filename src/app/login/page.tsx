'use client';

import React, { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { login } from '@/app/auth/actions';
import { Lock, Mail, Loader2, BarChart2 } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out hover:shadow-indigo-500/20 active:scale-[0.98]"
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
          Masuk...
        </>
      ) : (
        'Masuk ke Dasbor'
      )}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(login, null);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-radial from-slate-900 via-indigo-950 to-slate-950 p-4 font-sans select-none">
      {/* Background shapes for premium ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Logo/Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl mb-4 shadow-inner">
            <BarChart2 className="h-10 w-10 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            DigiBiz
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sistem Manajemen Inventaris & Penjualan
          </p>
        </div>

        {/* Login Form Container */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">
            Selamat Datang Kembali
          </h2>

          <form action={formAction} className="space-y-6">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Alamat Email
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@company.com"
                  className="block w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-150 text-sm"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Kata Sandi
                </label>
              </div>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-150 text-sm"
                />
              </div>
            </div>

            {/* Error Message */}
            {state?.error && (
              <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-xl text-sm text-red-400">
                {state.error}
              </div>
            )}

            {/* Submit Button */}
            <SubmitButton />
          </form>

          {/* Quick Info / Dev Bypass Details */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-500">
              Butuh akses akun? Hubungi pemilik sistem untuk pendaftaran.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
