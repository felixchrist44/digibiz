import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    // 1. Guard the endpoint using a CRON_SECRET token via headers
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is configured, enforce strict token checking
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing authorization token.' },
        { status: 401 }
      );
    }

    // 2. Parse query parameters (e.g. ?dryRun=true)
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    // Use Service Role Key for background administrative task if configured; fallback to Anon key
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    // 3. Database Reference Scan: Fetch all active product image URLs
    const { data: products, error: dbError } = await supabase
      .from('produk')
      .select('gambar_url')
      .not('gambar_url', 'is', null);

    if (dbError) {
      return NextResponse.json(
        { error: `Database reference scan failed: ${dbError.message}` },
        { status: 500 }
      );
    }

    // Map database image URLs to file name sets
    const activeFileNames = new Set<string>();
    if (products) {
      for (const p of products) {
        if (p.gambar_url) {
          const fileName = p.gambar_url.split('/').pop();
          if (fileName) {
            activeFileNames.add(fileName);
          }
        }
      }
    }

    // 4. Storage Batched Processing: Scan bucket files in chunks
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    const orphansToDelete: string[] = [];
    let totalScanned = 0;

    const now = Date.now();
    const gracePeriodMs = 24 * 60 * 60 * 1000; // 24-hour grace period

    while (hasMore) {
      const { data: files, error: storageError } = await supabase.storage
        .from('product-images')
        .list('', {
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (storageError) {
        return NextResponse.json(
          { error: `Storage list scan failed at offset ${offset}: ${storageError.message}` },
          { status: 500 }
        );
      }

      if (!files || files.length === 0) {
        hasMore = false;
        break;
      }

      for (const file of files) {
        totalScanned++;
        // Skip directory indicators or placeholders
        if (!file.name || file.metadata?.mimetype === 'placeholder') continue;

        const isActive = activeFileNames.has(file.name);

        // 5. 24-Hour Grace Period Check using file creation metadata
        const createdAt = file.created_at ? new Date(file.created_at).getTime() : 0;
        const isOutsideGrace = (now - createdAt) > gracePeriodMs;

        if (!isActive && isOutsideGrace) {
          orphansToDelete.push(file.name);
        }
      }

      if (files.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    let deletedFiles: string[] = [];
    let deleteCount = 0;

    // 6. Delete orphans in chunks to avoid URL size limits and keep execution light
    if (!dryRun && orphansToDelete.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < orphansToDelete.length; i += batchSize) {
        const chunk = orphansToDelete.slice(i, i + batchSize);
        const { error: removeError } = await supabase.storage
          .from('product-images')
          .remove(chunk);

        if (removeError) {
          console.error(`Failed to remove batch starting at index ${i}: ${removeError.message}`);
        } else {
          deletedFiles.push(...chunk);
          deleteCount += chunk.length;
        }
      }
    }

    // 7. Structured JSON Summary response for audit logs
    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        totalScanned,
        activeInDatabase: activeFileNames.size,
        orphansFound: orphansToDelete.length,
        deleted: dryRun ? 0 : deleteCount,
        files: dryRun ? orphansToDelete : deletedFiles
      }
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: `Unexpected cron task failure: ${err.message || err}` },
      { status: 500 }
    );
  }
}
