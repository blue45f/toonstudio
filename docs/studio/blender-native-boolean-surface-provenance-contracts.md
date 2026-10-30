# Boolean 표면 provenance와 재질 확정 계약

상태: **current — 소스에서 확인한 손실 경로**, **target — 아직 구현하지 않은 연결 계약**.
기록일: **2026-10-29**. 부모 `3a17b2c1ded27a55336e60de81fe5b6e9073df08` 위 미커밋 작업트리와
설치된 `manifold-3d` 3.5.1 타입을 읽고 공식 upstream과 대조했다. 이 문서 작성 중 CSG runtime·REA 분석·검사를 새로 실행하지 않았다.
Blender와 비슷한 웹 모델링에서 모양과 authored 표면을 함께 보존하기 위한 후속 구현 기준이다.

## current — 위치와 인덱스 이후 정보가 끊기는 경로

| 경계 | 현재 소스에서 확인한 사실 | 실제로 보존하지 못하는 정보 |
| --- | --- | --- |
| `resolveBooleanOperands` | 평가한 cutter를 `studioEditableMeshToTriangleSoup`로 바꾼다 | cutter face slot·smooth·crease·UV 대응 |
| `StudioMeshBooleanModifier.operand` / `StudioSolidBooleanBackend` | positions·indices만 선언한다 | 두 operand의 표면과 원본 면·코너 식별 |
| `createStudioManifoldRuntime.createManifold` | `numProp: 3`으로 생성한다 | 추가 UV·normal 채널과 seam merge vectors |
| 같은 runtime의 `getMesh` | numProp·vertProperties·triVerts만 복사한다 | runIndex·runOriginalID·faceID·runTransform·runFlags·merge vectors |
| provider `plainOutput` | 첫 세 property 채널을 positions로 분리한다 | runtime이 출력해도 추가 property는 최종 receipt에 남지 않음 |
| `evaluateStudioMeshModifierStack` Boolean 분기 | `soupToMesh(positions, indices)`만 호출한다 | 면 속성·UV 전달 인수가 비어 있음 |

새 editable mesh의 기본 면은 `materialSlot: 0`, `smooth: true`이고 vertex·half-edge crease는 0이다.
기본 unit cube는 원래 `smooth: false`로 만들지만 Boolean 재구축에는 그 보정이 없다.
원래 각진 면도 결과에서 smooth로 바뀌며, 공통 surface는 그 결과의 smooth 값으로 normal을 계산한다.
`studioModifierUvBudget`는 target에 UV가 있으면 현재 Boolean을 명시적으로 거부하지만,
target 무UV·cutter 유UV나 무UV 다중 재질·smooth·crease를 보존하는 별도 Boolean 대응은 없다.
이는 소스상의 데이터 경로 판정이며, 실제 CSG 결과를 생성한 재현 기록은 아니다.

## current — 면 slot 손실은 문서 재질 표까지 이어진다

`hybridDccApplyModifierStack`은 mesh·stack·권리·dependency를 확정하고 이전 materials를 상속한다.
이어 `appendCommand` → `finalizeState`는 `normalizeStudioHybridDccMaterials(..., geometry, true)`를 호출한다.
이 reconcile은 결과 mesh의 면에 없는 slot binding을 제거한다.

따라서 원본 A의 slot 7이 결과의 기본 slot 0으로 바뀌는 입력은 A의 slot 7 binding도 제거하는 경로를 갖는다.
slot 정수를 출력에 복사하는 것만으로도 부족하다. A의 slot 0과 B의 slot 0이 서로 다른 재질이면
`(operand 역할, source slot)`에서 결과 slot으로 가는 대응과 실제 재질 정의를 함께 확정해야 한다.
slot은 현재 safe integer이므로 Float32 property나 Uint32 run ID에 직접 넣어 손실시키지 않는다.
별도의 bounded 대응 표를 사용한다. 제거된 binding의 정의를 다른 자산이 쓰지 않으면 reconcile은 정의도 제거한다.
재질 확정까지 같은 undo transaction에 묶고, Undo·Redo·저장·복원에서도 양쪽 연결을 보존해야 한다.

## current — Manifold 자체의 지원 범위와 어댑터의 책임

