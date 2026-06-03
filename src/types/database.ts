export type UserRole = 'owner' | 'staff';

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface CustomUser {
  id: string;
  email?: string;
  full_name: string | null;
  role: UserRole;
}

export interface Produk {
  id: string;
  kode_produk: string;
  nama: string;
  deskripsi: string | null;
  harga: number;
  stok_saat_ini: number;
  gambar_url: string | null;
  created_at: string;
}

export interface StokLog {
  id: string;
  produk_id: string;
  tipe: 'masuk' | 'keluar' | 'penyesuaian';
  jumlah: number;
  keterangan: string | null;
  dibuat_oleh: string | null;
  created_at: string;
  produk?: {
    nama: string;
  };
  profiles?: {
    full_name: string | null;
  };
}

export interface Penjualan {
  id: string;
  nomor_invoice: string;
  total_harga: number;
  dibuat_oleh: string | null;
  created_at: string;
  profiles?: {
    full_name: string | null;
  };
  details?: DetailPenjualan[];
}

export interface DetailPenjualan {
  id: string;
  penjualan_id: string;
  produk_id: string | null;
  jumlah: number;
  harga_satuan: number;
  subtotal: number;
  created_at: string;
  produk?: {
    nama: string;
  };
}
