// 9단계 탐지 입력과 로컬 복합 탐지 규칙입니다.
// 반 엔진이 검증한 가상 사건에서 필요한 메타데이터만 새 객체로 옮깁니다.
// 메모 내용, 토큰, 실명 같은 나머지 필드는 복사하거나 출력하지 않습니다.

const SUBJECT = /^[A-Za-z0-9_-]{1,128}$/u;
const DEVICE_ID = /^[0-9a-f]{16}$/u;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const DECISIONS = new Set(['allow', 'deny', 'step_up']);
const WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 120;

const isPlainObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value);

function readEvent(event) {
  if (!isPlainObject(event) || !isPlainObject(event.identity)) return null;

  const subject = event.identity.sub;
  const method = event.method;
  const at = event.at;
  if (typeof subject !== 'string' || !SUBJECT.test(subject)
      || typeof method !== 'string' || !METHODS.has(method)
      || typeof at !== 'string') return null;

  const time = Date.parse(at);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== at) return null;

  const hasDevice = Object.hasOwn(event, 'deviceId');
  const hasDecision = Object.hasOwn(event, 'decision');
  if (hasDevice !== hasDecision) return null;

  if (!hasDevice) {
    return Object.freeze({ subject, deviceId: null, method, decision: null, at });
  }

  if (typeof event.deviceId !== 'string' || !DEVICE_ID.test(event.deviceId)
      || typeof event.decision !== 'string' || !DECISIONS.has(event.decision)) return null;

  return Object.freeze({
    subject,
    deviceId: event.deviceId,
    method,
    decision: event.decision,
    at,
  });
}

export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  return events.map(readEvent).filter(Boolean);
}

function firstLegacyBurst(read) {
  const groups = new Map();
  for (const event of read) {
    if (event.deviceId !== null || event.decision !== null || event.method !== 'GET') continue;
    if (!groups.has(event.subject)) groups.set(event.subject, []);
    groups.get(event.subject).push(Date.parse(event.at));
  }

  for (const [subject, times] of groups) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] >= WINDOW_MS) start += 1;
      if (end - start + 1 > BURST_LIMIT) return subject;
    }
  }
  return null;
}

function firstSuspiciousBurst(read) {
  const groups = new Map();

  for (const event of read) {
    if (event.deviceId === null || event.decision === null
        || event.method !== 'GET' || event.decision === 'deny') continue;
    const key = `${event.subject}\u0000${event.deviceId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  let found = null;
  for (const items of groups.values()) {
    items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let start = 0;
    let steppedUp = 0;

    for (let end = 0; end < items.length; end += 1) {
      if (items[end].decision === 'step_up') steppedUp += 1;
      while (Date.parse(items[end].at) - Date.parse(items[start].at) >= WINDOW_MS) {
        if (items[start].decision === 'step_up') steppedUp -= 1;
        start += 1;
      }

      const count = end - start + 1;
      if (count > BURST_LIMIT && steppedUp > 0) {
        const candidate = {
          subject: items[end].subject,
          deviceId: items[end].deviceId,
          detectedAt: items[end].at,
        };
        if (!found || candidate.detectedAt < found.detectedAt) found = candidate;
        break;
      }
    }
  }
  return found;
}

// 기존 시작 틀의 3필드 사건은 원래 detect(events) 계약을 유지합니다.
// 기기·판정이 있는 9단계 확장 사건은 같은 기기의 조회 폭주와 step_up 판정이
// 한 10분 창에 함께 있을 때만 suspicious로 표시합니다.
export function detect(events) {
  const read = readDetectionEvents(events);
  const extended = read.some((event) => event.deviceId !== null);

  if (!extended) {
    const subject = firstLegacyBurst(read);
    return subject
      ? { action: 'propose_revocation', reasonCode: 'burst_read', subject }
      : { action: 'observe' };
  }

  const found = firstSuspiciousBurst(read);
  return found
    ? {
        action: 'suspicious',
        reasonCode: 'burst_read',
        subject: found.subject,
        deviceId: found.deviceId,
      }
    : { action: 'observe' };
}

// 확장 사건의 탐지 결과와 별도로 만드는 회수 제안입니다.
// 실제 회수 API를 호출하거나 기기 권한을 바꾸지 않습니다.
export function revocationProposal(events) {
  const found = firstSuspiciousBurst(readDetectionEvents(events));
  if (!found) return null;

  return Object.freeze({
    action: 'propose_revocation',
    reasonCode: 'burst_read',
    target: Object.freeze({
      subject: found.subject,
      deviceId: found.deviceId,
    }),
  });
}
