# 네이티브 모델러·BG3D 집중 검증 기록

상태: **current — 범위별 실제 실행 기록**, **migration — 후속 소스 수정·남은 검증**을 구분한다.
기록일: **2026-10-29**. 전체 기능·전체 저장소·브라우저 검증 완료 기록이 아니다.

기존 실행 단락은 각 입력 시점의 역사적 snapshot이다. 현재 통합 상태는 마지막 2026-10-30 갱신을 따른다.

## current — 허용된 집중 검사 1회

- 작업트리: `/Users/hjunkim/.codex/worktrees/blender-native-bg3d-toon/toonstudio`
- 부모 HEAD: `3a17b2c1ded27a55336e60de81fe5b6e9073df08`. 실제 입력은 미커밋 변경을 포함한다.
- 실행 명령: `node /tmp/toonstudio-bg3d-focused-check.mjs`
- 내부 실행: 로컬 `node_modules/vitest/vitest.mjs run`에 선택된 62개 파일과
  `--maxWorkers=1 --no-cache`를 전달했다. Vitest 출력 버전은 `4.1.12`다.
- 상한: 270초, 독립 owned process group. 실제 실행은 **45.577초, exit 1, signal null**로 종료됐다.
- 입력: 변경 파일 **121개**의 SHA-256을 실행 전·후 고정했다.
  `modifiedDuring: []`, `pathSetChanged: false`다. 이 HEAD만의 결과로 인용하지 않는다.
- 결과: **62개 suite 중 58개 통과·4개 실패**, **730개 test 중 709개 통과·21개 실패**.
- receipt: `/tmp/toonstudio-bg3d-focused-Ic5Evw/receipt.json`
- 원본 log: `/tmp/toonstudio-bg3d-focused-Ic5Evw/focused.log`

원본 log·receipt는 보존하고 후속 실행으로 덮어쓰지 않는다. runner는 매 실행마다 별도 artifact 폴더를 만든다.
unified session `91342`는 실제 exit 1로 끝났으며, 종료 뒤 `pgrep -g 48178`은 exit 1·출력 없음으로
해당 owned group의 잔류 프로세스 0을 확인했다. 다른 세션의 프로세스를 중단하거나 재시작하지 않았다.
이번 단일 실행 창은 실패 보고와 함께 반환했고 자동 재실행하지 않았다.

## current — 실패 원인

| 실패 범위 | 실제 관측 | 원인과 후속 경계 |
| --- | --- | --- |
| `StudioHybridDccComponentTransformTools.test.tsx` 9개 | `ReferenceError: sculptBrushKind is not defined` | Panel의 tool catalog context가 새 Sculpt hook 대신 삭제한 이전 변수 이름을 참조 |
| `materials/StudioHybridDccPanel.toon-handoff.test.tsx` 9개 | 같은 Panel ReferenceError | 같은 렌더 진입 실패가 전달/lease 사례를 모두 막음 |
| `studio-hybrid-dcc-viewport-resource-ownership.test.ts` 1개 | 추출한 surface 검사 함수 문자열을 기존 source 집합에서 찾지 못함 | 실제 snapshot 모듈을 검사 source에 포함하고 Core 호출 연결도 검사해야 함 |
| `studio-bg3d-model-thumbnail-integration-boundary.test.ts` 2개 | 이전 session-only guard와 thumbnail 조건 문자열 불일치 | 실제 강화된 import owner/session/backend guard를 동등 이상으로 검사해야 함 |

통과한 709개는 이 실행의 input hash에 한정된다. 실패한 Panel 경로의 UI 동작을 통과로 합산하지 않는다.
특히 여기서 성공한 CPU·DOM·SDK fixture를 실제 브라우저 픽셀·물리 GPU·성능 증거로 사용하지 않는다.

## migration — 후속 수정과 남은 검사

Panel의 catalog context를 `sculpt.kind`·`sculpt.carve`에 연결했다.
viewport resource 계약은 추출된 실제 snapshot source와 Core 호출을 함께 확인하도록 보정했다.
thumbnail source 계약도 실제 import guard와 commit→썸네일 순서를 유지하는 범위에서 보정했다.
assertion 삭제·skip·허용오차 상향으로 실패를 통과시키지 않는다.

