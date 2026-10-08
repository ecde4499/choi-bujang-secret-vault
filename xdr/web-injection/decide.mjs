const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'sql_syntax_in_request_argument',
    condition: '요청 인자에 SQL 구문이나 SQL 주입에 쓰이는 구분자·결합 형태가 나타남',
    evidence: 'MITRE ATT&CK T1190은 외부 공개 애플리케이션의 입력 취약점을 악용해 접근하는 행위를 다룬다.',
  }),
  Object.freeze({
    name: 'script_tag_in_request_argument',
    condition: '요청 인자에 script 태그 또는 스크립트 삽입 표기가 나타남',
    evidence: 'MITRE ATT&CK T1190은 외부 공개 애플리케이션의 입력 처리 취약점을 악용하는 공격을 포함한다.',
  }),
  Object.freeze({
    name: 'repeated_parent_path_traversal',
    condition: '요청 경로 또는 인자에서 ../ 같은 상위 경로 이동 표기가 반복됨',
    evidence: 'MITRE ATT&CK T1190은 공개 애플리케이션의 경로 처리 취약점을 악용해 의도하지 않은 자원에 접근하는 행위를 포함할 수 있다.',
  }),
]);

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function hasT1190(alert) {
  return Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
}

function textOf(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const url = typeof alert?.data?.url === 'string' ? alert.data.url : '';
  return { description, url };
}

function countOf(alert) {
  const value = Number.parseInt(alert?.data?.count ?? '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function levelOf(alert) {
  return Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
}

function classifyPattern(alert) {
  const { description, url } = textOf(alert);

  const scriptStrong = /<\s*script\b|%3c\s*script\b/iu.test(url)
    || /스크립트 삽입 표기|스크립트 표식/u.test(description);
  if (scriptStrong) return { pattern: PATTERNS[1], strong: true };

  const traversalStrong = /(?:\.\.\/|%2e%2e%2f){2,}/iu.test(url)
    || /경로를 여러 단계 거슬러|경로 이탈 표기/u.test(description);
  if (traversalStrong) return { pattern: PATTERNS[2], strong: true };

  const sqlStrong = /\bunion\s+select\b|\bselect\b.+\bfrom\b|\bor\s+['"]?1['"]?\s*=\s*['"]?1|\bdrop\s+table\b|\binsert\s+into\b|\bupdate\s+\w+\s+set\b/iu.test(url)
    || /SQL 구문|SQL 표식|데이터베이스 조회를 이어 붙|명령 구분자 표기/u.test(description);
  if (sqlStrong) return { pattern: PATTERNS[0], strong: true };

  if (/스크립트|script/iu.test(description) || /script/iu.test(url)) {
    return { pattern: PATTERNS[1], strong: false };
  }
  if (/경로|\bup\b|\.\.\//iu.test(description) || /(?:\bup\b|\.\.\/)/iu.test(url)) {
    return { pattern: PATTERNS[2], strong: false };
  }
  return { pattern: PATTERNS[0], strong: false };
}

function confidenceFor(alert, strong) {
  const count = countOf(alert);
  const level = levelOf(alert);
  const { description } = textOf(alert);

  if (strong) {
    let confidence = count >= 8 ? 0.9 : count >= 3 ? 0.82 : 0.72;
    if (level >= 10) confidence += 0.05;
    if (/반복|연속|번 들어왔|번 나왔/u.test(description)) confidence += 0.04;
    return clamp(confidence);
  }

  let confidence = hasT1190(alert) ? 0.55 : 0.2;
  if (level >= 8) confidence += 0.08;
  if (count > 1) confidence += 0.05;
  if (/공격 표기는 없습니다|삽입 표식은 아닙니다|정상 조회|수업|공지|반복은 없습니다|반복되지 않았/u.test(description)) {
    confidence -= 0.03;
  }
  return clamp(confidence);
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert) || !hasT1190(alert)) {
    return {
      action: 'record',
      confidence: 0.1,
      reason: 'no_matching_web_injection_pattern',
    };
  }

  const match = classifyPattern(alert);
  const confidence = confidenceFor(alert, match.strong);
  const action = confidence >= 0.85 ? 'block'
    : confidence >= 0.5 ? 'alert'
      : 'record';

  return {
    action,
    confidence,
    reason: match.pattern.name,
  };
}
