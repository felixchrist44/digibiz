'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email dan password wajib diisi.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Translate common auth errors to Indonesian for better UX
    let message = error.message;
    if (error.message.includes('Invalid login credentials')) {
      message = 'Email atau password salah.';
    }
    return { error: message };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signup(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;
  const inviteToken = formData.get('inviteToken') as string;

  if (!email || !password || !fullName) {
    return { error: 'Semua kolom wajib diisi.' };
  }

  if (password.length < 6) {
    return { error: 'Kata sandi minimal harus 6 karakter.' };
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
