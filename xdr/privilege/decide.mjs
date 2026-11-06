const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'repeated_admin_group_addition',
    condition: 'T1078 경보에서 관리자 그룹 추가가 같은 흐름에서 반복되거나 여러 계정에 반복되면 강한 권한 가로채기 신호로 봅니다.',
    evidence: 'MITRE ATT&CK T1078은 정상 계정을 도용해 권한을 얻거나 확장하는 행위를 다루므로 반복된 관리자 그룹 추가는 강한 오용 신호입니다.',
  }),
  Object.freeze({
    name: 'account_added_to_admin_group',
    condition: 'T1078 경보에서 일반 계정이 administrators 같은 관리자 그룹에 새로 추가되면 강한 권한 가로채기 신호로 봅니다.',
    evidence: 'MITRE ATT&CK T1078은 기존 정상 계정의 자격을 악용해 더 높은 권한이나 제한 영역 접근을 얻는 행위를 포함합니다.',
  }),
  Object.freeze({
    name: 'unfamiliar_privileged_command',
    condition: 'T1068 경보에서 처음 보는 주소·방금 상승한 권한·다른 계정 권한으로 관리자 명령을 실행한 높은 수준 사건을 강한 신호로 봅니다.',
    evidence: 'MITRE ATT&CK T1068은 취약점 악용으로 더 높은 권한을 얻는 행위를 다루므로 비정상 맥락의 새 관리자 명령은 권한 상승 악용의 후속 신호가 됩니다.',
  }),
  Object.freeze({
    name: 'off_hours_privileged_use',
    condition: 'T1068 또는 T1078 경보에서 업무 시간 밖에 관리자 권한 사용·그룹 추가·권한 명령이 나타나면 강한 신호로 봅니다.',
    evidence: 'MITRE ATT&CK T1078의 정상 계정 오용은 비정상 시간대 활동으로 탐지할 수 있어 업무 시간 밖의 높은 권한 사용은 계정 도용 신호가 됩니다.',
  }),
  Object.freeze({
    name: 'privilege_change_needs_review',
    condition: 'T1068 또는 T1078 표시는 있으나 강한 관리자 그룹·낯선 관리자 명령·업무 시간 밖 사용 신호가 충분하지 않으면 추가 확인합니다.',
    evidence: 'T1068·T1078 관련 이벤트는 정상 관리 활동과 겹칠 수 있으므로 약한 단일 신호만 있을 때는 차단보다 추가 확인이 적절합니다.',
  }),
]);

const ADMIN_GROUPS = new Set(['administrators', 'administrator', 'domain admins', 'admins']);

function techniquesOf(alert) {
  return new Set((Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.split('.')[0].toUpperCase()));
}
function levelOf(alert) {
  const value = Number(alert?.rule?.level);
  return Number.isFinite(value) ? value : 0;
}
function countOf(alert) {
  const value = Number.parseInt(alert?.data?.count ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function groupOf(alert) {
  return typeof alert?.data?.group === 'string' ? alert.data.group.trim().toLowerCase() : '';
}
function descriptionOf(alert) {
  return typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
}
function localHourOf(alert) {
  const match = /T(\d{2}):/u.exec(typeof alert?.timestamp === 'string' ? alert.timestamp : '');
  return match ? Number(match[1]) : null;
}
function isOffHours(alert) {
  const hour = localHourOf(alert);
  return hour !== null && (hour >= 22 || hour < 6);
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
    return answer(0.1, 'no_matching_privilege_pattern');
  }

  const techniques = techniquesOf(alert);
  const level = levelOf(alert);
  const description = descriptionOf(alert);
  const count = countOf(alert);
  const group = groupOf(alert);
  const t1068 = techniques.has('T1068');
  const t1078 = techniques.has('T1078');
  const adminGroup = ADMIN_GROUPS.has(group);

  const repeatedAdmin = t1078 && level >= 10 && adminGroup
    && (count >= 2 || /계정\s*\d+개|다시\s*관리자/u.test(description));
  if (repeatedAdmin) return answer(0.95, PATTERNS[0].name);

  if (t1078 && level >= 10 && adminGroup) {
    return answer(0.92, PATTERNS[1].name);
  }

  const privilegedCommand = t1068 && level >= 10
    && /관리자\s*명령|관리자\s*권한|권한\s*명령/u.test(description)
    && /처음\s*보는|방금\s*관리자가\s*된|다른\s*계정의\s*권한|권한으로\s*바뀌/u.test(description);
  if (privilegedCommand) return answer(0.9, PATTERNS[2].name);

  const offHoursSignal = (t1068 || t1078) && level >= 10
    && (/수업\s*시간\s*밖|업무\s*시간\s*밖|업무처럼\s*보이지\s*않는\s*시각/u.test(description) || isOffHours(alert));
  if (offHoursSignal) return answer(0.88, PATTERNS[3].name);

  if ((t1068 || t1078) && level >= 4) {
    return answer(0.6, PATTERNS[4].name);
  }

  return answer(0.1, 'no_matching_privilege_pattern');
}
