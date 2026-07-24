import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getTrustedClientIp, incrementRateLimit } from '@/lib/rate-limit';

function sanitizePostgrestSearch(input: string): string {
  // Double quoting the value in PostgREST filters protects against grammar injection (, ) . *).
  // Escape backslashes and double quotes inside the string literal.
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    const supabase = await createClient();

    // Key rate limit by verified header x-user-id if available (from proxy middleware), fallback to IP
    const headers = request.headers;
    const xUserId = headers.get('x-user-id');
    const ip = getTrustedClientIp(headers);
    const rateLimitKey = xUserId ? `search:user:${xUserId}` : `search:ip:${ip}`;

    // Apply rate limit: 60 requests per 10 seconds (abuse ceiling for fast cashier typing)
    const limitResult = await incrementRateLimit(supabase, rateLimitKey, 60, 10);
    if (!limitResult.allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan search. Silakan tunggu beberapa saat.' },
        {
          status: 429,
          headers: {
            'Retry-After': '10',
          },
        }
      );
    }

    let dbQuery = supabase
      .from('produk')
      .select('id, nama, kode_produk, harga, stok_saat_ini')
      .order('nama', { ascending: true })
      .limit(12);

    if (query.trim()) {
      const sanitized = sanitizePostgrestSearch(query.trim());
      dbQuery = dbQuery.or(`nama.ilike."%${sanitized}%",kode_produk.ilike."%${sanitized}%"`);
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
