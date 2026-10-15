import assert from 'node:assert/strict';
import { RULE_IDS } from '../src/decider.mjs';
import {
  INSPECTED_STAGE11_COMMIT,
  OFFICIAL_ATTACK_TOTAL,
  buildOpsOverview,
  officialAttackSlots,
  verificationPlan,
} from '../src/ops-summary.mjs';

function pass(message) {
  process.stdout.write(`통과 · ${message}\n`);
}

const overview = buildOpsOverview({
  generatedAt: '2026-01-01T00:00:00.000Z',
  deviceVerified: true,
});

assert.deepEqual(overview.student.ruleIds, [...RULE_IDS]);
assert.deepEqual(RULE_IDS, ['device_registered', 'step_up_required', 'resource_scope']);
pass('작전실 판정 규칙은 실제 RULE_IDS 3개만 사용');

const recomputed = { total: 0, actualApi: 0, confirmedFromCode: 0, notRun: 0 };
for (const record of overview.redactedServerRecords) {
  recomputed.total += 1;
  if (record.state === 'actual_api') recomputed.actualApi += 1;
  if (record.state === 'confirmed_from_code') recomputed.confirmedFromCode += 1;
  if (record.state === 'not_run') recomputed.notRun += 1;
}
assert.deepEqual(overview.counts, recomputed);
pass('화면 수치용 요약과 가린 서버 기록 집계가 일치');

const detection = overview.redactedServerRecords.find(item => item.area === 'detection');
const revocation = overview.redactedServerRecords.find(item => item.area === 'revocation');
assert.equal(detection?.state, 'not_run');
assert.equal(revocation?.state, 'not_run');
assert.equal(overview.engine.name, 'ALEPH SDP engine');
assert.equal(overview.engine.source, 'provided');
pass('운영 탐지 사건과 실제 회수 집행을 미실행으로 구분');

assert.equal(overview.inspectedCommit, INSPECTED_STAGE11_COMMIT);
assert.match(overview.student.recoveryBaseline, /^[a-f0-9]{40}$/u);
pass('검사 기준 11단계 커밋과 복구 기준 버전을 분리해 표시');

const slots = officialAttackSlots();
assert.equal(slots.length, OFFICIAL_ATTACK_TOTAL);
assert.equal(slots.every(item => item.execution === 'not_run'), true);
assert.equal(overview.officialAttacks.executed, 0);
assert.equal(overview.officialAttacks.passed, 0);
assert.equal(overview.officialAttacks.notRun, 41);
pass('실행하지 않은 공식 41종을 통과로 세지 않음');

const plan = verificationPlan();
assert.equal(plan.length, 22);
for (let stage = 1; stage <= 11; stage += 1) {
  assert.equal(plan.some(item => item.stage === stage && item.kind === 'normal'), true);
  assert.equal(plan.some(item => item.stage === stage && item.kind === 'forbidden'), true);
}
assert.equal(plan.every(item => item.execution === 'not_run'
  && item.observed === null && item.requestId === null && item.checkedAt === null), true);
pass('1~11단계 정상·금지 요청 표는 실행 전 모두 미실행');

const serialized = JSON.stringify({ overview, plan });
for (const forbidden of ['password', 'access_token', 'refresh_token', 'private_key', 'noteBody', 'email']) {
  assert.equal(serialized.includes(forbidden), false);
}
assert.equal(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u.test(serialized), false);
pass('작전실 모델에 토큰·비밀번호·이메일·기기 개인키·가상 메모 본문 없음');

process.stdout.write('로컬 구조 점검이며 실제 API 실측·ALEPH 41종 판정·운영 회수 증거가 아닙니다.\n');
