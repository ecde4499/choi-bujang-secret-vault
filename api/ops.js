import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { verifyDeviceGrant } from '../src/device-access.mjs';
import {
  buildOpsOverview,
  mergeVerificationResults,
  probePlan,
} from '../src/ops-summary.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const app = new URL(config.publicAppUrl);
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

function exactAction(request) {
  const raw = request.query?.action;
  if (Array.isArray(raw)) return null;
  if (raw === undefined) return request.method === 'GET' ? 'summary' : null;
  return raw === 'summary' || raw === 'verify' ? raw : null;
}

function sameOriginPost(request) {
  if (request.method !== 'POST') return true;
  return typeof request.headers?.origin === 'string' && request.headers.origin === app.origin;
}

function authHeaders(request) {
  const headers = {};
  if (typeof request.headers?.cookie === 'string' && request.headers.cookie) {
    headers.cookie = request.headers.cookie;
  }
  if (typeof request.headers?.authorization === 'string' && request.headers.authorization.trim()) {
    headers.authorization = request.headers.authorization;
  }
  return headers;
}

async function safeJson(response) {
  try {
    const data = await response.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function requestProbe(url, { headers = {}, method = 'GET' } = {}) {
  const requestId = randomUUID();
  const checkedAt = new Date().toISOString();
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      'x-request-id': requestId,
      'x-aleph-attack-id': 'stage12-ops-verification',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  return { response, requestId, checkedAt };
}

function actual(testId, probe, observed, matchesExpected) {
  return {
    testId,
    observed,
    requestId: probe.requestId,
    checkedAt: probe.checkedAt,
    matchesExpected,
  };
}

async function runProbe(item, request) {
  const authenticatedHeaders = authHeaders(request);

  if (item.probe === 'root') {
    const probe = await requestProbe(new URL('/', app));
    return actual(item.testId, probe, `HTTP ${probe.response.status}`, probe.response.status === 200);
  }

  if (item.probe === 'data_redacted') {
    const probe = await requestProbe(new URL('/data.json', app));
    let redacted = false;
    if (probe.response.ok) {
      const data = await safeJson(probe.response);
      redacted = Array.isArray(data?.notes) && data.notes.length === 0
        && data.sampleMarker === undefined;
    }
    return actual(
      item.testId,
      probe,
      redacted
        ? `HTTP ${probe.response.status} · notes=0 · 공개 표식 없음`
        : `HTTP ${probe.response.status} · 빈 공개 자료 상태를 확인하지 못함`,
      probe.response.status === 200 && redacted,
    );
  }

  if (item.probe === 'anonymous_notes') {
    const probe = await requestProbe(new URL('/api/notes', app));
    const body = await safeJson(probe.response);
    const denied = [401, 403].includes(probe.response.status) && typeof body?.error === 'string';
    return actual(
      item.testId,
      probe,
      `HTTP ${probe.response.status}${body?.error ? ` · ${body.error}` : ''}`,
      denied,
    );
  }

  if (item.probe === 'session') {
    const probe = await requestProbe(new URL('/api/auth/session', app), {
      headers: authenticatedHeaders,
    });
    return actual(item.testId, probe, `HTTP ${probe.response.status}`, probe.response.status === 200);
  }

  if (item.probe === 'own_notes') {
    const probe = await requestProbe(new URL('/api/notes', app), {
      headers: authenticatedHeaders,
    });
    return actual(item.testId, probe, `HTTP ${probe.response.status} · 본문은 기록하지 않음`, probe.response.status === 200);
  }

  if (item.probe === 'original_no_key') {
    const probe = await requestProbe(new URL(config.originalApiUrl));
    return actual(
      item.testId,
      probe,
      `HTTP ${probe.response.status}`,
      !probe.response.ok,
    );
  }

  if (item.probe === 'restore_get') {
    const probe = await requestProbe(
      new URL('/api/restore/00000000-0000-4000-8000-000000000000', app),
      { headers: authenticatedHeaders },
    );
    return actual(item.testId, probe, `HTTP ${probe.response.status}`, probe.response.status === 405);
  }

  if (item.probe === 'device_status') {
    const probe = await requestProbe(new URL('/api/device?action=status', app), {
      headers: authenticatedHeaders,
    });
    return actual(item.testId, probe, `HTTP ${probe.response.status} · 상태 본문은 기록하지 않음`, probe.response.status === 200);
  }

  if (item.probe === 'anonymous_device') {
    const probe = await requestProbe(new URL('/api/device?action=status', app));
    const body = await safeJson(probe.response);
    return actual(
      item.testId,
      probe,
      `HTTP ${probe.response.status}${body?.error ? ` · ${body.error}` : ''}`,
      probe.response.status === 401,
    );
  }

  return null;
}

async function runVerification(request) {
  const results = [];
  for (const item of probePlan()) {
    try {
      const result = await runProbe(item, request);
      if (result) results.push(result);
    } catch (error) {
      results.push({
        testId: item.testId,
        observed: `요청 실패 · ${error?.name ?? 'Error'}`,
        requestId: randomUUID(),
        checkedAt: new Date().toISOString(),
        matchesExpected: false,
      });
    }
  }
  return mergeVerificationResults(results);
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method ?? 'GET')) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const action = exactAction(request);
  if (!action || (request.method === 'GET' && action !== 'summary')
      || (request.method === 'POST' && action !== 'verify')) {
    return response.status(400).json({ error: 'INVALID_OPS_ACTION' });
  }
  if (!sameOriginPost(request)) {
    return response.status(403).json({ error: 'ORIGIN_DENIED' });
  }

  let tools;
  try { tools = serverTools(); } catch { tools = null; }
  if (!tools) return response.status(500).json({ error: 'SERVER_CONFIGURATION_MISSING' });

  const authorization = requestAuthorization(request);
  const principal = await tools.verifyLogin(authorization);
  if (!principal) return response.status(401).json({ error: 'UNAUTHORIZED' });

  const deviceVerified = await verifyDeviceGrant({
    db: tools.supabase,
    identity: principal,
    authorization,
    cookieHeader: request.headers?.cookie,
  });
  if (!deviceVerified) return response.status(403).json({ error: 'DEVICE_NOT_VERIFIED' });

  if (action === 'summary') {
    return response.status(200).json(buildOpsOverview({
      generatedAt: new Date().toISOString(),
      deviceVerified: true,
    }));
  }

  const rows = await runVerification(request);
  const actual = rows.filter((row) => row.execution === 'actual_api');
  return response.status(200).json({
    schema: 'aleph.ops.verification.v1',
    generatedAt: new Date().toISOString(),
    inspectedCommit: buildOpsOverview({ deviceVerified: true }).inspectedCommit,
    counts: {
      total: rows.length,
      actualApi: actual.length,
      matched: actual.filter((row) => row.matchesExpected === true).length,
      mismatched: actual.filter((row) => row.matchesExpected === false).length,
      notRun: rows.filter((row) => row.execution === 'not_run').length,
    },
    rows,
  });
}
