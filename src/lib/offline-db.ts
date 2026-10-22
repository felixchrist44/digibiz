/**
 * Offline Storage & IndexedDB Layer (`digibiz_pos_db`)
 * Foundation storage module with zero external dependencies.
 */

export interface OfflineSaleItem {
  produk_id: string;
  nama: string;
  harga_satuan: number;
  jumlah: number;
}

/**
 * Status ownership rules:
 * - 'pending': awaiting sync (network failure or not yet attempted). Set at checkout enqueue or when reset for retry.
 * - 'synced': server confirmed, real invoice assigned. Set by SyncProvider or PenjualanClient on success.
 * - 'rejected': immediate-attempt business error (ONLY set by PenjualanClient). No retry, no goods moved.
 * - 'needs_review': sync-time failure (ONLY set by SyncProvider). Requires owner review or manual retry.
 */
export type OfflineSaleStatus = 'pending' | 'synced' | 'rejected' | 'needs_review';

export interface OfflineSaleRecord {
  idempotency_key: string;       // Primary Key (UUID v4, generated ONCE at checkout)
  items: OfflineSaleItem[];
  total_harga: number;
  tax_amount: number;
  tax_enabled: boolean;
  payment_method: 'cash' | 'qris';
  shift_id: string | null;
  dibuat_oleh: string;
  client_created_at: string;     // ISO timestamp of original checkout
  offline_invoice_number: string; // OFFLINE-{first 8 chars of key}
  status: OfflineSaleStatus;
  last_error: string | null;     // Human-readable error
  error_code: string | null;     // Machine-readable code (e.g. 'PRODUK_INVALID')
  sync_attempts: number;
  created_at: string;            // ISO timestamp when enqueued
  synced_at: string | null;      // ISO timestamp when successfully synced
  server_invoice_id: string | null;   // UUID returned from RPC on success
  server_nomor_invoice: string | null; // Real invoice number assigned by server
}

export interface CachedProduct {
  id: string;
  kode_produk: string;
  nama: string;
  harga: number;
  stok_saat_ini: number;
  updated_at: string;
}

export interface CachedSettings {
  tenant_id: string;
  store_name: string;
  store_address: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  tax_enabled: boolean;
  tax_rate: number;
  updated_at: string;
}

const DB_NAME = 'digibiz_pos_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDB(): IDBFactory | null {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  return null;
}

/**
 * Initialize IndexedDB connection & upgrade schema.
 * Automatically runs pruneOutbox() on open.
 */
