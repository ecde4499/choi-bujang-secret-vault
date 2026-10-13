// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 6단계의 등록 기기 규칙을 유지하고, 7단계는 엔진이 만든 가상 접속 신호만 연습에 사용합니다.
// 브라우저 헤더나 임의 사용자·위치·기기 값을 판정 근거로 승격하지 않습니다.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

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

export async function decide(request) {
  if (request?.deviceRegistered !== true) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request?.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: [RULE_IDS[0]],
    };
  }

  if (needsStepUp(request) && !hasFreshStepUp(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: [RULE_IDS[0], RULE_IDS[1]],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds: needsStepUp(request) ? [RULE_IDS[0], RULE_IDS[1]] : [RULE_IDS[0]],
  };
}
