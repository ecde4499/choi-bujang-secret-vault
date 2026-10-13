import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const START = Date.UTC(2026, 9, 1, 0, 0, 0);
const subject = 'learner_fixture';
const deviceA = 'aaaaaaaaaaaaaaaa';
const deviceB = 'bbbbbbbbbbbbbbbb';

function reads(count, {
  intervalSeconds = 2,
  owner = subject,
  deviceId = deviceA,
  decision = 'allow',
  stepUpAt = -1,
  method = 'GET',
  start = START,
} = {}) {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * intervalSeconds * 1000).toISOString(),
    method,
    identity: { sub: owner },
    deviceId,
    decision: index === stepUpAt ? 'step_up' : decision,
    noteBody: 'not-copied',
    authorization: 'not-copied',
  }));
}

const proposal = {
  action: 'suspicious',
  reasonCode: 'burst_read',
  subject,
  deviceId: deviceA,
};

function legacyReads(count, { intervalSeconds = 2, owner = subject } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(START + index * intervalSeconds * 1000).toISOString(),
    method: 'GET',
    identity: { sub: owner },
  }));
}

const cases = [
  { name: '정상 조회 30건 유지', events: reads(30), expected: { action: 'observe' } },
  { name: '다량 조회만 있으면 유지', events: reads(121), expected: { action: 'observe' } },
  { name: '네트워크 복합 판정만 있으면 유지',
    events: reads(30, { stepUpAt: 10 }), expected: { action: 'observe' } },
  { name: '복합 판정과 다량 조회가 함께 있으면 의심',
    events: reads(121, { stepUpAt: 60 }), expected: proposal },
  { name: '서로 다른 기기 조회는 합산하지 않음',
    events: [...reads(100), ...reads(100, { deviceId: deviceB, stepUpAt: 50 })]
      .sort((a, b) => a.at.localeCompare(b.at)),
    expected: { action: 'observe' } },
  { name: '서로 다른 사용자 조회는 합산하지 않음',
    events: [...reads(100), ...reads(100, { owner: 'other_fixture', stepUpAt: 50 })]
      .sort((a, b) => a.at.localeCompare(b.at)),
    expected: { action: 'observe' } },
  { name: '10분 밖 조회는 합산하지 않음',
    events: reads(121, { intervalSeconds: 6, stepUpAt: 60 }),
    expected: { action: 'observe' } },
  { name: '쓰기 요청은 조회 폭주로 세지 않음',
    events: reads(121, { method: 'PUT', stepUpAt: 60 }),
    expected: { action: 'observe' } },
];

const normalInput = reads(1);
const expectedRead = [{
  subject,
  deviceId: deviceA,
  method: 'GET',
  decision: 'allow',
  at: new Date(START).toISOString(),
}];

// Local practice only. This does not prove live event delivery or revocation.
export async function checkDetection({ readDetectionEvents, detect, revocationProposal }) {
  if (typeof readDetectionEvents !== 'function' || typeof detect !== 'function'
      || typeof revocationProposal !== 'function') {
    throw new TypeError('src/detect.mjs의 입력 읽기·탐지·회수 제안 함수를 확인해 주세요.');
  }

  const results = [
    { name: '기존 3필드 계약 120건은 관찰',
      passed: isDeepStrictEqual(await detect(legacyReads(120)), { action: 'observe' }) },
    { name: '기존 3필드 계약 121건 회수 제안 호환',
      passed: isDeepStrictEqual(await detect(legacyReads(121)), {
        action: 'propose_revocation', reasonCode: 'burst_read', subject,
      }) },
    { name: '가명 사용자·기기·요청·판정만 읽기',
      passed: isDeepStrictEqual(readDetectionEvents(normalInput), expectedRead) },
    { name: '형식이 잘못된 기기 사건 제외',
      passed: isDeepStrictEqual(readDetectionEvents([{ ...normalInput[0], deviceId: 'bad' }]), []) },
  ];

  for (const item of cases) {
    const actual = await detect(item.events);
    results.push({ name: item.name, passed: isDeepStrictEqual(actual, item.expected) });
  }

  const suspiciousEvents = reads(121, { stepUpAt: 60 });
  results.push(
    { name: '정상 사건은 회수 제안을 내지 않음',
      passed: revocationProposal(reads(30)) === null },
    { name: '의심 사건은 확인된 기기 한 개 회수 제안',
      passed: isDeepStrictEqual(revocationProposal(suspiciousEvents), {
        action: 'propose_revocation',
        reasonCode: 'burst_read',
        target: { subject, deviceId: deviceA },
      }) },
    { name: '다른 기기 사건을 회수 대상으로 넓히지 않음',
      passed: isDeepStrictEqual(revocationProposal([
        ...reads(121, { stepUpAt: 60 }),
        ...reads(30, { deviceId: deviceB }),
      ]), {
        action: 'propose_revocation',
        reasonCode: 'burst_read',
        target: { subject, deviceId: deviceA },
      }) },
  );

  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { readDetectionEvents, detect, revocationProposal } = await import('../src/detect.mjs');
    const results = await checkDetection({ readDetectionEvents, detect, revocationProposal });
    for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
    process.stdout.write('가상 사건 탐지 연습이며 실제 접속 회수나 심판 통과 증거가 아닙니다.\n');
    if (results.some((item) => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`탐지 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