이 후속 소스는 최초 실행 이후의 변경이며, 뒤의 5파일 재검증에 포함했다.
추가 검사는 별도 실행 허용 이후 동결 입력을 다시 고정해 수행한다.
새 failure·timeout은 원본 evidence와 소유 자원 정리 결과를 남기고 분석한 뒤 진행한다.

### migration — 공용 Sculpt 포인터의 종료 중 재진입 보강

추가 source-only 대조에서 공용 pointer adapter의 재진입 공백을 확인했다.
기존 terminal은 active를 비운 뒤 controller callback·capture 해제·종료 통지를 순서대로 실행했다.
그 callback에서 같은 adapter의 새 begin을 호출하면 이전 finally가 새 capture나 dragging 상태를 정리할 수 있었다.
현재 Panel/controller에서 이 동기 재진입이 발생하는 경로는 확인하지 못했으므로 실제 UI 재현으로 기록하지 않는다.

`studio-hybrid-dcc-sculpt-pointer.ts`에 전체 terminal 정리 동안 새 begin을 거절하는 flag를 추가했다.
outer finally는 callback·release·notification 실패에도 flag를 해제하며 기존 오류 전파와 소유 capture 정리를 유지한다.
기존 `studio-hybrid-dcc-sculpt-pointer.test.ts`에 정상 종료/취소 각각의 세 지점 재진입 거절 2개와
각 정리 단계의 예외 이후 다음 gesture 시작 3개를 추가했다. **이 5개 사례는 뒤의 5파일 재검증에서 통과했다.**
독립 source 검토에서 발견한 fixture의 0인수 mock 추론은 실제 `StudioSculptPointerCapture` 함수 타입으로 맞췄다.
이 소스 보정 역시 TSC 통과 결과가 아니다.
이 변경도 위 receipt의 input hash 이후이므로 기존 709개 통과 결과로 검증됐다고 인용하지 않는다.

## current — 후속 5파일 재검증 1회

- 실행 명령: 같은 작업트리에서 `node /tmp/toonstudio-bg3d-five-recheck.mjs`.
- 범위: 최초 실패 4개 파일과 `studio-hybrid-dcc-sculpt-pointer.test.ts` 1개만 실행했다.
  `--maxWorkers=1 --no-cache`, 상한 90초, 독립 process group을 사용했다.
- 입력: 부모 HEAD는 동일한 `3a17b2c1ded27a55336e60de81fe5b6e9073df08`, 변경 파일 124개의 SHA-256 고정.
  `modifiedDuring: []`, `pathSetChanged: false`, 종료 HEAD 동일.
- 실제 결과: **5개 suite 중 4개 통과·1개 실패**, **45개 test 중 44개 통과·1개 실패**.
  runner 11.329초, exit 1, signal null, timeout false.
- unified session `39208`도 exit 1로 종료했다. owned group `95110` 잔류 0, cleanup 오류 없음.
- receipt: `/tmp/toonstudio-bg3d-five-recheck-IqnpBi/receipt.json`
- 원본 log: `/tmp/toonstudio-bg3d-five-recheck-IqnpBi/focused.log`

Panel의 삭제 변수 ReferenceError는 재발하지 않았다. MToon handoff·viewport 자원 source 계약·thumbnail
source 계약·포인터 suite가 통과했다. 컴포넌트 변형 suite는 9개 중 8개 통과했으며 아래 1개가 남았다.
최초 62파일 실행과 이 재검증의 통과 수를 합산해 전체 변경 통과로 표시하지 않는다.
허용된 단일 실행 창을 반환하고 신규 계산 0으로 복귀했다. 자동 재실행은 하지 않았다.

### migration — 남은 미리보기 검사 입력 보정

남은 실패는 `StudioHybridDccComponentTransformTools.test.tsx`의 표시 불가 오류 기대값이다.
첫 정점을 `(0.75, 0.75, 0)`만큼 이동하면 면 0은 자기 교차하지 않는 오목한 사각형이다.
현재 공통 surface가 이를 삼각화할 수 있어 alert가 없는 실제 결과와 일치한다. 소스상의 좌표·정책 대조다.

