const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'unsigned_service_registration',
    condition: 'T1543 경보에서 규칙 수준이 높고, 서명 없는 새 서비스 등록·서비스 실행 파일 변경·반복 등록이 임시 경로 또는 반복 횟수와 함께 나타남',
    evidence: 'MITRE ATT&CK T1543은 시스템 서비스 같은 프로세스를 생성·변경해 지속성을 확보하는 기법을 다루므로 서명 없는 새 서비스 등록과 변경은 강한 지속성 신호다.',
  }),
  Object.freeze({
    name: 'unfamiliar_scheduled_task',
    condition: 'T1053 경보에서 규칙 수준이 높고, 처음 보는 예약 작업·임의 이름 작업·수업 시간 밖 작업이 임시 폴더 실행 파일을 호출함',
    evidence: 'MITRE ATT&CK T1053은 예약 작업을 이용해 프로그램을 반복 실행하거나 지속성을 확보하는 기법을 다루므로 낯선 예약 작업과 임시 실행 경로의 결합은 강한 신호다.',
  }),
  Object.freeze({
    name: 'startup_folder_change',
    condition: 'T1543 경보에서 규칙 수준이 높고, 시작 폴더 또는 시작 프로그램에 평소 목록에 없던 실행 파일이 추가·변경됨',
    evidence: 'MITRE ATT&CK T1543의 시스템 프로세스 생성·변경 관점에서 재시작 뒤에도 실행되도록 등록되는 시작 항목 변화는 지속성 확보 여부를 점검해야 하는 신호다.',
  }),
  Object.freeze({
    name: 'persistence_change_needs_review',
    condition: 'T1543 또는 T1053 표시는 있으나 위 강한 신호가 충분하지 않은 서비스·예약 작업·시작 항목 변경은 차단하지 않고 추가 확인함',
    evidence: 'MITRE ATT&CK T1543과 T1053은 정상 관리 작업과도 겹칠 수 있으므로 강한 악성 징후가 부족한 변화는 차단보다 추가 확인이 적절하다.',
  }),
]);

function techniquesOf(alert) {
  return new Set((Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.split('.')[0].toUpperCase()));
}

function levelOf(alert) {
  const value = Number(alert?.rule?.level);
  return Number.isFinite(value) ? value : 0;
}

function pathOf(alert) {
  const value = alert?.data?.path;
  return typeof value === 'string' ? value.toLowerCase().replaceAll('/', '\\') : '';
}

function countOf(alert) {
  const value = Number.parseInt(alert?.data?.count ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function descriptionOf(alert) {
  return typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
}

function answer(confidence, reason) {
  const value = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
  return {
    action: value >= 0.85 ? 'block' : value >= 0.5 ? 'alert' : 'record',
    confidence: value,
    reason,
  };
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) {
    return answer(0.1, 'no_matching_persistence_pattern');
  }

  const techniques = techniquesOf(alert);
  const level = levelOf(alert);
  const path = pathOf(alert);
  const count = countOf(alert);
  const description = descriptionOf(alert);
  const t1543 = techniques.has('T1543');
  const t1053 = techniques.has('T1053');
  const tempPath = path.includes('\\appdata\\local\\temp\\');
  const startupPath = path.includes('\\start menu\\programs\\startup\\');

  const serviceWords = /서비스/u.test(description);
  const unsignedOrChanged = /서명\s*없|새\s*서비스|등록|바뀌|변경|평소\s*목록에\s*없는|다시\s*켜도\s*남/u.test(description);
  const repeatedService = count >= 2 && serviceWords && /서명\s*없|등록/u.test(description);
  if (t1543 && level >= 10 && serviceWords && unsignedOrChanged && (tempPath || repeatedService)) {
    return answer(0.92, PATTERNS[0].name);
  }

  const scheduledWords = /예약\s*작업/u.test(description);
  const unfamiliarTask = /처음\s*보는|임의\s*문자열|수업\s*시간\s*밖/u.test(description);
  if (t1053 && level >= 10 && scheduledWords && (tempPath || unfamiliarTask)) {
    return answer(0.9, PATTERNS[1].name);
  }

  const startupWords = /시작\s*폴더|시작\s*프로그램/u.test(description);
  const startupChange = /평소\s*목록에\s*없는|추가|변경|같은\s*임시\s*파일/u.test(description);
  if (t1543 && level >= 10 && (startupPath || (startupWords && startupChange))) {
    return answer(0.9, PATTERNS[2].name);
  }

  if ((t1543 || t1053) && level >= 4) {
    return answer(0.6, PATTERNS[3].name);
  }

  return answer(0.1, 'no_matching_persistence_pattern');
}
