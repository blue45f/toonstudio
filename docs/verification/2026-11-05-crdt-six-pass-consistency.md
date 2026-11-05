# 6패스 CRDT 비동기 협업 일관성 검증

- 상태: **current — PR #2718 main 병합, PR #2717 분리 구조 통합 검증 중·운영 미배포**
- 검증 날짜: 2026-11-05 KST
- 기준 main SHA: `8d315c85d6fde4a3a30255612c756d3e299a95b0`
- 1차 main 통합 기준: `2c626df4000fcfc32318faa793a61bea3ef0901b` (PR #2716 병합)
- CRDT 수정 브랜치: `codex/crdt-six-pass-consistency-20261105`
- 후속 충돌 해결 기준: main `994e5ba34df98b6bcf1cb46c567456924a89dd68`와 PR #2717 head `1391d200a1f3015d2cdc0cefe4d090f2ad2b8935`
- 대상: [PR #2710 미해결 리뷰](https://github.com/blue45f/toonstudio/pull/2710)
- 제외: [PR #2711](https://github.com/blue45f/toonstudio/pull/2711)의 ZIP 저장·자동 저장 복구·DB 통합 검증 반복

## 판정과 검증 경계

네 지적 모두 기준 main의 실제 구현을 실행하는 로컬 회귀 테스트에서 재현했다. 자동 리뷰 문구나
`hydrationGeneration`의 존재만으로 결함을 확정하지 않았다. 운영 원고·운영 DB·사용자 저장 파일은
읽거나 변경하지 않았으므로, 운영 사용자 데이터에 이미 손상이 발생했는지는 판정하지 않는다.

| 지적 | 수정 전 재현 | 이번 수정 |
| --- | --- | --- |
| P1 생략된 frontier 변경 ID | 화면은 최신이지만 과거 history에 이전 text와 삭제 요소가 남는다. undo의 scene diff를 재전송하면 양쪽 CRDT에서 이전 text 및 삭제 요소가 복원된다. | 마지막 적용 이후 미반영된 stroke·scene element·page·layer group ID를 합쳐 최신 frontier와 적용한다. 최초 전체 복원의 `null` 의미와 offline projection 요청을 보존한다. |
| P2 원격 입장 검증 경합 | 두 원격 update가 같은 state vector에서 hydration을 시작하고, 첫 적용 뒤 두 번째가 거절돼 두 번째 획이 수신 문서에 없다. | 수신 realtime update의 입장 검증·순번 판정·적용을 도착 순서대로 처리한다. |
| P2 필터 초기화 누락 | Yjs 수신 props에는 `blurFx`·`blur`·`grayscale`이 없지만 투영 결과에는 기존 효과가 남는다. | 6패스 source URI 보존과 편집 속성 부재 반영을 분리한다. |
| P2 Magic Layer 마스크 거절 | 등록된 유효 mask surface를 연결하는 Yjs update도 6패스 root 검증에서 거절된다. | 기존 mask 편집 키와 계약 검증을 재사용한다. 기존 surface 등록·raw candidate·봉인·권한 검사는 유지한다. |

## P1 재현 절차와 수정 범위

`studio-crdt-frontier-async-history.test.ts`는 기존 합성 여섯 PNG·장면 JSON·manifest fixture를
실제 scene publisher로 두 `StudioCrdtDocument`에 등록한다. hydration 전체를 fixture
frontier/source를 반환하는 deferred Promise로 대체하고, 문서 구독·변경 ID·history reconciliation·scene diff 발행·Yjs 재전송은 실제
구현을 실행한다. PNG/CAS 복원 자체와 브라우저 undo 버튼은 이 테스트의 검증 대상이 아니다.

1. 수신 클라이언트에 로컬 undo·redo snapshot을 만든다.
2. 송신 클라이언트가 요소 A의 text 수정, 요소 삭제, 다른 요소 B의 text 수정을 별개 update로 보낸다.
3. 각 update의 hydration이 겹치게 한 뒤 오래된 순서 또는 최신 순서로 완료한다.
4. 수신 history의 현재·과거·redo snapshot을 검사한다.
5. history index를 이동하며 실제 scene diff를 발행하고 상대 문서에 재전송한다.
6. 양쪽 문서에서 A/B text와 삭제 tombstone이 유지되고, 로컬 요소만 undo·redo되는지 검사한다.

복원 대기 중 수신자의 로컬 요소 추가를 끼워 넣는 조건도 포함해 총 네 조합을 검증한다.
추가 binding 회귀 테스트는 최초 `null` 복원 추월, hydration 실패 뒤 누적 ID 보존,
네 종류의 ID 합산, 적용 뒤 ID 초기화, 번들이 없는 frontier의 추월을 검증한다.

수정은 binding 내부의 메모리 상태만 추가한다. 기존 generation 검사와 최신 frontier 표시를
유지하고, 생략된 frontier의 변경 범위만 함께 전달한다. 매번 전체 history를 덮어 로컬 undo 의미를
잃게 하는 방식은 사용하지 않는다.

## P2 독립 검증

- 원격 경합: 기존 합성 6패스 fixture, 실제 publisher·reader fence·Yjs를 사용한다. 서버와 방은
  테스트 대역이며 hydration 모듈도 fixture frontier를 반환하는 지연 테스트 대역이다. 별도 주기 sync 없이 두 update가 적용되는지,
  거절된 본문 뒤 정상 update가 진행되는지, 원고를 닫은 뒤 지연 결과가 적용되지 않는지 검사한다.
- 필터 초기화: 두 실제 CRDT 문서에서 unset update를 교환한다. `main-line`의 `studio-opfs-cas:`와
  `tone`의 `bg3d-lt-artifact:`를 각각 검사하고, 재발행 시 제거한 효과를 다시 포함하지 않는지 확인한다.
- Magic Layer: 두 Yjs 문서의 mask 연결 delta에 API root 검증과 봉인 admission 함수를 적용한다.
  `enabled=true/false/생략`을 허용하고, enabled 단독·잘못된 ID·문자열 enabled·미등록 surface를
  거부한다. repository는 mock이며 실제 업로드 ACK·HTTP·운영 DB 검증은 아니다.

## 전체 동기화·로컬 재편집 중첩 검증

후속 검증에서 이전 수신 큐만으로 해결되지 않는 경합을 추가로 재현했다.

| 중첩 조건 | 수정 전 실제 결과 | 보강 |
| --- | --- | --- |
| 전체 동기화 hydration 중 원격 update | 정상 원격 변경 누락 | 검증 뒤 실제 적용까지 같은 동기 실행 구간으로 묶고, 도중 문서가 바뀌면 최신 shadow를 다시 검증한다. |
| 원격 update 또는 전체 동기화 hydration 중 로컬 편집 | update 누락 또는 state-vector 오류 | 로컬 편집을 차단하지 않고 최신 shadow의 봉인·본문 검증을 반복한다. state vector가 그대로인 Yjs 삭제도 update 세대로 감지한다. |
| 이전 전체 동기화 응답보다 최신 원격 변경이 먼저 적용됨 | 최신 원격 변경을 로컬 누락분으로 오인해 publication 1개 발생 | 서버 순번을 단조 증가시키고, 최신 서버 frontier를 재확인하기 전에는 이전 응답 기준 aggregate diff를 발행하지 않는다. |
| 최초 sync 응답보다 원격 seq1이 먼저 도착 | 아직 추적 중인 서버 순번이 없어서 이전 응답 기준으로 원격 변경을 한 번 재발행함 | 미추적 authoritative update도 최신 서버 frontier 재확인을 요청하고, ACK fence가 최신 순번에 도달하는지 검사한다. |
| 마지막 원격 frontier 뒤 동일 요소의 같은 속성/다른 속성 로컬 재편집 | 오래된 값으로 현재 화면 또는 undo/redo 의미가 훼손됨 | 안정된 요소의 실제 원격 속성 delta만 기존 history에 즉시 반영하고, 이후 로컬 속성 이력을 보존한다. 최종 현재 snapshot은 최신 문서로 복원한다. |

같은 속성·다른 속성에 대해 복원 중 undo와 복원 후 undo/redo를 실제 scene diff 및 상대 문서
재전송까지 검사했다. 추가로 callback 안의 로컬 재진입과 원격 생성→편집이 겹치는 경우를
재현해 막았다. 생성·삭제·이동·본문 참조 전이는 속성 patch로 추정하지 않고 전체 frontier
경로를 유지하며, 해당 pending ID가 뒤의 속성 이벤트 때문에 history 적용에서 빠지지 않게 한다.
visibility receipt가 소유하는 `hidden`은 기존 Stage overlay 계약으로 유지하고, 해제된 snapshot에는
사용자의 원격 visibility를 그대로 반영한다.

최신 shadow의 본문 검증 실패, 봉인 revision 교체, 구 reader, 잘못된 권위 범위는 계속 거절한다.
close·연결 교체 후 지연 결과도 적용하지 않는다.

## 검증 한계

- hydration 모듈은 합성 fixture frontier/source를 반환하는 테스트 대역이다. 실제 PNG/CAS 복원,
  브라우저 버튼·포인터 입력, 네트워크 지연·탭 종료까지 포함한 종단 간 검증은 아니다.
- 운영 원고에서 이미 손상이 발생했는지 확인하지 않았으며, 과거에 잘못 재전파·저장된 데이터를
  복구하는 migration이나 도구를 제공하는 변경은 아니다.
- 연속 편집 중에는 최신 문서의 본문 검증을 다시 수행할 수 있다. 편집을 차단하거나 검증을
  생략하지 않으며, 한 번 검증된 오래된 shadow를 새 문서에 무조건 적용하지 않는다.

## 재실행과 결과

실행 위치는 저장소 루트이며 Node 24·pnpm 11 및 기존 workspace 의존성이 필요하다.
아래 명령은 로컬 테스트와 정적 검사만 수행하며 배포나 DB migration을 실행하지 않는다.

```sh
pnpm exec vitest run --maxWorkers=2 \
  apps/web/src/domains/creator/live/studio-crdt-frontier-async-history.test.ts \
  apps/web/src/domains/creator/live/studio-crdt-frontier-reconciliation-binding.test.ts \
  apps/web/src/domains/creator/live/studio-crdt-history.test.ts \
  apps/web/src/domains/creator/live/studio-crdt-pending-frontier-history.test.ts \
  apps/web/src/domains/creator/live/studio-crdt-room-binding.remote-admission.test.ts \
  apps/web/src/domains/creator/live/studio-crdt-room-binding.test.ts \
  apps/web/src/domains/creator/live/studio-crdt-authoring-projection.test.ts \
  apps/api/src/modules/creator/studio-crdt-bg3d-bundle.test.ts
pnpm harness:verify
```

- 1차 통합 실행: **7파일 117개 통과**. 강화한 P1 네 조합은 수정 전 main 구현에서 4개 모두
  실패하고 수정 후 4개 모두 통과했다. stale 완료 음성 검증을 강화한 뒤 P1 관련 2파일 11개도 통과했다.
- `pnpm harness:doctor`, `pnpm harness:verify`, `pnpm harness:check`: 통과. 하네스에는 변경 파일
  lint·Secretlint·architecture·source-size·Studio eager graph·전체 Web/API typecheck가 포함됐다.
- 1차 변경 코드 10파일 lint, 문서 포함 11파일 Secretlint 및 `git diff --check`: 통과.
- 별도 관련 검사: projection·page bridge·group key 51개 통과,
  room admission·offline-persistence·immutable-outbox 11개 통과, contracts typecheck 통과.
- 최종 `pnpm harness:verify`: 전체 Web/API 타입 검사와 범위 게이트를 포함해 종료 코드 **0**.
- 후속 통합 회귀: **12파일 216개 통과**. 같은 속성·다른 속성 재편집과 복원 중 undo,
  전체 동기화 중첩, 원격 echo, 구조 전이 및 Stage visibility overlay 보존을 포함한다.
- 최신 main 통합 후 관련 회귀 **12파일 216개**, CI manifest·경로 정책 **61개** 재검증 통과.
- 신규 frontier·pending history·remote admission 테스트를 필수 core와 기존 협업 CI 목록에
  등록했다. CI manifest·경로 정책 테스트 **60개 통과**, workflow fanout 정책 통과.
- 수정 전/후 원시 로그는 로컬 `/tmp/crdt-*`에 있으며 Git 추적 대상이 아니다.

## 데이터·호환성·승인 영향

프로젝트 v5 ZIP, manifest, 장면 JSON, CRDT wire/root의 구조·버전, DB schema, 기존 사용자 데이터 및
권한 정책은 변경하지 않는다. 기존 유효 마스크 계약을 6패스에서도 적용하며 malformed·미등록
surface는 계속 거절한다. 일회성 이력 교정·migration·데이터 삭제는 없다.

2026-11-05 후속 요청은 검증된 변경의 커밋·push·PR 생성·CI 확인을 승인했다. 병합·리뷰 스레드
resolve·운영 배포는 이 요청 범위에 포함하지 않는다. 운영 배포 또는 저장 형식 변경을 추가하려면
구체적인 변경 범위·영향을 제시하고 별도 사용자 승인을 받아야 한다.

## PR #2717 충돌 해결 — 2026-11-05

PR #2718은 사용자에 의해 main `994e5ba34df98b6bcf1cb46c567456924a89dd68`로 병합됐다.
이후 PR #2717의 API 순수 검사 추출과 충돌해 기존 facade·root schema의 shape 직접 import를
유지하고, 이미 main에 들어간 mask 허용을 `studio-crdt-bg3d-shape.ts`로 보존 이식했다.

동결 fixture 및 SHA-256은 변경하지 않았다. 다른 함수 본문·상수·예산·malformed 입력 검사는
유지하고, 해당 validator의 의도한 유효 mask 확장만 별도 동작 비교로 구분했다.
유효 mask 세 경우는 이전 함수가 거절하고 새 shape·facade가 허용하며, 잘못된 mask와 이미지
계약 여덟 경우는 계속 거절한다. shape·bundle·root schema boundary·reader gate 4파일 59개가 통과했다.

바이트 대조에서 main의 live 파일 493개와 contracts 투영 파일은 모두 그대로이며, facade의
transaction·admission·REST 본문과 root schema는 PR #2717 원본과 같다. 필수 CI 선택자는
기존 876개와 main 859개의 정확한 합집합인 880개이며, 협업 workflow의 신규 회귀 네 경로도 유지했다.
이 변경은 conflict 해결과 검증·normal fast-forward push 범위이며 ready·main 병합·운영 배포는 실행하지 않는다.
