# 9단계 탐지 연습 사건 계약

기존 시작 틀의 `detect(events)` 3필드 가상 사건 계약은 유지합니다.

```js
{ at: '2026-10-01T00:00:00.000Z', method: 'GET', identity: { sub: 'learner_fixture' } }
```

같은 `identity.sub`의 GET이 어느 10분 구간에서든 120건을 넘으면 기존 형식인
`{ action: 'propose_revocation', reasonCode: 'burst_read', subject }`를 반환합니다.
정확히 120건, 다른 사용자 합산, 10분 밖 사건은 `{ action: 'observe' }`입니다.

이번 9단계의 복합 탐지 연습에서는 같은 사건에 엔진이 확인한 가상 기기와 기존 판정만 추가합니다.

```js
{
  at: '2026-10-01T00:00:00.000Z',
  method: 'GET',
  identity: { sub: 'learner_fixture' },
  deviceId: 'aaaaaaaaaaaaaaaa',
  decision: 'allow'
}
```

`readDetectionEvents(events)`는 시각, 가명 사용자, 확인된 16자리 가상 기기 ID, 요청 종류,
기존 판정(`allow`, `deny`, `step_up`)만 새 객체로 옮깁니다. 메모 내용, 토큰, 실명과
그 밖의 필드는 복사하거나 출력하지 않습니다. 기기와 판정 중 하나만 있거나 형식이 틀린
사건은 임의로 고치지 않고 제외합니다.

확장 사건에서는 같은 가명 사용자·같은 기기의 GET을 따로 세며, 10분 창에서 120건을
넘는 조회와 `step_up` 판정이 함께 있을 때만 `detect(events)`가
`{ action: 'suspicious', reasonCode: 'burst_read', subject, deviceId }`를 반환합니다.
우리 7단계의 `step_up`은 평소와 다른 네트워크를 포함한 복합 이상 판정이므로 지역 하나를
새 탐지 근거로 사용하지 않습니다. 다량 조회만 있거나 `step_up`만 있거나, 사용자·기기가
섞이거나, 10분 밖으로 흩어지거나, 쓰기 요청이면 `observe`입니다.

`revocationProposal(events)`는 이 확장 의심 사건에 대해서만 별도 결과
`{ action: 'propose_revocation', reasonCode: 'burst_read', target: { subject, deviceId } }`를
만듭니다. 대상은 확인된 가상 기기 한 개로 한정합니다. 회수 API를 호출하거나 기기 권한을
변경하지 않으며 기존 `src/decider.mjs`의 허용/거부/재확인 응답 형식도 바꾸지 않습니다.

이 시험은 로컬 가상 사건 연습입니다. 운영 반 엔진의 사건 전달, 실제 기기 회수, 경과 시간
측정이 연결됐다고 주장하지 않으며 `npm run detect:test` 통과를 심판 판정으로 기록하지 않습니다.
