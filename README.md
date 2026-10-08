# BYTE BACK 방어전 — 5단계 자료 요청을 서버 한곳으로 모읍니다

4단계의 로그인·소유자 검사를 유지하면서 브라우저의 메모 요청과 로그인 요청을 같은 사이트의 서버 함수로 모은 저장점입니다. 브라우저 화면 코드에는 Supabase publishable/anon 키를 두지 않습니다. 서버 함수는 Vercel의 `SUPABASE_URL`, 로그인용 `SUPABASE_PUBLISHABLE_KEY`, 메모·검증용 `SUPABASE_SECRET_KEY`를 사용합니다.

## 현재 구현

- 브라우저는 메모를 Supabase 원본 REST API에서 직접 읽거나 쓰지 않고 `/api/notes` 서버 함수만 호출합니다.
- 로그인도 `POST /api/auth/login` 서버 함수를 거치며, access token은 `HttpOnly; Secure; SameSite=Lax` 쿠키로 전달됩니다.
- 메모 서버 함수는 기존 Bearer token 또는 같은 HttpOnly 쿠키를 `src/verify-login.mjs`로 검증합니다.
- 4단계의 `owner_id = 검증된 userId` 소유자 검사를 그대로 유지해 본인 메모만 CRUD할 수 있습니다.
- 화면 코드에는 `sb_publishable_...` 또는 anon 키가 없고, 정적 `data.json`에도 메모 본문이 없습니다.

## 브라우저 직접 자료 호출 확인

5단계 시작 시 `public/index.html`을 확인한 결과 메모 자료를 Supabase에서 직접 조회·추가·수정·삭제하는 코드는 **없었습니다**. 메모는 이미 `/api/notes`, `/api/notes/:id` 서버 함수만 사용하고 있었습니다.

추가점수 조건을 위해 브라우저에 있던 Supabase Auth SDK와 publishable key도 제거하고 로그인/로그아웃/세션 확인을 서버 함수로 옮겼습니다. 비밀번호는 로그인 요청 순간에만 서버 함수로 전달하며 코드·Git·로그·제출 묶음에 저장하지 않습니다.

## 서버 로그인 경로

- `POST /api/auth/login` — 이메일·비밀번호를 서버의 Supabase Auth 클라이언트로 전달하고 성공 시 HttpOnly 세션 쿠키 설정
- `GET /api/auth/session` — 현재 세션 쿠키를 기존 `src/verify-login.mjs`로 검증
- `POST /api/auth/logout` — 브라우저의 세션 쿠키 만료

브라우저 JavaScript는 access token을 직접 읽거나 Authorization 헤더를 만들지 않습니다. 기존 외부/심판 Bearer 요청 호환성을 위해 메모 API의 Authorization 검증도 계속 지원합니다.

## 메모 서버 함수와 소유자 검사

허용된 메모 경로는 다음과 같습니다.

- `GET /api/notes`
- `POST /api/notes`
- `GET /api/notes/:id`
- `PUT /api/notes/:id`
- `DELETE /api/notes/:id`

목록은 검증된 사용자 ID와 같은 `owner_id`의 행만 반환합니다. 추가 시 요청의 `owner_id`를 받지 않고 검증된 사용자 ID를 저장합니다. 한 건 조회·수정·삭제는 ID와 `owner_id`가 모두 현재 사용자와 일치해야 합니다. 수정 본문은 계속 `{title,body}`, 한 건 응답은 `{id,title,body}`입니다.

## 원본 자료 경로

`aleph.config.json`의 `originalApiUrl`에는 쿼리 없는 Supabase 원본 notes REST 경로를 기록합니다.

`https://fwkwsmcfbosrnqzsvyxk.supabase.co/rest/v1/notes`

이 주소는 심판이 anon 키로 직접 접근 차단 상태를 확인하기 위한 원본 자료 경로이며, 브라우저 화면에서는 사용하지 않습니다.

## 5단계 직접 권한 회수 SQL

`docs/STEP5_REVOKE_DIRECT_ACCESS.sql`은 **public.notes 테이블 하나만** 대상으로 합니다. 실행 전에는 `information_schema.role_table_grants`와 `has_table_privilege`로 PUBLIC·anon·authenticated 권한을 확인하고, 다음 명령으로 원본 직접 권한을 모두 회수합니다.

