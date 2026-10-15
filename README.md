# BYTE BACK 방어전 — 12단계 탈환 작전실을 완성합니다

1~11단계의 로그인·소유자 검사, 서버 함수 경계, 판정·탐지·복구·승인 기기 기능을 유지하면서 12단계에서는 승인된 기기에서 여는 탈환 작전실을 추가합니다. 작전실은 학생 판정 규칙, 운영 탐지 사건 연결 상태, 실제 회수 집행 상태, 복구 기준 버전과 현재 API 실측 기록을 메모 본문 없이 보여 주며, 실행하지 않은 공식 41종 시험을 통과로 계산하지 않습니다.

## 현재 구현

- 로그인과 메모 CRUD는 서버 함수·HttpOnly 세션·DB `owner_id` 재검사를 사용하며 브라우저가 Supabase 원본 REST나 서버 전용 키를 직접 사용하지 않습니다.
- 승인된 기기 기록과 현재 WebAuthn 서명이 확인되기 전에는 메모·복구 등 보호 API와 기존 자료실 화면이 열리지 않습니다.
- 학생 판정기는 `device_registered`, `step_up_required`, `resource_scope` 세 규칙을 유지하고, 탐지기는 운영 회수를 집행하지 않고 의심 기기 회수 제안만 만듭니다.
- 10단계 복구는 검증된 9단계 정책 사본과 소유자·해시를 확인한 단건 메모 사본만 대상으로 하며 실제 복구와 미실행을 구분합니다.
- 12단계 `/ops.html` + `GET/POST /api/ops`는 가린 서버 기록과 1~11단계 정상·금지 요청 표를 보여 주고 공식 41종 미수신 상태는 전부 `not_run`으로 둡니다.

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
- 최종 보완본 `dcb01afa0a87...`으로 8단계 심판 통과를 사용자 확인했습니다.

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


## 9단계 — 도플갱어를 찾고 권한을 거둡니다

`src/detect.mjs`는 가상 사건에서 시각, 가명 사용자, 확인된 가상 기기 ID, 요청 종류, 기존 판정만 새 객체로 옮깁니다. 메모 내용·토큰·실명과 나머지 필드는 저장하거나 출력하지 않습니다. 기존 시작 틀의 3필드 `detect(events)` 사건도 호환성을 유지합니다.

확장 사건에서는 같은 가명 사용자·같은 기기의 GET을 따로 세고, 10분 창에서 120건을 넘는 조회와 `step_up` 판정이 함께 있을 때만 `suspicious / burst_read`로 표시합니다. 우리 7단계에서 `step_up`은 평소와 다른 네트워크를 포함한 복합 이상 판정이므로 지역 하나를 새 근거로 사용하지 않습니다. 다량 조회만 있거나 `step_up`만 있거나, 사용자·기기가 섞이거나, 10분 밖이거나, 쓰기 요청이면 `observe`입니다.

탐지 결과와 별도로 `revocationProposal(events)`는 의심 사건의 확인된 가상 기기 한 개만 `target`에 넣어 `propose_revocation / burst_read` 제안을 만듭니다. 실제 회수 API 호출, 기기 등록 상태 변경, 실제 경과 시간 측정은 구현하지 않았고 심판/운영 엔진 확인 대상으로 남깁니다. 기존 `src/decider.mjs`의 5항목 허용·거부·재확인 응답 형식은 바꾸지 않았습니다.

확인 순서:

1. 저장소 루트에서 `npm run detect:test`를 실행합니다.
2. 기존 3필드 계약의 120건은 `observe`, 121건은 기존 `propose_revocation / burst_read` 형식인지 확인합니다.
3. 확장 사건에서는 정상 조회·다량 조회만·복합 판정만은 `observe`, 같은 기기의 복합 판정+121건 조회만 `suspicious`인지 확인합니다.
4. 정상 사건은 회수 제안이 없고, 의심 사건은 확인된 가상 기기 한 개만 대상으로 `propose_revocation / burst_read`를 내는지 확인합니다.
5. 이 시험은 로컬 가상 사건 연습이며 실제 회수나 심판 통과 증거가 아닙니다.

