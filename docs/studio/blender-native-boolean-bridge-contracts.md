# 실제 오브젝트 Boolean의 네이티브·BG3D 연결 경계

상태: **current — 소스에서 확인한 기존 기능**, **migration — 역변환 수정·회귀 작성**,
**target — 실제 BG3D A/B bridge와 속성 보존**을 구분한다. 기록일: **2026-10-29**.
부모 `3a17b2c1ded27a55336e60de81fe5b6e9073df08` 위 미커밋 작업트리를 소스로 검토했다.
이후 실행한 집중 CPU 검사의 입력·실패·수정 후 재검증 경계는
[별도 기록](blender-native-focused-validation-2026-10-29.md)에 남겼다.
실제 BG3D A/B 연결·전체 브라우저·GPU 검증·커밋·배포는 아직 없다.

## current — 재사용할 수 있는 경로

- [native modifier 작업대](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-modifier-workspace.ts)의
  `workspaceApplyActiveModifierStack`은 실제 cutter asset의 source·modifier stack·TRS를 읽고
  평가한 cutter를 active-local 좌표로 변환한다. target의 같은 ID를 확정하고 cutter는 유지한다.
- [문서 확정](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-document.ts)의
  `hybridDccApplyModifierStack`은 source/stack/result hash와 각 cutter receipt를 검사한다.
  target의 기존 권리에 cutter의 현재 BOM·상속 provenance를 합치고 geometry dependency를 기록한다.
  mesh·stack·권리·dependency 변경은 같은 문서 명령과 undo에 들어간다.
- `StudioHybridDccBooleanOperandEvaluationReceipt.objectTransformHash`는 **cutter** TRS의 hash다.
  target·부모 TRS·현재 actor/document/selection 권한을 별도로 보증하지 않는다.
  이 DTO는 인증 권한이나 모든 입력이 고정됐다는 실행 증거가 아니다.
- 기본 [solid backend](../../apps/web/src/domains/creator/studio-solid-boolean-backend.ts)는 Manifold 하나를 선택한다.
  실패 뒤 pure-convex/AABB로 자동 전환하지 않는다. 예제 AABB나 명시 pure-convex 공급자를
  일반 GLB·현재 기본 경로의 품질 근거로 쓰지 않는다.

기존 `workspaceBooleanBetweenAssets`의 새 asset 등록은 고정 `studio`·`CC0-1.0` 메타데이터를 쓴다.
수입 BG3D 자산의 원본 권리와 변환을 유지하는 bridge로 그대로 사용하지 않는다.

## migration — 복합 회전 역변환

부모의 modifier 작업대 private inverse는 canonical intrinsic XYZ forward의 역순과 달랐다.
active와 cutter가 같은 TRS이고 `rx=ry=π/2`, `rz=0`, scale이 1일 때 local `(1,0,0)`은
world `(0,1,0)`이 된다. 예전 private 식은 이를 `(0,0,-1)`로 돌렸고,
[공통 역변환](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-object-transform.ts)은 `(1,0,0)`로 돌린다.
이는 소스 수식 대조이며 실제 수치 프로그램을 실행한 결과로 기록하지 않는다.

후속 소스는 private 중복 구현을 제거하고 `inverseTransformStudioHybridDccPoint`를 재사용한다.
operand DTO·좌표 예산·negative determinant의 winding 반전·권리 receipt·공개 API는 유지한다.
신규 [operand transform 회귀](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-boolean-operand-transform.test.ts)는
실제 workspace add/resolve/evaluate 경로의 backend 입력을 독립 Three Matrix4 계산과 비교하도록 작성했다.
동일·서로 다른 복합 회전, 비균등/음수 scale, winding, singular 거부, 권리와 단일 undo/redo를 다룬다.
backend fixture는 입력 관측용이며 CSG/WASM 정확도·성능이나 실제 화면 성공의 증거가 아니다.
이 파일은 62개 suite 집중 검사 입력에 포함됐으며 해당 실행에 Boolean transform 실패는 기록되지 않았다.
집중 검사 전체는 다른 4개 suite의 21개 실패로 exit 1이었다. 후속 소스 전체가 통과했다는 뜻은 아니다.

## current — 저장된 operand와 표시 cache의 한계

