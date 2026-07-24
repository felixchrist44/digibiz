export function getTrustedClientIp(headers: Headers): string {
  const xRealIp = headers.get('x-real-ip');
  if (xRealIp && xRealIp.trim()) {
    return xRealIp.trim();
  }
  const xff = headers.get('x-forwarded-for');
  if (xff && xff.trim()) {
    // Extract first IP in x-forwarded-for header chain
    const firstIp = xff.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  return '127.0.0.1';
}

export async function checkRateLimit(
  supabase: any,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; reset_seconds: number }> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (error || !data) {
      console.error('Rate limit check RPC error:', error?.message);
      // Fail closed gracefully on DB error
      return { allowed: false, remaining: 0, reset_seconds: windowSeconds };
    }

    return {
      allowed: Boolean(data.allowed),
      remaining: typeof data.remaining === 'number' ? data.remaining : 0,
      reset_seconds: typeof data.reset_seconds === 'number' ? data.reset_seconds : windowSeconds,
    };
  } catch (err) {
    console.error('Rate limit check exception:', err);
    return { allowed: false, remaining: 0, reset_seconds: windowSeconds };
  }
}

export async function incrementRateLimit(
  supabase: any,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; reset_seconds: number }> {
  try {
    const { data, error } = await supabase.rpc('increment_rate_limit', {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (error || !data) {
      console.error('Rate limit increment RPC error:', error?.message);
      return { allowed: false, remaining: 0, reset_seconds: windowSeconds };
    }

    return {
      allowed: Boolean(data.allowed),
      remaining: typeof data.remaining === 'number' ? data.remaining : 0,
      reset_seconds: typeof data.reset_seconds === 'number' ? data.reset_seconds : windowSeconds,
    };
  } catch (err) {
    console.error('Rate limit increment exception:', err);
    return { allowed: false, remaining: 0, reset_seconds: windowSeconds };
  }
}

export async function resetRateLimit(supabase: any, key: string): Promise<void> {
  try {
    await supabase.rpc('reset_rate_limit', { p_key: key });
  } catch (err) {
    console.error('Rate limit reset exception:', err);
  }
}
