'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  getPendingSales,
  markSynced,
  markNeedsReview,
  getPendingCount,
  getNeedsReviewSales,
  OfflineSaleRecord
} from '@/lib/offline-db';
import { syncOfflineSale } from '@/app/dashboard/penjualan/actions';

export interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  needsReviewCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  lastSyncResult: { synced: number; needsReview: number; failed: number } | null;
  triggerManualSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return navigator.onLine;
    return true;
  });

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [needsReviewCount, setNeedsReviewCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    synced: number;
    needsReview: number;
    failed: number;
  } | null>(null);

  const isSyncingRef = useRef<boolean>(false);

  // Perform lightweight connectivity ping
  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return true;
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('/api/ping', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const online = res.ok;
      setIsOnline(online);
      return online;
    } catch {
      setIsOnline(false);
      return false;
    }
  }, []);

  // Update outbox counters
  const refreshCounts = useCallback(async () => {
    try {
      const pCount = await getPendingCount();
      const nrSales = await getNeedsReviewSales();
      setPendingCount(pCount);
      setNeedsReviewCount(nrSales.length);
    } catch (err) {
      console.warn('Gagal membaca jumlah outbox offline:', err);
    }
  }, []);

  /**
   * Main sequential sync loop.
   * CONSTRAINTS ENFORCED:
   * 1. Reads idempotency_key strictly from stored record — NEVER regenerates.
   * 2. SYNC ENGINE NEVER MARKS REJECTED — all non-network business errors → markNeedsReview.
   * 3. Three-way network error branch:
   *    - Genuine outage (ping fails) → stop queue immediately (break).
   *    - Online + attempts >= 5 → markNeedsReview + continue to next item (head-of-line escape).
   *    - Online + attempts < 5 → leave pending + continue to next item.
   */
  const processSyncQueue = useCallback(async () => {
    if (isSyncingRef.current) return;

    // First check connectivity
    const online = await checkConnectivity();
    if (!online) {
      await refreshCounts();
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    let synced = 0;
    let needsReview = 0;
    let failed = 0;

    try {
      const pendingRecords: OfflineSaleRecord[] = await getPendingSales();

      for (const record of pendingRecords) {
        // ALWAYS read idempotency_key from stored record — NEVER regenerate!
        const key = record.idempotency_key;
        const currentAttempts = (record.sync_attempts || 0) + 1;

        try {
          const res = await syncOfflineSale({
            idempotency_key: key,
            items: record.items,
            total_harga: record.total_harga,
            tax_amount: record.tax_amount,
            tax_enabled: record.tax_enabled,
            payment_method: record.payment_method,
            shift_id: record.shift_id,
            dibuat_oleh: record.dibuat_oleh,
            client_created_at: record.client_created_at
          });

          if (res.success && res.invoice_id && res.nomor_invoice) {
            // SUCCESS -> Mark synced
            await markSynced(key, res.invoice_id, res.nomor_invoice);
            synced++;
          } else {
            // Error returned from server action
            const errCode = res.code || 'SYNC_ERROR';
            const errMsg = res.error || 'Terjadi kesalahan saat menyelaraskan transaksi.';

            // RULE: Sync engine NEVER marks 'rejected'! All business rejections -> markNeedsReview
            await markNeedsReview(key, errMsg, errCode);
            needsReview++;
          }
        } catch (netErr: any) {
          // Network level exception during fetch
          failed++;
          const pingOnline = await checkConnectivity();

          if (!pingOnline) {
            // 1. Genuine network outage -> stop processing queue immediately
            break;
          } else if (currentAttempts >= 5) {
            // 2. Online + attempts >= 5 -> Head-of-line escape -> markNeedsReview + continue
            await markNeedsReview(
              key,
              `Gagal terhubung ke server setelah ${currentAttempts} kali percobaan.`,
              'NETWORK_TIMEOUT'
            );
            needsReview++;
          } else {
            // 3. Online + attempts < 5 -> Leave pending + continue to next item
            // (Record remains pending for next retry cycle)
          }
        }
      }
    } catch (err) {
      console.error('Kesalahan fatal pada sync loop:', err);
    } finally {
      await refreshCounts();
      setLastSyncTime(new Date());
      setLastSyncResult({ synced, needsReview, failed });
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [checkConnectivity, refreshCounts]);

  const triggerManualSync = useCallback(async () => {
    await processSyncQueue();
  }, [processSyncQueue]);

  // Initial counts & periodic 15-second connectivity ping
  useEffect(() => {
    refreshCounts();

    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    const intervalId = setInterval(() => {
      checkConnectivity().then((online) => {
        if (online) {
          processSyncQueue();
        }
      });
    }, 15000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      clearInterval(intervalId);
    };
  }, [checkConnectivity, processSyncQueue, refreshCounts]);

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        pendingCount,
        needsReviewCount,
        isSyncing,
        lastSyncTime,
        lastSyncResult,
        triggerManualSync
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncManager() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSyncManager must be used within a SyncProvider');
  }
  return context;
}