오류·적용 비활성·원본/hash/저널 보존 assertion은 유지하고, 입력을 기존 커널 회귀와 같은
`(1.25, 0.5, 0)`으로 바꿨다. 이때 면 0의 비인접 경계는 XY `(0.5, 0.1)`에서 실제 교차한다.
기존 `(0.75, 0.75, 0)` 입력도 정상 미리보기·한 번 적용·정확한 결과 좌표를 검사하는 별도 사례로 추가했다.
**이 fixture 보정과 새 정상 사례는 5파일 실행 이후의 변경이며 아직 재검증하지 않았다.**

전체 TSC·`pnpm harness:verify`·아키텍처·lint/Secretlint·프로덕션 build·실제 Chrome/STP UI·GPU/tile
검사는 이번 허용 창에 포함되지 않아 실행하지 않았다. 커밋·PR·병합·운영 배포도 수행하지 않았다.
기존 CPU 453개와 MToon GPU 캡처 14개의 별도 증거는 이 후속 source의 전체 통과로 합산하지 않는다.

## current — 입력 보정 뒤 5파일 최종 재검증

같은 feature 작업트리에서 `node /tmp/toonstudio-bg3d-five-recheck.mjs`를 새 실행 창에 정확히 한 번 실행했다.
부모·종료 HEAD는 `3a17b2c1ded27a55336e60de81fe5b6e9073df08`이고, 미커밋 입력 125개를 고정했다.
선택 범위는 앞의 5파일과 같으며 `--maxWorkers=1 --no-cache`, 90초 상한을 유지했다.

- 결과: **5개 suite·46개 test 모두 통과**. 앞서 보정한 자기 교차 오류 입력과 정상 오목 면 입력을 포함한다.
- runner 11.465초, exit 0, signal null, timeout false, process error null.
- `modifiedDuring: []`, `pathSetChanged: false`. 입력 125개의 실행 전·후 SHA-256과 HEAD가 같았다.
- unified session `84478`은 실제 exit 0으로 끝났다. owned group `42256`의 잔류 PID 0, cleanup 오류 없음.
- receipt: `/tmp/toonstudio-bg3d-five-recheck-8wwMqX/receipt.json`
- 원본 log: `/tmp/toonstudio-bg3d-five-recheck-8wwMqX/focused.log`

이 결과로 앞서 실패했던 Panel·미리보기·자원/썸네일 source 경계와 pointer 사례를 재확인했다.
이전 62파일 실행의 709개 통과나 독립 Boolean의 19개와 합산해 전체 미커밋 구현 통과로 표시하지 않는다.
실행 창은 결과·소유 자원 정리 근거와 함께 반환했다. 새로운 검사는 별도 실행 순서로 진행한다.

## current — 독립 Boolean 수정의 main 병합

