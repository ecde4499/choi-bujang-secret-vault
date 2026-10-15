const byId = id => document.getElementById(id);
let lastVerification = null;

function text(id, value) {
  const node = byId(id);
  if (node) node.textContent = value;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let body = null;
  try { body = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(body?.error ?? `HTTP_${response.status}`);
  return body;
}

function stateLabel(value) {
  if (value === 'actual_api') return '실제 API 확인';
  if (value === 'confirmed_from_code') return '코드 기준 확인';
  if (value === 'not_run') return '미실행';
  return String(value ?? '-');
}

function appendCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value ?? '-';
  if (className) cell.className = className;
  row.append(cell);
}

function renderRecords(records) {
  const body = byId('records');
  body.replaceChildren();
  for (const record of records ?? []) {
    const row = document.createElement('tr');
    appendCell(row, record.area);
    appendCell(row, stateLabel(record.state), record.state === 'not_run' ? 'muted' : '');
    appendCell(row, record.source);
    appendCell(row, record.value === null ? '-' : String(record.value));
    appendCell(row, record.detail);
    body.append(row);
  }
}

function recomputeCounts(records) {
  const result = { total: 0, actualApi: 0, confirmedFromCode: 0, notRun: 0 };
  for (const record of records ?? []) {
    result.total += 1;
    if (record.state === 'actual_api') result.actualApi += 1;
    if (record.state === 'confirmed_from_code') result.confirmedFromCode += 1;
    if (record.state === 'not_run') result.notRun += 1;
  }
  return result;
}

function sameCounts(left, right) {
  return ['total', 'actualApi', 'confirmedFromCode', 'notRun']
    .every(key => Number(left?.[key]) === Number(right?.[key]));
}

function renderVerification(rows) {
  const body = byId('verification-rows');
  body.replaceChildren();
  for (const item of rows ?? []) {
    const row = document.createElement('tr');
    appendCell(row, `${item.testId} / ${item.stage}단계`);
    appendCell(row, item.kind === 'normal' ? '정상' : '금지');
    appendCell(row, item.request);
    appendCell(row, item.expected);
    appendCell(row, item.execution === 'actual_api' ? item.observed : '미실행',
      item.execution === 'actual_api'
        ? (item.matchesExpected === true ? 'ok' : 'bad')
        : 'muted');
    appendCell(row, item.requestId ?? '-');
    appendCell(row, item.checkedAt ?? '-');
    body.append(row);
  }
}

function renderOfficial(slots) {
  const body = byId('official-rows');
  body.replaceChildren();
  for (const item of slots ?? []) {
    const row = document.createElement('tr');
    appendCell(row, item.testId);
    appendCell(row, item.execution === 'not_run' ? '미실행' : item.execution, 'muted');
    appendCell(row, item.observed ?? '-');
    appendCell(row, item.requestId ?? '-');
    appendCell(row, item.checkedAt ?? '-');
    body.append(row);
  }
}

function renderSummary(data) {
  const records = data?.redactedServerRecords ?? [];
  const decision = records.find(item => item.area === 'decision');
  const detection = records.find(item => item.area === 'detection');
  const revocation = records.find(item => item.area === 'revocation');
  const recovery = records.find(item => item.area === 'recovery');

  text('rules-count', decision?.value ?? '-');
  text('rules-detail', data?.student?.ruleIds?.join(', ') ?? '-');
  text('detection-state', stateLabel(detection?.state));
  text('revocation-state', stateLabel(revocation?.state));
  text('recovery-state', stateLabel(recovery?.state));
  text('recovery-detail', data?.student?.recoveryBaseline ?? '-');
  text('official-state', `${data?.officialAttacks?.executed ?? 0} / ${data?.officialAttacks?.total ?? 41}`);
  text('engine-source',
    `제공 엔진: ${data?.engine?.name ?? 'ALEPH SDP engine'} · 학생 구현: 판정기/탐지 규칙/접속 앱/자료실 · 운영 사건 전달: ${data?.engine?.operatingEventDelivery ?? 'not_run'}`);

  const localCounts = recomputeCounts(records);
  const consistent = sameCounts(localCounts, data?.counts);
  text('consistency', consistent
    ? `일치 · 화면 재계산 ${localCounts.total}건과 서버 요약이 같습니다. 생성 시각 ${data.generatedAt}`
    : '불일치 · 화면 재계산과 서버 요약이 다릅니다.');
  byId('consistency').className = consistent ? 'status ok' : 'status bad';

  renderRecords(records);
  renderVerification(data?.verificationPlan ?? []);
  renderOfficial(data?.officialAttacks?.slots ?? []);
}

async function refresh() {
  const button = byId('refresh');
  button.disabled = true;
  try {
    const data = await request('/api/ops');
    renderSummary(data);
  } catch (error) {
    text('consistency', `작전실 조회 실패: ${error.message}`);
    byId('consistency').className = 'status bad';
  } finally {
    button.disabled = false;
  }
}

async function verify() {
  const button = byId('verify');
  button.disabled = true;
  text('verification-status', '현재 배포에 안전한 읽기 실측 요청을 보내는 중입니다.');
  try {
    const data = await request('/api/ops?action=verify', {
      method: 'POST',
      body: '{}',
    });
    lastVerification = data;
    renderVerification(data.rows);
    text(
      'verification-status',
      `실제 API ${data.counts.actualApi}건 · 기대 일치 ${data.counts.matched}건 · 기대 불일치 ${data.counts.mismatched}건 · 미실행 ${data.counts.notRun}건`,
    );
    byId('verification-status').className = data.counts.mismatched === 0 ? 'status ok' : 'status bad';
    byId('export').disabled = false;
  } catch (error) {
    text('verification-status', `실측 실패: ${error.message}`);
    byId('verification-status').className = 'status bad';
  } finally {
    button.disabled = false;
  }
}

function exportJson() {
  if (!lastVerification) return;
  const blob = new Blob([`${JSON.stringify(lastVerification, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'stage12-verification.json';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

byId('refresh').addEventListener('click', refresh);
byId('verify').addEventListener('click', verify);
byId('export').addEventListener('click', exportJson);
await refresh();
