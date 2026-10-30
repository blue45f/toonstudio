# 3D 작업대의 루프 절단 계약

기록일: **2026-10-30**. 상태: **migration — 루프 절단 집중·필수 검증 통과, 후속 PR 병합 전**.
이 문서는 메인 병합된 준비 작업과 후속 루프 절단 변경을 구분한다. 후속 변경의 실행 결과와
커밋·PR 상태는 실제 검증 뒤 기록하며, 운영 제공이나 다른 모델러 전체 기능의 동등성을 뜻하지 않는다.

## current — 기존 동작과 후속 변경

PR #2566에 포함된 기존 절단은 연결된 변에 정점을 삽입했지만 면을 실제로 나누지 않았다.
UV 입력에서는 중앙 geometry authority의 손실 방지 검사가 편집을 거부하여 원본과 이력을 유지했다.

후속 구현은 [공개 메시 API](../../apps/web/src/domains/creator/studio-editable-half-edge-mesh.ts)의
`loopCutStudioEditableMesh` 시그니처를 유지하고
[별도 순수 커널](../../apps/web/src/domains/creator/mesh-topology/studio-editable-mesh-loop-cut.ts)로 연결한다.
선택한 변의 맞은편 변을 거쳐 사각 면 띠를 탐색하고, 두 절단점을 잇는 실제 내부 변으로 각 면을 두 면으로 나눈다.
닫힌 고리와 양쪽 경계로 이어지는 열린 띠를 지원한다. 삼각형·다각형에서는 진행을 멈추되
공유변의 새 정점은 종단면에도 반영하여 T자 접합을 만들지 않는다.

## target — 정확성과 보존 조건

- 절단 비율은 선택한 반변의 출발점에서 도착점 방향에 결합한다. 반대 방향 반변은 `1-factor`로 같은 물리적 위치를 사용한다.
- 면의 `materialSlot`·`smooth`, 기존 정점과 분할된 반변의 crease를 보존한다. 새 정점·내부 절단변의 crease는 0이다.
- UV는 면 코너별로 보간한다. 반변의 `vertex`는 도착점이며 `corners[he.id]`는 출발점이다.
  따라서 끝점 UV는 `corners[he.next]`다. 반대편 면의 코너와 합치지 않고 seam을 유지한다.
- 새 UV는 유한 Float32와 결과 topology hash에 결합한다. 무UV 입력에 UV 레이어를 새로 만들지 않는다.
- 양쪽 면의 UV가 연속인 공유변에서는 정점 ID의 정규 끝점 순서와 같은 가중합으로 계산한다.
  아주 작은 factor에서 `1-(1-factor)`의 오차가 거짓 UV seam을 만들지 않도록 한다.
- 원본 정점 ID와 원본 면의 시작 코너를 포함한 첫 자식 면의 ID를 유지한다. 새 자식 면은 뒤에 추가한다.
  반변 ID가 다시 발급되므로 기존 hash·revision에 결합한 선택은 현재 작업대 정책에 따라 무효화한다.
  새 절단 고리를 자동 선택하는 별도 대응 receipt는 후속 범위다.
- 유효한 평면 오목 사각형도 지원한다. 자기 교차·퇴화·뒤집힌 자식 면과 모순되는 고리는 원자적으로 거부한다.
  비평면 사각형은 기존 검증된 fan 표면의 조건을 유지한다.
- 완성된 메시만 기존 geometry command로 한 번 확정한다. 오류 시 원본·저널·undo·redo를 변경하지 않는다.
- 비사각형 종단면에도 새 코너가 생긴다. 결과 면이 기존 동기 표시 예산인 128코너를 넘으면
  builder·commit 전에 `budget-exceeded`로 거부하여 편집 후 오브젝트가 화면에서 제외되는 일을 막는다.
- 표시 가능한 원본의 절단 결과는 실제 interactive 표면 검사도 통과해야 작업대가 commit한다.
  Float64의 유효한 면이 Float32 표시에서 접히는 경우에도 원본·이력을 유지한다.
  원본부터 표시가 미지원인 파일·메타데이터의 기존 편집 범위를 이 검사로 추가 제한하지 않는다.
- `.toon3d` 저장·재열기와 이후 undo/redo에서 결과 메시·UV·재질·crease를 그대로 복원한다.

## migration — 독립 검증

[커널 검증](../../apps/web/src/domains/creator/hybrid-dcc/studio-editable-mesh-loop-cut.test.ts)은
정육면체 24개 seed의 12정점·20모서리·10사각 면, 닫힘·부피·면적과
비대칭 factor·열린 띠·비사각형 종단·음수/비대칭 UV·속성을 독립 기대값으로 확인한다.

[작업대 검증](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-loop-cut-workspace.test.ts)은
단일 commit, 원본 불변, UV seam, 되돌리기·다시 실행, 결과 저장과 되돌린 상태의 저장·재열기를 확인한다.
[중앙 UV 손실 방지 검증](../../apps/web/src/domains/creator/mesh-uv/studio-mesh-uv-loss-guard.test.ts)은
새 지원 경로의 UV 전달과 여전히 대응을 제공하지 않는 편집의 거부를 구분한다.

루프 절단 오류는 기계 판정용 코드와 원본 진단을 오류 객체에 보존한다. 패널에는 고정된
한국어·영어 복구 안내를 표시하고 영어 작업 이름도 같은 번역 경로를 사용한다.
다른 도구의 기존 오류 처리는 유지한다.
[오류 안내 검증](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-operation-feedback.test.ts)과
[실제 영어 패널 검증](../../apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccPanel.loop-cut-feedback.test.tsx)은
원본 진단의 미노출과 `aria-live` 상태 문장을 확인한다. 실제 작업대의 예산 실패 사례도
오류 종류·코드·원본 `detail`과 `message` 전달을 확인한다.

2026-10-30에 기준 `36cfccecf29082073b70096e2fd721242afb94e9` 위의 후속 입력 16파일을
고정하고 기존 작업대 편집을 포함한 **6파일·78개 테스트 PASS**를 확인했다.
단일 worker·파일 병렬 해제, `NODE_OPTIONS=--max-old-space-size=4096` 조건이며,
실행 창 7.310초·입력 지문 동일·소유 프로세스 그룹 잔류 0이었다.
선행 41개·35개·44개·52개 결과를 합산한 수치가 아니다.

같은 입력의 `pnpm harness:verify --base=36cfccecf29082073b70096e2fd721242afb94e9`도
`NODE_OPTIONS=--max-old-space-size=16384` 조건에서 통과했다.
웹 전체 및 API 세 종류의 타입 검사, 변경 코드 13파일·비밀값 16파일, 하네스 자체 검증,
앱 구조·문서·파일 크기·초기 로딩 검사를 포함한다. 실행 창은 339.987초,
입력 지문 동일·소유 프로세스 그룹 잔류 0이었다. 초기 그래프는 1,648모듈·19,803.6KiB로
늘지 않았고 기준선을 변경하지 않았다. 이 문서의 검증 기록은 해당 입력 뒤 정리했다.

비사각형 종단의 collinear 코너는 공통 ear 표면에서 처리하지만, 기존 Cloth 전처리처럼
fan만 허용하는 연산은 해당 면을 거부할 수 있다. 이 기존 소비자 제약은 후속 호환 작업이며
현재 검증으로 모든 편집 연산의 연속 적용을 보증하지 않는다.
실제 브라우저 조작·GPU 출력·4K 타일 비교·운영 배포는 위 검증으로 증명하지 않는다.
