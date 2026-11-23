import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

/** Pointer modules in original bindStudioCuttoonStagePointers function order. */
export const STUDIO_CUTTOON_STAGE_POINTER_FILES = [
  "./studio-cuttoon-stage-pointers-types.ts",
  "./studio-cuttoon-stage-pointers.ts",
  "./studio-cuttoon-stage-pointers-down.ts",
  "./studio-cuttoon-stage-pointers-down-armed.ts",
  "./studio-cuttoon-stage-pointers-down-pixel.ts",
  "./studio-cuttoon-stage-pointers-down-draw.ts",
  "./studio-cuttoon-stage-pointers-snap.ts",
  "./studio-cuttoon-stage-pointers-move.ts",
  "./studio-cuttoon-stage-pointers-move-handler.ts",
  "./studio-cuttoon-stage-pointers-fixed-rate.ts",
  "./studio-cuttoon-stage-pointers-freehand.ts",
  "./studio-cuttoon-stage-pointers-batch.ts",
  "./studio-cuttoon-stage-pointers-publish.ts",
  "./studio-cuttoon-stage-pointers-queue.ts",
  "./studio-cuttoon-stage-pointers-release.ts",
  "./studio-cuttoon-stage-pointers-finish.ts",
  "./studio-cuttoon-stage-pointers-finish-handler.ts",
  "./studio-cuttoon-stage-pointers-up.ts",
  "./studio-cuttoon-stage-pointers-cursors.ts",
  "./studio-cuttoon-stage-pointers-drag.ts",
] as const;

export function readStudioCuttoonStagePointersSource(): string {
  return STUDIO_CUTTOON_STAGE_POINTER_FILES
    .map((rel) => readFileSync(resolve(baseDir, rel), "utf8"))
    .join("\n");
}

/**
 * Boundary tests used to source-scan StudioPage.tsx for editor-owned
 * handlers. Pointer/view extracts live beside the page, so tests should
 * read the composed editor surface instead of a single file.
 */
