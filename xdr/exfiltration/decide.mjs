const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'large_transfer_to_unfamiliar_destination',
    condition: 'T1041 또는 T1048 경보에서 규칙 수준 10 이상, 목적지 존재, 50000000바이트 이상 전송이며 설명에 처음 보는 목적지·주소가 나타남',
    evidence: 'MITRE ATT&CK T1041·T1048 탐지에서는 대량 외부 전송과 드문 목적지 또는 대체 경로를 유출 신호로 볼 수 있다.',
  }),
  Object.freeze({
    name: 'off_hours_archive_exfiltration',
    condition: 'T1048 경보에서 규칙 수준 10 이상, 목적지 존재, 50000000바이트 이상이며 업무·수업 시간 밖 압축 파일 반출 신호가 함께 나타남',
    evidence: 'MITRE ATT&CK T1048 탐지 전략은 비정상 시간대의 높은 전송량과 비표준·대체 프로토콜 파일 전송을 탐지 신호로 제시한다.',
  }),
  Object.freeze({
    name: 'repeated_large_transfer',
    condition: 'T1041 또는 T1048 경보에서 규칙 수준 10 이상, 목적지 존재, 50000000바이트 이상이며 같은 흐름의 전송이 5회 이상 반복됨',
    evidence: 'MITRE ATT&CK T1041·T1048의 유출 탐지에서는 비정상적으로 큰 외부 전송량과 반복적인 전송 행위를 함께 살피는 것이 근거가 된다.',
  }),
  Object.freeze({
    name: 'bulk_or_unusual_channel_transfer',
    condition: 'T1041 또는 T1048 경보에서 규칙 수준 10 이상, 목적지 존재, 50000000바이트 이상이며 50개 이상 파일·평소 쓰지 않던 포트·명령 통로 중 하나가 나타남',
    evidence: 'MITRE ATT&CK T1041은 C2 통로 유출을, T1048은 다른 프로토콜 유출을 다루므로 대량 파일 전송이나 비정상 통로의 대용량 전송은 강한 유출 신호다.',
  }),
  Object.freeze({
    name: 'exfiltration_needs_review',
    condition: 'T1041 또는 T1048 표시는 있으나 대용량·낯선 목적지·반복·비정상 통로 같은 강한 신호가 충분하지 않으면 차단하지 않고 추가 확인함',
    evidence: 'T1041·T1048 관련 이벤트는 정상 동기화·백업과 겹칠 수 있으므로 작은 전송, 실패, 낮은 수준의 단일 신호는 추가 확인 대상으로 두는 것이 적절하다.',
  }),
]);
const LARGE_BYTES = 50_000_000;
function techniquesOf(alert) {
  return new Set((Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.split('.')[0].toUpperCase()));
}
function numberOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0;
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) return 0;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0;
}
function answer(confidence, reason) {
  const value = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
  return { action: value >= 0.85 ? 'block' : value >= 0.5 ? 'alert' : 'record', confidence: value, reason };
}
export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return answer(0.1, 'no_matching_exfiltration_pattern');
  const techniques = techniquesOf(alert);
  const hasTechnique = techniques.has('T1041') || techniques.has('T1048');
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const data = alert?.data && typeof alert.data === 'object' ? alert.data : {};
  const bytes = numberOf(data.bytes);
  const files = numberOf(data.files);
  const count = numberOf(data.count);
  const hasDestination = typeof data.dstip === 'string' && data.dstip.length > 0;
  const strongBase = hasTechnique && level >= 10 && hasDestination && bytes >= LARGE_BYTES
    && !/실패|외부 전송은 아직 없|전송은 아직 없/u.test(description);
  if (strongBase && /처음 보는 (?:목적지|주소)/u.test(description)) return answer(0.93, PATTERNS[0].name);
  if (strongBase && techniques.has('T1048') && /(?:수업|업무) 시간 밖/u.test(description) && /압축 파일/u.test(description)) return answer(0.94, PATTERNS[1].name);
  if (strongBase && count >= 5) return answer(0.92, PATTERNS[2].name);
  if (strongBase && (files >= 50 || /평소에 쓰지 않던 포트|명령 통로/u.test(description))) return answer(0.9, PATTERNS[3].name);
  if (hasTechnique && level >= 5) return answer(0.6, PATTERNS[4].name);
  return answer(0.1, 'no_matching_exfiltration_pattern');
}
