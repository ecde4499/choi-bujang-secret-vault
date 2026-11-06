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
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  return !mitre.includes('T1190')
    || /공개 화면|상태 확인 주소|로그인이 성공|정적 스타일|내 메모|세션 유지|반 공지|로그아웃/u.test(description);
}

export function createDenyRule(alert, decision, {
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (!decision || decision.action !== 'block' || decision.confidence < 0.85 || isNormalRequest(alert)) {
    return null;
  }

  const alertId = safeAlertId(alert);
  const sourceAddress = safeSource(alert);
  if (!alertId || !sourceAddress) return null;

  const expiresAt = new Date(now.getTime() + ttlMs);
  if (!Number.isFinite(expiresAt.getTime())) return null;

  return {
    ruleId: 'xdr.known_cve.' + alertId,
    effect: 'deny',
    sourceAddress,
    expiresAt: expiresAt.toISOString(),
    evidenceAlertId: alertId,
    reason: typeof decision.reason === 'string' ? decision.reason.replace(/[\r\n]+/gu, ' ').slice(0, 160) : 'known_cve_pattern',
  };
}

export async function respond(alert, decision, {
  denyRules = [],
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
  logPath = DEFAULT_LOG,
} = {}) {
  if (!Array.isArray(denyRules)) throw new TypeError('denyRules는 배열이어야 합니다.');
  if (!decision || !['block', 'alert'].includes(decision.action)) return { rule: null, denyRules };

  const rule = createDenyRule(alert, decision, { now, ttlMs });
  if (rule && !denyRules.some((item) => item?.ruleId === rule.ruleId)) denyRules.push(rule);

  const alertId = safeAlertId(alert);
  const sourceAddress = safeSource(alert);
  if (alertId && sourceAddress) {
    await mkdir(dirname(logPath), { recursive: true });
    const expiresAt = rule?.expiresAt ?? '-';
    const reason = typeof decision.reason === 'string'
      ? decision.reason.replace(/[\r\n\t]+/gu, ' ').slice(0, 160)
      : 'known_cve_pattern';
    await appendFile(
      logPath,
      new Date(now).toISOString() + '\t' + decision.action + '\t' + alertId + '\t' + sourceAddress + '\t' + expiresAt + '\t' + reason + '\n',
      'utf8',
    );
  }

  return { rule, denyRules };
}