/** Page entry + extracted editor host. Boundary scans that used to read only StudioPage.tsx. */
export function readStudioPageCompositionSource(): string {
  return [
    resolve(baseDir, "../StudioPage.tsx"),
    // 래칫 2라운드로 분리된 삽입·채우기 어댑터 — 호스트 배선 단언이 닿도록 합성에 포함한다.
    resolve(baseDir, "./studio-cuttoon-bg3d-insert.ts"),
    resolve(baseDir, "./studio-cuttoon-advanced-fill-run.ts"),
    resolve(baseDir, "../StudioCuttoonEditorHost.tsx"),
    resolve(baseDir, "../canvas/studio-canvas-viewport-input.ts"),
    // The route-layering refactor (984251d8c) moved host wiring into these runtimes. A scan that
    // reads only the page and the host now stops short of the code it is asserting on.
    resolve(baseDir, "./runtime/useStudioCollaborationAccessRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioCommentDocumentsRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioCrdtRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioDocumentAccessRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioDocumentSidecarsRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioDraftCollaborationRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioHistoryDurability.ts"),
    resolve(baseDir, "./runtime/useStudioHistoryRetention.ts"),
    resolve(baseDir, "./runtime/useStudioHydrationRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioLayerLiftRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioLiveSessionRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioMutationAuthorityRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioPageHistorySnapshots.ts"),
    resolve(baseDir, "./runtime/useStudioPreferencesRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioRasterPublicationRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioSharedDocumentRevalidation.ts"),
    resolve(baseDir, "./runtime/useStudioTournamentPersistenceBoot.ts"),
    resolve(baseDir, "./runtime/useStudioUnifiedHistoryJournal.ts"),
    resolve(baseDir, "./runtime/useStudioVectorOperationRuntime.ts"),
    // Phase 5B(2026-11-22) 호스트 분리 도메인 헬퍼 7종 — 합성 경계 검사가 분리된 배선까지 읽도록 포함한다.
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-canvas-element-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-comment-projection-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-liquify-and-selection-pointer-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-options-and-menu-derivations.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-publish-continuity-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-raster-edit-and-shape-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-view-and-resize-helpers.ts"),
    // Wave 2(2026-11-23) 호스트 2차 안전 분리 도메인 헬퍼 6종 — 합성 경계 검사에 포함한다.
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-ai-assist-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-draw-options-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-element-layout-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-live-ink-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-pixel-retouch-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-workspace-helpers.ts"),
    // Wave 5(2026-11-23) 호스트 3차 안전 분리 도메인 헬퍼 8종 — 합성 경계 검사에 포함한다.
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-assets-catalog-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-comments-companion-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-pixel-selection-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-pixel-stroke-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-project-save-export-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-server-revision-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-viewport-lifecycle-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-workspace-surface-helpers.ts"),
    // Wave 6(2026-11-23) 호스트 4차 안전 분리 도메인 헬퍼 11종 — 합성 경계 검사에 포함한다.
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-ai-generation-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-asset-and-authority-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-async-actions.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-content-insert-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-live-ink-and-gpu-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-pixel-and-retouch-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-redo-and-history-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-surface-and-comment-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-surface-handlers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-tool-memory-and-brush-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-ui-effects-and-resize-helpers.ts"),
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

export function readStudioCuttoonEditorSource(): string {
  return [
    // Extracted pure helpers come first so source slices that start at an
    // extracted symbol still reach their StudioPage.tsx end boundary.
    // The save pipeline is intentionally FIRST: save-contract tests slice it
    // directly, and leading the concat keeps its tokens out of every
    // cross-file slice that starts in a later extracted file.
    resolve(baseDir, "../studio-page-save-pipeline.ts"),
    resolve(baseDir, "../canvas/studio-hokusai-gpu-plan-matchers.ts"),
    resolve(baseDir, "../export/studio-interchange-import.ts"),
    resolve(baseDir, "../layer/studio-layer-operations.ts"),
    resolve(baseDir, "../layer/studio-layer-lift-session.ts"),
    resolve(baseDir, "./studio-pixel-tool-sessions.ts"),
    resolve(baseDir, "../studio-page-advanced-fill.ts"),
    resolve(baseDir, "../canvas/studio-zoom-gesture-engine.ts"),
    resolve(baseDir, "../studio-page-menu-asset-loaders.ts"),
    resolve(baseDir, "../studio-page-companion-runtime.ts"),
    resolve(baseDir, "../export/studio-publish-package-export.ts"),
    resolve(baseDir, "../live/studio-collaboration-wiring.ts"),
    resolve(baseDir, "../studio-collaboration-lock-copy.ts"),
    resolve(baseDir, "./studio-deferred-stroke-commit.ts"),
    // 분리된 라이브 표면의 입장·거절 조건도 기존 경계 검증에 포함한다.
    resolve(baseDir, "./studio-live-surface-start.ts"),
    // 래칫 2라운드 분리 — 3D 배경 삽입·고급 채우기 실행 어댑터도 합성 표면에 포함한다.
    resolve(baseDir, "./studio-cuttoon-bg3d-insert.ts"),
    resolve(baseDir, "./studio-cuttoon-advanced-fill-run.ts"),
    resolve(baseDir, "./studio-asset-library-mutations.ts"),
    resolve(baseDir, "../studio-page-shortcut-dispatcher.ts"),
    resolve(baseDir, "../studio-page-comments-runtime.ts"),
    resolve(baseDir, "../studio-page-autosave-runtime.ts"),
    resolve(baseDir, "../contracts/studio-hybrid-dcc-persistence.ts"),
    resolve(baseDir, "../hybrid-dcc/studio-hybrid-dcc-persistence.ts"),
    // DCC 라우트/내비게이션 절반. 지속성 절반 바로 뒤에 둬서 세 조각이 인접하게 읽힌다.
    resolve(baseDir, "../studio-router/studio-dcc-workbench-navigation.ts"),
    resolve(baseDir, "../studio-router/StudioDccWorkbenchRoute.tsx"),
    resolve(baseDir, "../studio-page-workspace-persistence.ts"),
    resolve(baseDir, "../render/studio-hokusai-natural-media-replacement.ts"),
    resolve(baseDir, "../render/studio-live-stroke-gpu-audit.ts"),
    resolve(baseDir, "../render/studio-live-stroke-gpu-append.ts"),
    resolve(baseDir, "../studio-auto-actions-controller.ts"),
    resolve(baseDir, "./studio-align-selected.ts"),
    resolve(baseDir, "../studio-drawing-assist-handlers.ts"),
    resolve(baseDir, "../studio-team-comment-read-marking.ts"),
    resolve(baseDir, "../studio-page-clipboard-controller.ts"),
    resolve(baseDir, "../canvas/studio-page-view-controller.ts"),
    resolve(baseDir, "../page/studio-page-management-controller.ts"),
    resolve(baseDir, "../history/studio-page-sidecars-controller.ts"),
    resolve(baseDir, "../vector/studio-node-bubble-edit-controller.ts"),
    resolve(baseDir, "../contracts/studio-bg3d-lt-copy-remap.ts"),
    resolve(baseDir, "../filter/studio-retouch-mask-tools-controller.ts"),
    resolve(baseDir, "../canvas/studio-crop-panel-split-controller.ts"),
    resolve(baseDir, "../checkpoint/studio-checkpoints-controller.ts"),
    resolve(baseDir, "../template/studio-template-layout-controller.ts"),
    resolve(baseDir, "../selection/studio-selection-transform-controller.ts"),
    resolve(baseDir, "../comipo/studio-quick-comic-controller.ts"),
    // Host runtimes extracted by the route-layering refactor (984251d8c). They hold wiring
    // that used to sit in the host body, so a scan that stops at the host now misses it —
    // which is what reddened twenty-five boundary suites. Listed before the host for the
    // same reason as the helpers above: a slice starting at an extracted symbol has to be
    // able to run forward into StudioPage.tsx.
    resolve(baseDir, "./runtime/useStudioCollaborationAccessRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioCommentDocumentsRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioCrdtRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioDocumentAccessRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioDocumentSidecarsRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioDraftCollaborationRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioHistoryDurability.ts"),
    resolve(baseDir, "./runtime/useStudioHistoryRetention.ts"),
    resolve(baseDir, "./runtime/useStudioHydrationRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioLayerLiftRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioLiveSessionRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioMutationAuthorityRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioPageHistorySnapshots.ts"),
    resolve(baseDir, "./runtime/useStudioPreferencesRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioRasterPublicationRuntime.ts"),
    resolve(baseDir, "./runtime/useStudioSharedDocumentRevalidation.ts"),
    resolve(baseDir, "./runtime/useStudioTournamentPersistenceBoot.ts"),
    resolve(baseDir, "./runtime/useStudioUnifiedHistoryJournal.ts"),
    resolve(baseDir, "./runtime/useStudioVectorOperationRuntime.ts"),
    // Phase 5B(2026-11-22) 호스트 분리 도메인 헬퍼 7종 — 분리된 심볼에서 시작하는 슬라이스가 호스트 본문까지 이어지도록 호스트 앞에 배치한다.
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-canvas-element-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-comment-projection-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-liquify-and-selection-pointer-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-options-and-menu-derivations.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-publish-continuity-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-raster-edit-and-shape-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-view-and-resize-helpers.ts"),
    // Wave 2(2026-11-23) 호스트 2차 안전 분리 도메인 헬퍼 6종 — 호스트 본문 앞에 배치한다.
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-ai-assist-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-draw-options-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-element-layout-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-live-ink-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-pixel-retouch-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave2-workspace-helpers.ts"),
    // Wave 5(2026-11-23) 호스트 3차 안전 분리 도메인 헬퍼 8종 — 호스트 본문 앞에 배치한다.
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-assets-catalog-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-comments-companion-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-pixel-selection-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-pixel-stroke-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-project-save-export-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-server-revision-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-viewport-lifecycle-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave5-workspace-surface-helpers.ts"),
    // Wave 6(2026-11-23) 호스트 4차 안전 분리 도메인 헬퍼 11종 — 호스트 본문 앞에 배치한다.
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-ai-generation-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-asset-and-authority-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-async-actions.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-content-insert-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-live-ink-and-gpu-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-pixel-and-retouch-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-redo-and-history-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-surface-and-comment-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-surface-handlers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-tool-memory-and-brush-helpers.ts"),
    resolve(baseDir, "../studio-cuttoon-edit/studio-host-wave6-ui-effects-and-resize-helpers.ts"),
    resolve(baseDir, "../StudioCuttoonEditorHost.tsx"),
    resolve(baseDir, "../canvas/studio-canvas-viewport-input.ts"),
    resolve(baseDir, "../StudioPage.tsx"),
    resolve(baseDir, "../studio-page-vector-ops.ts"),
    resolve(baseDir, "../ai/studio-scenario-image-generation.ts"),
    resolve(baseDir, "../bg3d/studio-bg3d-lt-apply.ts"),
    resolve(baseDir, "../studio-page-editor-ui-contracts.ts"),
    resolve(baseDir, "../studio-page-shell-runtime.ts"),
    resolve(baseDir, "../studio-page-editor-runtime-loaders.ts"),
    resolve(baseDir, "../studio-legacy-editor-runtime-helpers.ts"),
    ...STUDIO_CUTTOON_STAGE_POINTER_FILES.map((rel) => resolve(baseDir, rel)),
    resolve(baseDir, "./StudioCuttoonEditorView.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorHosts.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorDialogs.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorChrome.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorWorkspace.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorCanvasColumn.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorInspectorColumn.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorPanels.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorSessionDialogs.tsx"),
    resolve(baseDir, "./StudioCuttoonEditorContextMenu.tsx"),
    resolve(baseDir, "../studio-page-editor-types.ts"),
    resolve(baseDir, "../studio-page-comipo-seeds.ts"),
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}
