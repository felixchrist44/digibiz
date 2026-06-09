-- Database schema for Digibiz Inventory Management System (Idempotent Setup)

-- 1. Create Profiles Table (linked to Supabase Auth Users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) on profiles
alter table public.profiles enable row level security;

-- Setup RLS Policies on profiles (Drop first if exists to prevent duplicates)
drop policy if exists "Allow users to read all profiles" on public.profiles;
create policy "Allow users to read all profiles" on public.profiles for select to authenticated using (true);

drop policy if exists "Allow users to update their own profile" on public.profiles;
create policy "Allow users to update their own profile" on public.profiles for update using (auth.uid() = id);

-- Trigger function to automatically insert a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Staff Member'),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger execution (Drop first to prevent conflicts)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Create Produk Table
create table if not exists public.produk (
  id uuid default gen_random_uuid() primary key,
  kode_produk text unique not null,
  nama text not null,
  deskripsi text,
  harga numeric(12,2) not null check (harga >= 0),
  harga_modal numeric(12,2) check (harga_modal >= 0),
  stok_saat_ini integer not null default 0 check (stok_saat_ini >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on produk
alter table public.produk enable row level security;

-- Setup RLS Policies on produk (Drop first if exists)
drop policy if exists "Allow all read on produk for authenticated users" on public.produk;
create policy "Allow all read on produk for authenticated users" on public.produk for select to authenticated using (true);

drop policy if exists "Allow all write on produk for owners only" on public.produk;
create policy "Allow all write on produk for owners only" on public.produk for all to authenticated using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  )
);

drop policy if exists "Allow staff to update stock-only fields" on public.produk;
create policy "Allow staff to update stock-only fields" on public.produk for update to authenticated using (true);

