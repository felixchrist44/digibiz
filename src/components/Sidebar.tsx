'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/app/auth/actions';
import { UserRole } from '@/types/database';
import { canViewAudit, canViewFinancials, canManageUsers, canManageSettings } from '@/utils/permissions';
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
  Shield,
  Barcode,
  ShoppingCart,
  Camera,
  BarChart3,
  Settings
} from 'lucide-react';

interface SidebarProps {
  user: {
    email?: string;
    full_name: string | null;
    role: UserRole;
  };
  children: React.ReactNode;
}

export default function Sidebar({ user, children }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Global scanner buffering & redirection to checkout
  const keyBufferRef = useRef<{ char: string; time: number }[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If the user is already on Transaksi Penjualan, delegate the scanning logic directly to PenjualanClient
      if (pathname === '/dashboard/penjualan') {
        return;
      }

      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable
      );

      if (e.key === 'Enter') {
        const now = performance.now();
        const buffer = keyBufferRef.current;
        
        if (buffer.length > 0) {
          // Check inter-character timings (<30ms)
          let isScanner = true;
          for (let i = 1; i < buffer.length; i++) {
            if (buffer[i].time - buffer[i - 1].time > 30) {
              isScanner = false;
              break;
            }
          }

          // Ensure Enter also arrived within 30ms of last char
          if (now - buffer[buffer.length - 1].time > 30) {
            isScanner = false;
          }

          // If verified as hardware barcode scanner scan, redirect automatically
          if (isScanner && buffer.length >= 3) {
            e.preventDefault();
            const sku = buffer.map(b => b.char).join('');
            
            // Clean up any focused text fields to prevent garbage values
            if (isInputFocused && activeEl) {
              (activeEl as HTMLInputElement).value = '';
              (activeEl as HTMLInputElement).blur();
            }

            // Redirect automatically to the Transaksi Penjualan view with query parameter
            router.push(`/dashboard/penjualan?scan=${encodeURIComponent(sku)}`);
          }
        }
        keyBufferRef.current = [];
      } else if (e.key.length === 1) {
        const now = performance.now();
        
        // Idle delay check (>30ms) to reset manual keyboard typing buffer
        if (keyBufferRef.current.length > 0) {
          const lastTime = keyBufferRef.current[keyBufferRef.current.length - 1].time;
          if (now - lastTime > 30) {
            keyBufferRef.current = [];
          }
        }
        keyBufferRef.current.push({ char: e.key, time: now });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pathname, router]);

  const menuItems = [
    { name: 'Ringkasan', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Daftar Produk', href: '/dashboard/produk', icon: Package },
    { name: 'Pemindai Mobile', href: '/dashboard/scan', icon: Camera },
    { name: 'Transaksi Penjualan', href: '/dashboard/penjualan', icon: ShoppingCart },
    { name: 'Riwayat Penjualan', href: '/dashboard/riwayat-penjualan', icon: History },
    { name: 'Riwayat Aktivitas', href: '/dashboard/aktivitas', icon: History },
    { name: 'Laporan Keuangan', href: '/dashboard/laporan', icon: BarChart3 },
    { name: 'Pengguna', href: '/dashboard/users', icon: Users },
    { name: 'Pengaturan Struk', href: '/dashboard/pengaturan', icon: Settings },
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
              ) : user.role === 'manager' ? (
                <>
                  <ShieldCheck className="h-3 w-3 text-blue-400" />
                  Manager
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
            // Hide menu items dynamically based on permission matrices
            if (item.href === '/dashboard/laporan' && !canViewFinancials(user.role)) {
              return null;
            }
            if (item.href === '/dashboard/aktivitas' && !canViewAudit(user.role)) {
              return null;
            }
            if (item.href === '/dashboard/users' && !canManageUsers(user.role)) {
              return null;
            }
            if (item.href === '/dashboard/pengaturan' && !canManageSettings(user.role)) {
              return null;
            }
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
