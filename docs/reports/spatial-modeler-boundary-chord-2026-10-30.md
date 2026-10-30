# 공간 모델러 경계선 면 나누기 연결 구현

- 최초 작성: 2026-10-30. 아래 집중 검사 기록: 2026-10-31.
- 상태: `migration` — 제품 소스에 연결했다. 단위 결과 JSON은 32파일·400사례 통과지만 외부 guard는 실패했으며, 정상 프로세스 종료와 실제 브라우저 검증 완료를 뜻하지 않는다.
- 집중 검사 입력: 브랜치 `codex/spatial-boundary-chord-20261030`, 기준 커밋 `5cce6b15cc417033900e38992498d6a778dee4b4`와 B184 미커밋 변경.
- 전체 요구: [SK01–SK33 원장](../features/sketchup-feature-coverage.md)을 유지한다. 이 증분은 SK01·SK02·SK03·SK09·SK32의 연결 일부이며 어느 행도 전체 완료로 바꾸지 않는다.
- 이 문서의 검증 절은 B184 집중 검사 시점의 기록이다. 이후 정상 커밋·push·PR·병합 상태와 후크 결과는 해당 PR의 정확한 SHA로 별도 기록한다. 이 작업에서 운영 배포는 수행하지 않았다.

## 실제 소스 연결

기존 `StudioLeftToolRail`과 `StudioCuttoonEditorDialogs`의 지연 로딩 진입점에서
`StudioHybridDccDialog` → `StudioHybridDccPanel` → `StudioHybridDccViewport`를 사용한다.
새 경계선 도구는 이 뷰포트에 연결했으며 별도 제품 URL이나 예제 장면을 만들지 않았다.
실제 화면에서 이 진입점을 실행한 브라우저 증거는 아직 없다.

| 경계 | 현재 구현 소스와 동작 |
| --- | --- |
| 사용자 입력 | `StudioHybridDccBoundaryChordTools`와 뷰포트 wrapper의 모서리·꼭짓점 선택 모드. 현재 오브젝트의 한 면을 유지한다. |
| 실제 hit | `studio-hybrid-dcc-viewport-mesh-click`이 기존 선택 허용 검사 뒤 실제 `faceIndex`·camera·world matrix·CSS viewport를 전달한다. 다른 asset이나 거부된 endpoint를 일반 선택으로 바꾸지 않는다. |
| 원본 위치 | `studio-hybrid-dcc-boundary-endpoint`는 원본 f64 위치와 동적 revision을 검사하고 원근·clip 보정을 적용한 lease를 발급한다. marker도 이를 다시 검사하며 원래 asset TRS 안에서 표시한다. |
| 계산 | 전용 module Worker의 요청 ID·asset·hash·revision·generation과 packed mesh checksum을 검사한다. 원본 버퍼를 transfer하지 않으며 main 동기 계산으로 자동 재실행하지 않는다. |
| 미리보기 | workspace의 opaque plan과 별도 표시용 메시를 사용한다. 늦은 결과·취소·원본 변경은 게시 전에 다시 검사한다. |
| 적용·저장 | 기존 `geometry.commit` 한 번과 Panel의 `onRunWorkspaceEdit(label, edit, canCommit)`을 사용한다. modifier 대기 뒤 최종 발행 조건을 확인한다. 기존 Undo/Redo와 strict persistence가 전체 f64·UV snapshot을 소비하도록 회귀를 작성했다. |

첫 점 전의 Escape도 선택 모드를 종료하며, 점 선택 중에는 다른 오브젝트·component 버튼·편집
단축키가 선택을 바꾸지 않게 했다. Orbit의 실제 start/change/end와 기존 조작 후 클릭 억제를
연결했다. 카메라 이동 자체는 object-local endpoint를 폐기하지 않는다. marker는 다음 hit를
가로채지 않으며, ready 상태는 분할 결과 메시를 표시한다. 이 내용은 구현 설명이며 시각 검증 통과가 아니다.

