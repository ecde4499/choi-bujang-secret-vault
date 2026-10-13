# BYTE BACK 방어전 — 8단계 자료마다 갈 수 있는 구역을 나눕니다

1~7단계의 로그인·소유자 검사, 서버 함수 경계, 등록 기기와 추가 확인 규칙을 유지하면서 8단계에서는 메모와 강사 공지를 서로 다른 자원 ID로 구분하고 정확한 경로 단위로 접근 구역을 나눕니다. 화면 메뉴와 기존 메모 주소는 바꾸지 않습니다.

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



## 6단계 — 등록한 기기만 허용

`src/decider.mjs`의 규칙 ID는 `device_registered`입니다. 판정 요청의 `deviceRegistered`가 정확히 `true`일 때만 `allow / approved`를 반환하고, `false`이거나 값이 없으면 `deny / device_not_registered`로 거부합니다. 사용자 식별에는 계약의 가명 식별자 `subjectId`가 들어오며, Supabase 사용자 번호나 브라우저가 임의로 보낸 사용자·기기 상태를 판정 근거로 만들지 않습니다.

확인 순서:

1. 저장소 루트에서 `npm run decider:test`를 실행합니다.
2. `통과 · 등록 기기의 정상 요청`이 나오는지 확인합니다.
3. `통과 · 미등록 기기의 가상 요청`이 나오는지 확인합니다.
4. 이 명령은 로컬 가상 요청 연습이며 실제 심판 판정으로 기록하지 않습니다.
5. 미등록 기기 공격 자체는 심판이 별도 가상 요청으로 확인합니다.

로컬에서 `npm run decider:test`를 실행해 `통과 · 등록 기기의 정상 요청`과 `통과 · 미등록 기기의 가상 요청`을 모두 확인했습니다. 이 결과는 로컬 가상 요청 연습이며 심판 판정으로 기록하지 않습니다.

이번 단계에는 별도로 설치할 접속 프로그램이 없으며 설치 명령도 필요하지 않습니다.

## 6단계 저장점 기록

- 단계: 6
- 판정기: `src/decider.mjs`
- 규칙 ID: `device_registered`
- 등록 기기: `allow / approved`
- 미등록 또는 누락: `deny / device_not_registered`
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자·허용 경로·원본 API 주소: 5단계 설정 그대로 유지
- 인증서·CA·서명 키: 새로 생성하지 않음


## 7단계 — 평소와 다른 접속은 다시 확인

판정기는 계약에 있는 `signals`, `recentEvents`, `stepUp`만 사용합니다. 현재 실제 경로의 `signals.source`는 `none`이고 지역·네트워크는 `unknown`이므로 이를 임의의 정상 지역·평소 네트워크·정상 시간으로 바꾸지 않습니다. `judge_fixture`는 심판/로컬 연습용 가상 신호로만 구분하며 실제 위치 증거로 기록하지 않습니다. 브라우저가 임의로 보낸 헤더나 계약에 없는 필드는 판정 근거로 사용하지 않습니다.

기존 `device_registered` 규칙은 그대로 먼저 적용합니다. 등록 기기이면서 가상 연습 신호에서 **평소와 다른 시각 + 처음 보는 네트워크 + 최근 많은 위험 사건**이 함께 나타날 때만 `step_up / step_up_required`를 반환합니다. 지역 하나만으로 차단하거나 추가 확인하지 않습니다.

계약에는 `stepUp = { verified, authAgeSeconds }`가 있어 같은 로그인의 추가 확인 완료 여부와 확인 후 경과 시간을 판정기에 전달할 수 있습니다. 복합 이상 사건에서 아직 확인하지 않았으면 `step_up`, 확인된 새 요청이면 다시 판정해 `allow`할 수 있습니다. 토큰 원문은 판정 요청·로그·README에 기록하지 않습니다.

확인 순서:

1. `npm run fixture:7`을 실행해 정상 가상 사건은 `allow`, 정해진 복합 이상 사건은 `step_up`인지 확인합니다.
2. `npm run decider:test`를 실행해 등록 기기 허용, 미등록 기기 거부, 복합 이상 `step_up`, 추가 확인된 복합 이상 `allow`를 확인합니다.
3. 두 명령은 로컬 가상 요청 연습이며 실제 심판 판정이나 운영 자료 차단 실측으로 기록하지 않습니다.
4. 현재 실제 경로는 신뢰 가능한 지역·네트워크 신호를 제공하지 않으므로 **실제 자료에서 재로그인 전 차단과 새 로그인 후 허용 실측은 미실행**으로 남깁니다.