원래 feature의 125파일과 구분해 역변환 수정 두 파일만 최신 main 기반 후보에서 검증·병합했다.
[PR #2545](https://github.com/blue45f/toonstudio/pull/2545)의 검증 head는
`3879e34d80708955daa427535c700e3ca1a85584`, 병합 커밋은
`440ecf0ba7215b4b9e2907cf60659c195b0242bb`다.

관련 3개 suite·19개 test, 정상 commit hook, `pnpm harness:verify`의 Web/API 타입을 포함한 필수 검사,
정상 push hook이 통과했다. canonical harness base는 `8acfb59e63dc87dfb4f7955e11ef295d72fb022a`다.
해당 실행의 receipt는
`/Users/hjunkim/WebstormProjects/toonstudio/.qa/main-integration-20261029/boolean-inverse/pipeline-title-correction-receipt.json`이다.
병합된 두 blob은 검증한 `ce149a6523552865b25eca5aa670310624f3eae4`와
`35067e73f74eaa8727770ff001ed518a049e06f2`에 정확히 일치했다.

원격 core/verify는 계정 한도로 job 시작 전에 차단됐다. 이를 테스트 실행 실패나 CI 녹색으로 보고하지 않는다.
보호 설정 변경·admin 우회·운영 배포는 하지 않았다. 이 독립 후보의 전체 타입 검사를 원래 미커밋 구현 전체의
타입 통과로 대신하지 않는다. 원래 feature의 커밋된 기반에 있는 Array/Solidify 차이도 두 파일 통합과 구분해 보존한다.

## migration — 썸네일 저장 소유권을 게시 직전까지 전달

5파일 검사 종료·창 반환 뒤 별도 source checkpoint에서 생산 3파일과 테스트 2파일을 추가 수정했다.
적용 직전 원래 125개 입력의 bytes가 직전 receipt와 일치함을 확인했고, 코드 patch 적용 직후에도
그 125개 bytes는 그대로였다. 새 dirty 5경로가 생겨 130파일이 됐으며 HEAD와 staged 0을 유지했다.
근거는 `/tmp/toonstudio-thumbnail-source-checkpoint-g4worz01/before.json`·`after.json`이다.

controller는 persist에 job signal과 전체 소유권을 검사하는 동기 callback을 전달한다.
V12 thumbnail 옵션만 이를 받아 기존 authority signal 인자에 연결한다. 공유 authority는 operation 이후와
owner refs 보호 이후의 기존 rollback 경계에서 소유권을 다시 검사한다. `bg3d-model-library.ts`는 2,374줄로
순증하지 않았고 legacy 저장 옵션은 바꾸지 않았다.

최종 검사는 `kvSet` API 요청 인계 직전이다. Worker 내부의 실제 전송 직전까지 검사한다고 주장하지 않는다.
요청 인계 후의 취소·commit-before-throw는 기존 durable candidate 재확인과 참조 정리 계약을 유지하며,
새 작업을 지울 수 있는 저장 후 삭제 보상을 추가하지 않았다.

controller 4개와 실제 메모리 SQLite/OPFS 통합 8개 회귀를 추가했다. 같은 모델의 세대 교체, queue·blob·owner refs
대기 중 만료, 정상/older-revision 저장과 요청 인계 후 durable 결과를 구분한다. 실패 시에도 소유 Promise를
회수한 뒤 DB를 닫는다. 이 적용 checkpoint 시점에는 새 회귀가 미실행이었으며 아래의 별도 실행으로 확인했다.
앞의 46개 통과를 새 저장 guard의 근거로 대신하지 않는다.

## current — 썸네일 저장 guard의 별도 4파일 검증

source와 문서 보정을 마친 130개 변경, 설정·의존 manifest를 포함한 172개 입력을 동결해
`node /tmp/toonstudio-thumbnail-publication-check.mjs --execute`를 정확히 한 번 실행했다.
HEAD는 `3a17b2c1ded27a55336e60de81fe5b6e9073df08`이며 source 입력 집합 SHA-256은
`97be7a69aed09d4dacf14ad1b36296976faa18e19b8da2c577740327888d303c`다.
single worker·no-cache, 자식 heap 상한 8,192 MiB, 전체 작업 상한 180초를 사용했다.

| 단계 | 실제 범위와 결과 | exit | owned PG |
| --- | --- | --- | --- |
| `pnpm run test:root` | controller·신규 저장 회귀·공유 library·session-host의 4개 suite, **50개 test 통과**. workspace 19개 package의 29개 링크 검증 포함 | 0 | 81362 |
| `pnpm harness:check` | 에이전트 하네스 구조 무결성 | 0 | 81560 |
| ESLint | 새 생산 3파일과 테스트 2파일, `--max-warnings=0` | 0 | 81999 |
| canonical Secretlint | 위 TS 5파일과 문서 3파일 | 0 | 82514 |

신규 controller 4개·저장 8개 사례는 위 50개에 포함된다. 다른 실행의 통과 수와 합산하지 않는다.
unified session `80207`은 실제 exit 0, 총 10.234초의 벽시계 시간으로 종료했다.
모든 phase의 exit 0·signal null·timeout false, 각 owned group 잔류 0, 예상하지 않은 종료 후 잔류 없음이다.
실행 전·각 단계·종료 checkpoint의 HEAD/branch/staged 0/dirty 130/입력 172개가 모두 일치했다.
원본 receipt는 `/tmp/toonstudio-thumbnail-check-aXtwdS/receipt.json`, 단계별 log는 같은 디렉터리다.
전담 조정자도 네 group의 부재와 결과를 독립 확인한 뒤 실행 창을 회수했다.

시험 경계는 실제 sqlite-wasm 엔진의 **메모리 VFS**, **Map 기반 OPFS 메모리 대역**, 주입한 직렬 queue다.
실제 브라우저 OPFS·Web Locks·디스크 내구성 검증으로 표현하지 않는다. 이 후보의 전체 `harness:verify`·TSC·build,
실제 Chrome/STP 조작·GPU·4K 출력·REA는 이 실행에 포함되지 않았다. Git commit/push·PR·배포도 하지 않았다.
현재 단락은 실행 창 회수와 source 동결 해제 뒤 추가했으므로, 위 Secretlint 통과는 단락 추가 전의 문서 입력에 한정된다.
최종 문서 검증은 후속 통합 후보의 정상 검사에서 수행한다.

## migration — 미병합 기반 8개 commit을 포함하는 main 통합

`git cherry 440ecf0ba7215b4b9e2907cf60659c195b0242bb HEAD`에서 기반 8개 commit이 모두 `+`임을 확인했다.
공통 조상은 `7177969d4497237c8daee031b49da3148b0f409a`다. 파일 가져오기·편집 메시·corner UV/pack·재질 문서·
작업파일·공통 표면·workspace lease 기반은 main에 추가 변경 130개만 옮기는 것으로 채워지지 않는다.

기반 순서는 `06ed3b412`, `9903b0094`, `2deb1e28a`, `476af3325`, `7ccb26843`, `8e445a4b6`,
`527f64f1b`, `3a17b2c1d`다. 순서 보존 patch와 개별 SHA-256 manifest는
`/tmp/toonstudio-native-foundation-integration-eojec_1j`에 source 자료로 준비했다. 자료 작성 시점에는 새 main 후보에
적용·검증하지 않았으며, 이후의 source 병합은 아래에 별도 기록한다.

최신 main의 다른 변경을 보존하면서 누적 기반을 통합 후보에 포함하고, 그 위에 MToon/BG3D·Sculpt·저장 guard를 연결한다.
main↔HEAD 전체 tree를 교체해 다른 작업을 삭제하지 않는다. Boolean 회귀는 main과 같은 blob이지만 modifier 전체는
Array relative/constant·Solidify offset 기반 때문에 다르므로, 이미 반영한 역변환 hunk를 파일 단위 덮어쓰기로 정합화하지 않는다.
각 후보의 실제 타입·관련 테스트·정상 hook·PR/main 상태를 새로 확인하며 운영 배포는 하지 않는다.

## current — 기반과 WIP를 보존한 source 통합 후보

사용자 승인 범위의 main 통합 준비를 부모 조정자가 source-only 단계로 위임했다.
격리 작업트리는 `/Users/hjunkim/.codex/worktrees/native-bg3d-main-integration/toonstudio`, branch는
`codex/native-bg3d-main-integration-20261029`다. HEAD를 정확한 main
`440ecf0ba7215b4b9e2907cf60659c195b0242bb`에 둔 채 정상 `merge --no-commit --no-ff`로
`3a17b2c1ded27a55336e60de81fe5b6e9073df08`을 병합했다. merge process는 session `97725`의 실제 exit 0으로 종료했고,
자동으로 겹친 modifier workspace·문서 인덱스 두 경로도 충돌 없이 처리됐다. 아직 merge commit을 만들지 않았다.

modifier 결과는 main의 공용 역변환과 기반의 Array relative/constant·Solidify offset을 함께 가진다.
문서 인덱스는 기존 main의 내용을 유지하면서 native 문서 링크 5개와 빈 줄만 추가했다.
두 경로는 독립 source 검토에서도 main/기반 유실을 찾지 못했으나, 이것은 실행 검증이 아니다.

원본 130개 WIP는 original `3a17` 기준 tracked binary patch 68개와 untracked 62개로 분리해
`/tmp/toonstudio-feature-wip-export-rklyu3nn`에 보존했다. modifier는 이미 원본 working과 bytes가 같아 중복 적용하지 않았다.
나머지 tracked 67개는 `apply --3way --index`로 깨끗하게 적용했고, untracked 61개는 대상에 없는 새 경로에만 만들었다.
main에 이미 있는 Boolean 회귀 한 개는 bytes 일치를 확인해 중복만 제외했다. 기존 파일의 raw copy 덮어쓰기는 하지 않았다.

기록 단락을 추가하기 전의 130개 WIP 경로는 후보와 원본이 모두 bytes까지 일치했다.
기반을 포함한 owned 309개 경로의 차이는 main의 내용을 함께 보존한 `docs/README.md`뿐이었다.
현재 단락은 후보에만 추가했으므로 이 검증 기록 문서도 의도적으로 원본과 달라졌다. 원본 feature의 source·HEAD·staged 0과
기존 실행/동결 packet은 보존했다. 후보의 package·lock·CI는 main을 유지하며 다른 세션의 Spatial 미검증 소스는 가져오지 않았다.

source 병합 단계의 근거는 `/tmp/toonstudio-native-source-integration-71janqcw`에 남겼다.
새 후보에는 의존성을 설치하지 않았고 commit·hook·테스트·TSC·build·push·PR·main 병합·운영 쓰기를 실행하지 않았다.
앞의 46개·50개 및 독립 Boolean 결과를 이 새 후보의 통과로 대신하지 않는다. 정상 의존성 준비와 hook,
전체 하네스·관련 회귀·브라우저/GPU/출력 검증은 후속 실행에서 확인한다.

## current — 2026-10-30 통합 소스와 검증 경계

Native·Bundle·Shaper를 포함한 통합 소스는
`4ef92d7c0ce54e8f7eb8cfd479e106d4b9057fae`까지 정상 커밋된 상태다.
이 문서 앞부분의 `3a17`·미커밋·실행 전·source 병합 단계 설명은 각각 명시한 입력과 실행 당시의 역사적 snapshot이다.
이를 현재 통합 소스의 미커밋 상태나 현재 실행 대기 항목으로 해석하지 않는다.

이 SHA의 실제 하드웨어 GPU 실행은 입력 불변·소유 프로세스 잔여 0을 기록했다.
재질·기하 의미 제어군 **10개가 모두 통과**했고, WebGL·WebGPU의 256px masked 제어군은
RGBA·depth·normal 및 실제 Worker PNG 3종 비교 차이가 모두 0이다.
그러나 4K 색상 전체 비교는 WebGL **5픽셀**, WebGPU **2픽셀**, 최대 채널 차이 **246**으로
**실패**했다. 타일 경계 차이 0과 전체 픽셀 일치 실패를 구분하며 허용오차를 상향하지 않는다.
독립 Basic body 제어군도 WebGL 4픽셀·WebGPU 1픽셀 차이가 있어 MToon·외곽선만의 문제로 단정하지 않는다.
정확한 GPU 원인과 이전 main 대비 회귀 여부는 아직 입증되지 않았다.

원본 GPU 결과는 `/tmp/toonstudio-union-mtoon-tile-receipt-MjpDFs/result.json`, SHA-256은
`e741953ec41772f80d5d3f5080985c4bfa9ba106d0adeb40a00d4f9c807894b2`다.
작은 correctness 제어군은 실제 편집 동선·장기 성능·STP·모든 GPU의 통과 근거가 아니다.

기존 실제 Native UI 실행은 `7f92d704ba405628d19d6548555ca90393e1d79d`에서
프로젝트 메뉴 진입 대기 시간 초과로 종료했고 완료 check는 0개였다.
모델 가져오기·툰 적용·UV pack·Sculpt·작업파일 저장/재열기 통과를 주장하지 않는다.
새 통합 HEAD와 새 빌드가 일치하는 실제 제품 UI 검증은 남아 있다.
GLB 가져오기·요소 변형 preview·BG3D 전달·PNG ZIP·실제 4K 치수는 별도 미검증 범위다.

현재 정상 커밋과 최신 main 통합·새 build 검증·push·PR·main 병합은 각각 다른 단계다.
후속 실행과 원격 상태가 확인되기 전에는 완료로 합산하지 않는다. 이번 범위에서 운영 배포는 하지 않는다.