`REVOKE ALL ON TABLE public.notes FROM PUBLIC, anon, authenticated;`

실행 후 같은 두 조회로 anon/authenticated의 SELECT·INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER가 모두 false인지 확인합니다. 마지막 조회는 service_role의 CRUD 권한이 유지되는지만 확인하며 service_role 권한 자체를 변경하지 않습니다.

이 SQL은 사용자가 검토한 뒤 Supabase SQL Editor에서 직접 실행합니다. 다른 테이블과 기존 서버 함수의 로그인·소유자 검사는 건드리지 않습니다.

## 확인 절차

1. 최신 5단계 배포에서 A 계정으로 로그인합니다.
2. A의 기존 메모 목록이 보이고 메모 추가·수정·삭제가 모두 서버 함수에서 정상 동작하는지 확인합니다.
3. 로그아웃 뒤 `GET /api/notes`가 `401` 또는 `403` JSON 오류로 거부되는지 확인합니다.
4. `docs/STEP5_REVOKE_DIRECT_ACCESS.sql`을 검토해 실행하고 AFTER 결과에서 anon/authenticated 직접 권한이 모두 사라졌는지 확인합니다.
5. SQL 적용 뒤에도 A 화면 CRUD가 유지되는지 다시 확인합니다.
6. 배포 주소의 `/aleph.json`에서 `allowedRoutes`가 비어 있지 않고 `originalApiUrl`이 기록되었는지 확인합니다.
7. 첫 화면 응답의 `X-Content-Type-Options: nosniff`와 화면 소스에 `sb_publishable_` 키가 없는지 확인합니다.

원본 REST API에 anon 키를 넣은 직접 차단 시험은 키를 코드나 제출물에 저장하지 않고 심판 확인 대상으로 남깁니다.

## 다시 실행

로컬 정적 빌드:

`npm run build -- --local`

배포에서는 Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`가 필요합니다. publishable key도 브라우저 코드에 넣지 않고 서버 로그인 함수에서만 읽습니다. 실제 값은 Vercel 비밀 입력란에만 넣습니다.

DB 권한 회수는 `docs/STEP5_REVOKE_DIRECT_ACCESS.sql`을 검토한 뒤 Supabase SQL Editor에서 실행합니다. 배포가 Ready가 된 뒤 A 정상 CRUD를 SQL 적용 전후 모두 확인합니다.

## 5단계 저장점 기록

- 단계: 5
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자: Supabase Auth (`aleph.config.json`의 `identityProvider`)
- 허용 경로: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, 메모 GET/POST/PUT/DELETE 경로
- 원본 API 주소: `https://fwkwsmcfbosrnqzsvyxk.supabase.co/rest/v1/notes`
- 브라우저 공개 키: 제거
- 메모 데이터 경계: 서버 함수 + 검증된 사용자 ID + `owner_id`
- DB 직접 권한: `docs/STEP5_REVOKE_DIRECT_ACCESS.sql`을 사용자가 검토 후 실행
- 보안 헤더: `X-Content-Type-Options: nosniff` 유지
- 배포 식별 파일: 빌드 시 `/aleph.json`에 `allowedRoutes`, `originalApiUrl` 포함


## 보너스 xdr-02 — 웹 주입 공격 탐지

- 원본 경보: `xdr/fixtures/web-injection.json` (수정하지 않음)
- 읽기 모듈: `xdr/web-injection/read-alerts.mjs`
- 패턴 근거: MITRE ATT&CK T1190, SQL 구문·스크립트 삽입·반복 경로 이탈
- 판정 모듈: `xdr/web-injection/decide.mjs`
- 응답 연결 모듈: `xdr/web-injection/respond.mjs`
- 실행 명령: `npm run xdr:run -- web-injection`
- 실제 실행 결과: block 8 / alert 9 / record 9
- 정상 이벤트 오탐 차단: 0건
- 결과 파일: `xdr/web-injection/result.json`

[AGENTS.md](AGENTS.md)의 공통 규칙을 계속 적용합니다. 실제 비밀번호·JWT·서버 전용 키·실제 이메일 값은 GitHub나 제출 묶음에 넣지 않습니다.
