import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const VERIFIED_POLICY_COMMIT = 'afa0c5c674fd1a6eb98239c6deb6397e926dc660';
export const VERIFIED_POLICY_PATH = 'policy/verified-policy.json';

const root = resolve(import.meta.dirname, '..');
const expectedPaths = Object.freeze([
  'src/decider.mjs',
  'src/detect.mjs',
  'src/verify-login.mjs',
  'api/notes.js',
  'api/notes/[id].js',
  'api/notices/[id].js',
  'aleph.config.json',
]);
const CONFIG_POLICY_KEYS = Object.freeze([
  'identityProvider',
  'allowedRoutes',
  'originalApiUrl',
  'restoreRoute',
]);

const normalizeText = (value) => value.replace(/\r\n?/gu, '\n');
const sha256 = (value) => createHash('sha256').update(normalizeText(value), 'utf8').digest('hex');

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
}

function verifiedFile(path) {
  try {
    return git('show', `${VERIFIED_POLICY_COMMIT}:${path}`);
  } catch {
    throw new Error('verified_policy_commit_unavailable');
  }
}

function verifiedBlob(path) {
  try {
    return git('rev-parse', `${VERIFIED_POLICY_COMMIT}:${path}`).trim();
  } catch {
    throw new Error('verified_policy_commit_unavailable');
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
      || manifest.schema !== 'aleph.policy.verified.v1'
      || manifest.verifiedCommit !== VERIFIED_POLICY_COMMIT
      || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('verified_policy_snapshot_invalid');
  }

  const paths = Object.keys(manifest.files).sort();
  if (!sameJson(paths, [...expectedPaths].sort())) {
    throw new Error('verified_policy_snapshot_invalid');
  }

  for (const path of expectedPaths) {
    const entry = manifest.files[path];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || typeof entry.gitBlob !== 'string'
        || entry.gitBlob !== verifiedBlob(path)) {
      throw new Error('verified_policy_snapshot_invalid');
    }
  }

  const configEntry = manifest.files['aleph.config.json'];
  if (!Array.isArray(configEntry.policyKeys)
      || !sameJson(configEntry.policyKeys, [...CONFIG_POLICY_KEYS])) {
    throw new Error('verified_policy_snapshot_invalid');
  }

  return manifest;
}

export async function loadVerifiedPolicy() {
  let raw;
  try {
    raw = await readFile(resolve(root, VERIFIED_POLICY_PATH), 'utf8');
  } catch {
    throw new Error('verified_policy_snapshot_missing');
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error('verified_policy_snapshot_invalid');
  }
  return validateManifest(manifest);
}

async function currentFile(path) {
  try {
    return await readFile(resolve(root, path), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function comparePolicy(manifest) {
  validateManifest(manifest);
  const results = [];

  for (const path of expectedPaths) {
    const safe = verifiedFile(path);
    const current = await currentFile(path);

    if (path === 'aleph.config.json') {
      let safeJson;
      let currentJson;
      try {
        safeJson = JSON.parse(safe);
        currentJson = current === null ? null : JSON.parse(current);
      } catch {
        currentJson = null;
      }

      const changedKeys = currentJson === null
        ? [...CONFIG_POLICY_KEYS]
        : CONFIG_POLICY_KEYS.filter((key) => !sameJson(safeJson[key], currentJson[key]));

      results.push({
        path,
        status: current === null ? 'missing' : changedKeys.length ? 'modified' : 'same',
        changedKeys,
        safeSha256: sha256(safe),
        currentSha256: current === null ? null : sha256(current),
      });
      continue;
    }

    const same = current !== null && normalizeText(current) === normalizeText(safe);
    results.push({
      path,
      status: current === null ? 'missing' : same ? 'same' : 'modified',
      changedKeys: null,
      safeSha256: sha256(safe),
      currentSha256: current === null ? null : sha256(current),
    });
  }

  return results;
}

export function changedPolicyItems(results) {
  if (!Array.isArray(results)) throw new TypeError('invalid_policy_comparison');
  return results.filter((item) => item.status !== 'same');
}

function parseJsonPolicy(text) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid');
    }
    return value;
  } catch {
    throw new Error('policy_restore_scope_unavailable');
  }
}

function restoredContent(path, safe, current) {
  if (path !== 'aleph.config.json') return normalizeText(safe);
  if (current === null) throw new Error('policy_restore_scope_unavailable');

  const safeJson = parseJsonPolicy(safe);
  const currentJson = parseJsonPolicy(current);
  const restored = structuredClone(currentJson);

  for (const key of CONFIG_POLICY_KEYS) {
    restored[key] = structuredClone(safeJson[key]);
  }
  return `${JSON.stringify(restored, null, 2)}\n`;
}

export async function buildPolicyRestorePlan(manifest) {
  validateManifest(manifest);
  const results = await comparePolicy(manifest);
  const changed = changedPolicyItems(results);
  const items = [];

  for (const item of changed) {
    const safe = verifiedFile(item.path);
    const current = await currentFile(item.path);
    const restored = restoredContent(item.path, safe, current);

    items.push(Object.freeze({
      path: item.path,
      status: item.status,
      changedKeys: item.changedKeys,
      beforeSha256: item.currentSha256,
      afterSha256: sha256(restored),
      restored,
    }));
  }

  const summary = {
    verifiedCommit: VERIFIED_POLICY_COMMIT,
    items: items.map(({ path, status, changedKeys, beforeSha256, afterSha256 }) => ({
      path, status, changedKeys, beforeSha256, afterSha256,
    })),
  };
  const changeSet = sha256(JSON.stringify(summary)).slice(0, 16);

  return Object.freeze({
    verifiedCommit: VERIFIED_POLICY_COMMIT,
    label: manifest.label,
    changeSet,
    items: Object.freeze(items),
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;

export async function restorePrivateNote({ db, noteId, principal }) {
  if (!db || typeof db.rpc !== 'function'
      || typeof noteId !== 'string' || !UUID.test(noteId)
      || !principal || typeof principal.userId !== 'string' || !UUID.test(principal.userId)) {
    throw new Error('restore_invalid_request');
  }

  const { data, error } = await db.rpc('restore_verified_note_backup', {
    p_note_id: noteId.toLowerCase(),
    p_actor_id: principal.userId.toLowerCase(),
  });

  if (error) {
    const message = String(error.message ?? error.details ?? '');
    if (message.includes('backup_not_found') || message.includes('owner_mismatch')) {
      throw new Error('restore_not_found');
    }
    if (message.includes('backup_verification_failed')
        || message.includes('restore_verification_failed')) {
      throw new Error('restore_verification_failed');
    }
    throw new Error('restore_unavailable');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)
      || data.id?.toLowerCase() !== noteId.toLowerCase()
      || data.restored !== true
      || typeof data.contentSha256 !== 'string'
      || !SHA256.test(data.contentSha256)) {
    throw new Error('restore_verification_failed');
  }

  return Object.freeze({
    id: noteId.toLowerCase(),
    restored: true,
    contentSha256: data.contentSha256,
  });
}
