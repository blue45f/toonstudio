# 네이티브 조형 gesture의 표시와 문서 확정 계약

상태: **migration — 소스 연결·회귀 작성, 실행 검증 전**. 기록일: **2026-10-29**.
기준 부모는 `3a17b2c1ded27a55336e60de81fe5b6e9073df08`이며 이 문서의 후속 코드는 작업트리에 있다.
이 상태를 커밋·PR·운영 반영 또는 Blender 전체 조형 기능의 동등성으로 해석하지 않는다.

## current — 기존 동작과 변경 목적

부모 소스의 `onSculptStroke`는 pointerdown과 각 pointermove의 점을 `workspaceSculptActive`에 전달했다.
그 함수는 점마다 geometry command와 bridge 변경을 만들었다. 후속 소스는 한 번의 drag를
여러 sample로 계산한 뒤 한 번의 문서 명령으로 확정하도록 연결한다. 실제 지연·메모리 개선 폭은 미측정이다.
기존 single-dab API와 legacy viewport callback은 읽기·호출 호환성을 유지한다.

## migration — 소유권과 확정

- 순수 [stroke session](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-sculpt-stroke-session.ts)은
  시작 source·분리한 brush/direction/mask·working mesh와 발급한 receipt를 소유한다.
  sample은 기존 8종 kernel을 순서대로 호출하며 받아들인 점을 생략하거나 자동 보간하지 않는다.
- 원본 workspace·문서·저널·undo/redo·bridge·영구 저장은 drawing 중 변경하지 않는다.
  rAF는 표시 발행만 묶으며 kernel 계산은 모두 수행한다. 중간 sample 실패는 gesture 전체를 폐기한다.
- 최종 [workspace adapter](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-sculpt-stroke-workspace.ts)는
  정확한 workspace/document-state identity, document ID, active asset, mesh identity/hash/revision을 재검사한다.
  발급·사용 여부를 확인한 receipt 하나로 기존 geometry command와 공통 bridge 동기화를 각각 한 번 수행한다.
  no-op은 원본 workspace를 그대로 반환한다. 임의 session spread로 문서 명령을 흉내 내지 않는다.
- [UI host](../../apps/web/src/domains/creator/hybrid-dcc/useStudioHybridDccSculptStroke.ts)는 기존 workspace lease로
  계정·인증 revision·문서·작업대의 ABA를 차단한다. 모드·브러시 변경도 현재 작업을 취소한다.
  자신의 committing busy를 drawing의 외부 busy와 구분하여 정상 확정을 스스로 취소하지 않는다.
  호스트의 동기 `onPublished` 알림은 자기 workspace 발행 뒤 성공을 외부 문서 교체로 오인하지 않게 한다.
- receipt는 인증 권한이 아니다. 문서 lease와 원본 재검증을 통과해야 한다.
  취소된 A의 callback/rAF/finally는 새 B의 preview·잠금·이력을 정리하지 않는다.

## migration — 표시와 입력

[순수 snapshot](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-viewport-snapshot.ts)은
원본 provenance와 candidate surface를 검증하여 render-only preview를 표시한다.
원본 source mesh/hash/revision은 그대로이며 candidate positions/indices/UV/normal/material-slot stream과
world bounds·표시 signature를 같은 surface에서 만든다. 문서·파일·GLB에 임시 preview를 저장하지 않는다.
표시 snapshot 추출 후 Core의 기존 export는 호환 re-export로 유지한다.

조형 중 ray hit은 modifier cache가 아닌 원본 cage 또는 현재 조형 preview를 사용한다.
부모의 mutable modifier surface에서 원본 좌표를 추측하지 않는다. canonical TRS는 유지하고,
TRS가 없는 legacy inspection grid도 gesture 중 원본 표시 TRS를 고정하여 cursor 아래 물체가 재배치되지 않게 한다.
정상 확정 뒤에는 기존 modifier preview 갱신 경로로 돌아간다.

