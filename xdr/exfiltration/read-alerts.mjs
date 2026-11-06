import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const DEFAULT_FIXTURE = new URL('../fixtures/exfiltration.json', import.meta.url);
const SECRET_LIKE = Object.freeze([
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/giu,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/giu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
  /\b(?:sb_secret_|sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9_-]{12,}/gu,
  /\b(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key)\s*[=:]\s*[^\s&;,]+/giu,
]);
function hideSecretLike(value) { if (typeof value !== 'string') return ''; return SECRET_LIKE.reduce((text,pattern)=>text.replace(pattern,'[가림]'),value); }
export function projectAlert(alert) { return { timestamp: typeof alert?.timestamp==='string'?alert.timestamp:'', sourceAddress: typeof alert?.data?.srcip==='string'?alert.data.srcip:'', account: hideSecretLike(alert?.data?.srcuser), ruleLevel: Number.isFinite(alert?.rule?.level)?alert.rule.level:null, description: hideSecretLike(alert?.rule?.description) }; }
export async function readAlerts(fixtureUrl=DEFAULT_FIXTURE) { const raw=await readFile(fixtureUrl,'utf8'); const fixture=JSON.parse(raw); if (fixture?.schema!=='aleph.xdr.fixture.v1'||fixture.moduleKey!=='exfiltration'||!Array.isArray(fixture.alerts)) throw new Error('exfiltration 경보 묶음 형식이 아닙니다.'); const rows=fixture.alerts.map(projectAlert); if(rows.length!==fixture.alerts.length) throw new Error('경보 건수와 출력 줄 수가 다릅니다.'); return rows; }
const isMain=process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url));
if(isMain){try{const rows=await readAlerts(); for(const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`); process.stderr.write(`경보 ${rows.length}건 · 출력 ${rows.length}줄\n`);}catch(error){process.stderr.write(`경보 읽기 오류: ${error instanceof Error?error.message:'알 수 없는 오류'}\n`);process.exitCode=1;}}
