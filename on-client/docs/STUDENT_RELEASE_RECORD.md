# 벌레먹은딸기 22단계 최종 커밋 새 환경 재현·릴리스 기록

이 문서는 22단계 「최종 커밋의 새 환경 재현과 릴리스 기록」을 위한 학생 재현 기록입니다. 서버가 이 환경을 실행해 검증했다는 뜻이 아니며, 아래의 직접 확인은 학생이 별도 폴더에서 직접 실행하고 화면에서 관찰한 결과입니다. 원문 확인, demo, 실제 외부 시스템 연결 성공을 서로 구분합니다.

## 1. 범위와 버전

- 보안 Agent 이름: 벌레먹은딸기
- 단계: 22
- 상태: 검증 중
- `on-client/package.json` 앱 버전: `0.2.11`
- `on-client/package.json` Node.js 수업 기준: `24.19.0`
- 22단계 재현 PC Node.js 실제 관찰: `v24.21.0`
- 진단 응답에서 관찰한 서버/컴포넌트 메타데이터 버전: `0.1.0`
- 앱 버전 `0.2.11`과 진단 메타데이터 `0.1.0`은 서로 다른 버전 범위이며 같은 값으로 취급하지 않습니다.
- 22단계 통과는 원문 검토 기준의 수료이며 실제 운영 인증이나 v1.0 자동 인증을 뜻하지 않습니다.

현재 미확인 범위는 실제 AI 계정 연결·AI 사건 설명 성공, 19단계 실제 보안 조치 집행과 효과 관측, 실제 설치 패키지의 complete/partial OSV 조회입니다.

## 2. 저장소와 재현 기준

원래 작업 폴더를 보존한 상태에서 별도 폴더로 재현했습니다.

- 저장소 URL: `https://github.com/ecde4499/choi-bujang-secret-vault.git`
- 원래 작업 브랜치: `main`
- 22단계 redo 작업 브랜치: `stage22-redo`
- 22단계 재현을 시작한 21단계 기준 커밋: `8462d776e59f04a83db46ac61163129aa3adcf86`
- 별도 재현 폴더: `choi-bujang-secret-vault-stage22-redo`
- 원래 작업 폴더는 삭제·reset·덮어쓰기하지 않았고, 재현 시작 시 `main`이 위 40자리 커밋에서 clean 상태임을 확인했습니다.
- redo 폴더도 같은 40자리 커밋에서 `git status --short`가 빈 출력인 clean 상태로 시작했습니다.

22단계 문서 변경을 커밋한 뒤에는 그 마지막 커밋 자체를 최종 제출 후보로 사용합니다. 제출 직전 별도 redo 폴더를 그 40자리 SHA로 checkout하여 21단계 실행 절차를 다시 확인하고, 그 뒤에는 새 커밋을 만들지 않습니다. 과제 화면의 40자리 SHA와 비공개 원문 JSON의 `commit` 값도 동일한 SHA를 사용합니다.

## 3. 새 환경에서 수행한 절차

재현 세션 기준 확인 시각: **2026-10-26 15:23:53 +09:00 이후 동일 세션**

1. 원래 폴더와 redo 폴더가 모두 존재하고 clean 상태인지 확인했습니다.
2. redo 폴더에서 `node --version` → `v24.21.0`을 확인했습니다.
3. 저장소 루트에서 `npm.cmd ci`를 실행해 **10 packages 설치, 11 packages audit, 0 vulnerabilities**를 확인했습니다.
4. `on-client`에서 `npm.cmd run check`를 실행해 `node --check student/extension.mjs`가 오류 없이 끝나는 것을 확인했습니다.
5. `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1`로 기본 서버를 실행했습니다.
6. 브라우저 `http://127.0.0.1:5189/`에서 화면 표시와 **연결 없음** 상태를 직접 확인했습니다.
7. `Ctrl+C`로 종료한 뒤 같은 명령으로 재실행되는 것을 직접 확인했습니다.
8. 기본 서버를 종료한 뒤 `npm.cmd run demo`를 실행하고 브라우저에서 **예제 자료(demo)** 상태를 확인했습니다.
9. 기존 폴더의 인증·설정 파일을 redo 폴더에 복사하지 않았습니다.

루트 `npm.cmd ci`는 저장소 전체 의존성 설치 확인이고, `PROJECT_NOT_CONFIGURED`는 20단계 OSV 조회 대상 프로젝트 설정 상태입니다. 두 상태를 같은 것으로 해석하지 않습니다.

## 4. 13~21단계 재현 기록

