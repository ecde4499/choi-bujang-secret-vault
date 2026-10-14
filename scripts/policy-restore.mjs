import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildPolicyRestorePlan,
  comparePolicy,
  loadVerifiedPolicy,
} from '../src/recovery.mjs';

const root = resolve(import.meta.dirname, '..');
const auditPath = resolve(root, 'artifacts', 'policy-restore-audit.jsonl');
const apply = process.argv.includes('--apply');
const confirm = process.argv.find((arg) => arg.startsWith('--confirm='))
  ?.slice('--confirm='.length);

function publicItem(item) {
  return {
    path: item.path,
    status: item.status,
    changedKeys: item.changedKeys,
    beforeSha256: item.beforeSha256,
    afterSha256: item.afterSha256,
  };
}

function printPlan(plan) {
  process.stdout.write(`검증된 안전 정책 사본: ${plan.label}\n`);
  process.stdout.write(`복원 기준 버전: ${plan.verifiedCommit}\n`);
  process.stdout.write('실행 전 변경 범위:\n');

  if (!plan.items.length) {
    process.stdout.write('- 되돌릴 정책 차이 없음\n');
    return;
  }

  for (const item of plan.items) {
    const keys = item.changedKeys?.length
      ? ` · 정책 키: ${item.changedKeys.join(', ')}`
      : '';
    process.stdout.write(`- ${item.path} · ${item.status}${keys}\n`);
  }
  process.stdout.write(`확인 번호: ${plan.changeSet}\n`);
}

try {
  const snapshot = await loadVerifiedPolicy();
  const plan = await buildPolicyRestorePlan(snapshot);
  printPlan(plan);

  if (!plan.items.length) {
    process.stdout.write('현재 시험 정책은 검증된 정책 범위와 같습니다. 아무것도 변경하지 않았습니다.\n');
  } else if (!apply) {
    process.stdout.write('아직 아무것도 변경하지 않았습니다. 위 범위를 확인한 뒤 같은 상태에서 아래 명령으로만 적용합니다.\n');
    process.stdout.write(`npm run policy:restore -- --apply --confirm=${plan.changeSet}\n`);
  } else {
    if (!confirm || confirm !== plan.changeSet) {
      throw new Error('policy_restore_confirmation_mismatch');
    }

    await mkdir(dirname(auditPath), { recursive: true });
    await appendFile(auditPath, `${JSON.stringify({
      at: new Date().toISOString(),
      action: 'policy_restore_started',
      verifiedCommit: plan.verifiedCommit,
      changeSet: plan.changeSet,
      files: plan.items.map(publicItem),
    })}\n`, 'utf8');

    for (const item of plan.items) {
      const target = resolve(root, item.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, item.restored, 'utf8');
    }

    const after = await comparePolicy(snapshot);
    const remaining = after.filter((item) => item.status !== 'same');
    if (remaining.length) {
      throw new Error('policy_restore_verification_failed');
    }

    await appendFile(auditPath, `${JSON.stringify({
      at: new Date().toISOString(),
      action: 'policy_restore_completed',
      verifiedCommit: plan.verifiedCommit,
      changeSet: plan.changeSet,
      files: plan.items.map(publicItem),
    })}\n`, 'utf8');

    process.stdout.write(`${plan.items.length}개 시험 정책 항목을 검증된 버전으로 되돌렸습니다.\n`);
    process.stdout.write('다른 파일과 기존 감사 이력은 보존했습니다. 실제 운영 정책이나 DB는 변경하지 않았습니다.\n');
  }
} catch (error) {
  process.stderr.write(`정책 복원 중단: ${error.message}\n`);
  process.exitCode = 1;
}