로컬 확인 결과:
- `npm run detect:test`에서 15개 가상 사건 항목이 모두 통과했습니다.
- 정상 사건, 단순 대량 조회, 단순 복합 판정, 다른 사용자·기기 합산, 10분 밖 조회, 쓰기 요청은 모두 탐지 대상에서 제외됐습니다.
- 복합 판정과 같은 기기의 다량 GET이 함께 있는 사건만 의심으로 표시됐고, 회수 제안 대상은 그 확인된 가상 기기 한 개로 한정됐습니다.
- 운영 반 엔진 사건 전달, 실제 기기 회수, 실제 경과 시간 측정은 실행하지 않았습니다.

## 9단계 저장점 기록

- 단계: 9
- 기존 판정 규칙: `device_registered`, `step_up_required`, `resource_scope` 유지
- 탐지 입력: 가명 사용자·기기·요청 종류·기존 판정·시각만 사용
- 복합 탐지: 같은 사용자·같은 기기·10분 내 GET 121건 이상 + `step_up`
- 정상/단독 신호: `observe`
- 회수 제안: `propose_revocation / burst_read`, 확인된 가상 기기 한 개
- 실제 회수 API·권한 변경: 없음
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자·허용 경로·원본 API 주소: 8단계 설정 그대로 유지



## 10단계 — 백업에서 자료실을 되살립니다

정책 복구 기준은 검증된 9단계 저장점 `afa0c5c674fd1a6eb98239c6deb6397e926dc660`입니다. `policy/verified-policy.json`에는 기준 커밋과 정책 파일의 Git blob 지문을 기록하고, `src/recovery.mjs`는 실행할 때 그 커밋을 다시 읽어 사본 목록과 지문을 검증합니다. 사본이 없거나 기준 커밋·파일 지문이 맞지 않으면 비교와 복원을 중단합니다.

`npm run policy:diff`는 읽기 전용으로 복원 기준 버전과 현재 시험 정책의 변경 범위만 보여 줍니다. Windows 체크아웃의 CRLF/LF 차이는 내용 변경으로 세지 않습니다. `npm run policy:restore`도 먼저 같은 범위와 확인 번호만 보여 주며, 실제 복원은 `--apply --confirm=<확인 번호>`가 정확히 일치할 때만 가능합니다. `aleph.config.json`은 `identityProvider`, `allowedRoutes`, `originalApiUrl`, `restoreRoute`만 정책 범위로 다루고 단계·저장소·배포 주소·`judgeIssuer` 같은 다른 설정은 보존합니다. 복원 감사 기록은 기존 내용을 지우지 않고 `artifacts/policy-restore-audit.jsonl` 끝에 덧붙이며 실제 운영 정책과 DB를 직접 변경하지 않습니다.

비공개 가상 메모 복구 서비스는 기존 `notes` 서비스의 **`POST /api/restore/:id`** 한 경로입니다. `docs/STEP10_NOTE_BACKUP.sql`은 현재 소유자가 있는 가상 메모의 최초 사본을 `public.notes_backup`에 저장하고 기존 사본을 덮어쓰지 않습니다. 복구 API는 요청 본문에서 역할·소유자·메모 내용을 받지 않고, 기존 로그인 검증에서 얻은 사용자 ID와 사본의 `owner_id`가 일치하는 지정 UUID 한 건만 서버 전용 DB 함수로 복구합니다. DB 함수는 사본의 ID·소유자·내용 SHA-256을 복원 전 검증하고 복원 뒤 다시 같은 ID·소유자·해시를 확인한 뒤 성공 감사 한 건만 추가합니다. 다른 메모와 기존 감사 기록은 수정하지 않습니다.