기존 내부 polygon 작도의 3–64점 의미는 유지한다. 신규 파일은 800줄 미만이며 기존 뷰포트 Core는
클릭 처리와 선택 면 대응을 집중 모듈로 옮겨 1,381줄에서 1,326줄로 줄였다. 편집기 문서·history·renderer 소유권은
[현재 Studio 경계](../architecture/studio-current-boundaries.md)를 따른다.

## 2026-10-31 B184 집중 검사 기록

새 도구·선택 안내와 main의 오류·완료 문구는 `studio.bg3dScene.boundaryChord.*`의 키 기반으로 연결했다.
ko/en 정본에 58개 키를 작성했고 UI 소스·오류 키와 정본의 집합 및 값 일치를 읽기·JSON 대조로 확인했다.
Worker 커널의 내부 진단과 화면 문구는 분리하며, 오류 코드와 이름은 언어를 바꿔도 유지한다.
해당 번역 회귀를 추가하고 기존 UI의 오류 기대값도 현재 언어의 정본 문구에 대조하도록 고쳤다.
정상 설치 세션 `69986`은 실제 종료 코드 0이었다. 정상 i18n 3명령도 세션 `29960`·`66682`·`61775`가
각각 종료 코드 0으로 끝났으며, 다른 73개 로케일의 namespace와 75개 flat을 합친 생성물 148파일을 갱신했다.
75개 namespace·flat 팩은 모두 새 58키를 포함한다. 기존 91개 bg3dScene 키를 바꾸지 않고
UI 20키·오류 30키·안내 8키를 더했으며, 합쳐진 Studio 사전은 팩마다 정확히 1,794키다.

초기 소스 준비에서는 적용 전 patch·baseline 바이트 대조와 적용 후 `git diff --check`를 수행했다.
PR #2574의 실제 main 병합을 원격에서 확인하고, 이 브랜치도 해당 main까지 정상 fast-forward했다.
기존 33개 staged 파일·원문·diff를 별도 QA 사본으로 보존했으며 두 번의 동기화 직후 동일함을 확인했다.
동기화 후 실제 루프 절단이 이전 endpoint·미리보기 계획을 무효화하는 경로와,
UV·비0 crease를 가진 루프 절단 뒤 새 경계 분할·단일 확정·Undo/Redo·저장 복원을 검사하는
회귀 두 개를 추가해 아래 집중 실행 범위에 포함했다.
기본 무UV·crease 0 메시에서 모서리 분할로 생긴 collinear 코너를 표시 표면이 생략하면,
기존 선택 overlay의 `corners - 2` 누적이 실제 삼각형 수와 달라지는 오류도 소스 대조로 확인했다.
선택 면은 실제 interactive surface triangle 표의 `faceId`로 고르고 표시 index·좌표·면 누락을 검증하도록
수정했다. 실제 cube·분할·문서 확정·viewport projection을 쓰는 별도 7개 회귀도 작성했다.
이 입력의 신규 테스트 파일은 13개이며, 직접 회귀·번역을 합친 필수 집중 실행 범위는 32개 파일이다.

첫 실행 `70693`은 실제 종료 코드 1로 끝났다. 14파일 통과 뒤 `studio-i18n-loader.test.ts`의
총 키 수 기대값 1,736과 실제 1,794가 달라 1파일 실패했고, bail로 17파일은 실행하지 않았다.
정본·생성 팩의 정확한 58키 증가를 확인한 뒤 기대값만 1,794로 바꾸고 한글 근거 주석 3줄을 추가했다.
정확한 개수 일치 검증과 기존 assertions·안전 한도는 유지했으며 skip을 추가하지 않았다.

