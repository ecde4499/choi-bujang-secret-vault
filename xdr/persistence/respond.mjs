import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_LOG = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'alerts.log');

function safeAlertId(alert) {
  return typeof alert?.id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/iu.test(alert.id)
    ? alert.id
    : null;
}

function safeSource(alert) {
  const value = alert?.data?.srcip;
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value)) return null;
  return value.split('.').every((part) => Number(part) <= 255) ? value : null;
}

function hasClearPersistenceSignal(alert) {
  const techniques = new Set((Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.split('.')[0].toUpperCase()));
  const level = Number(alert?.rule?.level);
  if (!Number.isFinite(level) || level < 10 || (!techniques.has('T1543') && !techniques.has('T1053'))) return false;

  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const path = typeof alert?.data?.path === 'string'
    ? alert.data.path.toLowerCase().replaceAll('/', '\\')
    : '';
  const count = Number.parseInt(alert?.data?.count ?? '', 10);
  const tempPath = path.includes('\\appdata\\local\\temp\\');
  const startupPath = path.includes('\\start menu\\programs\\startup\\');

  const clearService = techniques.has('T1543') && /서비스/u.test(description)
    && /서명\s*없|새\s*서비스|등록|바뀌|변경|평소\s*목록에\s*없는|다시\s*켜도\s*남/u.test(description)
    && (tempPath || (Number.isFinite(count) && count >= 2));
  const clearTask = techniques.has('T1053') && /예약\s*작업/u.test(description)
    && (tempPath || /처음\s*보는|임의\s*문자열|수업\s*시간\s*밖/u.test(description));
  const clearStartup = techniques.has('T1543')
    && (startupPath || (/시작\s*폴더|시작\s*프로그램/u.test(description)
      && /평소\s*목록에\s*없는|추가|변경|같은\s*임시\s*파일/u.test(description)));
  return clearService || clearTask || clearStartup;
}

export function createDenyRule(alert, decision, {
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (!decision || decision.action !== 'block' || decision.confidence < 0.85
      || !hasClearPersistenceSignal(alert)) return null;

  const alertId = safeAlertId(alert);
  const sourceAddress = safeSource(alert);
  if (!alertId || !sourceAddress) return null;

  const expiresAt = new Date(now.getTime() + ttlMs);
  if (!Number.isFinite(expiresAt.getTime())) return null;
  return {
    ruleId: `xdr.persistence.${alertId}`,
    effect: 'deny',
    sourceAddress,
    expiresAt: expiresAt.toISOString(),
    evidenceAlertId: alertId,
    reason: typeof decision.reason === 'string' ? decision.reason : 'persistence_pattern',
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
    const reason = typeof decision.reason === 'string'
      ? decision.reason.replace(/[\r\n\t]+/gu, ' ').slice(0, 160)
      : 'persistence_pattern';
    await appendFile(
      logPath,
      `${new Date(now).toISOString()}\t${decision.action}\t${alertId}\t${sourceAddress}\t${rule?.expiresAt ?? '-'}\t${reason}\n`,
      'utf8',
    );
  }

  return { rule, denyRules };
}
