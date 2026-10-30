# 공간 모델러 공유 모서리 치유 소스 구현

- 최초 작성: 2026-10-30. 이 사본의 상태 갱신: 2026-10-31 PR 준비 시점.
- 상태: `migration` — 커널·필드와 workspace adapter 소스가 있다. 과거 커널 2파일·33개 통과와
  현재 PR 후보의 3파일·63개 회귀 정의를 구분하며, 현재 후보의 집중 검증과 실제 편집 도구 연결은 남아 있다.
- 최초 작성 기준: `3cc8e878dccc53bd96b72052173d3d7b56954dde`.
- 과거 커널 단위 검증 기준: `5cce6b15cc417033900e38992498d6a778dee4b4`, 브랜치 `codex/spatial-edge-heal-20261030`의 당시 미커밋 입력.
- 전체 요구: [기능 원장](../features/sketchup-feature-coverage.md)의 SK09·SK32를 이어간다. 어느 행도 완료로 바꾸지 않는다.
- PR 준비 범위: 기존 경계선 면 나누기 B35, 번역 생성물 148개, fixture 1개와 C 소스·회귀·보고서 7개를
  같은 PR 후보로 통합한다. 기존 번역 58개 키와 C 원본 기록은 보존하며, 이 사본의 갱신을 원본의 실행 결과로 소급하지 않는다.

## 원본 계약과 기존 구현의 차이