10단계 확인 기록:
- `npm run policy:diff`에서 9단계 기준 커밋과 사본 검증 통과를 확인했습니다. 최종 10단계 설정에서는 의도적으로 추가한 `aleph.config.json`의 `allowedRoutes`, `restoreRoute` 두 정책 키만 변경 범위로 표시됩니다. 처음 Windows 줄바꿈 차이가 변경으로 보였지만 GitHub 대조로 실제 정책 변경이 없음을 확인한 뒤 CRLF/LF를 정규화했습니다.
- `npm run policy:restore` 미리보기에서도 같은 두 정책 키와 확인 번호가 실행 전에 표시됐고, 실제 `--apply` 복원은 실행하지 않았습니다.
- `npm run restore:test`의 단건 ID/해시 반환, 다른 소유자 거부, 잘못된 사본 해시 거부, 복원 후 검증 실패 거부 4개 가상 시험이 모두 통과했습니다. 실제 DB 결과를 뜻하지 않습니다.
- Supabase에서 사본 준비 후 `live_rows=5`, `backup_rows=5`, `bad_hash_rows=0`, 복구 전 `mismatch_rows=0`을 확인했습니다.
- 실제 배포에서 시험 계정 B가 소유한 지정 가상 메모 한 건에 `POST /api/restore/:id`를 실행해 HTTP 200과 `restored: true`를 확인했습니다. UUID·본문·해시 원문은 README에 기록하지 않습니다.
- 복구 뒤 B 로그인으로 A 소유 메모를 직접 `GET /api/notes/:id` 요청했을 때 HTTP 404 `NOTE_NOT_FOUND`로 다시 거부되는 것을 확인했습니다.
- 복구 후 전체 `mismatch_rows`·감사 건수 재조회와 A 자신의 메모 200 정상 조회는 이 대화에서 구체 결과를 받지 못해 **미확인**으로 남깁니다. 다른 메모 전체 불변도 별도 실측으로 꾸미지 않습니다.

### 복구 뒤 1~9단계 재시험 순서

1. **1~2단계 공개 자료 경계:** `/data.json`에 메모 본문이 없고 브라우저가 원본 Supabase REST를 직접 사용하지 않는지 확인합니다.
2. **3단계 인증:** 로그아웃 상태의 `GET /api/notes`와 단건 자료 요청이 401/403 JSON으로 거부되는지 확인합니다.
3. **4단계 소유권:** A 자신의 메모는 정상 조회되고, B가 A 메모 UUID를 직접 요청하면 404 `NOTE_NOT_FOUND`인지 확인합니다.
4. **5단계 서버 경계:** 화면에 publishable key 값이 노출되지 않고 원본 자료 권한 회수와 서버 함수 CRUD가 유지되는지 확인합니다.
5. **6단계 기기 규칙:** `npm run decider:test`에서 등록 기기 정상 허용과 미등록 기기 거부를 확인합니다.
6. **7단계 추가 확인:** `npm run fixture:7`과 `npm run decider:test`에서 정상 허용, 복합 이상 `step_up`, 확인 뒤 허용을 확인합니다.
7. **8단계 자원 구역:** 정확한 메모 단건 구역만 허용되고 전체 목록·알 수 없는 기능 경로·일반 학생 공지 수정은 거부되는지 확인합니다. 실제 타인 메모 404도 다시 확인합니다.
8. **9단계 탐지:** `npm run detect:test`에서 정상/단독 신호는 관찰, 복합 다량 조회만 의심, 대상 가상 기기 한 개만 회수 제안인지 확인합니다.
9. **10단계 복구 확인:** `npm run policy:diff`로 기준 버전과 변경 범위를 보고 `npm run restore:test`를 다시 실행한 뒤, 실제 B 한 건 복구가 필요할 때만 `POST /api/restore/:id`를 사용합니다.

위 재시험 중 실제로 다시 실행하지 않은 항목은 기존 기록을 재사용해 성공으로 꾸미지 않고 미실행으로 남깁니다. 운영 반 엔진의 실제 기기 회수, 실제 강사 공지 수정 성공, 정책 `--apply` 복원은 현재 미실행입니다.

## 10단계 저장점 기록

- 단계: 10
- 정책 복구 기준: 9단계 저장점 `afa0c5c674fd1a6eb98239c6deb6397e926dc660`
- 정책 미리보기: `npm run policy:diff`
- 정책 복원 절차: `npm run policy:restore` → 확인 번호 검토 → 명시적 `--apply --confirm=...`
- 메모 복구 서비스/경로: `notes` · `POST /api/restore/:id`
- 비공개 사본: `public.notes_backup`; 기존 사본 덮어쓰기 없음
- 감사 기록: 성공 복구만 `public.notes_restore_audit`에 추가, 기존 감사 삭제 없음
- 실제 B 한 건 복구: HTTP 200 / `restored: true` 확인
- 복구 후 B→A 요청: HTTP 404 / `NOTE_NOT_FOUND` 확인
- 복구 후 A 자기 메모 200 및 전체 사본/감사 재조회: 미확인
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자·원본 API 주소·기존 1~9단계 규칙: 유지



## 11단계 — 나만의 접속 앱을 완성합니다

