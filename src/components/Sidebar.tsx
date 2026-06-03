'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/auth/actions';
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  History,
  Users,
  LogOut,
  Menu,
  X,
  User,
  ShieldCheck,
  Shield
} from 'lucide-react';

interface SidebarProps {
  user: {
    email?: string;
    full_name: string | null;
    role: 'owner' | 'staff';
  };
  children: React.ReactNode;
}

export default function Sidebar({ user, children }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const menuItems = [
    { name: 'Ringkasan', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Daftar Produk', href: '/dashboard/produk', icon: Package },
    { name: 'Transaksi Penjualan', href: '/dashboard/penjualan', icon: TrendingUp },
    { name: 'Riwayat Stok', href: '/dashboard/stok', icon: History },
    { name: 'Pengguna', href: '/dashboard/users', icon: Users },
  ];

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100 font-sans">
      {/* Mobile Header Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-indigo-400" />
          <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">DigiBiz</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-slate-400 hover:text-white focus:outline-none"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Panel (Desktop & Mobile Drawer) */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 w-64 bg-slate-900/50 backdrop-blur-xl border-r border-slate-800/80 flex flex-col z-50 transform lg:transform-none transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand/Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-850/50 lg:h-20">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-indigo-500 animate-pulse" />
            <span className="font-extrabold text-xl tracking-tight text-white">DigiBiz</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User profile Summary */}
        <div className="p-4 mx-3 my-4 bg-slate-950/40 border border-slate-800/50 rounded-2xl flex items-center gap-3 shadow-inner">
          <div className="h-10 w-10 rounded-xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400 truncate">{user.full_name || user.email || 'Staff'}</p>
            <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-750">
              {user.role === 'owner' ? (
                <>
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Owner
                </>
              ) : (
                <>
                  <Shield className="h-3 w-3 text-indigo-400" />
                  Staff
                </>
              )}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-600/10 text-white border-l-2 border-indigo-500 font-semibold'
                    : 'text-slate-450 hover:bg-slate-850 hover:text-slate-200'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-400' : 'text-slate-450 group-hover:text-slate-300'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Logout Section */}
        <div className="p-4 border-t border-slate-850/50">
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-150 active:scale-[0.98]"
          >
            <LogOut className="h-5 w-5" />
            Keluar Akun
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden pt-16 lg:pt-0">
        <main className="flex-1 p-6 md:p-8 lg:p-10 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
