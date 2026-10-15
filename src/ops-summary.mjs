import { RULE_IDS } from './decider.mjs';
import { VERIFIED_POLICY_COMMIT, VERIFIED_POLICY_PATH } from './recovery.mjs';

export const INSPECTED_STAGE11_COMMIT = 'ecd80731f526c4a741fd50e6ebdd114426d77e14';
export const OFFICIAL_ATTACK_TOTAL = 41;

const PLAN = Object.freeze([
  ['S01-NORMAL-SHELL', 1, 'normal', 'GET /', '현재 배포 화면 HTTP 200', 'root'],
  ['S01-FORBIDDEN-DATA-EXPOSURE', 1, 'forbidden', 'GET /data.json', 'HTTP 200이지만 notes=[]이고 가상/비공개 메모 본문 없음', 'data_redacted'],
  ['S02-NORMAL-EMPTY-DATA', 2, 'normal', 'GET /data.json', 'HTTP 200 및 빈 notes 배열', 'data_redacted'],
  ['S02-FORBIDDEN-PUBLIC-NOTES', 2, 'forbidden', 'GET /api/notes (쿠키 없음)', '현재 최종 자료실에서는 401/403 JSON 거부', 'anonymous_notes'],
  ['S03-NORMAL-SESSION', 3, 'normal', 'GET /api/auth/session', '현재 로그인 세션이면 HTTP 200', 'session'],
  ['S03-FORBIDDEN-ANON-NOTES', 3, 'forbidden', 'GET /api/notes (쿠키 없음)', 'HTTP 401/403 JSON 거부', 'anonymous_notes'],
  ['S04-NORMAL-OWN-LIST', 4, 'normal', 'GET /api/notes', '승인된 현재 사용자면 HTTP 200', 'own_notes'],
  ['S04-FORBIDDEN-OTHER-NOTE', 4, 'forbidden', 'GET /api/notes/:other-id', '타인 시험 UUID면 HTTP 404 NOTE_NOT_FOUND', null],
  ['S05-NORMAL-SERVER-BOUNDARY', 5, 'normal', 'GET /api/notes', '서버 함수에서 HTTP 200', 'own_notes'],
  ['S05-FORBIDDEN-ORIGINAL-NO-KEY', 5, 'forbidden', 'GET originalApiUrl (키 없음)', '2xx가 아닌 직접 접근 거부', 'original_no_key'],
  ['S06-NORMAL-REGISTERED-DEVICE', 6, 'normal', 'ALEPH SDP 판정 요청 · deviceRegistered=true', 'allow / approved', null],
  ['S06-FORBIDDEN-UNREGISTERED', 6, 'forbidden', 'ALEPH SDP 판정 요청 · deviceRegistered=false', 'deny / device_not_registered', null],
  ['S07-NORMAL-FRESH-STEP-UP', 7, 'normal', 'ALEPH SDP 복합 이상 + fresh stepUp', 'allow / approved', null],
  ['S07-FORBIDDEN-STEP-UP-REQUIRED', 7, 'forbidden', 'ALEPH SDP 복합 이상 + 미확인', 'step_up / step_up_required', null],
  ['S08-NORMAL-OWN-RESOURCE', 8, 'normal', 'GET /api/notes/:own-id', '본인 시험 UUID면 HTTP 200', null],
  ['S08-FORBIDDEN-OTHER-RESOURCE', 8, 'forbidden', 'GET /api/notes/:other-id', '타인 시험 UUID면 HTTP 404 NOTE_NOT_FOUND', null],
  ['S09-NORMAL-DETECTION-OBSERVE', 9, 'normal', 'ALEPH SDP 탐지 정상 사건', 'observe', null],
  ['S09-FORBIDDEN-SUSPICIOUS-BURST', 9, 'forbidden', 'ALEPH SDP 탐지 복합 조회 폭주', 'suspicious + 단일 기기 회수 제안', null],
  ['S10-NORMAL-RESTORE', 10, 'normal', 'POST /api/restore/:own-backup-id', '검증된 본인 사본만 HTTP 200 restored=true', null],
  ['S10-FORBIDDEN-RESTORE-GET', 10, 'forbidden', 'GET /api/restore/:id', 'HTTP 405', 'restore_get'],
  ['S11-NORMAL-DEVICE-STATUS', 11, 'normal', 'GET /api/device?action=status', '로그인·승인 기기 세션에서 HTTP 200', 'device_status'],
  ['S11-FORBIDDEN-ANON-DEVICE', 11, 'forbidden', 'GET /api/device?action=status (쿠키 없음)', 'HTTP 401', 'anonymous_device'],
].map(([testId, stage, kind, request, expected, probe]) =>
  Object.freeze({ testId, stage, kind, request, expected, probe })));