workfile·OPFS 복원은 disposable render cache를 버리지만 Boolean modifier의 **resolved operand bytes는 저장한다**.
기존 `workspaceRefreshModifierPreviews`는 live cutter를 다시 resolve하지 않고 저장된 stack을 materialize하며,
cache가 있으면 해당 record를 건너뛴다. source/stack/content hash가 같다고 새 역변환을 적용했다는 뜻은 아니다.

따라서 이번 수정은 새 add/patch/apply에서 사용하는 좌표 계산을 바로잡으며,
예전에 저장한 wrong-inverse operand의 자동 교정을 완료하지 않는다.
global revision만 올려도 같은 operand bytes를 평가하므로 해결되지 않는다.
live-reference dependency 재평가와 기존 파일 migration·이력/해시 보존 정책은 별도 필수 작업으로 남긴다.
이 검토를 이유로 저장된 canonical stack·state hash·저널을 조용히 재작성하지 않는다.
의존 입력이 바뀐 새 평가와 실패한 동일 요청의 자동 재실행은 구분한다. 새 입력 평가에서도
선택한 backend·현재 source lease·취소/실패 경계를 유지하고 다른 공급자로 성공을 가장하지 않는다.

### current — cache만 바꾸는 수정으로 해결되지 않는 이유

`materializeStudioGeometryRenderCache`는 현재 canonical stack을 평가하고 그 stack hash를 cache에 결합한다.
임시 registry의 다른 operand로 평가한 뒤 cache의 `sourceModifierStackHash`만 원본 값으로 덮어 붙이는 것은
실제 평가 입력을 다르게 표시하는 우회다. 현재 cache에는 별도 live 입력의 발급·현재성 증명이 없다.

다음 네 소비자를 같은 resolved evaluation 계약으로 연결해야 한다는 것을 소스에서 확인했다.

| 소비자 | 현재 동작 | 필요한 경계 |
| --- | --- | --- |
| `workspaceRefreshModifierPreviews` | cache 유무로 건너뛰고 저장된 stack을 평가 | 현재 A/B 입력과 policy에 대해 유효한 cache인지 검사 후 발급 |
| `synchronizeWorkspaceGeometryAuthority` | record 단독 검사로 bridge 표시 hash 결정 | 편집·Undo 이후 새 session의 geometry/TRS context 사용 |
| viewport `validateRenderCache` | record/source/stack/content 검사 | 현재 workspace의 참조 입력까지 재검사 |
| handoff `resolveStudioHybridDccDeliveryRecords` | canonical stack을 재평가해 cache hash와 비교 | 같은 trusted 평가의 실제 mesh·receipt 사용 |

표시 cache만 live 결과로 바꾸면 handoff가 저장 operand의 결과와 다르다고 거부할 수 있다.
handoff에서 cache soup를 editable mesh로 재조립하면 UV·slot·normal 대응도 잃을 수 있으므로 해결로 쓰지 않는다.
안전한 발급 경계는 현재 source에서 resolver→evaluator→projection을 실행하고 exact cache object에
canonical stack과 resolved input의 별도 provenance를 결합해야 한다. 이 live 전용 API는 아직 구현되지 않았다.

평가 mesh 전체를 cache sidecar에 강하게 보유하면 현재 typed render buffer 외에 half-edge 객체를 추가로
유지한다. 메모리·수명 비용은 미측정이며, 구현 시 출력 일치와 예산을 유지하는 결과 보관 정책을 함께 검증한다.
WeakRef/요청 단위 보관 등의 방식은 검토 후보이며 채택하거나 성능을 입증한 상태가 아니다.

enabled `operandAssetId`로 임시 dependency graph를 만들고 nested·cycle·missing을 처리해야 한다.
현재 canonical dependency는 Apply 시점의 기록이므로 미적용 live preview graph를 대신하지 못한다.
missing reference 때문에 파일 전체를 손상으로 단정하거나 저장된 operand를 삭제하지 않는다.
평가 오류·기존 source 표시·handoff 차단과 사용자의 참조 수정 경계를 구분한다.

이 runtime 수정에 저장 형식 변경이 필수인 것은 아니다. canonical stack/stateHash·저널·undo 보존과
전체 workfile byte/hash의 동일성은 다른 조건이다. bridge 역시 파일 payload이므로 표시 geometry hash를
갱신한 파일까지 byte-identical하다고 보고하지 않는다. 동기 OBJ와 authority GLB의 미적용 stack 거부는 유지한다.

