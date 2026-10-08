const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'rapid_same_source_failures',
    condition: '같은 출발 주소에서 짧은 시간에 로그인 실패가 반복되거나 실패 건수가 비정상적으로 크게 누적됨',
    evidence: 'MITRE ATT&CK T1110은 반복적인 인증 시도로 자격 증명을 추측하는 무차별 대입을 다룬다.',
  }),
  Object.freeze({
    name: 'password_spraying_multiple_accounts',
    condition: '같은 출발 주소에서 동일한 비밀번호를 여러 계정에 연속 적용한 정황이 명시됨',
    evidence: 'MITRE ATT&CK T1110의 무차별 대입에는 여러 계정에 같은 비밀번호를 시도하는 password spraying 형태가 포함된다.',
  }),
]);

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function hasT1110(alert) {
  return Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1110');
}

function countOf(alert) {
  const value = Number.parseInt(alert?.data?.count ?? '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function descriptionOf(alert) {
  return typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
}

function levelOf(alert) {
  return Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
}

function sprayMatch(description) {
  const samePassword = /같은 비밀번호/u.test(description);
  const multipleAccounts = /여러 계정|서로 다른 계정|계정\s*\d+개/u.test(description);
  return samePassword && multipleAccounts;
}

function rapidFailureConfidence(alert) {
  const description = descriptionOf(alert);
  const count = countOf(alert);
  let confidence = 0;

  if (count >= 40) confidence = 0.9;
  else if (count >= 20) confidence = 0.88;
  else if (count >= 10) confidence = 0.8;
  else if (count >= 6) confidence = 0.65;
  else if (count >= 3) confidence = 0.6;
  else if (/로그인 실패|실패/u.test(description)) confidence = 0.45;

  if (/1분|2분|3분|5분|분 안/u.test(description)) confidence += 0.05;
  if (/같은 주소|한 주소/u.test(description)) confidence += 0.05;
  if (levelOf(alert) >= 10) confidence += 0.05;
  if (/성공했습니다|뒤에 성공|그 뒤 성공/u.test(description)) confidence -= 0.05;

  return clamp(confidence);
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert) || !hasT1110(alert)) {
    return {
      action: 'record',
      confidence: 0.1,
      reason: 'no_matching_brute_force_pattern',
    };
  }

  const description = descriptionOf(alert);
  let confidence;
  let patternName;

  if (sprayMatch(description)) {
    confidence = 0.96;
    patternName = PATTERNS[1].name;
  } else {
    confidence = rapidFailureConfidence(alert);
    patternName = PATTERNS[0].name;
  }

  const action = confidence >= 0.85 ? 'block'
    : confidence >= 0.5 ? 'alert'
      : 'record';

  return {
    action,
    confidence,
    reason: action === 'record'
      ? `${patternName}: 근거 부족`
      : patternName,
  };
}
