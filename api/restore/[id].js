import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { restorePrivateNote } from '../../src/recovery.mjs';
import { createLoginVerifier } from '../../src/verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../../aleph.config.json', import.meta.url), 'utf8'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const COOKIE = '__Host-bb_session';

function requestAuthorization(request) {
  if (typeof request.headers?.authorization === 'string' && request.headers.authorization.trim()) {
    return request.headers.authorization;
  }
  const raw = request.headers?.cookie;
  if (typeof raw !== 'string') return undefined;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== COOKIE) continue;
    const encoded = rest.join('=');
    let token = encoded;
    try { token = decodeURIComponent(encoded); } catch { /* keep raw cookie value */ }
    return token ? `Bearer ${token}` : undefined;
  }
  return undefined;
}

function serverTools() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return null;
  return {
    verifyLogin: createLoginVerifier({ config, supabaseSecretKey: secretKey }),
    supabase: createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  };
}

function restoreId(request) {
  const value = Array.isArray(request.query?.id) ? null : request.query?.id;
  if (typeof request.url !== 'string') {
    return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
  }

  let target;
  try { target = new URL(request.url, 'https://local-request.invalid'); } catch { return null; }
  if (target.pathname.includes('%') || target.pathname.includes('..')
      || target.pathname.includes('\\')) return null;

  const match = /^\/api\/restore\/([^/]+)\/?$/u.exec(target.pathname);
  if (!match || !UUID.test(match[1])) return null;

  const queryKeys = [...target.searchParams.keys()];
  if (queryKeys.some((key) => key !== 'id') || target.searchParams.getAll('id').length > 1) {
    return null;
  }
  const urlId = target.searchParams.get('id');
  if (urlId !== null && urlId.toLowerCase() !== match[1].toLowerCase()) return null;
  if (value !== undefined && (typeof value !== 'string'
      || value.toLowerCase() !== match[1].toLowerCase())) return null;
  return match[1].toLowerCase();
}

function emptyBody(value) {
  return value === undefined || value === null
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const id = restoreId(request);
  if (!id) return response.status(400).json({ error: 'INVALID_NOTE_ID' });
  if (!emptyBody(request.body)) {
    return response.status(400).json({ error: 'RESTORE_BODY_NOT_ALLOWED' });
  }

  let tools;
  try { tools = serverTools(); } catch { tools = null; }
  if (!tools) return response.status(500).json({ error: 'SERVER_CONFIGURATION_MISSING' });

  const principal = await tools.verifyLogin(requestAuthorization(request));
  if (!principal) return response.status(401).json({ error: 'UNAUTHORIZED' });

  response.setHeader('X-Resource-Id', `notes:${id}`);

  try {
    const result = await restorePrivateNote({ db: tools.supabase, noteId: id, principal });
    return response.status(200).json(result);
  } catch (error) {
    if (error.message === 'restore_not_found') {
      return response.status(404).json({ error: 'BACKUP_NOT_FOUND' });
    }
    if (error.message === 'restore_verification_failed') {
      return response.status(409).json({ error: 'BACKUP_VERIFICATION_FAILED' });
    }
    if (error.message === 'restore_invalid_request') {
      return response.status(400).json({ error: 'INVALID_RESTORE_REQUEST' });
    }
    return response.status(500).json({ error: 'RESTORE_UNAVAILABLE' });
  }
}