저장소 manifest와 설치 package는 3.5.1을 사용한다. upstream release의 commit은
[`cc8a7f66d7d5a560da94346258c5b546af27811e`](https://github.com/elalish/manifold/commit/cc8a7f66d7d5a560da94346258c5b546af27811e)다.
계약 비교에는 [그 commit의 MeshGL 선언](https://github.com/elalish/manifold/blob/cc8a7f66d7d5a560da94346258c5b546af27811e/include/manifold/mesh.h)을 사용했다.
이 확인은 배포된 WASM의 실행 결과·속도·전체 API 적합성 증거가 아니다.

- 추가 float property는 연산 중 보간된다. 불연속 UV·normal을 가진 동일 위치 코너는 property vertex로
  분리하고 원래 topology의 merge vectors를 전달한다. 좌표가 비슷하다는 이유로 별개 shell을 합치지 않는다.
- `runIndex`는 **삼각형 개수가 아닌 `triVerts` 배열의 offset**이며 3의 배수다.
  `runOriginalID`와 operation 내부 원본 표를 연결해 양쪽 재질을 식별한다. 임의 중복 ID 대신 `reserveIDs` 계약을 따른다.
- `faceID`가 다른 면 사이의 경계는 유지된다. 원본의 어떤 삼각형·코너인지 구분해야 하는 입력은
  그 단위로 ID를 발급해야 하며, 원본 polygon ID만으로 비균일 보간의 삼각형을 추측하지 않는다.
- normal은 채널 의미·변환·backside 처리를 같이 정해야 한다. `getMesh(normalIdx)`의 변환/방향 처리와
  `runFlags` 정보를 읽은 뒤 같은 반전이나 행렬을 다시 적용하지 않는다.

현재 native `StudioEditableMesh`는 face smooth·crease·UV를 저장하지만 authored custom corner-normal 필드는 없다.
따라서 provider에서 normal 채널을 보존하더라도 native 정본에 넣는 순간 GLB custom normal의 완전 보존을
달성하지 못한다. 표면 권위·직렬화·해시·렌더·GLB가 공유하는 표현을 먼저 정해야 한다.
기존 원본 GLB bytes와 runtime 표시에서 normal을 유지하는 것과 editable Boolean 정본의 보존은 별개다.

## target — 하나의 품질 보존 연결로 구현할 조건

1. 공통 surface plan의 실제 triangulation·corner 표를 사용한다. concave polygon을 별도 fan으로 다시 쪼개지 않는다.
   양쪽의 slot·smooth·UV·원본 vertex/edge crease와 normal 지원 범위를 같은 입력에 묶는다.
2. 실행 입력과 출력에 source identity, run/face 대응, seam topology, property layout을 보유한다.
   길이·인덱스·finite·ID namespace와 전체 할당·work 예산을 검사한다. seam으로 늘어난 property vertex와
   물리 vertex·corner 수를 구분해 모두 청구한다. 속성·대응 표도 revision이 있는 receipt hash 입력에 포함한다.
   runtime `reserveIDs` 값 자체를 문서 권위 ID로 저장하지 않는다. 안정된 hash에는 원본 역할·면·코너 tuple로
   정규화한 대응을 사용해 같은 입력의 재평가가 global ID counter에 따라 달라지지 않게 한다.
3. output face/corner provenance로 양쪽 slot을 결과 slot에 대응시킨다. material bindings의 추가·유지를
   mesh·권리와 함께 검증·확정하며, 공통 slot 번호라는 이유로 서로 다른 정의를 덮어쓰지 않는다.
4. 원본 edge의 살아남은 구간·원본 vertex와 새 교차점/교차선을 구분해 crease를 전달한다.
   `halfedgeTangent`는 native crease와 같은 값이 아니다. 임의 nearest-position 복구나 전역 weld로 대체하지 않는다.
   교차선의 새 crease·smooth 정책은 명시하고, 양쪽 속성 충돌을 조용히 0이나 최댓값으로 바꾸지 않는다.
5. 저장 operand와 live reference, evaluated cache·viewport·handoff가 같은 표면 평가를 사용한다.
   이 계약은 [live-cache 계약](blender-native-boolean-bridge-contracts.md)의 현재성·권리 경계를 대체하지 않는다.

## target — 품질을 확인할 회귀 입력

| 입력 | 확인해야 할 출력/실패 경계 |
| --- | --- |
| A 무UV, slot 7, smooth와 crease / B 다른 slot 0 | 살아남은 A 면·edge 속성, B 면의 별도 재질, 정의·binding 동시 유지 |
| A·B의 slot 0 번호가 같고 재질 내용이 다름 | 역할별 대응이 유지되고 A/B 재질이 서로 덮이지 않음 |
| 평면 큐브·매우 큰 safe-integer slot·반복 평가 | flat 음영과 slot 정밀도가 유지되고 runtime ID counter가 문서 hash에 섞이지 않음 |
| target 무UV·cutter 유UV / 서로 다른 seam UV를 가진 양쪽 | UV 누락을 target 검사만으로 통과시키지 않으며 원본 코너·merge topology 유지 |
| 동일 polygon 안에서 UV 보간이 다른 triangulation | source triangle ID에 맞는 코너 보간; 최근접 면이나 다른 fan을 쓰지 않음 |
| subtraction과 음수·비균등 scale | cutter backside와 normal 변환이 한 번만 적용되고 재질 역할 유지 |
| 같은 좌표의 별도 shell과 경계의 서로 다른 crease | 무관한 topology를 합치지 않고, 보존 불가능 충돌은 구체적으로 보고 |
| 미리보기 → Apply → Undo/Redo → 저장/재열기 → GLB | 기하·표면·재질·권리와 상태 해시의 일관성, 단일 Apply undo |

이 입력들은 아직 새 회귀 테스트로 작성하거나 실행하지 않았다. 실제 CPU·WASM·Chrome/STP와
자산별 픽셀·메모리·시간 비교가 필요하며, 문서나 기존 geometry-only 테스트를 그 증거로 사용하지 않는다.
