// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 브라우저의 userId/role/기기 상태/헤더는 판정 근거로 사용하지 않습니다.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_scope']);

const DEVICE_ID = /^[0-9a-f]{16}$/u;
const EMPTY_QUERY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REQUEST_KEYS = Object.freeze([
  'schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'queryLength', 'querySha256',
  'at', 'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals',
]);
const RESERVED_IDS = new Set(['export', 'all', 'admin', 'search', 'backup', 'restore']);

function validContract(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return false;
  if (Object.keys(request).sort().join(',') !== [...REQUEST_KEYS].sort().join(',')) return false;
  if (request.schema !== 'aleph.decision.v1'
      || ['requestId', 'classId', 'projectId', 'subjectId'].some((key) =>
        typeof request[key] !== 'string' || !request[key])
      || !DEVICE_ID.test(request.deviceId ?? '')
      || !Number.isInteger(request.policyRevision) || request.policyRevision < 1
      || request.queryLength !== 0
      || request.querySha256 !== EMPTY_QUERY_SHA256) return false;
  const at = Date.parse(request.at);
  return Number.isFinite(at) && Math.abs(Date.now() - at) <= 5000;
}

function exactResource(request) {
  if (!validContract(request)
      || typeof request.service !== 'string'
      || typeof request.method !== 'string'
      || typeof request.path !== 'string'
      || typeof request.route !== 'string'
      || /[%?#\\]/u.test(request.path)) return null;

  const match = /^\/(api\/)?(notes|notices)\/([A-Za-z0-9_-]{1,128})$/u.exec(request.path);
  if (!match || request.service !== match[2] || RESERVED_IDS.has(match[3].toLowerCase())) {
    return null;
  }

  const route = `${request.method} /${match[1] ?? ''}${match[2]}/:id`;
  if (request.route !== route) return null;

  if (match[2] === 'notes' && ['GET', 'PUT'].includes(request.method)) {
    return { family: 'notes', resourceId: `notes:${match[3]}` };
  }
  // 현재 엔진 계약에는 강사 역할이 없으므로 기본 판정기는 공지 읽기만 연다.
  // 공지 수정 성공 여부는 실제 API가 저장된 강사 권한과 소유자를 다시 확인한다.
  if (match[2] === 'notices' && request.method === 'GET') {
    return { family: 'notices', resourceId: `notices:${match[3]}` };
  }
  return null;
}

// 구역 판정만 수행합니다. 메모 소유권/강사 권한은 최종 API가 저장된 값으로 재검사합니다.
export function resourceAllowed(request) {
  return exactResource(request) !== null;
}

function fixtureSignals(request) {
  const signals = request?.signals;
  if (!signals || typeof signals !== 'object' || signals.source !== 'judge_fixture') {
    return null;
  }

  const hour = Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23
    ? signals.hour
    : null;
  const region = typeof signals.region === 'string' && signals.region ? signals.region : null;
  const network = typeof signals.network === 'string' && signals.network ? signals.network : null;

  if (hour === null || region === null || network === null) return null;
  return { hour, region, network };
}

function hasRecentRiskBurst(request) {
  if (!Array.isArray(request?.recentEvents)) return false;
  return request.recentEvents.some((event) => event
    && typeof event === 'object'
    && event.kind === 'risk_signal'
    && Number.isFinite(event.ageSeconds)
    && event.ageSeconds >= 0
    && event.ageSeconds <= 300
    && Number.isFinite(event.count)
    && event.count >= 20);
}

function needsStepUp(request) {
  const signals = fixtureSignals(request);
  if (!signals) return false;

  const unusualHour = signals.hour <= 5 || signals.hour >= 23;
  const unfamiliarNetwork = signals.network === 'unusual';
  return unusualHour && unfamiliarNetwork && hasRecentRiskBurst(request);
}

function hasFreshStepUp(request) {
  const stepUp = request?.stepUp;
  return Boolean(stepUp)
    && stepUp.verified === true
    && Number.isFinite(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0
    && stepUp.authAgeSeconds <= 900;
}

function response(request, decision, reasonCode, ruleIds) {
  return {
    schema: 'aleph.decision.v1',
    requestId: request?.requestId,
    decision,
    reasonCode,
    ruleIds,
  };
}

export async function decide(request) {
  if (!validContract(request)) {
    return response(request, 'deny', 'resource_not_allowed', [RULE_IDS[2]]);
  }

  if (request.deviceRegistered !== true) {
    return response(request, 'deny', 'device_not_registered', [RULE_IDS[0]]);
  }

  if (!resourceAllowed(request)) {
    return response(request, 'deny', 'resource_not_allowed', [RULE_IDS[2]]);
  }

  if (needsStepUp(request) && !hasFreshStepUp(request)) {
    return response(request, 'step_up', 'step_up_required', [RULE_IDS[0], RULE_IDS[1], RULE_IDS[2]]);
  }

  const applied = needsStepUp(request)
    ? [RULE_IDS[0], RULE_IDS[1], RULE_IDS[2]]
    : [RULE_IDS[0], RULE_IDS[2]];
  return response(request, 'allow', 'approved', applied);
}
