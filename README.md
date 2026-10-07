# BYTE BACK 방어전 — 3단계 진짜 로그인을 붙입니다

2단계의 같은 자료실에 Supabase Auth 이메일·비밀번호 로그인과 로그아웃을 붙이고, 자료 API가 `src/verify-login.mjs`로 Bearer token을 검증하도록 바꾼 저장점입니다. 비밀번호·JWT·서버 전용 키는 직접 만들거나 코드에 저장하지 않습니다.

## 현재 구현

- `/`는 Supabase 공식 JS SDK의 `signInWithPassword()` / `signOut()` 흐름으로 로그인 상태를 바꿉니다.
- 로그인 세션이 없으면 메모 화면과 자료를 표시하지 않고, API도 `401 UNAUTHORIZED`로 거부합니다.
- 로그인 요청의 access token은 `src/verify-login.mjs`로 검증하며 브라우저가 보낸 `userId`나 `role`은 신뢰하지 않습니다.
- 로그인 사용자는 메모 목록 조회·추가·한 건 조회·수정·삭제를 할 수 있고, 새 메모의 `owner_id`는 서버가 검증한 사용자 ID로 저장합니다.
- 3단계에서는 소유자 검사를 아직 하지 않으므로 로그인 사용자 B가 A의 메모 ID를 알면 조회·수정·삭제할 수 있는 허점이 남아 있으며 4단계에서 막습니다.

## Supabase Auth 설정

브라우저에는 공개용 Project URL과 publishable key만 사용합니다. 서버는 기존 Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 계속 사용합니다. 서버 전용 키 값은 GitHub·브라우저 코드·응답·로그에 넣지 않습니다.

Supabase Dashboard에서 **Authentication → Providers → Email**이 활성화되어 있어야 합니다. 테스트용 A 계정은 Dashboard의 사용자 관리 화면에서 준비하거나 공식 가입 흐름으로 만든 계정을 사용합니다. 비밀번호나 토큰 값은 제출물에 기록하지 않습니다.

`aleph.config.json`의 로그인 발급자 정보는 다음 공개 메타데이터만 기록합니다.

- issuer: Supabase 프로젝트의 `/auth/v1`
- audience: `authenticated`
- jwksUrl: Supabase Auth의 `/.well-known/jwks.json`

## 3단계 DB 마이그레이션

Supabase **SQL Editor**에서 `docs/STEP3_DB_MIGRATION.sql`을 한 번 실행합니다. 기존 2단계 가상 메모 행은 보존하면서 API 계약에 맞게 `id`를 UUID로 바꾸고 `content`를 `body`로 전환합니다. `owner_id uuid`에는 `auth.users` 외래키를 추가하지 않습니다. `anon`과 `authenticated`에는 직접 테이블 권한을 주지 않고, 서버 함수가 서버 전용 권한으로 CRUD를 수행합니다.

## 자료 API 계약

허용 경로는 `aleph.config.json`의 `allowedRoutes`와 같습니다.

- `GET /api/notes` — 로그인 후 메모 배열 반환
- `POST /api/notes` — `{id?, title, body}`를 받고, `id`가 없으면 서버가 UUID를 만든 뒤 `{id}` 반환
- `GET /api/notes/:id` — `{id,title,body}` 반환
- `PUT /api/notes/:id` — `{title,body}`로 수정
- `DELETE /api/notes/:id` — 삭제 성공 시 `204`, 이후 같은 ID의 GET은 `404`

모든 경로는 `Authorization: Bearer <Supabase access token>`이 필요합니다. 토큰이 없거나 `src/verify-login.mjs` 검증에 실패하면 메모 데이터 없이 `401`로 거부합니다. POST의 `owner_id`는 요청 본문에서 받지 않고 검증된 사용자 ID를 서버가 넣습니다.

## 화면 확인

1. 시크릿 창에서 `/`를 열면 로그인 폼만 보이고 메모가 보이지 않아야 합니다.
2. 로그인하지 않은 상태에서 `/api/notes`를 요청하면 `401`이어야 합니다.
3. 정상 A 계정으로 로그인하면 메모 목록과 추가 화면이 나타나야 합니다.
4. A가 메모를 하나 추가하고 수정한 뒤 삭제합니다. 삭제한 ID를 다시 GET하면 `404`여야 합니다.
5. 로그아웃하면 로그인 폼 상태로 돌아가고 메모 화면이 사라져야 합니다.
6. B의 A 메모 접근 여부는 4단계의 소유자 검사 과제로 남겨 둡니다.

로그인 실패 시 화면의 상태 영역에 Supabase Auth가 돌려준 실패 이유를 표시합니다. 실제 비밀번호·JWT는 콘솔이나 README에 출력하지 않습니다.

## 다시 실행

로컬 정적 화면 빌드:

`npm run build -- --local`

배포에서는 Vercel의 Production 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`가 유지되어야 합니다. GitHub push 후 Vercel Production 배포가 Ready가 된 다음 위 확인 절차를 실제로 수행합니다. 실행하지 않은 확인을 완료했다고 기록하지 않습니다.

## 3단계 저장점 기록

- 단계: 3
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자: Supabase Auth (`aleph.config.json`의 `identityProvider`)
- 허용 경로: `GET/POST /api/notes`, `GET/PUT/DELETE /api/notes/:id`
- 원본 API 주소: 5단계 전이므로 `null`
- 남은 의도된 허점: 로그인 여부만 검사하고 메모 소유자는 아직 검사하지 않음
- 보안 헤더: `X-Content-Type-Options: nosniff` 유지
- 실제 로그인·CRUD·로그아웃 검증: 배포 후 사용자 확인 필요
- `npm run bundle`: 배포 및 실제 확인 후 실행 필요

[AGENTS.md](AGENTS.md)의 공통 규칙은 계속 적용합니다. `src/verify-login.mjs`는 이 단계에서 수정하지 않았습니다.
