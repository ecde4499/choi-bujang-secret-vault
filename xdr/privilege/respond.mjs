import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_LOG = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'alerts.log');
const BLOCK_REASONS = new Set([
  'repeated_admin_group_addition',
  'account_added_to_admin_group',
  'unfamiliar_privileged_command',
  'off_hours_privileged_use',
]);

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
function safeAccount(alert) {
  const value = alert?.data?.srcuser;
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/u.test(value) ? value : null;
}
function hasPrivilegeTechnique(alert) {
  const level = Number(alert?.rule?.level);
  if (!Number.isFinite(level) || level < 10) return false;
  return Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.some((value) =>
    typeof value === 'string' && ['T1068', 'T1078'].includes(value.split('.')[0].toUpperCase()));
}

export function createDenyRule(alert, decision, {
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (!decision || decision.action !== 'block' || decision.confidence < 0.85
      || !BLOCK_REASONS.has(decision.reason) || !hasPrivilegeTechnique(alert)) return null;

  const alertId = safeAlertId(alert);
  const sourceAddress = safeSource(alert);
  const account = safeAccount(alert);
  if (!alertId || !sourceAddress || !account) return null;

  const expiresAt = new Date(now.getTime() + ttlMs);
  if (!Number.isFinite(expiresAt.getTime())) return null;

  return {
    ruleId: `xdr.privilege.${alertId}`,
    effect: 'deny',
    sourceAddress,
    account,
    expiresAt: expiresAt.toISOString(),
    evidenceAlertId: alertId,
    reason: decision.reason,
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
  const account = safeAccount(alert);
  if (alertId && sourceAddress && account) {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(
      logPath,
      `${new Date(now).toISOString()}\t${decision.action}\t${alertId}\t${sourceAddress}\t${account}\t${rule?.expiresAt ?? '-'}\t${decision.reason}\n`,
      'utf8',
    );
  }

  return { rule, denyRules };
}

export async function respondAlerts(alerts, decisions, options = {}) {
  if (!Array.isArray(alerts) || !Array.isArray(decisions) || alerts.length !== decisions.length) {
    throw new TypeError('alerts 와 decisions 는 같은 길이여야 합니다.');
  }
  const denyRules = [];
  for (let index = 0; index < alerts.length; index += 1) {
    await respond(alerts[index], decisions[index], { ...options, denyRules });
  }
  return denyRules;
}
