const text = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
};

function decodeBase64url(value) {
  const base64 = value.replace(/-/gu, '+').replace(/_/gu, '/')
    + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function encodeBase64url(value) {
  const bytes = new Uint8Array(value);
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function registrationPublicKey(options) {
  const authenticatorSelection = {
    ...(options.authenticatorSelection ?? {}),
    authenticatorAttachment: 'platform',
    userVerification: 'required',
  };
  const { hints: _ignoredHints, ...rest } = options;
  return {
    ...rest,
    challenge: decodeBase64url(options.challenge),
    user: { ...options.user, id: decodeBase64url(options.user.id) },
    authenticatorSelection,
    excludeCredentials: (options.excludeCredentials ?? []).map((item) => ({
      ...item,
      id: decodeBase64url(item.id),
    })),
  };
}

function assertionPublicKey(options) {
  return {
    challenge: decodeBase64url(options.challenge),
    rpId: options.rpId,
    timeout: options.timeout,
    userVerification: options.userVerification,
    allowCredentials: (options.allowCredentials ?? []).map((item) => ({
      ...item,
      id: decodeBase64url(item.id),
    })),
  };
}

function registrationBody(credential) {
  const response = credential?.response;
  if (!credential || credential.type !== 'public-key'
      || typeof response?.getPublicKey !== 'function'
      || typeof response?.getAuthenticatorData !== 'function') {
    throw new Error('WEBAUTHN_DETAILS_UNAVAILABLE');
  }
  const publicKey = response.getPublicKey();
  const authenticatorData = response.getAuthenticatorData();
  if (!publicKey || !authenticatorData) throw new Error('WEBAUTHN_DETAILS_UNAVAILABLE');
  return {
    credential: {
      id: credential.id,
      type: credential.type,
      response: {
        clientDataJSON: encodeBase64url(response.clientDataJSON),
        authenticatorData: encodeBase64url(authenticatorData),
        publicKey: encodeBase64url(publicKey),
        transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
      },
    },
  };
}

function assertionBody(credential) {
  const response = credential?.response;
  if (!credential || credential.type !== 'public-key' || !response) {
    throw new Error('INVALID_DEVICE_ASSERTION');
  }
  return {
    credential: {
      id: credential.id,
      type: credential.type,
      response: {
        clientDataJSON: encodeBase64url(response.clientDataJSON),
        authenticatorData: encodeBase64url(response.authenticatorData),
        signature: encodeBase64url(response.signature),
      },
    },
  };
}

async function deviceRequest(action, body) {
  const response = await fetch(`/api/device?action=${encodeURIComponent(action)}`, {
    method: action === 'status' ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
  });
  let data = null;
  try { data = await response.json(); } catch { /* use status below */ }
  if (!response.ok) {
    const error = new Error(data?.error ?? `DEVICE_HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function initDeviceAccess({ isLoggedIn, onAuthorized, onLocked }) {
  const panel = document.getElementById('device-panel');
  const requestButton = document.getElementById('device-request');
  const openButton = document.getElementById('device-open');
  const refreshButton = document.getElementById('device-refresh');
  const installButton = document.getElementById('pwa-install');
  let busy = false;
  let installPrompt = null;

  function controls(registration = 'not_registered', verified = false) {
    const loggedIn = isLoggedIn();
    panel.hidden = !loggedIn;
    requestButton.hidden = !loggedIn || verified || registration === 'pending';
    openButton.hidden = !loggedIn || verified || registration !== 'approved';
    refreshButton.hidden = !loggedIn;
    for (const button of [requestButton, openButton, refreshButton]) button.disabled = busy;
  }

  function lock() {
    onLocked();
    controls();
  }

  function showStatus(data) {
    const verified = data?.verified === true && data?.canOpenVault === true;
    const registration = data?.registration ?? 'not_registered';
    if (verified) {
      text('device-state', '승인된 기기 확인 완료');
      text('device-detail', '서버가 승인 상태와 현재 기기 서명을 확인했습니다. 기존 자료실을 열 수 있습니다.');
      text('device-request-code', '');
    } else if (registration === 'approved') {
      text('device-state', '승인됨 · 기기 확인 필요');
      text('device-detail', '승인된 등록 기록이 있습니다. 인증기의 새 서명을 확인해야 자료실이 열립니다.');
      text('device-request-code', '');
    } else if (registration === 'pending') {
      text('device-state', '승인 대기');
      text('device-detail', '요청은 접수됐지만 아직 권한이 없습니다. 설치 여부와 승인 여부는 별개입니다.');
      text('device-request-code', data?.requestCode ? `승인 요청 코드: ${data.requestCode}` : '');
    } else {
      text('device-state', '기기 미등록');
      text('device-detail', '기기 승인 요청을 보내도 즉시 권한이 생기지 않습니다. 서버의 승인 기록이 필요합니다.');
      text('device-request-code', '');
    }
    controls(registration, verified);
    if (verified) onAuthorized();
    else onLocked();
  }

  async function status() {
    if (!isLoggedIn()) {
      panel.hidden = true;
      onLocked();
      return;
    }
    text('device-state', '기기 상태 확인 중');
    text('device-detail', '서버의 등록·승인 상태를 확인합니다.');
    try {
      showStatus(await deviceRequest('status'));
    } catch {
      onLocked();
      controls();
      text('device-state', '기기 확인 실패');
      text('device-detail', '서버에서 승인 상태를 확인할 수 없어 보호 자료를 잠갔습니다.');
    }
  }

  async function requestApproval() {
    if (busy || !isLoggedIn()) return;
    let requested = false;
    if (!window.PublicKeyCredential || !navigator.credentials?.create
        || typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      text('device-state', '기기 인증 기능을 사용할 수 없음');
      text('device-detail', 'HTTPS와 WebAuthn 플랫폼 인증기를 지원하는 브라우저가 필요합니다.');
      return;
    }
    const platformAvailable =
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
    if (!platformAvailable) {
      text('device-state', '이 기기의 내장 인증기를 사용할 수 없음');
      text('device-detail', '이 화면에서는 USB 보안키로 대체하지 않습니다. 휴대폰의 화면 잠금/생체 인증이 활성화된 브라우저에서 다시 시도하세요.');
      return;
    }
    busy = true;
    controls();
    text('device-state', '기기 등록 요청 준비 중');
    text('device-detail', '브라우저의 PIN·생체인증 안내를 완료해도 아직 승인 전입니다.');
    try {
      const options = await deviceRequest('registration-options', {});
      const credential = await navigator.credentials.create({
        publicKey: registrationPublicKey(options),
      });
      const result = await deviceRequest('registration-verify', registrationBody(credential));
      onLocked();
      text('device-state', '승인 대기');
      text('device-detail', '기기 등록 요청만 접수했습니다. 서버에서 승인되기 전에는 보호 자료가 열리지 않습니다.');
      requested = true;
      text('device-request-code', result?.requestCode
        ? `승인 요청 코드: ${result.requestCode}`
        : '승인 요청 코드를 확인할 수 없습니다.');
    } catch (error) {
      onLocked();
      text('device-state', '승인 요청 실패');
      text('device-detail', error?.name === 'NotAllowedError'
        ? '기기 등록 확인이 취소되었습니다.'
        : `기기 등록 요청 실패: ${error?.message ?? 'UNKNOWN_ERROR'}`);
      text('device-request-code', '');
    } finally {
      busy = false;
      controls(requested ? 'pending' : 'not_registered', false);
    }
  }

  async function openVault() {
    if (busy || !isLoggedIn()) return;
    let opened = false;
    if (!window.PublicKeyCredential || !navigator.credentials?.get) {
      text('device-state', '기기 인증 기능을 사용할 수 없음');
      return;
    }
    busy = true;
    controls('approved', false);
    text('device-state', '승인된 기기 확인 중');
    text('device-detail', '서버가 발급한 새 요청에 인증기가 서명해야 합니다.');
    try {
      const options = await deviceRequest('assertion-options', {});
      const credential = await navigator.credentials.get({
        publicKey: assertionPublicKey(options),
      });
      const result = await deviceRequest('assertion-verify', assertionBody(credential));
      if (result?.approved !== true || result?.canOpenVault !== true) {
        throw new Error('DEVICE_NOT_VERIFIED');
      }
      await status();
      opened = true;
    } catch (error) {
      onLocked();
      text('device-state', '자료실 잠김');
      text('device-detail', error?.name === 'NotAllowedError'
        ? '기기 확인이 취소되었습니다. 승인된 기기에서 다시 시도하세요.'
        : `기기 확인 실패: ${error?.message ?? 'UNKNOWN_ERROR'}`);
    } finally {
      busy = false;
      if (!opened) controls('approved', false);
    }
  }

  function installed() {
    return window.matchMedia?.('(display-mode: standalone)').matches === true;
  }

  function renderInstall() {
    if (installed()) {
      text('pwa-state', '설치형으로 실행 중 · 기기 승인은 별도 확인');
      installButton.hidden = true;
    } else if (installPrompt) {
      text('pwa-state', '설치 가능 · 설치만으로 기기 승인이 되지 않음');
      installButton.hidden = false;
    } else {
      text('pwa-state', '브라우저 실행 · 설치 표시는 기기 승인 근거가 아님');
      installButton.hidden = true;
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    renderInstall();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    renderInstall();
  });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    renderInstall();
    await prompt.prompt();
    renderInstall();
  });

  requestButton.addEventListener('click', requestApproval);
  openButton.addEventListener('click', openVault);
  refreshButton.addEventListener('click', status);

  renderInstall();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }, { once: true });
  }

  return Object.freeze({ status, lock });
}
