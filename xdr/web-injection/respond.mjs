import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_LOG = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'alerts.log');

function safeAlertId(alert) {
  return typeof alert?.id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/iu.test(alert.id)
    ? alert.id
    : null;
}

function safeSource(alert) {
  const value = alert?.data?.srcip;
  return typeof value === 'string'
    && /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.(?:[1-9]|[1-9]\d|1\d\d|2(?:[0-4]\d|5[0-5]))$/u.test(value)
    ? value
    : null;
}

function isNormalRequest(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  return !mitre.includes('T1190')
    || /자료 목록|정적 화면|내 메모|반 공지|화면을 새로고침|검색어 .* 로 조회|파일 이름 .* 조회|로그아웃 화면/u.test(description);
}

export function createDenyRule(alert, decision, {
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (!decision || decision.action !== 'block' || decision.confidence < 0.85
      || isNormalRequest(alert)) {
    return null;
  }

  const alertId = safeAlertId(alert);
  const sourceAddress = safeSource(alert);
  if (!alertId || !sourceAddress) return null;

  const expiresAt = new Date(now.getTime() + ttlMs);
  if (!Number.isFinite(expiresAt.getTime())) return null;

  return {
    ruleId: `xdr.web_injection.${alertId}`,
    effect: 'deny',
    sourceAddress,
    expiresAt: expiresAt.toISOString(),
    evidenceAlertId: alertId,
    reason: typeof decision.reason === 'string' ? decision.reason : 'web_injection_pattern',
  };
}

export async function respond(alert, decision, {
  denyRules = [],
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
  logPath = DEFAULT_LOG,
} = {}) {
  const rule = createDenyRule(alert, decision, { now, ttlMs });
  if (!rule) return { rule: null, denyRules };

  if (!Array.isArray(denyRules)) throw new TypeError('denyRules는 배열이어야 합니다.');

  const exists = denyRules.some(item => item?.ruleId === rule.ruleId);
  if (!exists) denyRules.push(rule);

  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(
    logPath,
    `${new Date(now).toISOString()}\tblock\t${rule.evidenceAlertId}\t${rule.sourceAddress}\t${rule.expiresAt}\t${rule.reason}\n`,
    'utf8',
  );

  return { rule, denyRules };
}
