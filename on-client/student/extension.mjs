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
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