| 단계 | 기능 | 이번 22단계 재현 결과 | 확인 시각 | 근거 | 미확인 또는 제한 |
|---|---|---|---|---|---|
| 13 | `renderIdentity` 로그인·기기·세션 표시 | demo에서 `연습 사용자`, `연습 PC · 확인 불가(unknown)`, `practice-session · 활성(active)` 표시 확인 | 2026-10-26 15:23:53 +09:00 이후 | 브라우저 학생 구현 표시 | 운영 SDP의 실제 사용자·기기·세션 연결은 미확인 |
| 14 | `renderDecision` 업무 앱 판정 | demo에서 `library=allow`, `repository=deny`, `approval=challenge`를 각각 확인 | 2026-10-26T06:26:44.966Z ~ 06:26:57.987Z | 브라우저 판정 카드와 이유·시각 | 실제 운영 SDP 정책 판정 및 업무 앱 접속 성공은 미확인 |
| 15 | `renderEvents` 보안 기록 | demo `event-01`, repository, `e-01`, `rule-01`, denied/active/unknown 상세 확인 | 2026-10-26 15:23:53 +09:00 이후 | 브라우저 `event-01` 상세 | 운영 사건 전달과 실제 사건 목록은 미확인 |
| 16 | `renderStatus` 진단 정보 | requestId/component/version/checkedAt/engine.mode/engine.code 6개 필드를 확인. mode=`demo`, code=`DEMO_ONLY` | 2026-10-26T06:27:54.057Z | 브라우저 도움정보 | 실제 외부 엔진 연결 진단은 미확인 |
| 17 | `renderAiConnection` AI 연결 상태 | `NATIVE_HOST_DISABLED`, 계정 연결 결과 확인 불가 상태를 직접 확인 | 2026-10-26 15:23:53 +09:00 이후 | 브라우저 AI 연결 상태와 진단 | 실제 AI 계정 연결, verified/model 응답은 미확인 |
| 18 | `renderExplanation` 사건 AI 설명 | `AI 설명 실패: 학생 앱 이용 권한의 발급·연결을 준비 중입니다. 담당자에게 확인하세요.` 표시 확인 | 2026-10-26 15:23:53 +09:00 이후 | 브라우저 AI 설명 영역 | 실제 AI 사건 설명 성공은 미확인 |
| 19 | `renderAction` 보안 조치 상태 | `아직 미실행(idle)` 및 지원 조치가 없으면 준비 버튼이 없는 상태를 확인 | 2026-10-26 15:23:53 +09:00 이후 | 브라우저 학생 조치 상태 표시 | prepared→executing→pending→succeeded, 실제 `effectApplied: true`는 미확인 |
| 20 | `renderVulnerabilities` 패키지 조회 | `PROJECT_NOT_CONFIGURED`, `조회 준비 미완료(not_configured)`, 결과 없음과 안전 보장 아님 문구 확인 | 2026-10-26T06:29:08.466Z | 서버 상태 카드와 학생 패키지 조회 표시 | 실제 complete/partial OSV 패키지 결과는 미확인 |
| 21 | 실행 설명서·시스템 구성도 | Node 확인 → 루트 설치 → 문법 검사 → 공식 기본 실행 → 브라우저 연결 없음 → 종료 → 재실행 순서 재현 성공 | 2026-10-26 15:23:53 +09:00 이후 | PowerShell 출력과 브라우저 직접 확인 | 포트 변경 경로, 운영 SDP/AI 설정을 넣은 실행은 이번 세션 미확인 |

표의 demo 성공은 화면 표시 기능의 재현 근거이며 실제 SDP·AI·운영 조치·OSV 연결 성공으로 계산하지 않습니다.

## 5. demo·학생 진술·원문 확인·실제 연결의 구분

- **학생 직접 확인:** 이 문서 3~4절에 적은 PowerShell 출력과 브라우저 화면은 학생이 이번 별도 폴더에서 직접 확인한 진술입니다.
- **demo:** `npm.cmd run demo`에서 나온 로그인·판정·기록·진단 값은 예제 자료입니다. 실제 회사 시스템 연결이나 보안 성취가 아닙니다.
- **원문 확인:** `student/extension.mjs`, README, 실행 설명서의 함수·버전·절차는 제출 커밋 원문과 대조할 수 있습니다. AI가 원문을 읽는 행위는 학생 코드를 실행한 증명이 아닙니다.
- **실제 외부 연결:** 이번 재현에서는 기본 상태가 `연결 없음`, AI가 `NATIVE_HOST_DISABLED`, 패키지 조회가 `PROJECT_NOT_CONFIGURED`였습니다. 따라서 실제 외부 연결 성공을 주장하지 않습니다.
- **19단계 실집행:** 보안 조치를 실제로 처리하는 연결은 아직 준비되지 않았으므로 idle 화면 확인만 기록합니다.

## 6. 이동 가능한 구성과 설치 경계

