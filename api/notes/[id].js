import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { verifyDeviceGrant } from '../../src/device-access.mjs';

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
  const verifyLogin = createLoginVerifier({ config, supabaseSecretKey: secretKey });
  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { verifyLogin, supabase };
}

function noteId(request) {
  const value = Array.isArray(request.query?.id) ? null : request.query?.id;
  if (typeof request.url === 'string') {
    let target;
    try { target = new URL(request.url, 'https://local-request.invalid'); } catch { return null; }
    const queryKeys = [...target.searchParams.keys()];
    if (queryKeys.some((key) => key !== 'id') || target.searchParams.getAll('id').length > 1) {
      return null;
    }
    if (target.pathname.includes('%') || target.pathname.includes('..')
        || target.pathname.includes('\\')) return null;
    const match = /^\/api\/notes\/([^/]+)\/?$/u.exec(target.pathname);
    if (!match || !UUID.test(match[1])) return null;
    const urlId = target.searchParams.get('id');
    if (urlId !== null && urlId.toLowerCase() !== match[1].toLowerCase()) return null;
    if (value !== undefined && (typeof value !== 'string'
        || value.toLowerCase() !== match[1].toLowerCase())) return null;
    return match[1];
  }
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

function validUpdate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join(',') !== 'body,title') return false;
  return typeof value.title === 'string' && value.title.trim().length >= 1
    && value.title.trim().length <= 120
    && typeof value.body === 'string' && value.body.trim().length >= 1
    && value.body.length <= 5000;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PUT', 'DELETE'].includes(request.method ?? 'GET')) {
    response.setHeader('Allow', 'GET, PUT, DELETE');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const id = noteId(request);
  if (!id) return response.status(400).json({ error: 'INVALID_NOTE_ID' });
  if (request.query && Object.keys(request.query).some((key) => key !== 'id')) {
    return response.status(400).json({ error: 'INVALID_RESOURCE_QUERY' });
  }
  response.setHeader('X-Resource-Id', `notes:${id}`);

  let tools;
  try { tools = serverTools(); } catch { tools = null; }
  if (!tools) return response.status(500).json({ error: 'SERVER_CONFIGURATION_MISSING' });

  const principal = await tools.verifyLogin(requestAuthorization(request));
  if (!principal) return response.status(401).json({ error: 'UNAUTHORIZED' });

  const deviceVerified = await verifyDeviceGrant({
    db: tools.supabase,
    identity: principal,
    authorization: requestAuthorization(request),
    cookieHeader: request.headers?.cookie,
  });
  if (!deviceVerified) return response.status(403).json({ error: 'DEVICE_NOT_VERIFIED' });

  if (request.method === 'GET') {
    const { data, error } = await tools.supabase
      .from('notes')
      .select('id, title, body, owner_id')
      .eq('id', id)
      .eq('owner_id', principal.userId)
      .maybeSingle();
    if (error) return response.status(500).json({ error: 'NOTE_READ_FAILED' });
    if (!data || data.owner_id !== principal.userId) {
      return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
    }
    return response.status(200).json({ id: data.id, title: data.title, body: data.body });
  }

  if (request.method === 'PUT') {
    if (!validUpdate(request.body)) return response.status(400).json({ error: 'INVALID_NOTE' });

    const { data: existing, error: existingError } = await tools.supabase
      .from('notes')
      .select('owner_id')
      .eq('id', id)
      .eq('owner_id', principal.userId)
      .maybeSingle();
    if (existingError) return response.status(500).json({ error: 'NOTE_READ_FAILED' });
    if (!existing || existing.owner_id !== principal.userId) {
      return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
    }

    const { data, error } = await tools.supabase
      .from('notes')
      .update({
        title: request.body.title.trim(),
        body: request.body.body,
      })
      .eq('id', id)
      .eq('owner_id', principal.userId)
      .select('id, title, body, owner_id')
      .maybeSingle();
    if (error) return response.status(500).json({ error: 'NOTE_UPDATE_FAILED' });
    if (!data || data.owner_id !== principal.userId) {
      return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
    }
    return response.status(200).json({ id: data.id, title: data.title, body: data.body });
  }

  const { data: existing, error: existingError } = await tools.supabase
    .from('notes')
    .select('owner_id')
    .eq('id', id)
    .eq('owner_id', principal.userId)
    .maybeSingle();
  if (existingError) return response.status(500).json({ error: 'NOTE_READ_FAILED' });
  if (!existing || existing.owner_id !== principal.userId) {
    return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
  }

  const { data, error } = await tools.supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('owner_id', principal.userId)
    .select('id, owner_id')
    .maybeSingle();
  if (error) return response.status(500).json({ error: 'NOTE_DELETE_FAILED' });
  if (!data || data.owner_id !== principal.userId) {
    return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
  }
  return response.status(204).end();
}
