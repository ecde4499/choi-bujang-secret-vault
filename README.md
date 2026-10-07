# BYTE BACK 방어전 — 4단계 로그인해도 내 자료만 보이게 합니다

3단계의 같은 자료실에 메모 소유자 검사를 추가한 저장점입니다. 로그인 토큰은 기존 `src/verify-login.mjs`로 검증하고, API는 검증된 사용자 ID와 DB의 `owner_id`가 일치하는 메모만 읽기·수정·삭제합니다. URL이나 요청 본문의 `owner_id`·`userId`·`role`은 신뢰하지 않습니다.

## 현재 구현

- 비로그인 메모 요청은 메모 데이터 없이 `401 UNAUTHORIZED` JSON으로 거부합니다.
- 로그인 목록 조회는 `owner_id = 검증된 userId`인 메모만 반환합니다.
- 새 메모는 서버가 검증한 userId를 `owner_id`로 저장하고, 요청 본문의 소유자 값은 허용하지 않습니다.
- 한 건 GET·PUT·DELETE는 ID와 `owner_id`가 모두 현재 사용자와 일치해야 하며, 상대 소유 메모는 `404`로 처리합니다.
- 수정 본문은 계속 `{title,body}`, 한 건 응답은 `{id,title,body}`를 유지합니다.

## A/B 학습 데이터 SQL

`docs/STEP4_OWNER_SEED.sql`은 실제 이메일을 Git에 넣지 않도록 `A_EMAIL_HERE`, `B_EMAIL_HERE` 자리표시자를 사용합니다. Supabase SQL Editor에서 실행하기 직전에 두 테스트 계정 이메일로만 교체합니다.

SQL은 `auth.users`에서 이메일로 UUID를 찾고 기존 미소유 가상 메모를 다음처럼 처리합니다.

- 미소유 메모가 3건이면: 세 건을 A에 연결하고 B 시험 메모 한 건을 새로 만듭니다.
- 미소유 메모가 4건이면: 기존 자료를 버리지 않고 세 건은 A, 한 건은 B에 연결합니다.
- 3건 또는 4건이 아니면 예상하지 않은 DB 상태로 보고 중단합니다.

적용 뒤 결과 조회에서 A/B 소유 건수를 확인하고 Table Editor에서도 각 행의 `owner_id`가 올바른 Auth 사용자 UUID인지 대조합니다.

## 자료 API 계약

`aleph.config.json`의 실제 허용 경로는 다음과 같습니다.

- `GET /api/notes`
- `POST /api/notes`
- `GET /api/notes/:id`
- `PUT /api/notes/:id`
- `DELETE /api/notes/:id`

POST는 `{id?,title,body}`만 허용하며 `id`가 없으면 서버가 UUID를 만들어 `{id}`로 반환합니다. PUT은 `{title,body}`만 허용합니다. `owner_id` 같은 추가 필드로 소유자를 바꾸려는 요청은 입력 형식 오류로 거부합니다.

## RLS와 최소 권한 SQL

`docs/STEP4_RLS.sql`은 **notes 테이블 하나만** 대상으로 합니다. 실행 전후에 `information_schema.role_table_grants`와 `has_table_privilege` 결과를 모두 보여 주도록 작성했습니다.

적용 순서는 다음과 같습니다.

1. 기존 `PUBLIC`, `anon`, `authenticated` 테이블 권한을 `REVOKE ALL`로 회수합니다.
2. `authenticated`에만 `SELECT, INSERT, UPDATE, DELETE`를 다시 부여합니다.
3. RLS를 활성화합니다.
4. SELECT·DELETE는 `USING (auth.uid() = owner_id)`를 사용합니다.
5. INSERT는 `WITH CHECK (auth.uid() = owner_id)`를 사용합니다.
6. UPDATE는 기존 행 `USING`과 새 행 `WITH CHECK`를 모두 사용합니다.

