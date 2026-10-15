import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEVICE_COOKIE,
  deviceGrantDigest,
  sessionDigest,
  verifyDeviceGrant,
} from '../src/device-access.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = 'credential_fixture_1234567890';
const TOKEN = 'A'.repeat(43);
const AUTH = 'Bearer fixture.session.token';

function fakeDb({ status = 'approved', ownerId = USER, expiresAt = '2999-01-01T00:00:00.000Z' } = {}) {
  return {
    from(table) {
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        gt(key, value) { filters.push([key, value]); return this; },
        async maybeSingle() {
          if (table === 'vault_device_grants') {
            return {
              data: {
                owner_id: ownerId,
                credential_id: CREDENTIAL,
                expires_at: expiresAt,
                session_sha256: sessionDigest(AUTH),
              },
              error: null,
            };
          }
          if (table === 'vault_device_credentials') {
            return { data: { owner_id: ownerId, status }, error: null };
          }
          return { data: null, error: { message: 'unexpected_table' } };
        },
      };
      return query;
    },
  };
}

const cookie = `${DEVICE_COOKIE}=${TOKEN}`;
assert.equal(deviceGrantDigest(TOKEN)?.length, 64);
assert.equal(sessionDigest(AUTH)?.length, 64);

assert.equal(await verifyDeviceGrant({
  db: fakeDb(),
  identity: { kind: 'student', userId: USER },
  authorization: AUTH,
  cookieHeader: cookie,
}), true);

assert.equal(await verifyDeviceGrant({
  db: fakeDb({ status: 'pending' }),
  identity: { kind: 'student', userId: USER },
  authorization: AUTH,
  cookieHeader: cookie,
}), false);

assert.equal(await verifyDeviceGrant({
  db: fakeDb(),
  identity: { kind: 'student', userId: USER },
  authorization: AUTH,
  cookieHeader: '',
}), false);

assert.equal(await verifyDeviceGrant({
  db: fakeDb(),
  identity: { kind: 'judge', userId: USER },
  authorization: undefined,
  cookieHeader: '',
}), true);

const [html, browser, sw, manifest] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/device.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
]);

assert.match(html, /id="vault" hidden/u);
assert.match(html, /설치 표시는 편의를 위한 기능이며 기기 승인이나 자료 접근 권한의 근거가 아닙니다/u);
assert.match(browser, /navigator\.credentials\.create/u);
assert.match(browser, /navigator\.credentials\.get/u);
assert.doesNotMatch(html + browser, /localStorage|sessionStorage|indexedDB/u);
assert.doesNotMatch(sw, /api\/|cache\.put\(event\.request/u);

const parsedManifest = JSON.parse(manifest);
assert.equal(parsedManifest.display, 'standalone');
assert.equal(parsedManifest.start_url, '/');
assert.equal(parsedManifest.scope, '/');

for (const message of [
  '통과 · 승인 전 서버 기기 증명 없이는 보호 자료 차단',
  '통과 · pending 등록 요청은 승인으로 취급하지 않음',
  '통과 · 운영 심판 주체는 기존 회귀 경로 유지',
  '통과 · 화면은 보호 자료를 기본 숨김',
  '통과 · WebAuthn 기기 키를 브라우저 저장소에 저장하지 않음',
  '통과 · 서비스 워커는 보호 API 응답을 캐시하지 않음',
  '통과 · 설치형 manifest 기본 설정 확인',
]) process.stdout.write(`${message}\n`);

process.stdout.write('로컬 가상 점검이며 실제 기기 승인·배포·심판 통과 증거가 아닙니다.\n');
