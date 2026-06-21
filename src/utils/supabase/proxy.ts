import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            });
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser();

  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard');
  const isLogin = request.nextUrl.pathname.startsWith('/login');

  if (isDashboard && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (isLogin && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = user ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }

  // Fetch the user's profile info to forward to Server Components
  let profile = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('id, tenant_id, full_name, role, created_at')
      .eq('id', user.id)
      .single();
    profile = data;
  }

  // Set up custom request headers to avoid duplicate database/auth checks in Server Components
  const requestHeaders = new Headers(request.headers);
  
  // Security: Strip client-supplied headers to prevent authentication spoofing/bypass
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-email');
  requestHeaders.delete('x-user-tenant-id');
  requestHeaders.delete('x-user-full-name');
  requestHeaders.delete('x-user-role');
  requestHeaders.delete('x-user-created-at');

  if (user) {
    requestHeaders.set('x-user-id', user.id);
    requestHeaders.set('x-user-email', user.email || '');
    if (profile) {
      requestHeaders.set('x-user-tenant-id', profile.tenant_id || '');
      requestHeaders.set('x-user-full-name', profile.full_name || '');
      requestHeaders.set('x-user-role', profile.role || '');
      requestHeaders.set('x-user-created-at', profile.created_at || '');
    }
  }

  const finalResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Transfer any set-cookie headers (auth token refresh) to finalResponse
  if (response.headers.has('set-cookie')) {
    response.headers.getSetCookie().forEach((cookieVal) => {
      finalResponse.headers.append('set-cookie', cookieVal);
    });
  }

  return finalResponse;
}