로컬 가상 요청 확인 결과:
- `npm run fixture:7` → 정상 사건 `allow`, 복합 이상 사건 `step_up`
- `npm run decider:test` → 등록 기기 정상 요청 통과, 미등록 기기 거부 통과, 복합 이상 접속 `step_up` 통과, 다시 확인한 복합 이상 접속 `allow` 통과
- 위 결과는 로컬 가상 요청 연습이며 실제 심판 판정이나 운영 접속 실측이 아닙니다.

## 7단계 저장점 기록

- 단계: 7
- 기존 규칙: `device_registered` 유지
- 추가 규칙: `step_up_required`
- 정상 등록 기기: `allow / approved`
- 미등록 또는 누락 기기: `deny / device_not_registered`
- 가상 복합 이상 사건: `step_up / step_up_required`
- 추가 확인된 같은 가상 사건: `allow / approved`
- 실제 접속 정보 출처: 현재 `none`; 누락·불명확 신호를 임의 정상값으로 보정하지 않음
- 실제 자료 재로그인 전/후 실측: 미실행
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자·허용 경로·원본 API 주소: 기존 설정 유지


## 8단계 — 자료마다 갈 수 있는 구역

서버 응답의 `X-Resource-Id`로 자원 종류와 ID를 구분합니다. 메모 목록은 `notes:own-list`, 메모 한 건은 `notes:<UUID>`, 강사 공지 한 건은 `notices:<UUID>`입니다. 기존 `/api/notes`, `/api/notes/:id` 주소와 화면 메뉴는 유지하고, 공지는 API 전용 `/api/notices/:id`만 추가했습니다.

판정기에는 `resource_scope` 규칙을 추가했습니다. 엔진 계약의 `classId`, `projectId`, `subjectId`, `deviceId`, `service`, `method`, `route`, 정확한 `path`만 비교하며 쿼리로 기능을 고르지 않습니다. `/notes/export`처럼 `:id`와 같은 깊이에 놓인 기능 경로나 알 수 없는 경로는 `deny / resource_not_allowed`입니다. 기존 `device_registered`, `step_up_required` 규칙은 먼저 유지합니다.

현재 판정기 계약에는 Supabase의 저장된 `owner_id`나 강사 역할이 없습니다. 따라서 `decide()`는 소유자를 추정하지 않고 구역만 판정합니다. 정확한 메모 단건 GET/PUT과 공지 단건 GET처럼 허용한 자료 경로만 통과시키고, 메모 전체 목록·기능 경로·알 수 없는 경로·공지 PUT은 거부합니다. 메모가 실제 로그인 사용자의 것인지와 공지 수정 권한이 있는지는 최종 API가 DB의 저장된 `owner_id`와 강사 권한을 다시 확인합니다.

자료 API는 판정기와 별도로 다시 확인합니다.

- 메모 목록과 개별 GET/PUT/DELETE는 검증된 로그인 사용자와 DB의 저장된 `owner_id`를 다시 대조합니다. 다른 소유자의 자료는 `NOTE_NOT_FOUND`로 숨깁니다.
- 메모 수정에서는 소유자를 다시 쓰지 않고 제목과 본문만 바꿉니다.
- 공지 PUT은 검증된 학생 로그인, `public.vault_instructors`에 저장된 강사 권한, `public.vault_notices.owner_id`가 모두 같은 사용자일 때만 허용합니다.
- 화면 메뉴나 요청 본문의 `role`, `owner_id`를 권한 근거로 사용하지 않습니다.

`docs/STEP8_RESOURCE_ZONES.sql`은 기존 `notes`와 기존 사용자를 수정하지 않고 빈 `vault_instructors`, `vault_notices` 테이블만 준비하는 검토용 SQL입니다. PUBLIC·anon·authenticated의 직접 테이블 권한을 회수하고 service_role의 필요한 SELECT/UPDATE만 둡니다. 강사나 공지 데이터는 자동으로 만들지 않습니다.