다른 PC나 다른 폴더에서는 특정 로컬 절대경로를 전제로 하지 않고 다음 순서로 재현합니다.

```powershell
git clone https://github.com/ecde4499/choi-bujang-secret-vault.git
cd choi-bujang-secret-vault
git checkout <제출할-40자리-커밋-SHA>
npm.cmd ci
cd on-client
node --version
npm.cmd run check
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1
```

필요한 공개 구성은 Git 커밋에 포함된 파일과 잠금 파일을 사용합니다. `.env`, 인증서, 토큰, 비밀번호, API 키와 담당자가 별도로 제공하는 개인 설정은 저장소에 넣지 않고 저장소 밖에서 관리합니다. 새 환경 재현을 위해 기존 폴더의 비밀 설정을 무작정 복사하지 않습니다.

## 7. 데이터 보존·백업·복원 계획

### 7.1 소스와 학생 문서

소스·학생 문서·설정 예시는 Git 커밋과 원격 저장소로 보존합니다. 백업 기준은 제출한 40자리 커밋이며, 복원은 새 폴더에서 `git clone` 후 해당 SHA를 `git checkout`하여 수행합니다. 미커밋 작업은 비공개 원문 도구에도 포함되지 않으므로 제출 근거로 사용하지 않습니다.

### 7.2 기존 자료실 메모와 정책 복구

이 저장소에는 앞 단계에서 만든 기존 복구 절차가 있습니다.

- 메모 사본은 `docs/STEP10_NOTE_BACKUP.sql` 절차로 `public.notes_backup`에 최초 사본을 보존하며 기존 사본을 덮어쓰지 않습니다.
- 지정 메모 복구 경로는 `POST /api/restore/:id`이며 현재 로그인 사용자와 사본의 `owner_id`가 일치하는 한 건만 대상으로 합니다.
- 성공한 복구 감사는 기존 감사를 지우지 않고 추가합니다.
- 정책은 검증 사본을 `npm run policy:diff`로 먼저 비교하고 `npm run policy:restore`에서 계획·확인 번호를 본 뒤, 명시적인 `--apply --confirm=...` 없이는 적용하지 않습니다.

이 22단계 별도 폴더 재현에서는 DB 복구나 정책 apply를 다시 실행하지 않았습니다. 앞 단계 기록을 이번 재현의 새 실행 결과로 바꾸지 않습니다.

### 7.3 on-client와 외부 시스템 데이터

`on-client` 학생 표시 코드 자체에는 별도의 영구 학생 데이터 저장소가 없습니다. demo 값은 예제 자료이며 백업 대상 운영 데이터가 아닙니다. SDP/AI/OSV의 외부 운영 데이터·제공자 로그·운영 계정 상태는 이 Git 저장소가 백업하거나 복원할 수 있는 범위가 아닙니다. 비밀 설정도 Git에 저장하지 않으므로 담당자가 제공한 별도 안전한 위치와 절차가 필요합니다.

따라서 Git clone만으로 외부 운영 상태까지 복원된다고 주장하지 않습니다.

## 8. 최종 제출 커밋 확인 절차

22단계 문서를 포함한 마지막 커밋을 만든 뒤 그 커밋을 제출 후보로 고정합니다.

```powershell
git rev-parse HEAD
git status --short
```

여기서 얻은 실제 40자리 SHA를 기록하고, 별도 redo 폴더에서 정확히 그 SHA를 checkout합니다.

```powershell
git fetch origin
git checkout --detach <과제 화면에 입력할 실제 40자리 SHA>
git rev-parse HEAD
git status --short
```

그 커밋에서 3절의 런타임 확인·설치·문법 검사·공식 실행·브라우저 확인·종료·재실행을 다시 확인합니다. 문제가 생겨 파일을 수정하면 새 커밋을 만들고 이전 커밋의 성공 결과를 새 최종 버전의 성공으로 합치지 않습니다.

최종 재현이 끝난 뒤에는 새 커밋을 만들지 않고, 같은 40자리 SHA를 과제 화면과 비공개 원문 도구의 `--commit`에 사용합니다. 원문 JSON은 프로젝트 밖에 저장하며 원문 전달 성공과 AI 검토 통과를 별도 상태로 확인합니다.

## 9. 현재 결론

- 13~16단계의 demo 표시와 17~20단계의 현재 제한 상태가 학생 화면에서 재현되었습니다.
- 21단계 실행 절차가 별도 폴더에서 재현되었습니다.
- 실제 AI 연결·AI 사건 설명 성공·실제 보안 조치 집행·실제 OSV complete/partial 조회는 미확인입니다.
- 현재 버전은 **검증 중**이며 운영 인증 또는 v1.0으로 표시하지 않습니다.
