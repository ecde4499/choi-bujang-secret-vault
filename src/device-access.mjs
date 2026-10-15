import { createHash } from 'node:crypto';

export const DEVICE_COOKIE = '__Host-bb_device';

const DEVICE_TOKEN = /^[A-Za-z0-9_-]{40,100}$/u;

function cookieValue(raw, name) {
  if (typeof raw !== 'string') return null;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== name) continue;
    const encoded = rest.join('=');
    try { return decodeURIComponent(encoded); } catch { return encoded; }
  }
  return null;
}

export function sessionDigest(authorization) {
  if (typeof authorization !== 'string' || !authorization) return null;
  return createHash('sha256').update(authorization, 'utf8').digest('hex');
}

export function deviceGrantToken(cookieHeader) {
  const token = cookieValue(cookieHeader, DEVICE_COOKIE);
  return typeof token === 'string' && DEVICE_TOKEN.test(token) ? token : null;
}

export function deviceGrantDigest(token) {
  if (typeof token !== 'string' || !DEVICE_TOKEN.test(token)) return null;
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function verifyDeviceGrant({
  db,
  identity,
  authorization,
  cookieHeader,
  now = new Date().toISOString(),
}) {
  if (!db || !identity) return false;
  if (identity.kind === 'judge') return true;
  if (identity.kind !== 'student' || typeof identity.userId !== 'string') return false;

  const token = deviceGrantToken(cookieHeader);
  const tokenSha256 = deviceGrantDigest(token);
  const sessionSha256 = sessionDigest(authorization);
  if (!tokenSha256 || !sessionSha256) return false;

  try {
    const { data: grant, error } = await db
      .from('vault_device_grants')
      .select('owner_id, credential_id, expires_at, session_sha256')
      .eq('token_sha256', tokenSha256)
      .eq('owner_id', identity.userId)
      .eq('session_sha256', sessionSha256)
      .gt('expires_at', now)
      .maybeSingle();

    if (error || !grant || grant.owner_id !== identity.userId) return false;

    const { data: credential, error: credentialError } = await db
      .from('vault_device_credentials')
      .select('owner_id, status')
      .eq('credential_id', grant.credential_id)
      .eq('owner_id', identity.userId)
      .maybeSingle();

    return !credentialError
      && credential?.owner_id === identity.userId
      && credential.status === 'approved';
  } catch {
    return false;
  }
}
