import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    const supabase = await createClient();

    let dbQuery = supabase
      .from('produk')
      .select('id, nama, kode_produk, harga, stok_saat_ini')
      .order('nama', { ascending: true })
      .limit(12);

    if (query.trim()) {
      dbQuery = dbQuery.or(`nama.ilike.%${query.trim()}%,kode_produk.ilike.%${query.trim()}%`);
    }

    const { data, error } = await dbQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