export function verificationPlan() {
  return PLAN.map(({ testId, stage, kind, request, expected }) => ({
    testId,
    stage,
    kind,
    request,
    expected,
    execution: 'not_run',
    observed: null,
    requestId: null,
    checkedAt: null,
    matchesExpected: null,
  }));
}

export function probePlan() {
  return PLAN.filter((item) => item.probe !== null).map((item) => ({ ...item }));
}

export function officialAttackSlots() {
  return Array.from({ length: OFFICIAL_ATTACK_TOTAL }, (_, index) => ({
    testId: `ALEPH-ATTACK-${String(index + 1).padStart(2, '0')}`,
    execution: 'not_run',
    observed: null,
    requestId: null,
    checkedAt: null,
  }));
}

function countStates(records) {
  const counts = { total: records.length, actualApi: 0, confirmedFromCode: 0, notRun: 0 };
  for (const record of records) {
    if (record.state === 'actual_api') counts.actualApi += 1;
    else if (record.state === 'confirmed_from_code') counts.confirmedFromCode += 1;
    else if (record.state === 'not_run') counts.notRun += 1;
  }
  return counts;
}

export function buildOpsOverview({ generatedAt = new Date().toISOString(), deviceVerified = false } = {}) {
  const records = [
    {
      recordId: 'decision-rules',
      area: 'decision',
      state: 'confirmed_from_code',
      source: 'student',
      value: RULE_IDS.length,
      detail: RULE_IDS.join(', '),
    },
    {
      recordId: 'detection-feed',
      area: 'detection',
      state: 'not_run',
      source: 'ALEPH SDP engine',
      value: null,
      detail: '운영 엔진 사건 전달은 이 저장소에서 수신 연결을 확인하지 않았습니다.',
    },
    {
      recordId: 'revocation-enforcement',
      area: 'revocation',
      state: 'not_run',
      source: 'student',
      value: null,
      detail: '탐지기는 회수 제안만 만들며 실제 운영 기기 회수 집행은 확인하지 않았습니다.',
    },
    {
      recordId: 'recovery-baseline',
      area: 'recovery',
      state: 'confirmed_from_code',
      source: 'student',
      value: 1,
      detail: `${VERIFIED_POLICY_PATH} · 기준 ${VERIFIED_POLICY_COMMIT}`,
    },
    {
      recordId: 'current-device-gate',
      area: 'access',
      state: deviceVerified ? 'actual_api' : 'not_run',
      source: 'server',
      value: deviceVerified ? 1 : null,
      detail: deviceVerified
        ? '현재 /api/ops 요청에서 로그인과 승인 기기 증명을 서버가 확인했습니다.'
        : '현재 요청의 승인 기기 증명을 확인하지 못했습니다.',
    },
  ];

  const official = officialAttackSlots();
  return {
    schema: 'aleph.ops.summary.v1',
    inspectedCommit: INSPECTED_STAGE11_COMMIT,
    generatedAt,
    engine: {
      name: 'ALEPH SDP engine',
      source: 'provided',
      studentImplemented: false,
      operatingEventDelivery: 'not_run',
    },
    student: {
      ruleIds: [...RULE_IDS],
      detection: 'src/detect.mjs',
      recoveryBaseline: VERIFIED_POLICY_COMMIT,
      accessApp: 'public/index.html + public/device.mjs',
      vaultApi: '/api/notes + /api/notes/:id',
    },
    counts: countStates(records),
    redactedServerRecords: records,
    officialAttacks: {
      total: OFFICIAL_ATTACK_TOTAL,
      executed: 0,
      passed: 0,
      notRun: OFFICIAL_ATTACK_TOTAL,
      slots: official,
    },
  };
}

export function mergeVerificationResults(results) {
  const rows = verificationPlan();
  const byId = new Map((Array.isArray(results) ? results : []).map((item) => [item?.testId, item]));
  return rows.map((row) => {
    const actual = byId.get(row.testId);
    if (!actual) return row;
    return {
      ...row,
      execution: 'actual_api',
      observed: actual.observed,
      requestId: actual.requestId,
      checkedAt: actual.checkedAt,
      matchesExpected: actual.matchesExpected === true,
    };
  });
}
