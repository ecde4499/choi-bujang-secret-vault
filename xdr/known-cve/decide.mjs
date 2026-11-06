const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'jndi_remote_lookup_in_header',
    condition: '요청 머리글 값(data.useragent 등)에 ${jndi:<프로토콜>://...} 형태의 완전한 원격 조회 구문이 있음',
    evidence: 'CVE-2021-44228은 공격자가 통제한 로그 메시지나 매개변수의 JNDI 관련 원격 엔드포인트가 해석되는 형태를 악용할 수 있다.',
  }),
  Object.freeze({
    name: 'jndi_remote_lookup_in_argument',
    condition: '요청 주소·인자(data.url)에 ${jndi:<프로토콜>://...} 형태의 완전한 원격 조회 구문이 있음',
    evidence: 'CVE-2021-44228은 공격자가 통제한 로그 메시지 매개변수에 포함된 JNDI 조회를 통해 원격 엔드포인트를 참조하는 형태와 관련된다.',
  }),
  Object.freeze({
    name: 'known_cve_probe_trace',
    condition: 'CVE 이름, jndi·lookup 단편, probe/class-check 같은 알려진 취약점 점검 흔적이 있으나 완전한 원격 조회 구문은 없거나 추가 확인이 필요함',
    evidence: 'MITRE ATT&CK T1190은 인터넷에 공개된 애플리케이션의 알려진 약점을 찾아 악용하는 시도를 다루므로 점검·탐색 흔적은 차단보다 추가 확인 신호로 쓴다.',
  }),
]);

const FULL_LOOKUP = /\$\{\s*jndi\s*:\s*(?:ldaps?|rmi|dns|iiop|nis|nds|corba|https?)\s*:\/\/[^\s}]+/iu;
const RELATED_VALUE = /cve-?2021-?44228|\bcve\b|\bjndi\b|lookup(?:-fragment)?|[?&]probe=|class-?check|log-?library/iu;
const RELATED_TEXT = /CVE-2021-44228|jndi|원격\s*조회|조회\s*형태|잘린|취약점|점검\s*도구|중괄호|라이브러리/iu;
const NON_HEADER_FIELDS = new Set(['srcip', 'srcuser', 'url', 'count']);

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function decode(value) {
  let text = String(value ?? '');
  for (let round = 0; round < 2; round += 1) {
    try {
      const next = decodeURIComponent(text);
      if (next === text) break;
      text = next;
    } catch {
      break;
    }
  }
  return text;
}

function requestValues(data) {
  const headers = [];
  const argumentsList = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { headers, argumentsList };
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') continue;
    if (key === 'url') argumentsList.push(decode(value));
    else if (!NON_HEADER_FIELDS.has(key)) headers.push(decode(value));
  }
  return { headers, argumentsList };
}

function countOf(alert) {
  const count = Number.parseInt(alert?.data?.count ?? '', 10);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function answer(confidence, reason) {
  const value = clamp(confidence);
  return {
    action: value >= 0.85 ? 'block' : value >= 0.5 ? 'alert' : 'record',
    confidence: value,
    reason,
  };
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) {
    return answer(0.05, 'no_matching_known_cve_pattern');
  }

  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const t1190 = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
  const count = countOf(alert);
  const { headers, argumentsList } = requestValues(alert.data);
  const inHeader = headers.some((value) => FULL_LOOKUP.test(value));
  const inArgument = argumentsList.some((value) => FULL_LOOKUP.test(value));
  const probeTrace = [...headers, ...argumentsList].some((value) => RELATED_VALUE.test(value))
    || RELATED_TEXT.test(description);

  if (inHeader || inArgument) {
    let confidence = 0.88;
    if (t1190) confidence += 0.03;
    if (count >= 2) confidence += 0.03;
    if (inHeader && inArgument) confidence += 0.03;
    const hasScannerMark = /[?&]probe=|class-?check/iu.test(argumentsList.join(' '))
      || /점검\s*(?:흔적|도구)/u.test(description);
    const pattern = hasScannerMark ? PATTERNS[2] : inHeader ? PATTERNS[0] : PATTERNS[1];
    return answer(confidence, pattern.name);
  }

  if (probeTrace || t1190) {
    let confidence = probeTrace ? 0.6 : 0.55;
    if (t1190) confidence += 0.03;
    if (level >= 8) confidence += 0.04;
    if (count >= 2) confidence += 0.04;
    return answer(Math.min(confidence, 0.84), PATTERNS[2].name);
  }

  return answer(level >= 8 ? 0.2 : 0.05, 'no_matching_known_cve_pattern');
}
