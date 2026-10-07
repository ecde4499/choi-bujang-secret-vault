import { readFileSync } from 'node:fs';
import { createLoginVerifier } from '../../src/verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../../aleph.config.json', import.meta.url), 'utf8'));
const COOKIE = '__Host-bb_session';

function cookieToken(request) {
  const raw = request.headers?.cookie;
  if (typeof raw !== 'string') return null;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) {
      const value = rest.join('=');
      try { return decodeURIComponent(value); } catch { return value; }
    }
  }
  return null;
}

function loginVerifier() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return null;
  return createLoginVerifier({ config, supabaseSecretKey: secretKey });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  let verifyLogin;
  try { verifyLogin = loginVerifier(); } catch { verifyLogin = null; }
  if (!verifyLogin) return response.status(500).json({ error: 'SERVER_CONFIGURATION_MISSING' });

  const authorization = request.headers?.authorization
    ?? (cookieToken(request) ? `Bearer ${cookieToken(request)}` : undefined);
  const principal = await verifyLogin(authorization);
  if (!principal) return response.status(401).json({ error: 'UNAUTHORIZED' });

  return response.status(200).json({ authenticated: true });
}