[pointer adapter](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-sculpt-pointer.ts)는
자기 token·pointer ID·시작 시각·capture만 소유한다. 정상 end 상태를 먼저 닫은 뒤 capture를 해제하여
release에서 발생한 lostcapture가 새 작업을 취소하지 않게 한다. 실제 mesh ray hit만 sample로 받는다.
preview hash 변경이 component key를 바꿔 진행 중 capture owner를 unmount하지 않는다.
외부 lease 취소는 `isCurrent(token)`과 layout reconcile로 자기 capture도 회수한다.

drawing의 Escape·pointercancel·예기치 않은 lostcapture·blur·unmount는 pointer 경계가 처리한다.
pointerup 뒤 modifier 평가를 기다리는 committing 단계의 Escape·blur는 host가 처리한다.
Escape는 작업대 scope·IME·editable·안쪽 dialog/popover를 존중한다.
취소는 이미 확정한 문서를 undo하는 방식으로 구현하지 않는다. 취소 뒤 늦은 pointerup·평가 결과는 발행하지 않는다.

경쟁하는 파일 열기·저장·다른 모델링·변형·선택은 drawing/committing 동안 기존 busy 경계로 잠근다.
모드 변경과 명시 조형 취소는 계속 사용할 수 있다. [조형 도구 UI](../../apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccSculptTools.tsx)는
원본 cage·단일 undo·취소와 오류를 한글/영문 문구·status/alert로 안내한다.

네이티브 Core의 PerformanceMonitor에 의한 자동 DPR 저하는 제거했다.
기존 명시 min/max 해상도 profile은 유지하며 dependency·장면 예산·사용자 선택을 변경하지 않는다.
BG3D의 별도 품질 governor·복구 정책은 공간 모델러 세션 소유이며 이 변경으로 해결됐다고 판정하지 않는다.

## target — 실행 검증과 남은 기능

공유 릴리스 quiet 때문에 이 후속 source의 새 검사는 아직 실행하지 않았다.
기존 CPU 453개와 작은 MToon hardware 캡처 14개는 이번 조형 입력·snapshot·DPR 변경의 통과 증거가 아니다.

작성된 회귀는 kernel 직접 순회와의 Float32·UV·속성·hash 일치, 순수 source 불변,
다중 sample의 단일 command/undo·redo·bridge, 취소/중간 오류/opaque receipt/stale scope,
작업파일·GLB·메모리 OPFS checkpoint, host의 auth/workspace ABA·자기 busy·늦은 rAF와
committing Escape/blur를 다룬다. pointer와 snapshot 회귀도 같은 변경의 검증 대상이다.
소스에 테스트가 있다는 사실을 통과 결과로 세지 않는다.

후속 실행 순서는 단일 worker 집중 회귀, scoped lint/Secretlint, 문서·하네스·source-size·eager graph,
정확한 후보 SHA의 타입·아키텍처·프로덕션 build, 실제 Chrome 제품 flow 순이다.
실제 UI에서는 drag 도중 원본 hash 불변·임시 화면 변화, 한 번 undo로 전체 drag 복원,
Escape 뒤 늦은 pointerup에도 원본·undo/redo·화면 유지, 저장·재열기 결과를 확인해야 한다.
macOS STP·실 펜·pressure/spacing·모든 GPU의 품질·성능은 별도 증거가 필요하다.

현재 고정 radius/strength와 grab 방향은 부모 수학을 유지한다. mask 저작 UI·새 pressure/resampling,
Multires·동적 topology·대형 GPU Sculpt·deformed modifier의 역매핑은 이번 소스로 완료되지 않는다.
성능 판정은 sparse/dense 입력을 같은 결과로 측정한 뒤 기록한다.

관련 기준: [모델러 조사 원장](web-modeler-research-ledger-2026-10-29.md),
[브라우저·엔진 품질 기준](3d-browser-engine-quality-policy-2026-10-29.md).