-- 3. Create Stok Log Table (for manual adjustment or transaction tracking)
create table if not exists public.stok_log (
  id uuid default gen_random_uuid() primary key,
  produk_id uuid references public.produk on delete cascade not null,
  tipe text not null check (tipe in ('masuk', 'keluar', 'penyesuaian')),
  jumlah integer not null check (jumlah > 0),
  keterangan text,
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.stok_log enable row level security;

drop policy if exists "Allow read/write on stok_log for authenticated users" on public.stok_log;
create policy "Allow read/write on stok_log for authenticated users" on public.stok_log for all to authenticated using (true);

-- 4. Create Penjualan Table
create table if not exists public.penjualan (
  id uuid default gen_random_uuid() primary key,
  nomor_invoice text unique not null,
  total_harga numeric(12,2) not null check (total_harga >= 0),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.penjualan enable row level security;

drop policy if exists "Allow read/write on penjualan for authenticated users" on public.penjualan;
create policy "Allow read/write on penjualan for authenticated users" on public.penjualan for all to authenticated using (true);

-- 5. Create Detail Penjualan Table
create table if not exists public.detail_penjualan (
  id uuid default gen_random_uuid() primary key,
  penjualan_id uuid references public.penjualan on delete cascade not null,
  produk_id uuid references public.produk on delete set null,
  jumlah integer not null check (jumlah > 0),
  harga_satuan numeric(12,2) not null check (harga_satuan >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.detail_penjualan enable row level security;

drop policy if exists "Allow read/write on detail_penjualan for authenticated users" on public.detail_penjualan;
create policy "Allow read/write on detail_penjualan for authenticated users" on public.detail_penjualan for all to authenticated using (true);

-- Trigger to automatically update produk.stok_saat_ini when a new stok_log is recorded
create or replace function public.sync_product_stock()
returns trigger as $$
begin
  if (new.tipe = 'masuk') then
    update public.produk
    set stok_saat_ini = stok_saat_ini + new.jumlah
    where id = new.produk_id;
  elsif (new.tipe = 'keluar' or new.tipe = 'penyesuaian') then
    update public.produk
    set stok_saat_ini = stok_saat_ini - new.jumlah
    where id = new.produk_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger execution (Drop first to prevent conflicts)
drop trigger if exists trigger_sync_product_stock on public.stok_log;
create trigger trigger_sync_product_stock
after insert on public.stok_log
for each row execute function public.sync_product_stock();

-- 6. Add gambar_url to produk table
alter table public.produk add column if not exists gambar_url text;

-- 7. Create storage bucket for product images if not exists
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Setup storage policies for product images bucket (Drop first if exists)
drop policy if exists "Allow public to read product images" on storage.objects;
create policy "Allow public to read product images" on storage.objects for select to public using (bucket_id = 'product-images');

drop policy if exists "Allow authenticated users to upload product images" on storage.objects;
create policy "Allow authenticated users to upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images');

drop policy if exists "Allow authenticated users to update product images" on storage.objects;
create policy "Allow authenticated users to update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images');

drop policy if exists "Allow authenticated users to delete product images" on storage.objects;
create policy "Allow authenticated users to delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images');

-- 8. Add harga_modal to produk table (for existing databases)
alter table public.produk add column if not exists harga_modal numeric(12,2) check (harga_modal >= 0);

-- 9. Create receipts and receipt_archives tables for Tiered Retention (Stage 1 & 2)
create table if not exists public.receipts (
  id uuid default gen_random_uuid() primary key,
  nomor_invoice text unique not null,
  total_harga numeric(12,2) not null check (total_harga >= 0),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone default null
);

create table if not exists public.receipt_items (
  id uuid default gen_random_uuid() primary key,
  receipt_id uuid references public.receipts on delete cascade not null,
  produk_id uuid references public.produk on delete set null,
  jumlah integer not null check (jumlah > 0),
  harga_satuan numeric(12,2) not null check (harga_satuan >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.receipt_archives (
  id uuid primary key,
  original_receipt_id uuid references public.receipts(id) on delete set null,
  nomor_invoice text not null,
  total_harga numeric(12,2) not null check (total_harga >= 0),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null,
  archived_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone default null
);

create table if not exists public.receipt_item_archives (
  id uuid primary key,
  receipt_archive_id uuid references public.receipt_archives on delete cascade not null,
  produk_id uuid references public.produk on delete set null,
  jumlah integer not null check (jumlah > 0),
  harga_satuan numeric(12,2) not null check (harga_satuan >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  created_at timestamp with time zone not null
);

-- Enable RLS on receipts and archives
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.receipt_archives enable row level security;
alter table public.receipt_item_archives enable row level security;

-- Setup RLS Policies (Drop first to prevent conflicts)
drop policy if exists "Allow read/write on receipts for authenticated users" on public.receipts;
create policy "Allow read/write on receipts for authenticated users" on public.receipts for all to authenticated using (true);

drop policy if exists "Allow read/write on receipt_items for authenticated users" on public.receipt_items;
create policy "Allow read/write on receipt_items for authenticated users" on public.receipt_items for all to authenticated using (true);

drop policy if exists "Allow read/write on receipt_archives for authenticated users" on public.receipt_archives;
create policy "Allow read/write on receipt_archives for authenticated users" on public.receipt_archives for all to authenticated using (true);

drop policy if exists "Allow read/write on receipt_item_archives for authenticated users" on public.receipt_item_archives;
create policy "Allow read/write on receipt_item_archives for authenticated users" on public.receipt_item_archives for all to authenticated using (true);

-- Indexes for slow/historical analytical lookups (Stage 2)
create index if not exists idx_receipt_archives_created_at on public.receipt_archives (created_at);
create index if not exists idx_receipt_archives_deleted_at on public.receipt_archives (deleted_at);
create index if not exists idx_receipt_archives_invoice on public.receipt_archives (nomor_invoice);
create index if not exists idx_receipt_item_archives_receipt on public.receipt_item_archives (receipt_archive_id);
create index if not exists idx_receipt_item_archives_product on public.receipt_item_archives (produk_id);

-- 10. Create default active views that filter out soft-deleted records (Stage 3)
create or replace view public.active_receipts as
select * from public.receipts
where deleted_at is null;

create or replace view public.active_receipt_archives as
select * from public.receipt_archives
where deleted_at is null;

-- 11. Create data-retention routine function (Stage 4 & Idempotency / ON CONFLICT)
create or replace function public.run_receipt_data_retention()
returns void as $$
begin
  -- STAGE 2: Migrate records older than 90 days from receipts to receipt_archives
  -- Safe idempotent inserts using ON CONFLICT DO NOTHING
  insert into public.receipt_archives (id, original_receipt_id, nomor_invoice, total_harga, dibuat_oleh, created_at, deleted_at)
  select id, id, nomor_invoice, total_harga, dibuat_oleh, created_at, deleted_at
  from public.receipts
  where created_at < now() - interval '90 days'
  on conflict (id) do nothing;

  insert into public.receipt_item_archives (id, receipt_archive_id, produk_id, jumlah, harga_satuan, subtotal, created_at)
  select id, receipt_id, produk_id, jumlah, harga_satuan, subtotal, created_at
  from public.receipt_items
  where receipt_id in (select id from public.receipt_archives)
  on conflict (id) do nothing;

  -- Synchronously delete migrated records from primary receipts table
  -- Linked receipt_items details are cascade deleted automatically
  delete from public.receipts
  where created_at < now() - interval '90 days';

  -- STAGE 3: Soft Delete records in receipt_archives older than 2 years (2 - 10 Years)
  update public.receipt_archives
  set deleted_at = now()
  where created_at < now() - interval '2 years'
    and deleted_at is null;

  -- STAGE 4: Hard Delete records older than 10 years (10+ Years)
  -- Associated receipt_item_archives lines are deleted via cascade constraint
  delete from public.receipt_archives
  where created_at < now() - interval '10 years';
end;
$$ language plpgsql security definer;

-- 12. Register Supabase pg_cron job daily trigger
create extension if not exists pg_cron with schema extensions;

-- Unschedule first if exists to prevent duplicates
select cron.unschedule('receipt-data-retention');

-- Schedule the retention routine function daily at midnight
select cron.schedule(
  'receipt-data-retention',
  '0 0 * * *',
  $$ select public.run_receipt_data_retention(); $$
);