동일 32파일 재실행의 Vitest JSON은 **32파일·400사례 모두 passed**, skip·fail·pending은 모두 0이며
실행 시간은 154.72초였다. 이 JSON의 SHA-256은
`01549d734007595a174cda12425470cdc42a365f4a39f147b2bace5ad4808ceb`다.
다만 외부 guard 세션 `33373`은 ps5 관측 timeout과 cleanup 조회 실패로 **실제 종료 코드 1**이었고,
자식 프로세스의 OS 종료 코드는 확인하지 못했다. 따라서 400사례의 JSON 통과를 정상 프로세스 종료 코드 0이나
전체 실행 성공으로 바꾸어 기록하지 않는다. 이 단위 실행 시간도 실제 3D 화면 성능 측정값이 아니다.
별도 확인에서 알려진 PID·PG 잔류는 0이었고, 184경로 source fingerprint는 실행 전후 `b18d…`로 같았다.
실패 뒤 재시작하거나 추가 신호를 보내지 않았다. 알려진 PID·PG 확인은 모든 미관측 프로세스 부재의 증거와 구분한다.

타입 검사·lint·전체 하네스·실제 Chrome·GPU·빌드의 통과 증거는 이 집중 검사 기록에 포함하지 않는다.
원본 QA patch의 Worker 오류 사전에서 따옴표 없는 `invalid-input` 키를 발견해 적용 소스에서
구문을 바로잡았고, 사용자 오류 문구에서 내부 Worker 용어를 제거했다. 보존한 QA patch를 이후
검증된 제품 소스 대신 다시 적용하면 안 된다.

원본 kernel·endpoint·UV 회귀 3파일은 import만 실제 제품 경로에 맞춰 옮겼다. 추가 Worker client,
workspace, hook, click, Orbit, Tools, wrapper, Core, marker 회귀도 제품 테스트 경로에 배치했다.
실행 결과 JSON과 외부 guard 실패는 위와 같이 구분한다. Node의 DOM·전송 경계 대체 테스트는 실제
브라우저 Worker·WebGL·포인터·픽셀 성공을 대신하지 않는다.

남은 검증은 정확한 후속 입력과 실행 승인을 기준으로 타입·정적 검사·저장소 하네스와 정상 종료 확인,
실제 Chrome의 endpoint 선택 → Worker 종료 → 미리보기 → 적용 → Undo/Redo → 저장·재열기 경로를 다룬다.
실제 marker 위치·크기·가시성, 분할선 구별, 카메라·transform 드래그 뒤 선택,
취소 뒤 늦은 응답, 읽기 전용 잠금과 기존 작도 도구를 함께 확인해야 한다.
전체 source checkout의 대용량 public 자산을 중복 복사하지 않은 작업 공간이므로, 전체 하네스와
빌드 전에 필요한 public fixture·생성 입력도 정상적으로 확보해야 한다.

## 유지하는 미완료 요구

현재 커널은 선택한 한 면의 두 경계를 잇는 분할이다. 모든 작도 도구·수치 입력·작도 평면·추론
고정·여러 면을 가로지르는 선·교차 치유를 대체하지 않는다. UV 경로도 현재 영향받는 면의
affine/planar field와 최종 Float32 값을 보존할 수 있는 범위다. 일반 non-affine·projective UV,
내부 루프·곡면·전체 Knife와 외부 face 조직·주석의 remap 소비는 남아 있다.
기존 interactive surface의 smooth+crease 조합에는 smoothing-island 렌더 경로가 필요하다.
루프 절단과의 새 UV·crease 연속 편집 회귀는 flat 면을 사용하며 이 렌더 미완료 요구를 대신하지 않는다.
전체 face 1→2 및 방향 있는 half-edge remap은 Worker 응답·plan·편집 결과에 유지하며 journal에
별도 영구 remap schema를 추가하지 않았다.

이 제한은 이번 구현 단계의 현재 상태이며 원장의 원래 요구를 축소하는 완료 기준이 아니다.
원본 동작과의 새 native/REA 비교 증거도 아직 없으며, 기존 자료를 새 분할 알고리즘의 등가성
증거로 전용하지 않는다. 실제 사용자 경로와 원본 비교·정밀도·저장·성능 검증까지 이어가야 한다.
