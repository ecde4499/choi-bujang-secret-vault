import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));

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

function validNoteInput(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.title === 'string' && value.title.trim().length >= 1
    && value.title.trim().length <= 120
    && typeof value.body === 'string' && value.body.trim().length >= 1
    && value.body.length <= 5000;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method ?? 'GET')) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  let tools;
  try { tools = serverTools(); } catch { tools = null; }
  if (!tools) return response.status(500).json({ error: 'SERVER_CONFIGURATION_MISSING' });

  const principal = await tools.verifyLogin(request.headers?.authorization);
  if (!principal) return response.status(401).json({ error: 'UNAUTHORIZED' });

  if (request.method === 'GET') {
    const { data, error } = await tools.supabase
      .from('notes')
      .select('id, title, body')
      .order('created_at', { ascending: true });
    if (error) return response.status(500).json({ error: 'NOTES_READ_FAILED' });
    return response.status(200).json(data ?? []);
  }

  if (!validNoteInput(request.body)) {
    return response.status(400).json({ error: 'INVALID_NOTE' });
  }
  const requestedId = request.body.id;
  if (requestedId !== undefined && (typeof requestedId !== 'string' || !UUID.test(requestedId))) {
    return response.status(400).json({ error: 'INVALID_NOTE_ID' });
  }
  const id = requestedId ?? crypto.randomUUID();
  const { error } = await tools.supabase.from('notes').insert({
    id,
    owner_id: principal.userId,
    title: request.body.title.trim(),
    body: request.body.body,
  });
  if (error) return response.status(500).json({ error: 'NOTE_CREATE_FAILED' });
  return response.status(201).json({ id });
}
