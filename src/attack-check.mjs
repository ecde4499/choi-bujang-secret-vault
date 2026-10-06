// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }

  if (config.step === 1) {
    const response = await fetch(new URL('/data.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let visible = false;
    if (response.ok) {
      try {
        const data = await response.json();
        visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
          && data.notes.length > 0;
      } catch {
        // A non-JSON response is a failed check, not a successful deployment.
      }
    }
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
  }

  if (config.step === 2) {
    const staticResponse = await fetch(new URL('/data.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let staticEmpty = false;
    if (staticResponse.ok) {
      try {
        const data = await staticResponse.json();
        staticEmpty = Array.isArray(data.notes) && data.notes.length === 0
          && data.sampleMarker === undefined;
      } catch {
        // Failed JSON parsing means the expected empty static file was not verified.
      }
    }

    const apiResponse = await fetch(new URL('/api/notes', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let apiPublic = false;
    if (apiResponse.ok) {
      try {
        const data = await apiResponse.json();
        apiPublic = Array.isArray(data.notes) && data.notes.length > 0;
      } catch {
        // Non-JSON is not a successful public API check.
      }
    }

    return [
      { attackId: 'static_note_removed', expected: '비로그인 /data.json에 메모 본문이 없음',
        observed: staticEmpty ? '정적 data.json에서 메모 본문이 보이지 않음' : `정적 data.json 제거 상태를 확인하지 못함 (HTTP ${staticResponse.status})` },
      { attackId: 'public_server_api', expected: '2단계에서는 서버 API가 아직 공개 주소라는 약점 확인',
        observed: apiPublic ? '비로그인 /api/notes 요청에서 가상 메모 목록을 읽을 수 있음' : `공개 API 약점을 확인하지 못함 (HTTP ${apiResponse.status})` },
    ];
  }

  throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
}