## target — BG3D bridge의 필수 불변식

BG3D 공간 모델러 세션은 실제 선택한 A/B, scene command와 같은 ID 교체를 소유한다.
native 세션은 공통 기하 계산·표면·재질/입출력 및 정확한 backend/cache variant 계약을 소유한다.
기존 derivative bridge의 한 모델 변환 지원을 두 operand Boolean 완료로 확대하지 않는다.

1. A/B의 owned GLB bytes·원본 hash·권리·선택 세대·document/actor/source/runtime 소유권을 묶는다.
   마지막 commit 전에 target과 cutter 양쪽을 재검사한다. target·부모·정규화 k도 입력이다.
2. 원본 GLB 좌표에 entity TRS·normalized root·GLB node matrix·parent world를 정확히 합성한다.
   canonical child entity는 부모의 normalized GLB root와 형제이므로 부모 모델의 k를 상속하지 않는다.
   부모의 비균등 scale과 자식 회전이 만드는 shear를 TRS 분해로 버리지 않는다.
   일반 계층은 실제 행렬로 계산하거나, 표현 불가 범위를 명시적으로 거부해야 한다.
3. geometry 포트와 BG3D 문서 권위를 구분한다. target의 같은 entity ID, cutter, hierarchy,
   전체 권리/AI 표기·저장/내보내기 의미를 유지한다. 단순 target 권리 복사는 cutter provenance를 보장하지 않는다.
4. storage ID만으로 runtime cache를 읽지 않는다. 현재 backend의 정확한 entry/variant를 읽고,
   source snapshot과 늦은 결과 fence에 같은 entry를 고정한다.
5. 결과의 정규화 k가 바뀌면 canonical scale 보정과 실제 world placement를 함께 확인한다.
   수입 derivative·cache·문서 확정은 자기 소유 rollback과 한 번 undo 경계로 처리한다.

현재 `createScene3dInplaceController`는 단일 binding과 별도의 derivative allowlist를 사용한다.
A/B를 두 번 capture하면 앞 binding이 무효화되므로 두 역할을 같은 operation 세대에 묶는 port가 필요하다.
`prepareStudioBg3dInplaceDerivative`의 scale 보정은 같은 raw-source-frame 결과를 전제로 한다.
world/entity-local로 이미 bake한 결과에 이를 다시 적용하지 않는다.
procedural target 교체는 `replaceCanonicalDocumentState({primitives, customModels})`의 한 동기 fence에서
원본 primitive를 제거하고 같은 ID의 custom model을 추가해야 한다. 임시 중복 ID를 발행하지 않는다.
기존 history writer가 pending edit를 먼저 flush할 수 있으므로 함수 호출 한 번을 항상 timeline 한 칸으로 세지 않는다.
Boolean 결과의 한 번 undo와 이전 미커밋 편집 보존을 함께 검증한다.

## current / target — 표면 속성과 검증 범위

`studioModifierUvBudget`는 target UV의 정확한 Boolean 코너 전파가 미지원이면 현재 명시적으로 거부한다.
렌더 가능한 GLB가 속성을 보존하며 Boolean 가능한 solid라는 뜻은 아니다.
현재 Boolean backend DTO는 positions/indices 중심이고, 출력 조립은 UV·material slot·corner normal·crease의
완전한 양쪽 provenance를 공급하지 않는다. 이를 보존하는 일반 BG3D bridge는 아직 없다.
이 경로로 authored 속성을 조용히 제거한 뒤 같은 품질이라고 보고하지 않는다.
Manifold 3.5.1의 실제 필드와 현재 재질 확정 경로를 대조한
[표면 provenance 연결 계약](blender-native-boolean-surface-provenance-contracts.md)에
slot 충돌·seam·normal·crease와 추가 회귀 조건을 구체화했다. 해당 runtime 연결은 미구현이다.

완료에는 실제 A/B 선택·좌표와 표면 속성·양쪽 권리·stale 결과·단일 undo·저장/재열기를 아우르는 검증이 필요하다.
원본 물체 대신 bounding box를 연산한 예제나 DOM/명령 로그만으로 입증하지 않는다.
현재 집중 검증과 실제 Chrome/STP 품질·성능 검증은 공유 실행 허용 이후 수행할 대상이다.