기존 자료실 화면에 `public/manifest.webmanifest`, 공개 오프라인 안내 `public/offline.html`, 서비스 워커 `public/sw.js`를 추가했습니다. 서비스 워커는 네트워크 탐색이 실패했을 때 공개 오프라인 안내만 보여 주며 API·로그인·메모 응답은 캐시하지 않습니다. 설치 가능/설치형 실행 표시는 화면 정보일 뿐 기기 승인이나 자료 권한의 근거가 아닙니다.

로그인 뒤에는 `GET /api/device?action=status`로 서버의 기기 등록 상태를 확인합니다. `기기 승인 요청`은 WebAuthn 등록을 거친 뒤 `public.vault_device_credentials`에 `pending` 요청 한 건만 만들며 즉시 자료 권한을 주지 않습니다. 화면에 표시된 12자리 요청 코드를 관리자가 Supabase SQL Editor에서 정확한 한 건만 `approved`로 바꿔야 합니다. 모든 pending 요청을 한꺼번에 승인하는 SQL은 사용하지 않습니다.

승인된 행이 있어도 자료실은 바로 열리지 않습니다. `승인 확인하고 자료실 열기`를 누르면 서버가 새 assertion challenge를 발급하고 WebAuthn 인증기가 다시 서명합니다. 서버가 challenge·HTTPS origin·RP ID·사용자 확인 플래그·등록 공개키 서명·카운터·현재 승인 상태를 확인한 뒤에만 15분짜리 HttpOnly 기기 증명 쿠키를 발급합니다. 이 증명은 현재 로그인 세션의 SHA-256과 묶이며 원문 로그인 토큰이나 기기 개인키를 DB나 브라우저 저장소에 넣지 않습니다.

보호 API인 메모 목록/추가, 메모 단건 조회·수정·삭제, 공지 단건 API, 10단계 단건 복구 API는 기존 로그인 검증 뒤 서버의 승인 기기 증명도 다시 확인합니다. 학생 요청에서 기기 증명이 없거나 pending/revoked/만료 상태면 `403 DEVICE_NOT_VERIFIED`로 닫고, 기존 심판 회귀 주체는 기존 경로를 유지합니다. 기기 게이트를 통과한 뒤에도 메모 `owner_id`, 공지 강사/소유자, 복구 사본 소유자 검사는 그대로 다시 적용됩니다.

### 11단계 실제 확인 기록

- `npm run device:test`의 7개 로컬 가상 점검이 모두 통과했습니다. 이는 실제 기기 승인이나 심판 결과가 아닙니다.
- 같은 시점에 `npm run decider:test` 11개와 `npm run detect:test` 15개 가상 회귀 점검도 모두 통과했습니다.
- Supabase SQL Editor에서 `docs/STEP11_DEVICE_APPROVAL.sql`을 실행했고 처음에는 승인 요청 행이 없음을 확인했습니다.
- Windows PC는 사용 가능한 Windows Hello 플랫폼 인증기가 없어 실제 등록을 완료하지 못했습니다. USB 보안키를 별도로 구입하거나 접속 프로그램을 설치하지 않았습니다.
- 휴대폰의 앱 내장 브라우저에서는 WebAuthn origin이 배포 페이지와 일치하지 않아 서버가 거부했습니다. 휴대폰 Chrome에서 배포 주소를 직접 열어 등록했을 때 화면 잠금 인증 뒤 `pending` 요청이 만들어졌습니다.
- 화면의 요청 코드 한 건만 SQL로 `approved`로 변경했고 `returning` 결과에서 한 행의 approved 상태와 승인 시각을 사용자 확인했습니다.
- 승인 뒤 휴대폰 Chrome에서 `승인 확인하고 자료실 열기`를 눌러 지문 인증을 완료하자 서버 기기 확인을 통과했고 기존 본인 메모 목록이 실제로 표시되는 것을 사용자 확인했습니다.
- 승인 전에는 기존 자료실 영역이 잠긴 상태로 유지됐고, 승인된 기기의 서명 확인이 끝난 뒤에만 메모가 처음 표시됐습니다.
- 8~10단계에서 확인한 타인 메모 404 등 기존 실제 거부 결과를 이번 단계에서 모두 다시 실측했다고 꾸미지 않습니다. 최종 회귀는 아래 명령과 제출 묶음의 실제 요청 결과로 다시 확인합니다.

### 다시 실행

