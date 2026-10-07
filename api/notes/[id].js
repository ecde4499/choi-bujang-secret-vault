import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../../src/verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../../aleph.config.json', import.meta.url), 'utf8'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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
  const value = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id;
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

  let tools;
  try { tools = serverTools(); } catch { tools = null; }
  if (!tools) return response.status(500).json({ error: 'SERVER_CONFIGURATION_MISSING' });

  const principal = await tools.verifyLogin(request.headers?.authorization);
  if (!principal) return response.status(401).json({ error: 'UNAUTHORIZED' });

  if (request.method === 'GET') {
    const { data, error } = await tools.supabase
      .from('notes')
      .select('id, title, body')
      .eq('id', id)
      .eq('owner_id', principal.userId)
      .maybeSingle();
    if (error) return response.status(500).json({ error: 'NOTE_READ_FAILED' });
    if (!data) return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
    return response.status(200).json(data);
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
        owner_id: principal.userId,
      })
      .eq('id', id)
      .eq('owner_id', principal.userId)
      .select('id, title, body')
      .maybeSingle();
    if (error) return response.status(500).json({ error: 'NOTE_UPDATE_FAILED' });
    if (!data) return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
    return response.status(200).json(data);
  }

  const { data, error } = await tools.supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('owner_id', principal.userId)
    .select('id')
    .maybeSingle();
  if (error) return response.status(500).json({ error: 'NOTE_DELETE_FAILED' });
  if (!data) return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
  return response.status(204).end();
}
