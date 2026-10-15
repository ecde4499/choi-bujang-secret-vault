import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  DEVICE_COOKIE,
  deviceGrantDigest,
  sessionDigest,
  verifyDeviceGrant,
} from '../src/device-access.mjs';
import { createLoginVerifier } from '../src/verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const SESSION_COOKIE = '__Host-bb_session';
const ID = /^[A-Za-z0-9_-]{10,1024}$/u;
const B64 = /^[A-Za-z0-9_-]{8,8192}$/u;
const CHALLENGE = /^[A-Za-z0-9_-]{40,100}$/u;
const REQUEST_CODE = /^[a-f0-9]{12}$/u;
const CHALLENGE_MS = 3 * 60 * 1000;
const GRANT_MS = 15 * 60 * 1000;

function trustedWebContext(request, requireOrigin) {
  const rawHost = request.headers?.host ?? request.headers?.['x-forwarded-host'];
  if (typeof rawHost !== 'string' || !rawHost.trim()) return null;
  const host = rawHost.split(',')[0].trim().toLowerCase();
  const rawOrigin = request.headers?.origin;

  if (typeof rawOrigin !== 'string') {
    if (requireOrigin) return null;
    try {
      const parsed = new URL(`https://${host}`);
      return { origin: parsed.origin, rpId: parsed.hostname };
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== 'https:' || parsed.host.toLowerCase() !== host) return null;
    return { origin: parsed.origin, rpId: parsed.hostname };
  } catch {
    return null;
  }
}

function requestAuthorization(request) {
  if (typeof request.headers?.authorization === 'string' && request.headers.authorization.trim()) {
    return request.headers.authorization;
  }
  const raw = request.headers?.cookie;
  if (typeof raw !== 'string') return undefined;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== SESSION_COOKIE) continue;
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
  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    supabase,
    verifyLogin: createLoginVerifier({ config, supabaseSecretKey: secretKey }),
  };
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sha256(value) {
  return createHash('sha256').update(value).digest();
}

function date(ms) {
  return new Date(ms).toISOString();
}

function safeTransports(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && /^[a-z-]{2,24}$/u.test(item)).slice(0, 8)
    : [];
}

