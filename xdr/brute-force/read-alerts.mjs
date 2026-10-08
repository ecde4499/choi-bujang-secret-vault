import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_FIXTURE = new URL('../fixtures/brute-force.json', import.meta.url);

export function projectAlert(alert) {
  return {
    timestamp: typeof alert?.timestamp === 'string' ? alert.timestamp : '',
    sourceAddress: typeof alert?.data?.srcip === 'string' ? alert.data.srcip : '',
    account: typeof alert?.data?.srcuser === 'string' ? alert.data.srcuser : '',
    ruleLevel: Number.isFinite(alert?.rule?.level) ? alert.rule.level : null,
    description: typeof alert?.rule?.description === 'string' ? alert.rule.description : '',
  };
}

export async function readAlerts(fixtureUrl = DEFAULT_FIXTURE) {
  const raw = await readFile(fixtureUrl, 'utf8');
  const fixture = JSON.parse(raw);
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'brute-force'
      || !Array.isArray(fixture.alerts)) {
    throw new Error('brute-force 경보 묶음 형식이 아닙니다.');
  }
  return fixture.alerts.map(projectAlert);
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const rows = await readAlerts();
    for (const row of rows) {
      process.stdout.write(`${JSON.stringify(row)}\n`);
    }
  } catch (error) {
    process.stderr.write(`경보 읽기 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}\n`);
    process.exitCode = 1;
  }
}
