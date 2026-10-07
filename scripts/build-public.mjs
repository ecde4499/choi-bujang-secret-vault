import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));

if (![1, 2, 3, 4, 5].includes(config.step)) {
  throw new Error('현재 시작 틀 빌드는 1~5단계까지만 지원합니다.');
}

await mkdir(resolve(root, 'public'), { recursive: true });

if (config.step === 1) {
  const source = resolve(root, 'data.json');
  const data = JSON.parse(await readFile(source, 'utf8'));
  if (!Array.isArray(data.notes)) {
    throw new Error('실습용 공개 자료 형식을 확인하세요. 실제 학생 자료를 넣으면 안 됩니다.');
  }
  await writeFile(resolve(root, 'public', 'data.json'),
    `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log('1단계 실습용 공개 자료를 public/data.json에 기록했습니다.');
} else {
  await writeFile(resolve(root, 'public', 'data.json'), '{\n  "notes": []\n}\n', 'utf8');
  console.log(`${config.step}단계에서는 public/data.json에 메모 본문을 두지 않습니다.`);
}

if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
