/* Extracted render tree from StudioCuttoonEditor.
 * Session props are an `any` bag matching the original editor closure. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).
import { StudioAppliedFilterPresentation } from "../filter/StudioAppliedFilterPresentation";
import { StudioColorWorkspaceProvider } from "../color/StudioColorWorkspaceContext";
import { Maximize2 } from "lucide-react";
import { StudioLiveCollaborationProviderLazy as StudioLiveCollaborationProvider } from "../live/StudioLiveCollaborationProviderLazy";
import { STUDIO_ICON_SIZE, STUDIO_ICON_STROKE, studioChromeIconClass } from "../studio-chrome-ui";
import { lazy, Suspense, useLayoutEffect, useState } from "react";
import { cancelPendingStudioAllTools } from "../studio-toolbar-channel";
import { StudioHelpCenterHost } from "../StudioHelpCenterHost";
import { returnFromStudioEditorInBrowser } from "../studio-editor-return-navigation";
import { StudioEditorReturnButton } from "../StudioEditorReturnButton";
import { useStudioDrawingPresentation } from "../studio-drawing-presentation";
import { StudioToolHintPreferencesProvider } from "../StudioToolHint";
import { StudioWorkspaceNavigator } from "../StudioWorkspaceNavigator";
import { Container } from "@/shared/components/container";
import { cn } from "@/shared/lib/utils";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { StudioOfflineOwnerPreviewVisibility, type StudioOfflinePreviewDisplay } from "../offline/studio-offline-owner-preview-visibility";
import { StudioCuttoonEditorChrome } from "./StudioCuttoonEditorChrome";
import { StudioCuttoonEditorDialogs } from "./StudioCuttoonEditorDialogs";
import { StudioCuttoonEditorHosts } from "./StudioCuttoonEditorHosts";
import { StudioCuttoonEditorWorkspace } from "./StudioCuttoonEditorWorkspace";
import { StudioDrawingClarityProvider } from "./StudioDrawingClarity";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import { StudioScopedWriteTargetPicker } from "./StudioScopedWriteTargetPicker";
import { StudioScopedWriteAuthorityContext } from "../studio-collab/studio-scoped-write-context";
import { hasVisibleLegacyMixboxStrokes } from "../brush-lab/brush-studio-v6-legacy-pigment";
import type { StudioLinkedCutRefreshRequest } from "../character-shaper/StudioCharacterCutRefreshRunner";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

import "../studio-shell/studio-visual-identity.css";
import "../studio-shell/studio-visual-identity-v2.css";

const StudioCuttoonEditorContextMenu = lazy(() => import("./StudioCuttoonEditorContextMenu").then(module => ({ default: module.StudioCuttoonEditorContextMenu })));
const StudioCharacterCutRefreshRunner = lazyRetry(() => import("../character-shaper/StudioCharacterCutRefreshRunner"), "StudioCharacterCutRefreshRunner");
const StudioDraftSaveCenter = lazy(() => import("../StudioDraftSaveCenter").then((module) => ({ default: module.StudioDraftSaveCenter })));
const StudioSaveStatusChromeMount = lazy(() => import("../StudioSaveStatusChromeMount").then((module) => ({ default: module.StudioSaveStatusChromeMount })));
const StudioDrawingAppBar = lazyRetry(
  () => import("./StudioDrawingAppBar").then((module) => ({ default: module.StudioDrawingAppBar })),
  "StudioDrawingAppBar",
);
const StudioLegacyPigmentStrokeMigration = lazy(() => import("../brush/StudioLegacyPigmentStrokeMigration"));
const StudioErgonomicsRuntimeHost = lazy(() =>
  import("../ergonomics/StudioErgonomicsRuntimeHost").then((module) => ({
    default: module.StudioErgonomicsRuntimeHost,
  })),
);

export type { StudioCuttoonEditorViewSession };

export function StudioCuttoonEditorView(s: StudioCuttoonEditorViewSession) {
  const drawingPresentation = useStudioDrawingPresentation();
  return <StudioDrawingClarityProvider session={s} presentation={drawingPresentation}><StudioCuttoonEditorViewContent {...s} /></StudioDrawingClarityProvider>;
}

function StudioCuttoonEditorViewContent(s: StudioCuttoonEditorViewSession) {
  const clarity = useStudioDrawingClarity();
  const [cutRefresh, setCutRefresh] = useState<StudioLinkedCutRefreshRequest | null>(null);
  const [previewDisplay, setPreviewDisplay] = useState<StudioOfflinePreviewDisplay | null>(null);
  const offlinePreviewPhase = previewDisplay && previewDisplay.workId === s.workId && s.sourceHydrationPending
    ? previewDisplay.phase : undefined;
  const visibleError = offlinePreviewPhase && s.error === s.workHydrationError ? null : s.error;
  const {
    activePage,
    appSettings,
    canvasOnlyMode,
    effectiveWorkId,
    handleStudioCrdtAuthoritativeSaveBarrierChange,
    handleStudioCrdtDocumentChange,
    handleStudioLiveEditSafetyChange,
    handleStudioLiveRoomChange,
    isFullscreen,
    isMobile,
    maximized,
    mobileImmersive,
    pagesHi,
    pagesHistory,
    rejectedStrokeCount,
    requiresStudioLiveServer,
    setCanvasOnlyMode,
    studioAuthUserId,
    studioHistoryRetention,
    studioLiveParticipant,
    studioLiveTransportFactory,
    studioRootRef,
    tool,
    uiDensityMode,
    workMode,
    watermarkPreferenceSnapshot,
  } = s;
  useLayoutEffect(() => {
    const scope = studioRootRef.current;
    return () => { if (scope) cancelPendingStudioAllTools(scope); };
  }, [studioRootRef, studioAuthUserId, effectiveWorkId, s.saveIntentScope?.documentKey]);
  const drawingPresentation = clarity?.presentation ?? "integrated";
  const drawingAppPresentation = drawingPresentation === "app";
  const legacyPagePigment = hasVisibleLegacyMixboxStrokes(s.elements, s.groups);
  const legacyMasterPigment = !s.masterEditMode && !s.activePage.hideMaster && hasVisibleLegacyMixboxStrokes(s.master.elements, []);

  return (
    <StudioScopedWriteAuthorityContext.Provider value={s.scopedWriteRuntime?.authority ?? null}>
    <StudioLiveCollaborationProvider
      workId={effectiveWorkId}
      participant={studioLiveParticipant}
      currentPageId={activePage.id}
      currentTool={tool}
      outboxScope={studioAuthUserId}
      transportFactory={studioLiveTransportFactory}
      serverRequired={Boolean(studioLiveParticipant && requiresStudioLiveServer)}
      onRoomChange={handleStudioLiveRoomChange}
      onCrdtDocumentChange={handleStudioCrdtDocumentChange}
      onEditSafetyChange={handleStudioLiveEditSafetyChange}
      onAuthoritativeSaveBarrierChange={handleStudioCrdtAuthoritativeSaveBarrierChange}
    >
    <StudioColorWorkspaceProvider value={{
      ownerKey: JSON.stringify([s.studioAuthUserId, s.effectiveWorkId, s.saveIntentScope, s.currentPageId]),
      selectionKey: JSON.stringify([s.selectedId, s.marqueeIds, s.tool, s.layerMaskPaintActive]),
      primary: s.color, secondary: s.studioOptionsBarsDrawModel.secondaryColor,
      elements: s.elements, pinned: s.appSettings.general.colorPanelPinned === true, isMobile: s.isMobile,
      onPrimaryChange: s.studioOptionsBarsHandlers.setColor,
      onSecondaryChange: s.studioOptionsBarsHandlers.setSecondaryColor,
      onPinnedChange: (pinned) => s.studioLeftToolRailHandlers.commitAppSettings({ ...s.appSettings, general: { ...s.appSettings.general, colorPanelPinned: pinned } }),
      onRevealDock: () => s.setRightPanelOpenWithOverride(true),
      onBeforePopupOpen: () => { if (s.isMobile) { s.setMobileSheet(null); s.setMenu(null); } },
      onRequestSample: s.studioInspectorAsideHandlers.requestInspectorColorSample,
    }}>
    <StudioToolHintPreferencesProvider
      mode={appSettings.general.toolHintMode}
      touchHoldDelayMs={appSettings.touch.toolHintHoldMs}
      reduceMotion={appSettings.other.reduceMotion}
    >
    <div
      id="studio-app-shell"
      ref={studioRootRef}
      data-studio-mobile-immersive={mobileImmersive ? "true" : "false"}
      data-studio-ui-density={uiDensityMode}
      data-studio-drawing-clarity={clarity?.active ? "true" : undefined}
      data-studio-drawing-clarity-panel={clarity?.active ? clarity.panel ?? undefined : undefined}
      data-studio-drawing-clarity-mobile={clarity?.active && isMobile ? "true" : undefined}
      data-studio-work-mode={workMode ?? "all"}
      data-studio-workspace-layout-source={s.studioDrawingClarityBaseline?.source}
      data-studio-drawing-presentation={drawingPresentation}
      data-studio-tool-hint-mode={appSettings.general.toolHintMode}
      data-studio-reduce-motion={appSettings.other.reduceMotion ? "true" : "false"}
      data-studio-device-kind={isMobile ? "mobile" : "desktop"}
      data-studio-editor="true"
      data-studio-app-shell="true"
      data-studio-watermark-persistence={watermarkPreferenceSnapshot.state}
      data-studio-history-entry-count={pagesHistory.length}
      data-studio-history-undo-depth={pagesHi}
      data-studio-history-last-measured-retained-bytes={
        studioHistoryRetention.lastMeasuredRetainedBytes
      }
      data-studio-history-last-measured-budget-bytes={
        studioHistoryRetention.lastMeasuredBudgetBytes
      }
      data-studio-history-last-measured-entry-bytes={
        studioHistoryRetention.lastMeasuredEntryBytes
      }
      data-studio-history-budget-evicted-steps={
        studioHistoryRetention.totalBudgetEvictedSteps
      }
      data-studio-history-total-appends={studioHistoryRetention.totalAppends}
      data-studio-rejected-stroke-count={rejectedStrokeCount ?? 0}
      className={cn(
        "flex min-h-0 flex-col bg-canvas text-fg",
        !maximized && !canvasOnlyMode && !mobileImmersive &&
          "h-[100dvh] max-h-[100dvh] overflow-hidden",
        isFullscreen && "bg-canvas",
        drawingAppPresentation && "isolate",
        maximized && !isMobile && !mobileImmersive &&
          "fixed inset-0 z-[60] overflow-y-auto bg-canvas",
        canvasOnlyMode &&
          "fixed inset-0 z-[70] h-[100dvh] overflow-hidden overscroll-none bg-canvas",
        mobileImmersive &&
          "fixed inset-0 z-[75] h-[100dvh] overflow-hidden overscroll-none bg-canvas"
      )}
      style={
        mobileImmersive
          ? {
              paddingTop: "env(safe-area-inset-top)",
              paddingLeft: "env(safe-area-inset-left)",
              paddingRight: "env(safe-area-inset-right)",
            }
          : undefined
      }
    >
      <StudioAppliedFilterPresentation
        scope={JSON.stringify([s.studioAuthUserId, s.saveIntentScope?.documentKey, s.effectiveWorkId, s.currentPageId])}
        selected={s.selectedId ? s.elementById.get(s.selectedId) : undefined}
      >
      {drawingAppPresentation ? (
        !canvasOnlyMode && !mobileImmersive ? (
          <Suspense fallback={null}><StudioDrawingAppBar session={s} /></Suspense>
        ) : null
      ) : (
        <StudioWorkspaceNavigator />
      )}
      <StudioCuttoonEditorHosts {...s} />
      {legacyPagePigment || legacyMasterPigment ? <div
        data-studio-legacy-pigment-notice="true"
        className={cn("min-w-0 shrink-0", mobileImmersive && !canvasOnlyMode &&
          "relative max-lg:z-[31] max-lg:mt-[var(--studio-immersive-menubar-block,4.25rem)]")}
      >
        <Suspense fallback={null}>
          <StudioLegacyPigmentStrokeMigration session={s} />
        </Suspense>
      </div> : null}
      <StudioCuttoonEditorDialogs {...s} />
      <Container
        size="wide"
        className={cn(
          "flex min-h-0 flex-1 flex-col !max-w-none !px-0 py-0",
          (isFullscreen || maximized) && "min-h-0"
        )}
      >
        <StudioCuttoonEditorChrome {...s} error={visibleError} />
        {s.saveSyncStore && !(drawingAppPresentation && !canvasOnlyMode && !mobileImmersive) ? (
          <Suspense fallback={null}>
            <StudioSaveStatusChromeMount
              store={s.saveSyncStore}
              onRequestSaveFlush={s.requestSaveFlush}
              onDownloadLocalBackup={() => { void s.studioMenubarContentHandlers.handleExportProject(); }}
              publishSuggestion={s.workMode === "finish" ? {
                // 1회성 기억의 단위는 문서(오토세이브 키)다 — 문서가 바뀌면 새 첫 게시 흐름으로 본다.
                scope: s.saveIntentScope?.documentKey ?? s.effectiveWorkId ?? s.workId ?? "new-work",
                cutCount: s.activePage?.elements?.length ?? 0,
                alreadyPublished: s.loadedWork?.status === "published",
                // "게시 준비 확인하기"의 도착지는 호스트의 게시 사전검사(게시 센터)다.
                onCheckPublishReady: () => s.setPublishPreflightOpen(true),
              } : undefined}
            />
          </Suspense>
        ) : null}
        <Suspense fallback={null}>
        <StudioDraftSaveCenter
          key={JSON.stringify([s.saveIntentScope, s.effectiveWorkId ?? s.workId ?? "new-work"])}
          saveIntentScope={s.saveIntentScope}
          offlineSceneNotice={s.offlineSceneNotice}
          onDismissOfflineSceneNotice={s.dismissOfflineSceneNotice}
          saving={s.saving}
          workId={s.workId}
          workHydrated={s.workHydrated}
          workHydrationFailed={s.workHydrationFailed}
          offlinePreviewPhase={offlinePreviewPhase}
          pendingSaveIntent={s.pendingSaveIntent}
          loadedWork={s.loadedWork}
          sharedDocument={s.sharedDocument}
          localCheckpointCount={s.checkpoints?.length ?? 0}
          serverCurrentRevision={s.serverCurrentRevision}
          serverRevisions={s.serverRevisions}
          serverRevisionLoading={s.serverRevisionLoading}
          serverRevisionError={s.serverRevisionError}
          autosaveDocumentLeadership={s.autosaveDocumentLeadership}
          collaborationOperationSyncPending={s.collaborationOperationSyncPending}
          collaborationDocumentLocked={s.collaborationDocumentLocked}
          error={visibleError}
          mobileImmersive={s.mobileImmersive}
          canvasOnlyMode={s.canvasOnlyMode}
          onSaveDraft={() => s.studioMenubarContentHandlers.handleSave("draft")}
          onContinuePendingSave={() => s.onContinuePendingSave()}
          onOpenVersions={() => s.setCheckpointPanelOpen(true)}
          onExportBackup={() => s.studioMenubarContentHandlers.handleExportProject()}
        />
        </Suspense>
        {s.scopedWriteRuntime ? <StudioScopedWriteTargetPicker runtime={s.scopedWriteRuntime} currentPageId={s.currentPageId} onPage={s.setCurrentPageId} onLayer={s.onScopedWriteLayer} onDraw={() => { s.activatePrimaryCanvasTool("draw", "pen"); }} /> : null}
        <StudioOfflineOwnerPreviewVisibility.Provider value={setPreviewDisplay}>
          <StudioCuttoonEditorWorkspace {...s} />
        </StudioOfflineOwnerPreviewVisibility.Provider>
        {s.contextMenu.visible && <Suspense fallback={null}>
          <StudioCuttoonEditorContextMenu {...s} onRefreshLinkedCuts={(documentId) => {
            if (!cutRefresh && s.currentPageIdRef.current === s.activePage.id) {
              setCutRefresh({ documentId, page: s.activePage, ticket: s.captureStudioMutationTicket() });
            }
          }} />
        </Suspense>}
        {cutRefresh && <Suspense fallback={null}>
          <StudioCharacterCutRefreshRunner request={cutRefresh} session={s} onClose={() => setCutRefresh(null)} />
        </Suspense>}
      </Container>
    {canvasOnlyMode ? (
      <div className="pointer-events-none fixed left-[env(safe-area-inset-left)] right-[env(safe-area-inset-right)] top-[max(0.5rem,env(safe-area-inset-top))] z-[80] flex flex-wrap justify-center gap-2 px-2">
        <StudioEditorReturnButton
          variant="canvas-only"
          onReturn={returnFromStudioEditorInBrowser}
          className="pointer-events-auto"
        />
        <button
          type="button"
          onClick={() => setCanvasOnlyMode(false)}
          className="pointer-events-auto inline-flex min-h-11 min-w-11 items-center gap-2 rounded-full border border-line bg-panel/95 px-3 text-xs font-semibold text-fg shadow-lg backdrop-blur transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          title="일반 편집 화면으로 복원 (Esc)"
        >
          <Maximize2
            size={STUDIO_ICON_SIZE.context}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioChromeIconClass({ tone: "accent" })}
          />
          도구막대 복원
          <kbd className="hidden rounded border border-line bg-card px-1.5 py-0.5 text-[0.65rem] font-medium text-fg-3 lg:inline">Esc</kbd>
        </button>
      </div>
    ) : null}
    <StudioHelpCenterHost />
    <Suspense fallback={null}>
      <StudioErgonomicsRuntimeHost
        studioRootRef={studioRootRef}
        workMode={workMode}
        tool={tool}
        drawMode={s.drawMode}
        eyedropperActive={s.eyedropperActive}
        colorWheelOpen={s.colorWheelOpen}
        colorRangePickActive={s.colorRangePickActive}
        pageGradePanelOpen={s.pageGradePanelOpen}
        advancedFillActive={s.advancedFillActive}
        wetMixActive={s.wetMixActive}
        dodgeBurnActive={s.dodgeBurnActive}
        isExporting={s.isExporting}
        exportMenuOpen={s.exportMenuOpen}
        colorBlindPreview={s.colorBlindPreview}
        activeMenu={s.menu}
        canvasOnlyMode={canvasOnlyMode}
        reduceMotion={appSettings.other.reduceMotion}
      />
    </Suspense>
      </StudioAppliedFilterPresentation>
    </div>
    </StudioToolHintPreferencesProvider>
    </StudioColorWorkspaceProvider>
    </StudioLiveCollaborationProvider>
    </StudioScopedWriteAuthorityContext.Provider>
  );
}
