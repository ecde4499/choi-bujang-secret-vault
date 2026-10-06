import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method && request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    return response.status(500).json({ error: 'SERVER_CONFIGURATION_MISSING' });
  }

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from('notes')
    .select('title, content')
    .order('id', { ascending: true });

  if (error) {
    return response.status(500).json({ error: 'NOTES_READ_FAILED' });
  }

  return response.status(200).json({ notes: data ?? [] });
}
