import { isDeepStrictEqual } from 'node:util';
import { restorePrivateNote } from '../src/recovery.mjs';

const noteId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const contentSha256 = 'a'.repeat(64);

function fakeDb(result) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return result;
    },
  };
}

const results = [];

const okDb = fakeDb({
  data: { id: noteId, restored: true, contentSha256 },
  error: null,
});
const restored = await restorePrivateNote({
  db: okDb,
  noteId,
  principal: { userId: ownerId },
});
results.push({
  name: '지정한 한 건의 ID와 해시만 반환',
  passed: isDeepStrictEqual(restored, { id: noteId, restored: true, contentSha256 })
    && isDeepStrictEqual(okDb.calls, [{
      name: 'restore_verified_note_backup',
      args: { p_note_id: noteId, p_actor_id: ownerId },
    }]),
});

const otherDb = fakeDb({ data: null, error: { message: 'backup_not_found' } });
let otherDenied = false;
try {
  await restorePrivateNote({ db: otherDb, noteId, principal: { userId: otherId } });
} catch (error) {
  otherDenied = error.message === 'restore_not_found';
}
results.push({ name: '다른 소유자의 사본 복원 거부', passed: otherDenied });

const badHashDb = fakeDb({ data: null, error: { message: 'backup_verification_failed' } });
let hashDenied = false;
try {
  await restorePrivateNote({ db: badHashDb, noteId, principal: { userId: ownerId } });
} catch (error) {
  hashDenied = error.message === 'restore_verification_failed';
}
results.push({ name: '내용 해시가 맞지 않는 사본 거부', passed: hashDenied });

const wrongResultDb = fakeDb({
  data: { id: noteId, restored: true, contentSha256: 'not-a-hash' },
  error: null,
});
let resultDenied = false;
try {
  await restorePrivateNote({ db: wrongResultDb, noteId, principal: { userId: ownerId } });
} catch (error) {
  resultDenied = error.message === 'restore_verification_failed';
}
results.push({ name: '복원 후 검증 결과가 틀리면 거부', passed: resultDenied });

for (const item of results) {
  process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
}
process.stdout.write('가상 DB 연습이며 실제 B 메모 복구나 심판 통과 증거가 아닙니다.\n');
if (results.some((item) => !item.passed)) process.exitCode = 1;