1. `npm run device:test`로 승인 전 차단·pending 비승인·브라우저 저장소 미사용·PWA 캐시 경계를 확인합니다.
2. `npm run decider:test`와 `npm run detect:test`로 기존 6~9단계 판정·탐지 가상 회귀를 확인합니다.
3. `npm run restore:test`와 `npm run policy:diff`로 10단계 복구/정책 사본 경계를 다시 확인합니다.
4. `npm run build -- --local`로 11단계 정적 배포 자료를 생성합니다.
5. 실제 배포에서는 로그인 → 기기 승인 요청 → 관리자의 정확한 pending 한 건 승인 → 상태 새로고침 → 승인된 기기 WebAuthn 서명 → 기존 본인 자료실 개방 순서로 확인합니다.
6. 승인 전 보호 자료는 열리지 않아야 하고, 설치 버튼/설치형 실행 여부만으로 자료가 열리면 실패입니다.

## 11단계 저장점 기록

- 단계: 11
- 설치형 앱: `public/manifest.webmanifest` + `public/sw.js` + `public/offline.html`
- 기기 승인 서비스: `GET/POST /api/device`
- 승인 요청: WebAuthn 등록 후 서버 DB에 `pending`만 생성
- 실제 승인: 관리자가 정확한 요청 코드 한 건만 `approved`
- 자료실 개방: 승인된 기기의 새 WebAuthn 서명 + 서버 검증 후에만 허용
- 브라우저 저장소의 기기 개인키: 사용하지 않음
- 설치 표시를 승인 근거로 사용: 하지 않음
- 별도 접속 프로그램: 없음
- 승인된 실제 휴대폰 Chrome: 지문 확인 뒤 기존 본인 메모 표시 확인
- 기존 판정 규칙: `device_registered`, `step_up_required`, `resource_scope` 유지
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자·원본 API·10단계 복구 경계: 유지



## 12단계 — 탈환 작전실을 완성합니다

### 시작 상태와 검사 기준

12단계 작업 전 원격 `main`의 마지막 커밋은 `ecd80731f526c4a741fd50e6ebdd114426d77e14`이고 메시지는 `11단계 저장점`이었습니다. 당시 README 제목·11단계 저장점 기록과 마지막 커밋 단계가 일치했습니다. 이 커밋을 12단계 설치·실행·중지·복구 안내의 **검사 기준 커밋**으로 기록합니다. 원격에서는 로컬 작업 폴더의 `git status`를 볼 수 없으므로 저장점 직전 로컬 상태는 별도로 확인합니다.

### 작전실 화면과 서버 기록

승인된 기기의 기존 자료실에 `/ops.html` 링크를 추가했습니다. 화면 자체는 공개 정적 파일이지만 `GET /api/ops`와 `POST /api/ops?action=verify`는 기존 로그인 검증과 승인 기기 증명을 모두 다시 확인하므로 인증·기기 확인 전에는 가린 서버 요약과 실측표를 읽거나 실행할 수 없습니다.

`GET /api/ops` 응답은 같은 응답의 `redactedServerRecords`에서 화면 수치를 계산할 수 있게 다음 상태를 구분합니다.

- **판정기 규칙:** 학생 코드 `src/decider.mjs`의 실제 `RULE_IDS` 세 개만 `confirmed_from_code`로 표시합니다.
- **탐지 사건:** 학생 탐지 규칙은 저장소에 있지만 ALEPH SDP 운영 엔진의 사건 전달 연결은 이 저장소에서 확인하지 않았으므로 `not_run`입니다. 사건 수를 임의의 0으로 바꾸지 않습니다.
- **회수 상태:** `src/detect.mjs`는 특정 기기 회수 **제안**만 만들고 실제 운영 회수 API를 호출하지 않으므로 집행 상태는 `not_run`입니다.
- **복구 버전:** `policy/verified-policy.json`과 `src/recovery.mjs`가 가리키는 검증 기준 커밋 `afa0c5c674fd1a6eb98239c6deb6397e926dc660`을 표시합니다.
- **현재 접속:** `/api/ops` 요청 자체에서 로그인과 승인 기기 증명을 확인한 경우에만 `actual_api`로 표시합니다.

화면은 서버가 반환한 `counts`를 그대로 믿지 않고 `redactedServerRecords`를 다시 세어 두 값이 같은지 표시합니다. 기록에는 메모 제목·본문, 이메일, 비밀번호, JWT, 서버 전용 키, 기기 개인키, 실제 사용자·기기 식별자를 넣지 않습니다.

