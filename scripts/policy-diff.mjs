import {
  VERIFIED_POLICY_COMMIT,
  changedPolicyItems,
  comparePolicy,
  loadVerifiedPolicy,
} from '../src/recovery.mjs';

try {
  const snapshot = await loadVerifiedPolicy();
  const results = await comparePolicy(snapshot);
  const changed = changedPolicyItems(results);

  process.stdout.write(`검증된 안전 정책 사본: ${snapshot.label}\n`);
  process.stdout.write(`복원 기준 버전: ${VERIFIED_POLICY_COMMIT}\n`);
  process.stdout.write('사본 검증: 통과\n');
  process.stdout.write('현재 시험 정책과의 변경 범위:\n');

  if (!changed.length) {
    process.stdout.write('- 차이 없음\n');
  } else {
    for (const item of changed) {
      const keys = item.changedKeys?.length
        ? ` · 정책 키: ${item.changedKeys.join(', ')}`
        : '';
      process.stdout.write(`- ${item.path} · ${item.status}${keys}\n`);
    }
  }

  process.stdout.write('읽기 전용 비교만 수행했습니다. 실제 운영 정책과 현재 파일은 변경하지 않았습니다.\n');
} catch (error) {
  process.stderr.write(`정책 비교 중단: ${error.message}\n`);
  process.exitCode = 1;
}
