# 스튜디오 드로잉 코디네이터 후속 티켓 — Procreate/ibisPaint 벤치마킹 (2026-09-30 · 2026-11-21 현황 정비)

리포트: `~/workspace/mobile-draw-benchmark-2026-09-30.md`
상태 표기 기준: **구현·실마운트 완료**와 **단위 엔진 구현·호스트 연결 잔여**, **실기기/브라우저 터치 E2E 미실행**을 분리해 기록한다.

## 2026-11-21 검증 요약 (단위 테스트 실측)

- 실행 명령: `pnpm exec vitest run apps/web/src/domains/creator/touch-gestures/touch-gesture-model.test.ts apps/web/src/domains/creator/studio-cuttoon-editor/studio-touch-gesture-policy.test.ts apps/web/src/domains/creator/studio-cuttoon-editor/StudioRadialQuickWheel.test.tsx apps/web/src/domains/creator/drawing/studio-hover-eyedropper-and-assist.test.ts apps/web/src/domains/creator/drawing/StudioEdgeQuickSlidersAndHoldEyedropper.test.tsx apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.trio-gestures.test.tsx apps/web/src/domains/creator/brush/StudioFloodFillPanel.colordrop.test.tsx apps/web/src/domains/creator/brush/StudioBrushStudio.test.tsx`
- 결과: **8개 테스트 파일 / 86개 테스트 통과** (`2026-11-21` 로컬 실행).
- 미실행 영역: 실기기(iPad/Android 태블릿) 멀티터치·스타일러스 호버·팜 리젝션 브라우저/기기 E2E는 본 라운드에서 별도 미실행.

## P0 (모바일 드로잉 최소 신뢰선)

- **T1. 제스처 undo/redo** — *부분 완료 (정책·2/3/4손가락 탭 호스트 연결 완료, 홀드 스크럽 런타임 통합 잔여)*
  - 구현·연결: `studio-touch-gesture-policy.ts`, `studio-mobile-history-touch-gesture-host.ts` (`useStudioMobileHistoryTouchGestures`), 순수 모델 `touch-gestures/touch-gesture-model.ts` (`touch-gesture-model.test.ts` 34/34, `studio-touch-gesture-policy.test.ts` 통과).
  - 잔여: `touch-gesture-model.ts`의 홀드 연속 스크럽(2손가락 Undo / 3손가락 Redo)과 실캔버스 호스트 단일 통합 및 터치 브라우저 E2E 확인.
- **T5. 팜 리젝션** — *구현·호스트 연결 완료 (단위 검증 통과, 실기기 터치 E2E 잔여)*
  - 구현·연결: `studio-cuttoon-stage-pointers-down-draw.ts`(`touchPrefs.palmRejection` 펜 세션 중 터치 차단), `StudioEdgeQuickSlidersAndHoldEyedropper.tsx`(`palmRejectionEnabled` 기본 활성), `StudioAppSettingsEditor.tsx` 토글, `canvas/studio-pointer-input.ts`.

## P1 (Procreate급 완성도)

- **T2. QuickMenu (6슬롯 커스텀 팝업)** — *구현·실마운트 완료 (단위 검증 통과)*
  - `StudioRadialQuickWheel.tsx` + `drawing/studio-quickmenu-preferences.ts` (`StudioDrawingQuickErgonomicsBar.tsx` 지연 마운트, `StudioRadialQuickWheel.test.tsx` 통과).
- **T3. 압력 곡선 (베지어 직접 편집)** — *구현·실마운트 완료*
  - `StudioPressureCurveEditor.tsx`, `StudioPressureCurveGraph.tsx`, `StudioPressureCalibrationPanel.tsx`, `brush/studio-pressure-curve-editor.ts`.
- **T4. 호버 프리뷰 (펜촉·기울기·회전)** — *엔진·프리뷰 구현 완료 (단위 검증 통과, 실기기 펜 호버 E2E 잔여)*
  - `drawing/studio-hover-eyedropper-and-assist.ts`(`computeStylusHoverCursorProjection`, `studio-hover-eyedropper-and-assist.test.ts` 통과), `StudioNaturalMediaShowcase.tsx`.
- **T6. ColorDrop (임계값 스크럽)** — *구현·검증 완료*
  - `StudioFloodFillPanel.tsx` (`StudioFloodFillPanel.colordrop.test.tsx` 2/2 통과).
- **T7. QuickShape (도형 스냅·노드 편집)** — *구현 완료*
  - `StudioQuickShapePanel.tsx`, `ai/studio-smart-shape-brush-effect-entry-boundary.test.ts`.
- **T9. 레이어 트리오 + 제스처 (Clipping / Alpha Lock / Reference)** — *구현·실마운트 완료 (단위 검증 통과)*
  - `layer/studio-layer-row-trio-gestures.ts`, `layer/StudioLayerNavigatorItemRow.tsx` (`StudioLayerNavigatorItemRow.trio-gestures.test.tsx` 2/2 통과).

## P2 (차별화)

- **T8. 드로잉 가이드 (그리드·원근·대칭·Drawing Assist 스냅)** — *구현 완료 (단위 검증 통과)*
  - `brush/studio-drawing-assist-document.ts`, `drawing/studio-hover-eyedropper-and-assist.ts`, `canvas/StudioCanvasGuideLayers.tsx`.
- **T10. 브러시 스튜디오 (풀 에디터·복구 경로)** — *구현·실마운트 완료 (단위 검증 통과)*
  - `brush/StudioBrushStudio.tsx` (`StudioBrushStudio.test.tsx` 26/26 통과).
- **T11. 과정 기록·리플레이 (타임랩스 WebM · 0.5x–4x)** — *패널·출고 엔진 구현 완료*
  - `StudioTimelapsePanel.tsx`, `export/studio-timelapse-and-psd-exporter.ts`, `timelapse-share/studio-timelapse-export-pipeline.ts`.
- **T12. 터치-홀드 스포이드 + 가장자리 퀵 슬라이더** — *구현·실마운트 완료 (단위 검증 통과)*
  - `drawing/StudioEdgeQuickSlidersAndHoldEyedropper.tsx` (`StudioCuttoonEditorCanvasColumn.tsx` 지연 마운트, `StudioEdgeQuickSlidersAndHoldEyedropper.test.tsx` 3/3 통과).