정상 적용 후 `anon`은 notes 테이블 권한이 없어야 하고, `authenticated`에는 SELECT·INSERT·UPDATE·DELETE만 남아야 합니다. TRUNCATE·REFERENCES·TRIGGER 권한은 없어야 합니다.

## A/B 확인 절차

1. A 로그인에서 A 소유 메모만 목록에 보이는지 확인합니다.
2. A가 자기 메모를 조회·추가·수정·삭제할 수 있는지 확인합니다.
3. B 로그인에서도 B 자기 메모 CRUD가 유지되는지 확인합니다.
4. A 토큰으로 B 메모 ID, B 토큰으로 A 메모 ID를 GET·PUT·DELETE하면 거부되어야 합니다.
5. PUT 본문에 `owner_id`를 추가해 소유자를 바꾸려 하면 거부되어야 합니다.
6. 로그아웃 후 `GET /api/notes`는 `401` 또는 `403`과 JSON `error` 문구를 반환해야 합니다.

상대 메모의 존재 여부를 노출하지 않기 위해 소유자가 아닌 한 건 접근은 `404 NOTE_NOT_FOUND`로 처리합니다.

## 배포 안전 확인

- `vercel.json`의 `X-Content-Type-Options: nosniff` 설정을 유지합니다.
- 배포 빌드에서는 `scripts/build-public.mjs`가 `public/aleph.json`을 계속 생성합니다.
- 배포 뒤 `/aleph.json`을 직접 열어 4단계 배포 정보가 JSON으로 보이는지 확인합니다.
- `/data.json`은 계속 빈 `notes` 배열만 가지며 메모 본문을 정적으로 공개하지 않습니다.

`src/attack-check.mjs`의 4단계 자기 점검은 실제 배포에 비로그인 요청을 보내 JSON 거부, `/aleph.json`, `nosniff` 헤더, 빈 정적 자료 상태를 확인합니다. 이 결과는 학생 자기 점검이며 운영 심판 판정이 아닙니다. A/B 로그인 토큰은 코드나 제출 묶음에 넣지 않으므로 교차 소유자 시험은 사용자가 직접 확인합니다.

## 다시 실행

로컬 정적 빌드:

`npm run build -- --local`

DB 적용 순서:

1. `docs/STEP4_OWNER_SEED.sql`을 검토하고 이메일 자리표시자만 로컬에서 교체해 실행합니다.
2. A/B 데이터 소유자를 확인합니다.
3. `docs/STEP4_RLS.sql`의 BEFORE 결과를 확인한 뒤 전체 SQL을 실행합니다.
4. AFTER 결과에서 anon 권한 없음, authenticated CRUD 네 권한만 남았는지 확인합니다.
5. Production 배포가 최신 4단계 커밋인지 확인한 뒤 A/B 교차 소유자 시험을 수행합니다.

## 4단계 저장점 기록

- 단계: 4
- GitHub 저장소: `https://github.com/ecde4499/choi-bujang-secret-vault`
- 배포 주소: `https://choi-bujang-secret-vault-ashy.vercel.app`
- 로그인 발급자: Supabase Auth (`aleph.config.json`의 `identityProvider`)
- 허용 경로: `GET/POST /api/notes`, `GET/PUT/DELETE /api/notes/:id`
- 원본 API 주소: 5단계 전이므로 `null`
- 소유자 경계: API에서 검증된 사용자 ID와 `owner_id` 비교
- DB 방어: `docs/STEP4_RLS.sql`을 사용자가 검토 후 적용
- 보안 헤더: `X-Content-Type-Options: nosniff` 유지
- 배포 식별 파일: 빌드 시 `/aleph.json` 생성 유지

[AGENTS.md](AGENTS.md)의 공통 규칙은 계속 적용합니다. 비밀번호·JWT·서버 전용 키·실제 이메일 값은 GitHub나 제출 묶음에 넣지 않습니다.