### 1~11단계 정상·금지 요청 실측표

작전실의 「안전한 API 실측 실행」은 **현재 최종 배포에서 자료를 변경하지 않는 요청만** 다시 보냅니다. 표의 모든 행은 `시험/단계 · 정상/금지 · 요청 · 기대 결과 · 실제 API 결과 · 요청 ID · 확인 시각`을 갖습니다. 서버가 각 실측 요청에 새 UUID 요청 ID와 UTC 시각을 붙이며 응답의 메모 본문은 표에 복사하지 않습니다.

절차는 다음과 같습니다.

1. 기존 자료실에서 로그인하고 승인된 기기 서명을 완료해 본인 메모 화면이 열리는지 확인합니다.
2. 「탈환 작전실 열기」 → 「서버 요약 새로 읽기」를 눌러 화면 재계산 수치와 가린 서버 기록 수치가 일치하는지 확인합니다.
3. 「안전한 API 실측 실행」을 누릅니다. 현재 자동 실측은 공개 화면/빈 `data.json`, 비로그인 메모 거부, 현재 로그인 세션, 승인 기기의 본인 메모 목록, 키 없는 원본 API, 복구 경로 GET 405, 승인 기기 상태, 비로그인 기기 상태처럼 **읽기 또는 무변경 요청**만 사용합니다.
4. 타인 메모 UUID가 필요한 소유권 시험, 실제 복구 POST, ALEPH SDP 판정·탐지 가상 입력처럼 별도 시험 자료나 실행 엔진이 필요한 행은 `미실행`으로 남깁니다.
5. 표에서 적어도 하나의 **정상 요청 HTTP 허용**과 하나의 **금지 요청 HTTP 거부**가 실제 결과·요청 ID·확인 시각과 함께 있는지 확인합니다.
6. 필요하면 「표 JSON 저장」으로 현재 브라우저에 표시된 실측 응답을 내려받습니다. 이 JSON은 제출 묶음의 심판 결과가 아니며 메모 본문을 포함하지 않습니다.

이 표는 1~11단계마다 정상·금지 한 행씩 총 22행을 준비합니다. 행을 준비했다는 사실을 실행 결과로 취급하지 않으며, 실행하지 않은 행의 `observed`, `requestId`, `checkedAt`은 비워 둡니다.

### 공식 41종 시험

작전실에는 `ALEPH-ATTACK-01`부터 `ALEPH-ATTACK-41`까지 41개 슬롯을 별도로 둡니다. 현재 저장소에는 공식 41종 개별 결과를 수신하는 계약이나 운영 엔진 연결이 없으므로 최초 상태는 **executed=0, passed=0, notRun=41**입니다. 자체 `npm` 시험, 작전실 안전 API 실측, 과거 심판 기록을 이 41개 슬롯의 통과로 바꾸지 않습니다.

### 학생 구현과 제공 엔진의 출처

- **제공 엔진:** `ALEPH SDP engine`. 운영 측이 판정 요청과 탐지 사건을 전달하는 제공 엔진이며 학생이 설치·구현한 프로그램으로 표기하지 않습니다.
- **학생 판정기:** `src/decider.mjs`. 엔진이 검증한 `docs/DECIDER_REQUEST.md` 계약을 받아 세 `RULE_IDS`로 판정합니다.
- **학생 탐지 규칙:** `src/detect.mjs`. `docs/DETECT_EVENTS.md` 형식의 사건을 로컬/제공 입력으로 분석하지만 운영 사건 전달과 실제 회수 집행을 스스로 연결했다고 주장하지 않습니다.
- **학생 접속 앱:** `public/index.html`, `public/device.mjs`, manifest/service worker. 설치 여부만으로 승인하지 않고 서버 승인 기록 + WebAuthn 서명을 요구합니다.
- **학생 자료실:** `api/notes.js`, `api/notes/[id].js`와 기존 소유자 검사. 브라우저가 원본 DB 권한이나 서버 전용 키를 갖지 않습니다.
- **학생 탈환 작전실:** `public/ops.html`, `public/ops.mjs`, `api/ops.js`, `src/ops-summary.mjs`. 제공 엔진 상태와 학생 코드 상태를 다른 출처로 표시합니다.

### 검사 기준 커밋에서 재현하기

