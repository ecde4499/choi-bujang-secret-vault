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
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
