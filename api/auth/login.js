import { createClient } from '@supabase/supabase-js';

const COOKIE = '__Host-bb_session';

function authClient() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const email = request.body?.email;
  const password = request.body?.password;
  if (typeof email !== 'string' || typeof password !== 'string'
      || !email.trim() || !password) {
    return response.status(400).json({ error: 'INVALID_LOGIN_INPUT' });
  }

  let supabase;
  try { supabase = authClient(); } catch { supabase = null; }
  if (!supabase) return response.status(500).json({ error: 'SERVER_CONFIGURATION_MISSING' });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data?.session?.access_token) {
    return response.status(401).json({
      error: 'LOGIN_FAILED',
      message: error?.message ?? '로그인에 실패했습니다.',
    });
  }

  const maxAge = Number.isFinite(data.session.expires_in)
    ? Math.max(1, Math.min(Math.floor(data.session.expires_in), 3600))
    : 3600;
  response.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(data.session.access_token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
  return response.status(200).json({ authenticated: true });
}