export async function initDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const idb = getIndexedDB();
    if (!idb) {
      return reject(new Error('IndexedDB tidak didukung di lingkungan ini.'));
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // 1. Store: offline_sales
      if (!db.objectStoreNames.contains('offline_sales')) {
        const store = db.createObjectStore('offline_sales', { keyPath: 'idempotency_key' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
        store.createIndex('offline_invoice_number', 'offline_invoice_number', { unique: false });
        store.createIndex('shift_id', 'shift_id', { unique: false });
      }

      // 2. Store: cached_products
      if (!db.objectStoreNames.contains('cached_products')) {
        const store = db.createObjectStore('cached_products', { keyPath: 'id' });
        store.createIndex('kode_produk', 'kode_produk', { unique: false });
        store.createIndex('nama', 'nama', { unique: false });
      }

      // 3. Store: cached_settings
      if (!db.objectStoreNames.contains('cached_settings')) {
        db.createObjectStore('cached_settings', { keyPath: 'tenant_id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  }).then(async (db) => {
    // Run housekeeping prune on DB startup
    try {
      await pruneOutboxInternal(db);
    } catch (err) {
      console.warn('Prune outbox startup housekeeping failed:', err);
    }
    return db;
  });

  return dbPromise;
}

/**
 * Internal helper for pruning outbox on a database instance.
 */
async function pruneOutboxInternal(db: IDBDatabase): Promise<{ pruned: number }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const request = store.openCursor();
    
    let pruned = 0;
    const now = Date.now();
    const NinetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const TwentyFourHoursMs = 24 * 60 * 60 * 1000;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const record: OfflineSaleRecord = cursor.value;

        if (record.status === 'synced') {
          // Retention: synced deleted after 90 days
          const syncedTime = record.synced_at ? new Date(record.synced_at).getTime() : new Date(record.created_at).getTime();
          if (now - syncedTime > NinetyDaysMs) {
            cursor.delete();
            pruned++;
          }
        } else if (record.status === 'rejected') {
          // Retention: rejected deleted after 24 hours
          const createdTime = new Date(record.created_at).getTime();
          if (now - createdTime > TwentyFourHoursMs) {
            cursor.delete();
            pruned++;
          }
        }
        // 'pending' and 'needs_review' are NEVER deleted

        cursor.continue();
      } else {
        resolve({ pruned });
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Public function to prune old synced/rejected outbox records.
 */
export async function pruneOutbox(): Promise<{ pruned: number }> {
  const db = await initDB();
  return pruneOutboxInternal(db);
}

/**
 * Enqueue a new offline sale into outbox as status: 'pending'.
 */
export async function queueOfflineSale(
  sale: Omit<OfflineSaleRecord, 'status' | 'last_error' | 'error_code' | 'sync_attempts' | 'synced_at' | 'server_invoice_id' | 'server_nomor_invoice'>
): Promise<OfflineSaleRecord> {
  const db = await initDB();
  const record: OfflineSaleRecord = {
    ...sale,
    status: 'pending',
    last_error: null,
    error_code: null,
    sync_attempts: 0,
    synced_at: null,
    server_invoice_id: null,
    server_nomor_invoice: null
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const request = store.add(record);

    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all 'pending' sales, ordered by created_at ASC (FIFO).
 */
export async function getPendingSales(): Promise<OfflineSaleRecord[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readonly');
    const store = tx.objectStore('offline_sales');
    const index = store.index('created_at');
    const request = index.getAll();

    request.onsuccess = () => {
      const records: OfflineSaleRecord[] = request.result || [];
      const pending = records.filter(r => r.status === 'pending');
      pending.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      resolve(pending);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all 'needs_review' sales.
 */
export async function getNeedsReviewSales(): Promise<OfflineSaleRecord[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readonly');
    const store = tx.objectStore('offline_sales');
    const index = store.index('status');
    const request = index.getAll('needs_review');

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all offline sales (all statuses).
 */
export async function getAllOfflineSales(): Promise<OfflineSaleRecord[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readonly');
    const store = tx.objectStore('offline_sales');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single record by idempotency_key.
 */
export async function getSaleByKey(key: string): Promise<OfflineSaleRecord | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readonly');
    const store = tx.objectStore('offline_sales');
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Search outbox by offline_invoice_number (e.g. 'OFFLINE-a3f7b2c1').
 */
export async function findSaleByOfflineInvoice(offlineNum: string): Promise<OfflineSaleRecord | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readonly');
    const store = tx.objectStore('offline_sales');
    const index = store.index('offline_invoice_number');
    const request = index.get(offlineNum);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mark a sale as 'synced'.
 */
export async function markSynced(key: string, invoiceId: string, nomorInvoice: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const getReq = store.get(key);

    getReq.onsuccess = () => {
      const record: OfflineSaleRecord = getReq.result;
      if (!record) return reject(new Error(`Sale record ${key} tidak ditemukan.`));

      record.status = 'synced';
      record.synced_at = new Date().toISOString();
      record.server_invoice_id = invoiceId;
      record.server_nomor_invoice = nomorInvoice;
      record.last_error = null;
      record.error_code = null;

      const updateReq = store.put(record);
      updateReq.onsuccess = () => resolve();
      updateReq.onerror = () => reject(updateReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Mark a sale as 'rejected'.
 * OWNERSHIP RULE: MUST ONLY be called by PenjualanClient during immediate-attempt failures.
 */
export async function markRejected(key: string, error: string, code: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const getReq = store.get(key);

    getReq.onsuccess = () => {
      const record: OfflineSaleRecord = getReq.result;
      if (!record) return reject(new Error(`Sale record ${key} tidak ditemukan.`));

      record.status = 'rejected';
      record.last_error = error;
      record.error_code = code;

      const updateReq = store.put(record);
      updateReq.onsuccess = () => resolve();
      updateReq.onerror = () => reject(updateReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Mark a sale as 'needs_review'.
 * OWNERSHIP RULE: MUST ONLY be called by SyncProvider during sync failures.
 */
export async function markNeedsReview(key: string, error: string, code: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const getReq = store.get(key);

    getReq.onsuccess = () => {
      const record: OfflineSaleRecord = getReq.result;
      if (!record) return reject(new Error(`Sale record ${key} tidak ditemukan.`));

      record.status = 'needs_review';
      record.last_error = error;
      record.error_code = code;

      const updateReq = store.put(record);
      updateReq.onsuccess = () => resolve();
      updateReq.onerror = () => reject(updateReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Reset a 'needs_review' or failed sale back to 'pending' for manual retry.
 */
export async function markPendingForRetry(key: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const getReq = store.get(key);

    getReq.onsuccess = () => {
      const record: OfflineSaleRecord = getReq.result;
      if (!record) return reject(new Error(`Sale record ${key} tidak ditemukan.`));

      record.status = 'pending';
      record.last_error = null;
      record.error_code = null;

      const updateReq = store.put(record);
      updateReq.onsuccess = () => resolve();
      updateReq.onerror = () => reject(updateReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Remove an offline sale from IndexedDB.
 */
export async function removeOfflineSale(key: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get count of unsynced sales (status === 'pending').
 */
export async function getPendingCount(): Promise<number> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readonly');
    const store = tx.objectStore('offline_sales');
    const index = store.index('status');
    const request = index.count('pending');

    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get count of unsynced sales for a specific shift (status === 'pending' || status === 'needs_review').
 */
export async function getUnsyncedCountForShift(shiftId: string): Promise<number> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readonly');
    const store = tx.objectStore('offline_sales');
    const request = store.getAll();

    request.onsuccess = () => {
      const records: OfflineSaleRecord[] = request.result || [];
      const count = records.filter(
        r => r.shift_id === shiftId && (r.status === 'pending' || r.status === 'needs_review')
      ).length;
      resolve(count);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Bulk seed/cache products in IndexedDB.
 */
export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_products', 'readwrite');
    const store = tx.objectStore('cached_products');

    for (const p of products) {
      store.put(p);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all cached products.
 */
export async function getCachedProducts(): Promise<CachedProduct[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_products', 'readonly');
    const store = tx.objectStore('cached_products');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Search cached products by name or SKU substring match.
 */
export async function searchCachedProducts(query: string): Promise<CachedProduct[]> {
  const db = await initDB();
  const q = query.trim().toLowerCase();
  if (!q) return getCachedProducts();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_products', 'readonly');
    const store = tx.objectStore('cached_products');
    const request = store.getAll();

    request.onsuccess = () => {
      const all: CachedProduct[] = request.result || [];
      const filtered = all.filter(
        p => p.nama.toLowerCase().includes(q) || p.kode_produk.toLowerCase().includes(q)
      );
      resolve(filtered);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Lookup cached product by SKU/kode_produk.
 */
export async function getCachedProductBySku(sku: string): Promise<CachedProduct | null> {
  const db = await initDB();
  const trimmed = sku.trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_products', 'readonly');
    const store = tx.objectStore('cached_products');
    const index = store.index('kode_produk');
    const request = index.get(trimmed);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Cache tenant settings.
 */
export async function cacheSettings(settings: CachedSettings): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_settings', 'readwrite');
    const store = tx.objectStore('cached_settings');
    const request = store.put(settings);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get cached tenant settings.
 */
export async function getCachedSettings(tenantId: string): Promise<CachedSettings | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_settings', 'readonly');
    const store = tx.objectStore('cached_settings');
    const request = store.get(tenantId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
