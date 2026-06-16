'use client';

import React, { useState, useActionState, useEffect, use } from 'react';
import { useFormStatus } from 'react-dom';
import { authenticate } from '@/app/auth/actions';
import { Lock, Mail, Loader2, BarChart2, User } from 'lucide-react';

interface SubmitButtonProps {
  isSignUp: boolean;
}

function SubmitButton({ isSignUp }: SubmitButtonProps) {
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
          {isSignUp ? 'Mendaftar...' : 'Masuk...'}
        </>
      ) : (
        isSignUp ? 'Daftar Akun Baru' : 'Masuk ke Dasbor'
      )}
    </button>
  );
}

interface LoginPageProps {
  searchParams: Promise<{ invite?: string }>;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = use(searchParams);
  const inviteToken = resolvedParams?.invite || '';
  const [isSignUp, setIsSignUp] = useState(false);
  const [state, formAction] = useActionState(authenticate, null) as any;

  // If registration is successful, automatically flip form to login mode
  useEffect(() => {
    if (state?.success) {
      const timer = setTimeout(() => {
        setIsSignUp(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Automatically switch to SignUp mode if invite token is present
  useEffect(() => {
    if (inviteToken) {
      setIsSignUp(true);
    }
  }, [inviteToken]);

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

        {/* Login/Signup Form Container */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">
            {isSignUp ? (inviteToken ? 'Bergabung ke Toko (Undangan)' : 'Daftar Akun Staff Baru') : 'Selamat Datang Kembali'}
          </h2>

          <form action={formAction} className="space-y-6">
            {/* Hidden Input for Form Mode Router */}
            <input type="hidden" name="actionType" value={isSignUp ? 'signup' : 'login'} />
            {isSignUp && inviteToken && (
              <input type="hidden" name="inviteToken" value={inviteToken} />
            )}

            {/* Full Name Input (Only on Sign Up Mode) */}
            {isSignUp && (
              <div className="animate-in fade-in duration-200">
                <label htmlFor="fullName" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Nama Lengkap
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-500" />
                  </div>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required={isSignUp}
                    placeholder="Nama Anda..."
                    className="block w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-150 text-sm"
                  />
                </div>
              </div>
            )}

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

            {/* Server action error display */}
            {state?.error && (
              <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-xl text-sm text-red-400 animate-in fade-in duration-200">
                {state.error}
              </div>
            )}

            {/* Server action success display (e.g. signup success redirect) */}
            {state?.success && (
              <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-sm text-emerald-400 animate-in fade-in duration-200">
                {state.success}
              </div>
            )}

            {/* Submit Button */}
            <SubmitButton isSignUp={isSignUp} />
          </form>

          {/* Toggle Tab Button */}
          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                if (state) {
                  // Clean up actionState warnings or errors by reloading or simple state clear
                  state.error = undefined;
                  state.success = undefined;
                }
              }}
              className="text-xs text-indigo-400 hover:text-indigo-350 hover:underline focus:outline-none transition-colors"
            >
              {isSignUp ? 'Sudah punya akun? Masuk di sini' : 'Belum punya akun? Daftar di sini'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
