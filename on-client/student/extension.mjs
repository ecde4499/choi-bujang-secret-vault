// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions }) {
      const root = document.createElement('section');

      const appendText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };

      const modeText = {
        demo: '예제 자료(demo)',
        disconnected: '연결 없음(disconnected)',
        unknown: '확인 불가(unknown)',
      };

      const deviceText = {
        compliant: '정상(compliant)',
        noncompliant: '점검 필요(noncompliant)',
        unknown: '확인 불가(unknown)',
      };

      const sessionText = {
        active: '사용 중(active)',
        expired: '만료(expired)',
        revoked: '취소(revoked)',
        unknown: '확인 불가(unknown)',
      };

      const appendMode = (parent, resource, label) => {
        const text = modeText[resource?.mode];
        if (text) appendText(parent, 'p', `${label} 연결 상태: ${text}`);
      };

      const identity = document.createElement('section');
      appendText(identity, 'h3', '현재 로그인 정보');

      if (me?.status === 'loading') {
        appendText(identity, 'p', '로그인 정보를 불러오는 중입니다.');
      } else if (me?.status === 'error') {
        appendText(identity, 'p', `로그인 정보 연결 실패: ${me.error?.message || '확인할 수 없습니다.'}`);
      } else if (me?.status === 'ok') {
        const user = me.data?.user;
        const device = me.data?.device;
        const session = me.data?.session;
        appendText(identity, 'p', `사용자: ${user?.label || user?.id || '확인 불가'}`);
        appendText(identity, 'p', `현재 기기: ${device?.label || device?.id || '확인 불가'} · ${deviceText[device?.status] || '확인 불가(unknown)'}`);
        appendText(identity, 'p', `현재 세션: ${session?.id || '확인 불가'} · ${sessionText[session?.status] || '확인 불가(unknown)'}`);
      } else {
        appendText(identity, 'p', '로그인 정보를 확인할 수 없습니다.');
      }
      appendMode(identity, me, '로그인 정보');
      root.append(identity);

      const deviceSection = document.createElement('section');
      appendText(deviceSection, 'h3', '등록 기기');

      if (devices?.status === 'loading') {
        appendText(deviceSection, 'p', '기기 정보를 불러오는 중입니다.');
      } else if (devices?.status === 'error') {
        appendText(deviceSection, 'p', `기기 정보 연결 실패: ${devices.error?.message || '확인할 수 없습니다.'}`);
      } else if (devices?.status === 'ok') {
        if (!Array.isArray(devices.data) || devices.data.length === 0) {
          appendText(deviceSection, 'p', '등록된 기기가 없습니다.');
        } else {
          const list = document.createElement('ul');
          for (const device of devices.data) {
            appendText(list, 'li', `${device.label || device.id} · ${deviceText[device.status] || '확인 불가(unknown)'}`);
          }
          deviceSection.append(list);
        }
      } else {
        appendText(deviceSection, 'p', '기기 정보를 확인할 수 없습니다.');
      }
      appendMode(deviceSection, devices, '기기 정보');
      root.append(deviceSection);

      const sessionSection = document.createElement('section');
      appendText(sessionSection, 'h3', '현재 세션');

      if (sessions?.status === 'loading') {
        appendText(sessionSection, 'p', '세션 정보를 불러오는 중입니다.');
      } else if (sessions?.status === 'error') {
        appendText(sessionSection, 'p', `세션 정보 연결 실패: ${sessions.error?.message || '확인할 수 없습니다.'}`);
      } else if (sessions?.status === 'ok') {
        if (!Array.isArray(sessions.data) || sessions.data.length === 0) {
          appendText(sessionSection, 'p', '현재 확인할 수 있는 세션이 없습니다.');
        } else {
          const list = document.createElement('ul');
          for (const session of sessions.data) {
            appendText(list, 'li', `${session.id} · ${sessionText[session.status] || '확인 불가(unknown)'}`);
          }
          sessionSection.append(list);
        }
      } else {
        appendText(sessionSection, 'p', '세션 정보를 확인할 수 없습니다.');
      }
      appendMode(sessionSection, sessions, '세션 정보');
      root.append(sessionSection);

      return root;
    },
    renderDecision({ status, mode, data, error, appId }) {
      const root = document.createElement('section');

      const appendText = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.append(node);
        return node;
      };

      const modeText = {
        demo: '예제 자료(demo)',
        disconnected: '연결 없음(disconnected)',
        unknown: '확인 불가(unknown)',
      };

      if (status === 'idle') {
        appendText('p', '업무 앱을 골라 접속을 요청하세요.');
      } else if (status === 'loading') {
        appendText('p', `접속 판정을 확인하는 중입니다.${appId ? ` 대상 앱: ${appId}` : ''}`);
      } else if (status === 'error') {
        appendText('p', `요청 실패: ${error?.message || '접속 판정 요청 결과를 확인할 수 없습니다.'}`);
        appendText('p', '요청 실패는 접근 거부(deny) 판정이 아닙니다.');
        if (appId) appendText('p', `대상 앱: ${appId}`);
      } else if (status === 'ok') {
        const decisionLabels = {
          allow: '접근 허용(allow)',
          deny: '접근 거부(deny)',
          challenge: '추가 인증 또는 확인 필요(challenge)',
          unknown: '판정 확인 불가(unknown)',
        };
        const decision = Object.hasOwn(decisionLabels, data?.decision) ? data.decision : 'unknown';

        appendText('p', `대상 앱: ${data?.appId || appId || '확인 불가'}`);
        appendText('p', `접근 판정: ${decisionLabels[decision]}`);
        appendText('p', `판정 이유: ${data?.reason || '이유를 확인할 수 없습니다.'}`);
        appendText('p', `판정 시각: ${data?.checkedAt || '시각을 확인할 수 없습니다.'}`);

        if (decision === 'allow') {
          appendText('p', '정책상 접근 허용 판정이며 실제 업무 앱 접속 성공을 보장하지 않습니다.');
        } else if (decision === 'challenge') {
          appendText('p', '추가 인증 또는 확인이 필요하며 이 화면이 해당 확인 절차를 대신 수행하지 않습니다.');
        } else if (decision === 'unknown') {
          appendText('p', '판정을 확인할 수 없으므로 접근 허용으로 간주하지 않습니다.');
        }
      } else {
        appendText('p', '접속 판정 상태를 확인할 수 없습니다.');
      }

      if (modeText[mode]) {
        appendText('p', `데이터 연결 상태: ${modeText[mode]}`);
      }

      return root;
    },
    renderEvents({ status, mode, data, error }) {
      const root = document.createElement('section');

      const appendText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };

      const modeText = {
        demo: '예제 자료(demo)',
        disconnected: '연결 없음(disconnected)',
        unknown: '확인 불가(unknown)',
      };

      if (status === 'loading') {
        appendText(root, 'p', '보안 기록을 불러오는 중입니다.');
        if (modeText[mode]) appendText(root, 'p', `데이터 연결 상태: ${modeText[mode]}`);
        return root;
      }

      if (status === 'error') {
        const contractMismatch = error?.code === 'CONTRACT_MISMATCH' || error?.code === 'ENGINE_RESULT_UNVERIFIED';
        appendText(
          root,
          'p',
          contractMismatch
            ? `기록을 확인할 수 없습니다: ${error?.message || '응답 형식을 확인할 수 없습니다.'}`
            : `기록을 불러오지 못했습니다: ${error?.message || '요청에 실패했습니다.'}`,
        );
        if (modeText[mode]) appendText(root, 'p', `데이터 연결 상태: ${modeText[mode]}`);
        return root;
      }

      if (status !== 'ok') {
        appendText(root, 'p', '보안 기록 상태를 확인할 수 없습니다.');
        if (modeText[mode]) appendText(root, 'p', `데이터 연결 상태: ${modeText[mode]}`);
        return root;
      }

      const events = Array.isArray(data)
        ? [...data].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        : [];

      if (modeText[mode]) appendText(root, 'p', `데이터 연결 상태: ${modeText[mode]}`);

      if (events.length === 0) {
        appendText(root, 'p', '표시할 기록이 없습니다.');
        return root;
      }

      const kindLabels = {
        access: '접속 기록(access)',
        xdr: 'XDR 경보(xdr)',
      };
      const accessLabels = {
        allowed: '허용됨(allowed)',
        denied: '거부됨(denied)',
        unknown: '확인 불가(unknown)',
      };
      const sessionLabels = {
        active: '사용 중(active)',
        expired: '만료(expired)',
        revoked: '취소(revoked)',
        unknown: '확인 불가(unknown)',
      };
      const deviceLabels = {
        compliant: '정상(compliant)',
        noncompliant: '점검 필요(noncompliant)',
        unknown: '확인 불가(unknown)',
      };

      const controls = document.createElement('div');
      const list = document.createElement('ul');
      const detail = document.createElement('section');
      const count = document.createElement('p');

      const createFilter = (id, labelText, values, format) => {
        const wrapper = document.createElement('div');
        const label = document.createElement('label');
        const select = document.createElement('select');

        label.setAttribute('for', id);
        label.textContent = labelText;
        select.id = id;

        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = '전체';
        select.append(allOption);

        for (const value of values) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = format(value);
          select.append(option);
        }

        wrapper.append(label, select);
        controls.append(wrapper);
        return select;
      };

      const kinds = [...new Set(events.map((event) => event.kind))];
      const apps = [...new Set(events.map((event) => event.appId).filter((value) => typeof value === 'string'))];
      const accessStates = [...new Set(events.map((event) => event.state.access))];

      const kindFilter = createFilter(
        'student-event-kind-filter',
        '기록 종류',
        kinds,
        (value) => kindLabels[value] || value,
      );
      const appFilter = createFilter(
        'student-event-app-filter',
        '업무 앱',
        apps,
        (value) => value,
      );
      const accessFilter = createFilter(
        'student-event-access-filter',
        '접속 상태',
        accessStates,
        (value) => accessLabels[value] || value,
      );

      const clearDetail = () => {
        detail.replaceChildren();
        detail.removeAttribute('data-student-event-detail');
      };

      const showDetail = (event) => {
        clearDetail();
        detail.setAttribute('data-student-event-detail', event.id);

        appendText(detail, 'h3', `기록 ${event.id} 상세`);
        appendText(detail, 'p', `사건 ID: ${event.id}`);
        appendText(detail, 'p', `업무 앱: ${event.appId || '앱을 확인할 수 없습니다.'}`);

        const evidenceTitle = document.createElement('h4');
        evidenceTitle.textContent = '근거';
        detail.append(evidenceTitle);
        if (event.evidence.length === 0) {
          appendText(detail, 'p', '근거 없음');
        } else {
          const evidenceList = document.createElement('ul');
          for (const item of event.evidence) {
            appendText(evidenceList, 'li', `${item.id}: ${item.text}`);
          }
          detail.append(evidenceList);
        }

        const rulesTitle = document.createElement('h4');
        rulesTitle.textContent = '규칙';
        detail.append(rulesTitle);
        if (event.rules.length === 0) {
          appendText(detail, 'p', '규칙 없음');
        } else {
          const rulesList = document.createElement('ul');
          for (const item of event.rules) {
            appendText(rulesList, 'li', `${item.id}: ${item.text}`);
          }
          detail.append(rulesList);
        }

        const stateTitle = document.createElement('h4');
        stateTitle.textContent = '기록 상태';
        detail.append(stateTitle);
        appendText(detail, 'p', `접속 상태: ${accessLabels[event.state.access] || `확인 불가(${event.state.access})`}`);
        appendText(detail, 'p', `세션 상태: ${sessionLabels[event.state.session] || `확인 불가(${event.state.session})`}`);
        appendText(detail, 'p', `기기 상태: ${deviceLabels[event.state.device] || `확인 불가(${event.state.device})`}`);

        if (Array.isArray(event.supportedActions) && event.supportedActions.length > 0) {
          const unsupportedTitle = document.createElement('h4');
          unsupportedTitle.textContent = '미지원 조치';
          detail.append(unsupportedTitle);

          for (const action of event.supportedActions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
            button.textContent = `${action} 미지원`;
            detail.append(button);
          }

          appendText(detail, 'p', '조치 실행 연결은 아직 지원하지 않으며 이 화면은 어떤 조치 요청도 전송하지 않습니다.');
        }
      };

      const renderList = () => {
        clearDetail();
        list.replaceChildren();

        const filtered = events.filter((event) => {
          if (kindFilter.value !== 'all' && event.kind !== kindFilter.value) return false;
          if (appFilter.value !== 'all' && event.appId !== appFilter.value) return false;
          if (accessFilter.value !== 'all' && event.state.access !== accessFilter.value) return false;
          return true;
        });

        count.textContent = `표시 기록: ${filtered.length}건 / 전체 ${events.length}건`;

        if (filtered.length === 0) {
          appendText(list, 'li', '현재 필터에 해당하는 기록이 없습니다.');
          return;
        }

        for (const event of filtered) {
          const row = document.createElement('li');
          row.setAttribute('data-student-event-id', event.id);

          appendText(row, 'p', `사건 ID: ${event.id}`);
          appendText(row, 'p', `시각: ${event.at} · ${new Date(event.at).toLocaleString('ko-KR')}`);
          appendText(row, 'p', `종류: ${kindLabels[event.kind] || event.kind}`);
          appendText(row, 'p', `업무 앱: ${event.appId || '앱을 확인할 수 없습니다.'}`);
          appendText(row, 'p', `요약: ${event.summary}`);

          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = `${event.id} 상세`;
          button.addEventListener('click', () => showDetail(event));
          row.append(button);

          list.append(row);
        }
      };

      kindFilter.addEventListener('change', renderList);
      appFilter.addEventListener('change', renderList);
      accessFilter.addEventListener('change', renderList);

      root.append(controls, count, list, detail);
      renderList();
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode }) {
      const root = document.createElement('section');

      const appendText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };

      const deviceLabels = {
        compliant: '정상(compliant)',
        noncompliant: '점검 필요(noncompliant)',
        unknown: '확인 불가(unknown)',
      };
      const sessionLabels = {
        active: '사용 중(active)',
        expired: '만료(expired)',
        revoked: '취소(revoked)',
        unknown: '확인 불가(unknown)',
      };
      const modeLabels = {
        connected: '연결됨(connected)',
        demo: '예제 자료(demo)',
        disconnected: '연결 없음(disconnected)',
        unknown: '확인 불가(unknown)',
      };

      const retryNotice = (parent) => {
        appendText(parent, 'p', '다시 시도는 위쪽 「다시 불러오기」 버튼을 사용자가 직접 누르세요. 자동으로 다시 요청하지 않습니다.');
      };

      const deviceSection = document.createElement('section');
      appendText(deviceSection, 'h3', '기기 상태');
      if (devices?.status === 'loading') {
        appendText(deviceSection, 'p', '기기 정보를 불러오는 중입니다.');
      } else if (devices?.status === 'error') {
        appendText(deviceSection, 'p', `기기 정보를 불러오지 못했습니다: ${devices.error?.message || '요청에 실패했습니다.'}`);
        retryNotice(deviceSection);
      } else if (devices?.status === 'ok') {
        if (!Array.isArray(devices.data) || devices.data.length === 0) {
          appendText(deviceSection, 'p', '등록된 기기가 없습니다.');
        } else {
          const list = document.createElement('ul');
          for (const device of devices.data) {
            appendText(list, 'li', `${device.label || device.id} · ${deviceLabels[device.status] || `확인 불가(${device.status})`}`);
          }
          deviceSection.append(list);
        }
      } else {
        appendText(deviceSection, 'p', '기기 상태를 확인할 수 없습니다.');
      }
      root.append(deviceSection);

      const sessionSection = document.createElement('section');
      appendText(sessionSection, 'h3', '현재 연결');
      appendText(sessionSection, 'p', '세션 조회는 현재 검증된 연결 한 개를 대상으로 하며 과거 세션 전체 목록이 아닙니다.');
      if (sessions?.status === 'loading') {
        appendText(sessionSection, 'p', '현재 연결 정보를 불러오는 중입니다.');
      } else if (sessions?.status === 'error') {
        appendText(sessionSection, 'p', `현재 연결 정보를 불러오지 못했습니다: ${sessions.error?.message || '요청에 실패했습니다.'}`);
        retryNotice(sessionSection);
      } else if (sessions?.status === 'ok') {
        if (!Array.isArray(sessions.data) || sessions.data.length === 0) {
          appendText(sessionSection, 'p', '현재 확인된 연결이 없습니다.');
        } else {
          const list = document.createElement('ul');
          for (const session of sessions.data) {
            appendText(list, 'li', `${session.id} · ${sessionLabels[session.status] || `확인 불가(${session.status})`}`);
          }
          sessionSection.append(list);
        }
      } else {
        appendText(sessionSection, 'p', '현재 연결 상태를 확인할 수 없습니다.');
      }
      root.append(sessionSection);

      const notificationSection = document.createElement('section');
      appendText(notificationSection, 'h3', '상태 알림');
      if (!Array.isArray(notifications) || notifications.length === 0) {
        appendText(notificationSection, 'p', '주의할 알림이 없습니다.');
      } else {
        const list = document.createElement('ul');
        for (const notice of notifications) {
          appendText(
            list,
            'li',
            `자료: ${notice.resource || 'unknown'} · 코드: ${notice.code || 'UNVERIFIED'} · ${notice.message || '메시지를 확인할 수 없습니다.'}`,
          );
        }
        notificationSection.append(list);
      }
      root.append(notificationSection);

      const diagnosticsSection = document.createElement('section');
      appendText(diagnosticsSection, 'h3', '진단 정보');

      if (diagnostics?.status === 'idle') {
        appendText(diagnosticsSection, 'p', '진단 정보를 아직 불러오지 않았습니다. 제공 영역의 「도움정보 불러오기」를 사용자가 직접 누르세요.');
      } else if (diagnostics?.status === 'loading') {
        appendText(diagnosticsSection, 'p', '진단 정보를 불러오는 중입니다.');
      } else if (diagnostics?.status === 'error') {
        appendText(diagnosticsSection, 'p', `진단 정보를 불러오지 못했습니다: ${diagnostics.error?.message || '요청에 실패했습니다.'}`);
        retryNotice(diagnosticsSection);
      } else if (diagnostics?.status === 'ok') {
        const d = diagnostics.data || {};
        const safeDiagnostics = {
          requestId: d.requestId ?? '확인 불가',
          component: d.component ?? '확인 불가',
          version: d.version ?? '확인 불가',
          checkedAt: d.checkedAt ?? '확인 불가',
          engineMode: d.engine?.mode ?? '확인 불가',
          engineCode: d.engine?.code ?? '확인 불가',
        };

        appendText(diagnosticsSection, 'p', `requestId: ${safeDiagnostics.requestId}`);
        appendText(diagnosticsSection, 'p', `component: ${safeDiagnostics.component}`);
        appendText(diagnosticsSection, 'p', `version: ${safeDiagnostics.version}`);
        appendText(diagnosticsSection, 'p', `checkedAt: ${safeDiagnostics.checkedAt}`);
        appendText(diagnosticsSection, 'p', `engine.mode: ${safeDiagnostics.engineMode}`);
        appendText(diagnosticsSection, 'p', `engine.code: ${safeDiagnostics.engineCode}`);
        appendText(diagnosticsSection, 'p', '아래 버튼은 위의 비밀 없는 진단 정보만 도움 요청용으로 복사합니다.');

        const copyStatus = document.createElement('p');
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.textContent = '도움정보 복사';
        copyButton.addEventListener('click', async () => {
          const copyText = [
            `requestId: ${safeDiagnostics.requestId}`,
            `component: ${safeDiagnostics.component}`,
            `version: ${safeDiagnostics.version}`,
            `checkedAt: ${safeDiagnostics.checkedAt}`,
            `engine.mode: ${safeDiagnostics.engineMode}`,
            `engine.code: ${safeDiagnostics.engineCode}`,
          ].join('\n');

          try {
            await navigator.clipboard.writeText(copyText);
            copyStatus.textContent = '비밀 없는 도움정보를 클립보드에 복사했습니다.';
          } catch {
            copyStatus.textContent = '자동 복사를 사용할 수 없습니다. 위의 비밀 없는 진단 정보만 직접 복사하세요.';
          }
        });
        diagnosticsSection.append(copyButton, copyStatus);
      } else {
        appendText(diagnosticsSection, 'p', '진단 정보 상태를 확인할 수 없습니다.');
      }
      root.append(diagnosticsSection);

      if (modeLabels[mode]) {
        appendText(root, 'p', `현재 데이터 연결 상태: ${modeLabels[mode]}`);
      }

      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted }) {
      const root = document.createElement('section');

      const appendText = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.append(node);
        return node;
      };

      const modeLabels = {
        connected: '연결됨(connected)',
        demo: '예제 자료(demo)',
        disconnected: '연결 없음(disconnected)',
        unknown: '확인 불가(unknown)',
      };

      const manualRetry = () => {
        appendText('p', '다시 점검하려면 제공 화면의 「현재 API 연결 점검」을 사용자가 직접 누르세요. 자동으로 다시 점검하지 않습니다.');
      };

      if (status === 'idle') {
        appendText('p', 'AI 연결 점검 전입니다.');
        appendText('p', '아직 앱 권한이나 모델 응답을 확인하지 않았으며 사건 설명도 실행하지 않았습니다.');
        manualRetry();
      } else if (status === 'loading') {
        appendText('p', 'AI 연결 점검 중입니다.');
        appendText('p', '현재 로그인과 앱 권한으로 모델 응답 가능 여부를 확인하는 중이며 사건 설명 성공을 뜻하지 않습니다.');
      } else if (status === 'ok') {
        const authLabel = data?.audienceAuthorization === 'test'
          ? '시험 연결 점검(test)'
          : data?.audienceAuthorization === 'verified'
            ? '앱 권한 확인 후 점검(verified)'
            : `확인 불가(${data?.audienceAuthorization ?? 'unknown'})`;

        appendText('p', `연결 점검: ${authLabel}`);
        appendText('p', `응답 가능한 모델 수: ${Number.isInteger(data?.modelCount) ? data.modelCount : '확인 불가'}`);
        appendText('p', `점검 시각: ${checkedAt || '확인 불가'}`);
        appendText('p', '이 결과는 AI 연결과 모델 응답 가능 여부를 점검한 결과입니다.');
        appendText('p', '사건 설명은 아직 실행하지 않았습니다. 보안 기록에서 별도로 요청하고 결과를 확인해야 합니다.');
        if (explanationAccepted === true) {
          appendText('p', '연결 점검과 사건 설명 결과는 서로 별도의 상태로 확인합니다.');
        }
        manualRetry();
      } else if (status === 'error') {
        const code = error?.code || 'AI_REQUEST_UNVERIFIED';
        const message = error?.message || 'AI 연결 또는 응답을 확인할 수 없습니다.';

        appendText('p', `AI 연결 점검 실패 · 오류 코드: ${code}`);
        appendText('p', `오류 메시지: ${message}`);

        const provisioning = new Set([
          'ON_AI_PROVISIONING_PENDING',
          'AI_REQUEST_UNVERIFIED',
          'SUBJECT_SCOPE_UNVERIFIED',
          'ON_AI_AUTHORIZATION_CHANGED',
        ]);
        const authentication = new Set(['WB_CLCO_AUTH_REQUIRED']);
        const accessDenied = new Set(['WB_CLCO_ACCESS_BLOCKED']);
        const limits = new Set(['WB_CLCO_COHORT_BUDGET_EXHAUSTED', 'WB_CLCO_LIMIT_REACHED']);
        const manualNetworkRetry = new Set(['WB_CLCO_RATE_LIMITED', 'WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT']);
        const cancelled = new Set(['WB_CLCO_CANCELLED', 'CANCELLED', 'REQUEST_CANCELLED']);
        const noModel = new Set(['MODEL_NOT_CONFIGURED', 'ON_AI_MODEL_LIST_EMPTY']);

        if (provisioning.has(code)) {
          appendText('p', '계정 연결 또는 앱 권한을 확인할 수 없거나 준비 중입니다. 담당자에게 현재 계정과 앱 권한 상태를 확인하세요.');
        } else if (authentication.has(code)) {
          appendText('p', '앱 인증을 확인할 수 없습니다. 계정 연결을 다시 확인하고 필요하면 담당자에게 앱 권한을 확인하세요.');
        } else if (accessDenied.has(code)) {
          appendText('p', '현재 앱의 AI 접근 권한이 제한됐습니다. 담당자에게 앱 이용 권한을 확인하세요.');
        } else if (limits.has(code)) {
          appendText('p', '수업용 AI 사용량 또는 이용 한도에 도달했습니다. 담당자에게 이용 가능 상태를 확인하세요.');
        } else if (code === 'WB_CLCO_SESSION_CLOSED') {
          appendText('p', '현재 AI 이용 시간이 아닙니다. 수업용 AI 이용 시간을 확인하세요.');
        } else if (manualNetworkRetry.has(code)) {
          appendText('p', '요청 제한·시간 초과 또는 일시적인 연결 문제입니다. 잠시 뒤 사용자가 직접 다시 점검하세요.');
        } else if (cancelled.has(code)) {
          appendText('p', 'AI 연결 점검이 취소됐습니다. 이전 점검 결과는 현재 결과가 아닙니다.');
        } else if (noModel.has(code)) {
          appendText('p', '현재 앱 권한으로 사용할 수 있는 모델을 확인할 수 없습니다. 담당자에게 모델 허용 설정을 확인하세요.');
        } else {
          appendText('p', '현재 AI 연결 상태를 확인할 수 없습니다. 기존 보안 기록은 그대로 유지하고 담당자에게 상태를 확인하세요.');
        }

        appendText('p', '연결 점검 실패는 사건 설명 실패나 보안 기록 변경을 의미하지 않습니다.');
        manualRetry();
      } else {
        appendText('p', 'AI 연결 점검 상태를 확인할 수 없습니다.');
        manualRetry();
      }

      if (modeLabels[mode]) {
        appendText('p', `데이터 연결 상태: ${modeLabels[mode]}`);
      }

      return root;
    },
    renderExplanation({ event, explanation, checkedAt }) {
      const root = document.createElement('section');

      const appendText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };

      const safeCode = explanation?.error?.code || 'AI_REQUEST_UNVERIFIED';
      const safeMessage = explanation?.error?.message || 'AI 설명 결과를 확인할 수 없습니다.';

      if (explanation?.status === 'error') {
        appendText(root, 'p', `AI 설명 실패 · 오류 코드: ${safeCode}`);
        appendText(root, 'p', `오류 메시지: ${safeMessage}`);
        if (safeCode === 'ON_AI_INVALID_INPUT') {
          appendText(root, 'p', '현재 기록의 근거·규칙·상태가 설명 요청에 충분한지 확인해야 합니다.');
        } else if (safeCode === 'ON_AI_INVALID_OUTPUT') {
          appendText(root, 'p', 'AI 설명의 근거 ID 또는 응답 형식이 현재 기록과 맞지 않아 설명을 사용할 수 없습니다.');
        } else if (safeCode === 'CANCELLED' || safeCode === 'WB_CLCO_CANCELLED' || safeCode === 'REQUEST_CANCELLED') {
          appendText(root, 'p', '설명 요청이 취소됐으며 이전 설명은 현재 결과가 아닙니다.');
        }
        appendText(root, 'p', 'AI 설명이 실패해도 원래 보안 기록은 그대로 유지됩니다.');
        appendText(root, 'p', 'AI 설명 실패는 업무 앱 판정이나 보안 기록 자체의 실패를 의미하지 않습니다.');
        return root;
      }

      if (!event?.id) {
        appendText(root, 'p', '보안 기록에서 기록을 먼저 고르세요.');
        return root;
      }

      if (explanation?.status === 'loading') {
        appendText(root, 'p', `AI 사건 설명을 요청하는 중입니다. 사건 ID: ${event.id}`);
        return root;
      }

      if (explanation?.status === 'idle') {
        appendText(root, 'p', `사건 ${event.id}의 AI 설명을 아직 요청하지 않았습니다.`);
        return root;
      }

      if (explanation?.status !== 'ok') {
        appendText(root, 'p', 'AI 사건 설명 상태를 확인할 수 없습니다.');
        return root;
      }

      const data = explanation.data || {};
      const evidence = Array.isArray(event.evidence) ? event.evidence : [];
      const rules = Array.isArray(event.rules) ? event.rules : [];
      const supportedActions = Array.isArray(event.supportedActions) ? event.supportedActions : [];
      const evidenceIds = Array.isArray(data.evidenceIds) ? data.evidenceIds : [];
      const proposals = Array.isArray(data.proposals) ? data.proposals : [];

      const evidenceById = new Map(evidence.map((item) => [item.id, item]));
      const evidenceIdSet = new Set(evidenceIds);
      const currentEvidenceIds = new Set(evidence.map((item) => item.id));

      const evidenceMatchesCurrentEvent =
        evidence.length > 0
        && evidenceIds.length === evidence.length
        && evidenceIdSet.size === evidenceIds.length
        && evidenceIds.every((id) => evidenceById.has(id))
        && evidence.every((item) => evidenceIdSet.has(item.id));

      if (!evidenceMatchesCurrentEvent) {
        appendText(root, 'p', 'AI 설명을 사용할 수 없습니다: 근거 ID가 현재 선택한 기록의 근거와 일치하지 않습니다.');
        appendText(root, 'p', `현재 사건 ID: ${event.id}`);
        if (safeCode !== 'AI_REQUEST_UNVERIFIED') appendText(root, 'p', `오류 코드: ${safeCode}`);
        appendText(root, 'p', '없는 근거를 만들어 맞추지 않으며 원래 보안 기록은 그대로 유지합니다.');
        return root;
      }

      const proposalEvidenceMatches = proposals.every((proposal) =>
        proposal
        && typeof proposal.action === 'string'
        && supportedActions.includes(proposal.action)
        && typeof proposal.reason === 'string'
        && Array.isArray(proposal.evidenceIds)
        && proposal.evidenceIds.length > 0
        && new Set(proposal.evidenceIds).size === proposal.evidenceIds.length
        && proposal.evidenceIds.every((id) => currentEvidenceIds.has(id))
      );

      if (!proposalEvidenceMatches || data.requiresHumanConfirmation !== true || data.executed !== false) {
        appendText(root, 'p', 'AI 설명을 사용할 수 없습니다: 조치 제안 또는 실행 상태가 현재 기록의 계약과 맞지 않습니다.');
        appendText(root, 'p', 'AI가 이미 실행했다고 표시한 설명은 사용하지 않으며 어떤 조치도 실행하지 않습니다.');
        return root;
      }

      root.setAttribute('data-student-explanation-event', event.id);

      appendText(root, 'h3', 'AI 설명(참고용)');
      appendText(root, 'p', `사건 ID: ${event.id}`);
      appendText(root, 'p', `AI 요약: ${data.summary || '설명 요약을 확인할 수 없습니다.'}`);
      if (checkedAt) appendText(root, 'p', `설명 확인 시각: ${checkedAt}`);
      appendText(root, 'p', 'AI 설명은 참고 정보이며 사실 판단은 아래 기록의 근거·규칙·현재 상태를 기준으로 합니다.');

      appendText(root, 'h4', '인용한 근거');
      const evidenceList = document.createElement('ul');
      for (const id of evidenceIds) {
        const item = evidenceById.get(id);
        appendText(evidenceList, 'li', `${id} — ${item.text}`);
      }
      root.append(evidenceList);

      appendText(root, 'h4', '현재 규칙');
      if (rules.length === 0) {
        appendText(root, 'p', '표시할 규칙이 없습니다.');
      } else {
        const ruleList = document.createElement('ul');
        for (const rule of rules) {
          appendText(ruleList, 'li', `${rule.id} — ${rule.text}`);
        }
        root.append(ruleList);
      }

      appendText(root, 'h4', '확인 불가 상태');
      const unknownStates = [];
      if (event.state?.access === 'unknown') unknownStates.push('접속: 확인 불가(unknown)');
      if (event.state?.session === 'unknown') unknownStates.push('세션: 확인 불가(unknown)');
      if (event.state?.device === 'unknown') unknownStates.push('기기: 확인 불가(unknown)');

      if (unknownStates.length === 0) {
        appendText(root, 'p', '확인 불가(unknown) 상태 없음');
      } else {
        const unknownList = document.createElement('ul');
        for (const text of unknownStates) appendText(unknownList, 'li', text);
        root.append(unknownList);
      }

      appendText(root, 'h4', '조치 제안');
      if (proposals.length === 0) {
        if (supportedActions.length === 0) {
          appendText(root, 'p', '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).');
        } else {
          appendText(root, 'p', '현재 기록에 대해 AI가 제안한 조치가 없습니다.');
        }
      } else {
        const proposalList = document.createElement('ul');
        for (const proposal of proposals) {
          const item = document.createElement('li');
          appendText(item, 'p', `조치: ${proposal.action}`);
          appendText(item, 'p', `이유: ${proposal.reason}`);
          appendText(item, 'p', `근거 ID: ${proposal.evidenceIds.join(', ')}`);
          appendText(item, 'p', '사람 확인이 필요하며 아직 실행되지 않았습니다.');
          proposalList.append(item);
        }
        root.append(proposalList);
      }

      appendText(root, 'p', 'AI 설명과 제안만으로 보안 조치는 실행되지 않습니다.');
      return root;
    },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