function bodyObject(request) {
  if (request.body === undefined || request.body === null) return {};
  if (typeof request.body === 'object' && !Array.isArray(request.body)) return request.body;
  if (typeof request.body !== 'string' || Buffer.byteLength(request.body, 'utf8') > 24000) return null;
  try {
    const value = JSON.parse(request.body);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function clientData(value, expectedType, expectedOrigin) {
  if (typeof value !== 'string' || !B64.test(value)) {
    return { error: 'DEVICE_CLIENT_ENCODING_INVALID' };
  }
  try {
    const raw = Buffer.from(value, 'base64url');
    if (raw.length > 5000) return { error: 'DEVICE_CLIENT_ENCODING_INVALID' };
    const parsed = JSON.parse(raw.toString('utf8'));
    if (parsed?.type !== expectedType) {
      return { error: 'DEVICE_CLIENT_TYPE_INVALID' };
    }
    if (parsed.origin !== expectedOrigin) {
      return { error: 'DEVICE_CLIENT_ORIGIN_INVALID' };
    }
    if (typeof parsed.challenge !== 'string' || !CHALLENGE.test(parsed.challenge)) {
      return { error: 'DEVICE_CLIENT_CHALLENGE_INVALID' };
    }
    return { raw, challenge: parsed.challenge };
  } catch {
    return { error: 'DEVICE_CLIENT_ENCODING_INVALID' };
  }
}

function authenticatorData(value, expectedRpId) {
  if (typeof value !== 'string' || !B64.test(value)) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    if (raw.length < 37 || raw.length > 8192) return null;
    const expectedRp = sha256(Buffer.from(expectedRpId, 'utf8'));
    if (!timingSafeEqual(raw.subarray(0, 32), expectedRp)) return null;
    const flags = raw[32];
    if ((flags & 0x01) === 0 || (flags & 0x04) === 0) return null;
    return { raw, counter: raw.readUInt32BE(33) };
  } catch {
    return null;
  }
}

async function saveChallenge(db, ownerId, kind, challenge) {
  const { error } = await db.from('vault_device_challenges').insert({
    id: randomUUID(),
    owner_id: ownerId,
    kind,
    challenge,
    expires_at: date(Date.now() + CHALLENGE_MS),
  });
  if (error) throw new Error('DEVICE_STORE_UNAVAILABLE');
}

async function consumeChallenge(db, ownerId, kind, challenge) {
  const { data, error } = await db
    .from('vault_device_challenges')
    .delete()
    .eq('owner_id', ownerId)
    .eq('kind', kind)
    .eq('challenge', challenge)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (error) throw new Error('DEVICE_STORE_UNAVAILABLE');
  if (!data) throw new Error('DEVICE_CHALLENGE_EXPIRED');
}

function registrationCredential(body) {
  const credential = body?.credential;
  const response = credential?.response;
  if (!credential || credential.type !== 'public-key' || !ID.test(credential.id ?? '')
      || !response || typeof response !== 'object'
      || !B64.test(response.clientDataJSON ?? '')
      || !B64.test(response.authenticatorData ?? '')
      || !B64.test(response.publicKey ?? '')) return null;
  return credential;
}

function assertionCredential(body) {
  const credential = body?.credential;
  if (!credential || typeof credential !== 'object') {
    return { error: 'DEVICE_ASSERTION_CREDENTIAL_MISSING' };
  }
  if (credential.type !== 'public-key') {
    return { error: 'DEVICE_ASSERTION_TYPE_INVALID' };
  }
  if (!ID.test(credential.id ?? '')) {
    return { error: 'DEVICE_ASSERTION_ID_INVALID' };
  }

  const response = credential.response;
  if (!response || typeof response !== 'object') {
    return { error: 'DEVICE_ASSERTION_RESPONSE_MISSING' };
  }
  if (!B64.test(response.clientDataJSON ?? '')) {
    return { error: 'DEVICE_ASSERTION_CLIENT_DATA_INVALID' };
  }
  if (!B64.test(response.authenticatorData ?? '')) {
    return { error: 'DEVICE_ASSERTION_AUTH_DATA_INVALID' };
  }
  if (!B64.test(response.signature ?? '')) {
    return { error: 'DEVICE_ASSERTION_SIGNATURE_INVALID' };
  }
  return { credential };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  const action = Array.isArray(request.query?.action) ? null : request.query?.action;
  const allowed = new Set([
    'status',
    'registration-options',
    'registration-verify',
    'assertion-options',
    'assertion-verify',
  ]);
  if (typeof action !== 'string' || !allowed.has(action)) {
    return response.status(404).json({ error: 'DEVICE_ROUTE_NOT_FOUND' });
  }

  const expectedMethod = action === 'status' ? 'GET' : 'POST';
  if (request.method !== expectedMethod) {
    response.setHeader('Allow', expectedMethod);
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const web = trustedWebContext(request, expectedMethod === 'POST');
  if (!web) {
    return response.status(403).json({ error: 'ORIGIN_DENIED' });
  }

  let tools;
  try { tools = serverTools(); } catch { tools = null; }
  if (!tools) return response.status(503).json({ error: 'DEVICE_SERVICE_UNAVAILABLE' });

  const authorization = requestAuthorization(request);
  const principal = await tools.verifyLogin(authorization);
  if (!principal || principal.kind !== 'student') {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const db = tools.supabase;
  try {
    if (action === 'status') {
      const { data, error } = await db
        .from('vault_device_credentials')
        .select('status, request_code, requested_at')
        .eq('owner_id', principal.userId)
        .order('requested_at', { ascending: false });
      if (error) throw new Error('DEVICE_STORE_UNAVAILABLE');

      const rows = Array.isArray(data) ? data : [];
      const approved = rows.some((row) => row.status === 'approved');
      const pending = rows.find((row) => row.status === 'pending');
      const verified = await verifyDeviceGrant({
        db,
        identity: principal,
        authorization,
        cookieHeader: request.headers?.cookie,
      });

      return response.status(200).json({
        schema: 'aleph.device.status.v1',
        registration: approved ? 'approved' : pending ? 'pending' : 'not_registered',
        verified,
        canOpenVault: verified,
        requestCode: pending && REQUEST_CODE.test(pending.request_code ?? '')
          ? pending.request_code
          : null,
        installIsApproval: false,
      });
    }

    if (action === 'registration-options') {
      const { data, error } = await db
        .from('vault_device_credentials')
        .select('credential_id, status')
        .eq('owner_id', principal.userId);
      if (error) throw new Error('DEVICE_STORE_UNAVAILABLE');

      const challenge = randomBytes(32).toString('base64url');
      await saveChallenge(db, principal.userId, 'registration', challenge);
      return response.status(200).json({
        schema: 'aleph.device.registration-options.v1',
        challenge,
        rp: { name: 'BYTE BACK', id: web.rpId },
        user: {
          id: createHash('sha256').update(`byte-back-device:${principal.userId}`).digest('base64url'),
          name: 'BYTE BACK 사용자',
          displayName: 'BYTE BACK 사용자',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'required',
        },
        hints: ['hybrid', 'client-device'],
        excludeCredentials: (Array.isArray(data) ? data : [])
          .filter((row) => row.status !== 'revoked' && ID.test(row.credential_id ?? ''))
          .map((row) => ({ type: 'public-key', id: row.credential_id })),
      });
    }

    if (action === 'assertion-options') {
      const empty = bodyObject(request);
      if (!empty || Object.keys(empty).length !== 0) {
        return response.status(400).json({ error: 'DEVICE_REQUEST_FIELDS_INVALID' });
      }

      const { data, error } = await db
        .from('vault_device_credentials')
        .select('credential_id, transports')
        .eq('owner_id', principal.userId)
        .eq('status', 'approved');
      if (error) throw new Error('DEVICE_STORE_UNAVAILABLE');
      const rows = (Array.isArray(data) ? data : [])
        .filter((row) => ID.test(row.credential_id ?? ''));
      if (!rows.length) return response.status(403).json({ error: 'DEVICE_NOT_APPROVED' });

      const challenge = randomBytes(32).toString('base64url');
      await saveChallenge(db, principal.userId, 'assertion', challenge);
      return response.status(200).json({
        schema: 'aleph.device.assertion-options.v1',
        challenge,
        rpId: web.rpId,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: rows.map((row) => ({
          type: 'public-key',
          id: row.credential_id,
          transports: safeTransports(row.transports),
        })),
      });
    }

    const body = bodyObject(request);
    if (!body) {
      return response.status(400).json({ error: 'DEVICE_REQUEST_BODY_INVALID' });
    }
    if (Object.keys(body).sort().join(',') !== 'credential') {
      return response.status(400).json({ error: 'DEVICE_REQUEST_FIELDS_INVALID' });
    }

    if (action === 'registration-verify') {
      const credential = registrationCredential(body);
      if (!credential) return response.status(400).json({ error: 'INVALID_DEVICE_REQUEST' });

      const client = clientData(credential.response.clientDataJSON, 'webauthn.create', web.origin);
      if (client.error) return response.status(403).json({ error: client.error });

      const auth = authenticatorData(credential.response.authenticatorData, web.rpId);
      if (!auth) return response.status(403).json({ error: 'DEVICE_AUTH_DATA_INVALID' });

      await consumeChallenge(db, principal.userId, 'registration', client.challenge);

      let key;
      try {
        key = createPublicKey({
          key: Buffer.from(credential.response.publicKey, 'base64url'),
          format: 'der',
          type: 'spki',
        });
      } catch {
        return response.status(403).json({ error: 'DEVICE_PUBLIC_KEY_INVALID' });
      }
      if (key.asymmetricKeyType !== 'ec'
          || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
        return response.status(403).json({ error: 'DEVICE_PUBLIC_KEY_UNSUPPORTED' });
      }

      const requestCode = randomBytes(6).toString('hex');
      const { error } = await db.from('vault_device_credentials').insert({
        credential_id: credential.id,
        owner_id: principal.userId,
        public_key_spki: credential.response.publicKey,
        sign_count: auth.counter,
        transports: safeTransports(credential.response.transports),
        status: 'pending',
        request_code: requestCode,
      });
      if (error) {
        return response.status(error.code === '23505' ? 409 : 503).json({
          error: error.code === '23505'
            ? 'DEVICE_ALREADY_REQUESTED'
            : 'DEVICE_STORE_UNAVAILABLE',
        });
      }

      return response.status(202).json({
        schema: 'aleph.device.registration.v1',
        registration: 'pending',
        requestCode,
        canOpenVault: false,
      });
    }

    const assertion = assertionCredential(body);
    if (assertion.error) return response.status(400).json({ error: assertion.error });
    const credential = assertion.credential;
    const client = clientData(credential.response.clientDataJSON, 'webauthn.get', web.origin);
    if (client.error) return response.status(403).json({ error: client.error });
    const auth = authenticatorData(credential.response.authenticatorData, web.rpId);
    if (!auth) return response.status(403).json({ error: 'DEVICE_AUTH_DATA_INVALID' });
    await consumeChallenge(db, principal.userId, 'assertion', client.challenge);

    const { data: stored, error } = await db
      .from('vault_device_credentials')
      .select('credential_id, owner_id, public_key_spki, sign_count, status')
      .eq('credential_id', credential.id)
      .eq('owner_id', principal.userId)
      .maybeSingle();
    if (error) throw new Error('DEVICE_STORE_UNAVAILABLE');
    if (!stored || stored.status !== 'approved' || stored.owner_id !== principal.userId) {
      return response.status(403).json({ error: 'DEVICE_NOT_APPROVED' });
    }

    let publicKey;
    try {
      publicKey = createPublicKey({
        key: Buffer.from(stored.public_key_spki, 'base64url'),
        format: 'der',
        type: 'spki',
      });
    } catch {
      return response.status(403).json({ error: 'DEVICE_NOT_VERIFIED' });
    }

    const signed = Buffer.concat([
      auth.raw,
      sha256(client.raw),
    ]);
    let signatureOk = false;
    try {
      signatureOk = verify(
        'sha256',
        signed,
        publicKey,
        Buffer.from(credential.response.signature, 'base64url'),
      );
    } catch {
      signatureOk = false;
    }
    if (!signatureOk) return response.status(403).json({ error: 'DEVICE_NOT_VERIFIED' });

    const oldCounter = Number(stored.sign_count);
    const counterOk = auth.counter === 0 && oldCounter === 0
      ? true
      : Number.isSafeInteger(oldCounter) && auth.counter > oldCounter;
    if (!counterOk) return response.status(409).json({ error: 'DEVICE_STATE_CHANGED' });

    const { data: updated, error: updateError } = await db
      .from('vault_device_credentials')
      .update({
        sign_count: auth.counter,
        last_used_at: new Date().toISOString(),
      })
      .eq('credential_id', credential.id)
      .eq('owner_id', principal.userId)
      .eq('status', 'approved')
      .eq('sign_count', stored.sign_count)
      .select('credential_id')
      .maybeSingle();
    if (updateError) throw new Error('DEVICE_STORE_UNAVAILABLE');
    if (!updated) return response.status(409).json({ error: 'DEVICE_STATE_CHANGED' });

    const grantToken = randomBytes(32).toString('base64url');
    const tokenSha256 = deviceGrantDigest(grantToken);
    const sessionSha256 = sessionDigest(authorization);
    const { error: grantError } = await db.from('vault_device_grants').insert({
      id: randomUUID(),
      owner_id: principal.userId,
      credential_id: credential.id,
      token_sha256: tokenSha256,
      session_sha256: sessionSha256,
      expires_at: date(Date.now() + GRANT_MS),
    });
    if (grantError) throw new Error('DEVICE_STORE_UNAVAILABLE');

    response.setHeader('Set-Cookie',
      `${DEVICE_COOKIE}=${encodeURIComponent(grantToken)}; Path=/; Max-Age=${Math.floor(GRANT_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`);
    return response.status(200).json({
      schema: 'aleph.device.grant.v1',
      approved: true,
      canOpenVault: true,
      expiresInSeconds: Math.floor(GRANT_MS / 1000),
    });
  } catch (error) {
    if (error?.message === 'DEVICE_CHALLENGE_EXPIRED') {
      return response.status(409).json({ error: 'DEVICE_CHALLENGE_EXPIRED' });
    }
    return response.status(503).json({ error: 'DEVICE_STORE_UNAVAILABLE' });
  }
}