확인 순서:

1. 저장소 루트에서 `npm run decider:test`를 실행합니다.
2. 등록 정상·미등록 기기·7단계 복합 이상 확인에 더해 정확한 메모 단건 구역과 API 메모 단건 경로는 허용되고, 메모 전체 목록·일반 학생 공지 수정·강사 역할 이름만으로 한 공지 수정·알 수 없는 기능 경로는 거부되는지 확인합니다. 공지 단건 GET 구역은 허용하되 실제 공지 수정 권한은 API가 다시 확인합니다.
3. Supabase SQL Editor에서 `docs/STEP8_RESOURCE_ZONES.sql`을 검토한 뒤 실행할 수 있습니다. 이 SQL은 기존 notes 데이터를 변경하지 않습니다.
4. 실제 A/B 계정으로 API를 확인할 때는 A 메모 UUID를 주소에 넣어 B로 `GET /api/notes/:id`를 직접 열었을 때 404 JSON이어야 합니다. 화면 메뉴를 거치지 않아도 같은 소유자 검사가 적용됩니다.
5. 실제 강사 계정·공지 행을 준비하지 않았다면 공지 수정 성공은 실측했다고 기록하지 않습니다.

실제 확인 결과:
- 8단계 제출을 두 차례 심판에 보냈고 두 번 모두 기록 코드 `S08_OTHER_ZONE_ALLOWED`, 48/100점이었습니다. 피드백은 다른 사용자의 메모 또는 일반 학생의 공지 수정이 허용될 수 있다는 내용이었습니다.
- 첫 보완에서는 가짜 강사 허용표와 공지 GET 예외를 제거했지만 같은 심판 코드가 다시 발생했습니다. 이후 판정기가 연습용 소유자 표를 직접 판단하던 구조를 없애고, 엔진 계약에 맞춰 구역 판정과 최종 API의 실제 소유권 검사를 분리했습니다.
- 두 번째 구조 보완 후 `npm run decider:test`에서 등록 기기, 미등록 기기, 복합 이상, 재확인 복합 이상, 정확한 메모 단건 구역 허용, 메모 전체 목록 거부, 일반 학생 공지 수정 거부, 강사 역할 이름만으로 한 공지 수정 거부, 공지 단건 읽기 구역 허용, 알 수 없는 기능 경로 거부, API 메모 단건 경로 허용까지 11개 항목이 모두 통과했습니다. 이는 로컬 가상 요청 연습이며 심판 판정이 아닙니다.
- `npm run fixture:7`에서 정상 사건 `allow`, 복합 이상 사건 `step_up`을 다시 확인했습니다.
- Supabase 권한 조회에서 `anon`과 `authenticated`는 두 새 테이블의 SELECT/INSERT/UPDATE/DELETE가 모두 false였습니다. `service_role`은 `vault_instructors`의 SELECT만 true, `vault_notices`의 SELECT·UPDATE만 true였습니다.
- 실제 배포에서 다른 계정으로 타인 메모 UUID를 `GET /api/notes/:id`에 직접 넣었을 때 `404 NOTE_NOT_FOUND`로 거부되는 것을 확인했습니다.
- 실제 배포에서 일반 학생 세션으로 `PUT /api/notices/:id`를 직접 호출했을 때 `403 INSTRUCTOR_REQUIRED`로 거부되는 것을 확인했습니다.
- 실제 강사 계정·공지 행을 만들지 않았으므로 강사 공지 수정 성공 실측은 하지 않았습니다.

## 8단계 저장점 기록

- 단계: 8
- 기존 규칙: `device_registered`, `step_up_required`
- 추가 규칙: `resource_scope`
- 메모 자원 ID: `notes:own-list`, `notes:<UUID>`
- 강사 공지 자원 ID: `notices:<UUID>`
- 알 수 없는/기능 경로: `deny / resource_not_allowed`
- 메모 API 권한: 검증된 사용자 + 저장된 `owner_id` 재대조
- 공지 수정 권한: 검증된 사용자 + 저장된 `vault_instructors` 권한 + 저장된 공지 `owner_id`
- 화면 메뉴 변경: 없음
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자·원본 API 주소: 기존 설정 유지

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
