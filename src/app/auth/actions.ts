'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getTrustedClientIp, checkRateLimit, incrementRateLimit, resetRateLimit } from '@/lib/rate-limit';

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email dan password wajib diisi.' };
  }

  const supabase = await createClient();
  const reqHeaders = await headers();
  const ip = getTrustedClientIp(reqHeaders);
  const normalizedEmail = email.trim().toLowerCase();

  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${normalizedEmail}`;

  // Check rate limits BEFORE authenticating (check-only, does not increment counter)
  const ipCheck = await checkRateLimit(supabase, ipKey, 20, 900); // 20 attempts per 15 min
  const emailCheck = await checkRateLimit(supabase, emailKey, 15, 900); // 15 failures per 15 min

  if (!ipCheck.allowed || !emailCheck.allowed) {
    return { error: 'Terlalu banyak percobaan masuk. Silakan coba lagi beberapa saat lagi.' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Only increment failure counters on failed authentication attempt
    await incrementRateLimit(supabase, ipKey, 20, 900);
    await incrementRateLimit(supabase, emailKey, 15, 900);

    // Translate common auth errors to Indonesian for better UX
    let message = error.message;
    if (error.message.includes('Invalid login credentials')) {
      message = 'Email atau password salah.';
    }
    return { error: message };
  }

  // Clear failure counter on successful login so legitimate owners never lock themselves out
  await resetRateLimit(supabase, emailKey);

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signup(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;
  const inviteToken = formData.get('inviteToken') as string;
  const namaToko = formData.get('namaToko') as string;

  if (!email || !password || !fullName) {
    return { error: 'Semua kolom wajib diisi.' };
  }

  if (!inviteToken && !namaToko) {
    return { error: 'Nama toko wajib diisi untuk pendaftaran baru.' };
  }

  if (password.length < 8) {
    return { error: 'Kata sandi minimal harus 8 karakter.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: inviteToken ? 'staff' : 'owner',
        invite_token: inviteToken || undefined,
        nama_toko: inviteToken ? undefined : (namaToko || 'Toko Baru'),
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: inviteToken ? 'Pendaftaran berhasil! Silakan masuk untuk bergabung.' : 'Pendaftaran berhasil! Silakan masuk dengan akun baru Anda.' };
}

export async function authenticate(prevState: any, formData: FormData) {
  const actionType = formData.get('actionType') as string;
  if (actionType === 'signup') {
    return await signup(prevState, formData);
  } else {
    return await login(prevState, formData);
  }
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