[원본 공식 도움말](https://help.sketchup.com/en/sketchup/dividing-splitting-and-exploding-lines-and-faces)은
면의 경계 두 곳을 이은 선으로 면을 나누고, 그 선을 지우면 다시 한 면으로 치유되는 동작을 설명한다.
[공식 Edge API](https://ruby.sketchup.com/Sketchup/Edge.html#split-instance_method)는 원본 모서리 위의 점과
시작점 기준 매개변수로 모서리를 나누는 계약을 설명한다. 이 자료는 공개 동작 계약이며 새 native/REA 실행 증거가 아니다.

기존 `dissolveStudioEditableMeshFaces()`는 선택한 면을 제거한다. 공유 모서리 삭제로 두 면을 합치는 동작과 다르다.
Bevel의 private 공면 병합도 전체 후보 seam의 전처리이므로 선택·속성·UV·remap 계약 없이 그대로 노출하지 않는다.

## 작성한 소스

`studio-hybrid-dcc-coplanar-edge-dissolve.ts`의 `dissolveStudioHybridDccCoplanarEdges()`는 실제 mesh·hash·동적 revision과
명시적으로 삭제할 half-edge 목록을 받는다. 같은 두 incident face를 가진 reciprocal twin만 수용하며,
두 면 사이에 선택하지 않은 seam이 남으면 조용히 추가 삭제하지 않고 거부한다.

합친 외곽은 방향을 유지한 최소 원본 vertex ID에서 시작한다. 오목한 단순 외곽도 공유 surface planner로 검사한다.
f64 위치와 정점 crease, 살아남는 각 방향 half-edge crease, 면의 material/smooth를 복사하고 전체 원본 ID의 대응을 반환한다.
삭제한 양방향 half-edge는 빈 대응, 두 원본 면은 같은 결과 면으로 기록한다. 정점 compaction은 하지 않는다.
선택한 seam의 crease 제거는 사용자가 명시한 모서리 삭제에 포함한다.

UV는 결과 유향 half-edge의 원본 corner 값을 복사한 뒤 새 topology hash와 codec으로 결합한다.
단순히 유효한 UV 배열이 생겼다는 이유로 보존 성공을 판정하지 않는다.

`studio-hybrid-dcc-coplanar-edge-fields.ts`는 실제 공유 surface의 triangle·corner provenance·UV·법선을 비교한다.
f64 원본과 실제 Float32 표시 위치 양쪽에서 삼각형 교차 영역을 계산하고, 교차 다각형 꼭짓점의 보간장과
각 old/new triangle의 전체 coverage를 확인한다. 같은 affine field만 허용하는 제한은 두지 않았다.
비대상 면의 실제 삼각분할과 corner 값도 다시 대응하여 주변 smooth 음영 변경을 검사한다.

현재 수의 dyadic 값을 bounded rational로 계산하며, 수치 오차 허용폭으로 표현 손실을 통과시키지 않는다.
전체 메시·삼각형 수·교차 pair·계산량·분수 bit 수에 상한을 두고, 일부만 검사한 성공은 반환하지 않는다.
상한은 성능 측정 결과나 대용량 지원 완료를 의미하지 않는다.

## workspace adapter의 연결 범위

`studio-hybrid-dcc-coplanar-edge-dissolve-workspace.ts`는 452줄이며 SHA256은
`bc881d3169cb7f6e12a8e85b33b1874a8ea9d9885742520845cf683379cd3186`이다.
실제 edge 선택과 geometry record의 동적 revision·hash를 받아 준비·미리보기·단일 문서 확정 후보를 만든다.
`compute`는 필수인 비동기 내부 신뢰 포트다. adapter가 동기 fallback하거나 C 커널·필드 검증을 다시 실행하지 않으며,
아직 실제 Worker에 연결하지 않았다.

준비 단계는 원본 workspace·session identity, stateHash, active asset, mesh 포인터·재계산 hash·revision,
선택 identity·snapshot, 호출자 세대와 취소 상태를 await 전후에 검사한다. 원본 복사본을 계산 포트에 전달하고,
결과의 정본 codec·hash·전체 remap·명시한 seam 삭제·생존 유향 모서리·면 속성·origin UV 복사를 구조 검증한다.
검증한 snapshot과 결과 metadata는 비공개로 보관하고, frozen 요약 객체의 발급 identity를 WeakMap으로 묶는다.
따라서 구조가 같은 DTO 복제는 원본 계획의 권위를 얻지 못한다. 이 구조 검증은 임의 외부 계산의 기하 의미를 인증하는 계약이 아니다.

미리보기는 별도 display mesh·bridge 사본을 만들고 render cache를 폐기하며, 기존 modifier를 새 mesh 기반으로 재구성한다.
원본 journal·Undo·문서 revision은 바꾸지 않는다. 확정은 일반 `hybridDccCommitGeometry` 한 번과 authority 동기화로 후보를 만들고,
새 revision의 병합 면을 선택한다. extrude 전용 receipt로 치유 연산을 가장하지 않는다. 기존 Undo/Redo와 persistence codec을
사용하는 adapter·회귀 소스는 있으므로 이 경로 전체를 미연결로 보지 않되, 실행 성공은 아래 검증 기록과 구분한다.

commit은 첫 시도만 허용하고 실패한 계획도 재사용하지 못한다. 후보 생성·실패 뒤의 `canCommit`은 별도의 live guard로 유지해,
호출자가 modifier 준비를 await한 뒤 최종 발행과 catch 안내를 판정할 수 있게 한다. 새 session 관측·취소·세대 변경에는 거부하며,
같은 session에서 숨김·컷·잉크만 바뀌어도 canonical workspace identity가 다르면 이전 후보를 거부한다.
adapter가 후보 반환을 동기적인 React 발행 완료로 간주하지는 않는다.

실제 사용자 도구·viewport·Worker와의 연결은 아직 없다. 이 소스만으로 선택한 모서리를 화면에서 지우고,
저장 후 새 화면으로 재열기하는 사용자 경로가 완성되었다고 판정하지 않는다.

## 회귀 소스와 실행 상태

커널 회귀는 분할 cube의 F7→F6, 오목 외곽, 명시한 연속 seam, 전체 remap, 비기본 속성·외곽 crease,
corner UV 재결합, 정상 codec 재읽기와 stale hash/revision·속성 충돌·홀·비공면·외곽 edge의 무변경 거부를 작성했다.
필드 회귀는 공통 affine와 보존 가능한 일반 piecewise UV, 반대 대각선의 내부 보간 변화, 실제 UV seam,
상수 UV, smooth 법선 가중치 변화, identity cache와 Float32 collapse를 다룬다.

workspace 회귀 파일의 SHA256은 `4cfbac3c50efe119e5dd0e55846871c0deb2b047909943ce0050172d883e342d`이며
30개 회귀를 정의했다. 실제 커널을 쓰는 비동기 producer와 edge 선택에서 preview·단일 확정·Undo/Redo·persistence 재읽기를 다루고,
취소·source/선택/세션 변경·ABA·늦은 결과·계획 복제·결과 변조·단일 시도·실패 안내·bridge-only 변경의 발행 거부를 다룬다.
이는 회귀 소스의 범위이며 실제 Worker 또는 실행 통과 증거가 아니다.

**과거 실행 기록:** 2026-10-30에 커널과 필드 두 파일을 명시한 정상 `pnpm exec vitest run` 명령을 `--maxWorkers=1`로 한 번 실행했다.
실제 tool session `93374`가 종료 코드 0으로 끝났고 **2파일·33개가 통과**했다. Vitest 4.1.12의 실행 시간은
2.50초이며 테스트 본문은 113ms였다. 이 시간은 단위 검사 시간으로, 3D 화면 성능 측정값이 아니다.

실행 전후 코드 4개와 당시 보고서 1개의 SHA·파일 권한을 보존했고 관련 Vitest 실행의 잔류가 없음을 확인했다.
당시 실행 결과는 그 입력 보존 확인 뒤 기록했다. 정상 명령 내부의 로컬 store 동기화와 prepare hook은 유지했으며
별도 설치 명령이나 재시도는 실행하지 않았다. 짧은 실행 동안 PGID를 직접 수집하지 못한 한계는 원본 기록에 남겼다.

**2026-10-31 PR 사본:** 커널 회귀 269행의 `it.each`를 `it.for`로 한 줄 교정해 배열 row가 선택 ID 배열 한 인자로 유지되는
strict 타입 계약을 맞췄다. 수정한 커널 회귀 파일의 SHA256은
`b42fe350141d90113d7f1364ad2456e2e95d3909696d0c4af983596f8c541f65`이다.
과거 33개 통과는 이 수정과 workspace 30개 회귀를 포함하지 않는다. 현재 C3의 63개 집중 회귀는 실행 GO 전이며 아직 실행하지 않았다.

현재 PR 사본의 타입 검사·lint·전체 하네스·브라우저·GPU·빌드 결과도 이 기록에서 보증하지 않는다.
통합 이후 정상 Git 후크와 단위 검증 결과는 PR의 정확한 SHA·실제 실행 결과에 귀속해 별도로 기록해야 한다.
이 문서 갱신에서는 Node·테스트·Git 쓰기나 배포를 실행하지 않았다.

## 계속 구현하고 검증할 범위

- 현재 face schema의 단일 loop로 표현할 수 없는 홀·여러 외곽·자기접촉은 별도 위상 계약이 필요하다.
- 서로 다른 material/smooth와 표현이 달라지는 UV를 한 면의 한 속성으로 보존했다고 가장하지 않는다.
- 현재 UV schema는 단일 corner UV다. 다중 채널과 projective Q를 임의로 첫 채널로 축소하지 않는다.
- mesh-only API는 임의 object/parent 변환 뒤의 일반 variable smooth 재삼각화를 증명할 수 없다.
  대응 삼각형이 같거나 교차 영역의 양쪽 삼각형이 같은 상수 법선을 가지는 경우만 변환 독립 보존으로 판정한다.
  일반 지원에는 실제 normal transform과 현재 문서 context를 함께 묶는 실행 계약이 필요하다.
- workspace 회귀 30개를 포함한 C3 집중 검증을 실행하고, 실제 Worker·선택 도구·viewport 연결을 구현해야 한다.
- 실제 경계선 면 나누기 결과를 치유하고 한 번 Undo/Redo·저장·새 mount로 재열기하는 사용자 경로를 검증해야 한다.
- 정상 타입·lint·하네스, 후속 연결 회귀와 실제 Chrome의 렌더·취소·대용량 성능 검증은 배정된 실행 차례에 진행한다.

이 제한과 미실행 상태를 SK01–SK33의 원래 목표를 줄이는 완료 기준으로 사용하지 않는다.
