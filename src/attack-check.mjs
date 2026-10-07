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

  if (config.step === 3) {
    const staticResponse = await fetch(new URL('/data.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let staticEmpty = false;
    if (staticResponse.ok) {
      try {
        const data = await staticResponse.json();
        staticEmpty = Array.isArray(data.notes) && data.notes.length === 0;
      } catch {
        // The expected empty JSON file was not verified.
      }
    }

    const listResponse = await fetch(new URL('/api/notes', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const createResponse = await fetch(new URL('/api/notes', app), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'unauthorized-check', body: 'must-not-be-created' }),
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const itemResponse = await fetch(new URL('/api/notes/00000000-0000-4000-8000-000000000000', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });

    return [
      { attackId: 'static_note_removed', expected: '정적 data.json에는 메모 본문이 없음',
        observed: staticEmpty ? '정적 data.json이 빈 자료 상태임' : `정적 data.json 상태를 확인하지 못함 (HTTP ${staticResponse.status})` },
      { attackId: 'anonymous_note_list_denied', expected: '비로그인 목록 조회는 401로 거부',
        observed: `비로그인 목록 조회 HTTP ${listResponse.status}` },
      { attackId: 'anonymous_note_create_denied', expected: '비로그인 메모 추가는 401로 거부',
        observed: `비로그인 메모 추가 HTTP ${createResponse.status}` },
      { attackId: 'anonymous_note_item_denied', expected: '비로그인 한 건 조회는 401로 거부',
        observed: `비로그인 한 건 조회 HTTP ${itemResponse.status}` },
    ];
  }

  if (config.step === 4) {
    const rootResponse = await fetch(app, {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const nosniff = rootResponse.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff';

    const alephResponse = await fetch(new URL('/aleph.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let alephVisible = false;
    if (alephResponse.ok) {
      try {
        const data = await alephResponse.json();
        alephVisible = data?.step === 4
          && typeof data?.commit === 'string'
          && typeof data?.repoUrl === 'string';
      } catch {
        // A non-JSON deployment identity is not a successful check.
      }
    }

    const staticResponse = await fetch(new URL('/data.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let staticEmpty = false;
    if (staticResponse.ok) {
      try {
        const data = await staticResponse.json();
        staticEmpty = Array.isArray(data.notes) && data.notes.length === 0;
      } catch {
        // The expected empty JSON file was not verified.
      }
    }

    const listResponse = await fetch(new URL('/api/notes', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let listJsonError = false;
    try {
      const body = await listResponse.json();
      listJsonError = (listResponse.status === 401 || listResponse.status === 403)
        && typeof body?.error === 'string' && body.error.length > 0;
    } catch {
      // HTML or empty response must not count as a correct denial.
    }

    const itemResponse = await fetch(new URL('/api/notes/00000000-0000-4000-8000-000000000000', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });

    return [
      { attackId: 'anonymous_note_list_denied_json', expected: '비로그인 목록 요청은 401/403 JSON 오류로 거부',
        observed: listJsonError ? `비로그인 목록 요청이 JSON 오류로 거부됨 (HTTP ${listResponse.status})` : `비로그인 목록 거부 형식 불일치 (HTTP ${listResponse.status})` },
      { attackId: 'anonymous_note_item_denied', expected: '비로그인 한 건 요청은 401/403으로 거부',
        observed: `비로그인 한 건 요청 HTTP ${itemResponse.status}` },
      { attackId: 'deployment_identity_visible', expected: '/aleph.json에서 4단계 배포 식별 정보 확인',
        observed: alephVisible ? '4단계 aleph.json 확인됨' : `aleph.json 확인 실패 (HTTP ${alephResponse.status})` },
      { attackId: 'security_header_present', expected: '첫 화면에 X-Content-Type-Options nosniff 존재',
        observed: nosniff ? '첫 화면 nosniff 헤더 확인됨' : `첫 화면 nosniff 헤더 없음 (HTTP ${rootResponse.status})` },
      { attackId: 'static_note_removed', expected: '정적 data.json에는 메모 본문이 없음',
        observed: staticEmpty ? '정적 data.json이 빈 자료 상태임' : `정적 data.json 상태를 확인하지 못함 (HTTP ${staticResponse.status})` },
    ];
  }

  throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
}