**설치:** Node.js 22 이상에서 검사 기준 커밋 또는 이후 저장점을 받은 뒤 `npm ci`를 실행합니다. 비밀값은 README·명령 인자·Git에 포장하지 않습니다. 배포에 필요한 값은 기존과 같이 Vercel의 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` 비밀 입력란에서만 관리합니다.

**학생 판정기/탐지 실행:** `npm run decider:test`, `npm run detect:test`, `npm run ops:test`를 실행합니다. 모두 로컬 가상/구조 시험이며 ALEPH SDP 엔진의 운영 판정·41종 심판·실제 회수 결과가 아닙니다.

**접속 앱/자료실 실행:** `npm run build -- --local`로 정적 파일을 확인합니다. 운영 배포는 기존 Vercel 연결 저장소에서 이루어지며 별도 접속 프로그램이나 학생용 SDP 엔진을 설치하지 않습니다. 배포가 Ready가 된 뒤 기존 로그인 → 승인 기기 서명 → 자료실 → `/ops.html` 순서로 확인합니다.

**중지:** 위 `npm run ...` 점검은 상주 프로세스가 아니라 실행 후 종료됩니다. 설치형 웹앱도 별도 보안 데몬이 아니며 브라우저/PWA를 닫으면 해당 클라이언트 사용이 끝납니다. ALEPH SDP 제공 엔진의 시작·중지는 학생 저장소 명령으로 조작하지 않습니다.

**복구:** 먼저 `npm run policy:diff`로 9단계 검증 사본과 현재 정책 차이를 확인하고 `npm run policy:restore`로 복구 계획과 확인 번호만 미리 봅니다. 실제 정책 `--apply`는 기존 절차처럼 명시적 확인이 있을 때만 수행합니다. 메모 복구는 `npm run restore:test`로 가상 경계를 확인한 뒤 필요할 때만 검증된 본인 사본 한 건에 `POST /api/restore/:id`를 사용합니다.

### 12단계 확인 기록

- 12단계 작업 시작 기준: `ecd80731f526c4a741fd50e6ebdd114426d77e14 · 11단계 저장점`, README 단계와 일치.
- `npm run ops:test`: **7/7 통과** — 판정 규칙 3개, 화면/서버 기록 집계 일치, 탐지·회수 미실행 구분, 복구 기준, 공식 41종 미실행, 22행 실측표, 민감정보 미포함을 로컬 구조 점검으로 확인했습니다. 실제 심판 결과로 취급하지 않습니다.
- 12단계 변경 후 회귀시험: `device:test` **7/7**, `decider:test` **11/11**, `detect:test` **15/15**, `restore:test` **4/4** 통과. 모두 로컬 가상/구조 시험이며 실제 심판·운영 회수 증거가 아닙니다.
- 배포 작전실 확인: `/ops.html` **HTTP 200**, 비로그인 `GET /api/ops` **HTTP 401 UNAUTHORIZED**, 승인 기기에서 화면 재계산 **5건과 서버 요약 일치**를 실제 배포에서 확인했습니다.
- 12단계 안전 API 실측: **실제 API 12건 · 기대 일치 12건 · 기대 불일치 0건 · 미실행 10건**. 실행된 행은 요청 ID와 확인 시각을 기록하며, 별도 시험 자료나 운영 엔진이 필요한 행은 미실행으로 유지합니다.
- 공식 ALEPH 41종: **executed=0, passed=0, notRun=41** — 자체 로컬 시험과 작전실 API 실측을 공식 41종 통과로 계산하지 않습니다.

### 12단계 저장점 기록

- 단계: 12
- 작전실 화면: `/ops.html`
- 작전실 서버 API: `GET /api/ops`, `POST /api/ops?action=verify`
- 화면/서버 수치 대조: 같은 `redactedServerRecords` 재집계
- 1~11단계 실측표: 정상·금지 22행, 실제 실행 결과와 미실행 분리
- 공식 41종: 별도 41슬롯, 미수신 상태는 `not_run`
- 제공 엔진 출처: ALEPH SDP engine
- 학생 구현: 판정기·탐지 규칙·접속 앱·자료실·작전실
- 검사 기준 커밋: `ecd80731f526c4a741fd50e6ebdd114426d77e14`
- 기존 로그인 발급자·원본 API·`judgeIssuer`·1~11단계 보호 경계: 변경하지 않음
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 저장점 커밋 메시지: `12단계 저장점`


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
