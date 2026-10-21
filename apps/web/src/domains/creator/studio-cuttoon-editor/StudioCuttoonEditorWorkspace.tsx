/* Extracted render tree from StudioCuttoonEditor.
 * Session props are an `any` bag matching the original editor closure. */
// @ts-nocheck
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).
import { lazy, Suspense, useLayoutEffect, useState } from "react";
import { StudioCharmBarSlotLazy } from "../charm/StudioCharmBarSlotLazy";
import { createStudioLeftToolRailRuntime } from "../editor-client/studio-left-tool-rail-client";
import { LazyStudioLeftToolRail, LazyStudioPageListPane } from "../studio-page-modal-lazy-boundaries";
import { StudioWorkspaceArrangementToolbar } from "../StudioWorkspaceArrangementToolbar";
import { StudioWorkspaceRegion } from "../StudioWorkspaceRegion";
import { useStudioInspectorDockSide } from "../studio-inspector-dock";
import { cn } from "@/shared/lib/utils";
import { StudioCuttoonEditorCanvasColumn } from "./StudioCuttoonEditorCanvasColumn";
import { StudioCuttoonEditorInspectorColumn } from "./StudioCuttoonEditorInspectorColumn";
import { StudioCuttoonEditorPanels } from "./StudioCuttoonEditorPanels";
import { StudioCuttoonEditorSessionDialogs } from "./StudioCuttoonEditorSessionDialogs";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

import "./studio-cinematic-canvas-v4.css";

const LazyStudioBrushWorkbenchDock = lazy(() => import("../brush/StudioBrushWorkbenchDock").then((module) => ({ default: module.StudioBrushWorkbenchDock })));

const TOOL_RAIL_LAYOUT = { version: 2, xRatio: 0.02, yRatio: 0.1, width: 96, height: 720, dock: "free", positionLocked: false, sizeLocked: false } as const;

export function StudioCuttoonEditorWorkspace(s: StudioCuttoonEditorViewSession) {
  const {
    activeSurfaceReviewLocked,
    admittedBg3dOpen,
    admittedMannequinPoserOpen,
    admittedCharacterShaperOpen,
    admittedPoserVrmOpen,
    advancedFillActive,
    advancedFillUnsupportedReason,
    appSettings,
    appSettingsOpen,
    canvasOnlyMode,
    collaborationDocumentLocked,
    collaborationLockMessage,
    commentPlacementActive,
    composeWorkAssetPreviewPage,
    cropRect,
    currentPageId,
    dismissActiveMobileSheet,
    dodgeBurnActive,
    drawMode,
    drawShape,
    eyedropperActive,
    frameAnimOpen,
    frameAnimTargetId,
    hybridDccOpen,
    isMobile,
    isRailToolVisible,
    leftResize,
    liquifyActive,
    master,
    masterEditMode,
    masterPanelOpen,
    metaEditPageId,
    mobileImmersive,
    mobileKeyboardInset,
    mobileSheet,
    modalMobileSheet,
    pageDnd,
    pages,
    pagesSheetRef,
    perspectiveRulerActive,
    pixelForceCircle,
    pixelSel,
    pixelTool,
    pixelToolTargetAvailable,
    quickShapeActive,
    railMoreOpen,
    rasterRetouchTargetAvailable,
    referencePanelOpen,
    selected,
    selectedImageMutationLocked,
    setAppSettingsInitialTab,
    setAppSettingsOpen,
    setCurrentPageId,
    setDrawShape,
    setEyedropperActive,
    setHybridDccOpen,
    setLeftPanelOpenWithOverride,
    setMannequinPoserOpen,
    setMasterPanelOpen,
    setMenu,
    setMetaEditPageId,
    setMobileSheet,
    setPerspectiveRulerActive,
    setPixelForceCircle,
    setPixelTool,
    setPoserVrmOpen,
    setCharacterShaperOpen,
    setQuickShapeActive,
    setRailMoreOpen,
    setReferencePanelOpen,
    setViewTool,
    smudgeActive,
    studioLeftToolRailHandlers,
    studioPageListPaneHandlers,
    tool,
    uiDensityMode,
    workMode,
    uiChromeExposure,
    setUiAdvancedToolsExpanded,
    viewTool,
    viewTransformSuppressed,
    wetMixActive,
    presentationPanelsHidden,
    visibleLeftPanelOpen,
  } = s;
  // 작업 패널 도킹 방향(로컬 선호). 왼쪽 도킹이면 캔버스+인스펙터 행의 시각 순서만
  // 뒤집는다 — DOM 순서는 유지해 포커스·랜드마크 이동 계약을 바꾸지 않는다.
  const inspectorDockSide = useStudioInspectorDockSide();
  const studioLeftToolRailInput = {
    activeSurfaceReviewLocked,
    pixelToolTargetAvailable,
    rasterRetouchTargetAvailable,
    advancedFillActive,
    advancedFillUnsupportedReason,
    appSettings,
    appSettingsOpen,
    canvasOnlyMode,
    commentPinArmed: commentPlacementActive,
    cropActive: cropRect !== null,
    drawMode,
    drawShape,
    eyedropperActive,
    frameAnimOpen,
    frameAnimTargetId,
    isRailToolVisible,
    liquifyActive,
    mobileImmersive,
    perspectiveRulerActive,
    pixelForceCircle,
    pixelSel,
    pixelTool,
    quickShapeActive,
    railMoreOpen,
    referencePanelOpen,
    mannequinPoserOpen: admittedMannequinPoserOpen,
    poserVrmOpen: admittedPoserVrmOpen,
    characterShaperOpen: admittedCharacterShaperOpen,
    bg3dOpen: admittedBg3dOpen,
    hybridDccOpen,
    selected,
    selectedImageMutationLocked,
    dodgeBurnActive,
    wetMixActive,
    smudgeActive,
    tool,
    uiDensityMode,
    viewTransformSuppressed,
    viewTool,
    setAppSettingsInitialTab,
    setAppSettingsOpen,
    setDrawShape,
    setEyedropperActive,
    setMenu,
    setPerspectiveRulerActive,
    setPixelForceCircle,
    setPixelTool,
    setQuickShapeActive,
    setRailMoreOpen,
    setReferencePanelOpen,
    setMannequinPoserOpen,
    setPoserVrmOpen,
    setCharacterShaperOpen,
    setHybridDccOpen,
    setViewTool,
    ...studioLeftToolRailHandlers,
  };
  const [studioLeftToolRailRuntime] = useState(() =>
    createStudioLeftToolRailRuntime(studioLeftToolRailInput)
  );
  useLayoutEffect(() => {
    studioLeftToolRailRuntime.update(studioLeftToolRailInput);
  }, [studioLeftToolRailInput, studioLeftToolRailRuntime]);

  return (
      <div
        id="studio-workspace"
        role="group"
        aria-label="편집 작업공간"
        tabIndex={-1}
        data-studio-mobile-canvas-workspace={isMobile ? "true" : undefined}
        data-studio-cinematic-workspace="v4"
        className={cn(
          // Edge-dock workspace: the mobile dock overlays the scrollport instead of shrinking this
          // flex lane. StudioCanvasViewport owns the matching scroll-safe inset, so the final canvas
          // pixels remain reachable while the full dynamic viewport stays available for drawing.
          "relative flex min-h-0 flex-1 flex-col gap-0 pb-0 lg:flex-row lg:overflow-hidden",
          canvasOnlyMode && "overflow-hidden",
          mobileImmersive && "overflow-hidden"
        )}
      >
        {/* 모달 시트 전용 스크림. 브러시 설정(draw)은 캔버스를 계속 만질 수 있는 비모달이다. */}
        {isMobile && modalMobileSheet && (
          <div
            aria-hidden
            data-studio-modal-backdrop="true"
            onPointerDown={(event) => {
              // The scrim itself is not a focus target. Prevent the pointer's default focus move
              // from overriding the modal controller's launcher-focus restoration during unmount.
              event.preventDefault();
              dismissActiveMobileSheet();
            }}
            className="fixed inset-0 z-[59] bg-black/45 backdrop-blur-sm lg:hidden"
          />
        )}
        {/* 왼쪽: 페이지 목록 — 접히면 아이콘 엣지 레일.
            Work-mode gate: this pane is the "page-strip" + "left-panel" chrome.
            When the composed gate (uiChromeExposure, density × work mode)
            folds either region, the pane mounts as a slim folded strip whose
            expand button reuses the density advanced-expansion choice — the
            same pattern as the tool-rail gate below. Neither region is folded
            by the current work-mode matrix and mode "all" returns the density
            verdict unchanged, so the pane renders exactly as before until a
            mode actually folds it. An unwired host (no uiChromeExposure)
            keeps the pane mounted, as before. */}
        {uiChromeExposure
          && (uiChromeExposure("page-strip") === "folded" || uiChromeExposure("left-panel") === "folded") ? (
          <div
            data-studio-page-list-folded={workMode ?? undefined}
            className="hidden w-12 shrink-0 flex-col items-center border-r border-line bg-panel py-2 lg:flex"
          >
            <button
              type="button"
              onClick={() => setUiAdvancedToolsExpanded?.(true)}
              aria-label="접힌 페이지 목록 펼치기"
              title="이 단계에서는 페이지 목록을 접어 둡니다. 펼치면 바로 쓸 수 있어요."
              className="min-h-11 rounded-full border border-line px-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-panel"
            >
              페이지 펼치기
            </button>
          </div>
        ) : (
        <Suspense
          fallback={(
            <div
              aria-hidden="true"
              data-studio-page-list-loading="true"
              className="hidden w-12 shrink-0 border-r border-line bg-panel lg:block"
            />
          )}
        >
          <LazyStudioPageListPane
            collaborationDocumentLocked={collaborationDocumentLocked}
            collaborationLockMessage={collaborationLockMessage}
            composeWorkAssetPreviewPage={composeWorkAssetPreviewPage}
            currentPageId={currentPageId}
            isMobile={isMobile}
            leftResize={leftResize}
            master={master}
            masterEditMode={masterEditMode}
            masterPanelOpen={masterPanelOpen}
            metaEditPageId={metaEditPageId}
            mobileKeyboardInset={mobileKeyboardInset}
            mobileSheet={mobileSheet}
            pageDnd={pageDnd}
            pages={pages}
            pagesSheetRef={pagesSheetRef}
            presentationPanelsHidden={presentationPanelsHidden}
            setCurrentPageId={setCurrentPageId}
            setLeftPanelOpen={setLeftPanelOpenWithOverride}
            setMasterPanelOpen={setMasterPanelOpen}
            setMetaEditPageId={setMetaEditPageId}
            setMobileSheet={setMobileSheet}
            visibleLeftPanelOpen={visibleLeftPanelOpen}
            stableHandlers={studioPageListPaneHandlers}
          />
        </Suspense>
        )}

        {/* Left vertical toolbar — desktop only; mobile uses bottom dock / horizontal belt.
            Work-mode gate: "tool-rail" is folded by the lettering/finish modes
            (studio-work-mode.ts). When the composed gate (uiChromeExposure,
            density × work mode) says folded, the rail mounts as a slim folded
            strip instead; its expand button reuses the density
            advanced-expansion choice, so expanding restores the rail without
            changing the work mode. An unwired host (no uiChromeExposure)
            keeps the rail mounted, as before. */}
        {uiChromeExposure && uiChromeExposure("tool-rail") === "folded" ? (
          <div
            data-studio-tool-rail-folded={workMode ?? undefined}
            className="hidden w-12 shrink-0 flex-col items-center border-r border-line bg-panel py-2 lg:flex"
          >
            <button
              type="button"
              onClick={() => setUiAdvancedToolsExpanded?.(true)}
              aria-label="접힌 도구 레일 펼치기"
              title="이 단계에서는 도구 레일을 접어 둡니다. 펼치면 바로 쓸 수 있어요."
              className="min-h-11 rounded-full border border-line px-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-panel"
            >
              도구 펼치기
            </button>
          </div>
        ) : (
        <StudioWorkspaceRegion
          surfaceId="tool-rail"
          label="그리기 도구"
          defaultLayout={TOOL_RAIL_LAYOUT}
          disabled={isMobile || canvasOnlyMode || mobileImmersive || presentationPanelsHidden}
          minWidth={80}
          minHeight={240}
          maxWidth={320}
          allowedDockEdges={["left", "right"]}
        >
        <Suspense
          fallback={(
            <div
              aria-hidden="true"
              data-studio-left-tool-rail-loading="true"
              className="hidden w-12 shrink-0 border-r border-line bg-panel lg:block"
            />
          )}
        >
        <LazyStudioLeftToolRail client={studioLeftToolRailRuntime.client} />
        </Suspense>
        </StudioWorkspaceRegion>
        )}

        {!isMobile && !canvasOnlyMode && !mobileImmersive && !presentationPanelsHidden
          && s.studioOptionsBarsDrawModel.libraryDockOpen ? (
          <Suspense fallback={<div role="status" className="hidden w-64 shrink-0 border-r border-line bg-panel p-3 text-sm text-fg-2 lg:block xl:w-[17rem]">브러시 라이브러리를 여는 중…</div>}>
            <LazyStudioBrushWorkbenchDock
              key={`${s.studioOptionsBarsDrawModel.workspaceOwnerScope}:${drawMode === "eraser" ? "erase" : "paint"}`}
              width={s.appSettings.general.brushPanelWidth ?? 240}
              onWidthChange={(width) => s.studioLeftToolRailHandlers.commitAppSettings({ ...s.appSettings, general: { ...s.appSettings.general, brushPanelWidth: width } })}
              sizeLocked={s.proDrawPrefs.sizeLocked} opacityLocked={s.proDrawPrefs.opacityLocked}
              onToggleSizeLock={s.studioOptionsBarsHandlers.toggleSizeLock}
              onToggleOpacityLock={s.studioOptionsBarsHandlers.toggleOpacityLock}
              modifiedCount={s.studioOptionsBarsDrawModel.brushDefaultRestore?.modifiedCount ?? 0}
              onRestoreDefaults={s.studioOptionsBarsHandlers.restoreBrushDefaults}
              activeBrushId={s.activeCatalogBrush.id}
              operation={drawMode === "eraser" ? "erase" : "paint"}
              favoriteIds={s.proDrawPrefs.favoriteBrushIds}
              recentIds={s.proDrawPrefs.recentBrushIds}
              restoredView={s.proDrawPrefs.brushLibraryView[drawMode === "eraser" ? "erase" : "paint"]}
              onViewStateChange={(view) => s.studioBrushCatalogHandlers.rememberView?.(view, drawMode === "eraser" ? "erase" : "paint", s.studioOptionsBarsDrawModel.workspaceOwnerScope)}
              onSelect={s.applyStudioBrushCatalogSelection}
              onSelectionLifecycle={s.studioBrushCatalogHandlers.selectionLifecycle}
              onToggleFavorite={s.studioBrushCatalogHandlers.toggleFavorite}
              onCollapse={s.studioOptionsBarsHandlers.toggleBrushDock}
              onOpenBrushStudio={s.studioOptionsBarsHandlers.openBrushStudio}
              expanded={s.brushCatalogSession?.placement === "desktop-dock"}
              onExpandCatalog={(trigger) => s.studioBrushCatalogHandlers.toggle("desktop-dock", trigger)}
            />
          </Suspense>
        ) : null}
        {/* 참(Charm) 바 — 자주 쓰는 소재를 한 번에 붙이는 도킹 가능한 소형 패널. 꺼져 있으면 아무것도 그리지 않는다.
            슬롯째 지연 로드한다(`StudioCharmBarSlotLazy`): 정적으로 가져오면 Studio 첫 청크 그래프가 커져 번들 래칫을 깬다. */}
        <StudioCharmBarSlotLazy session={s} />
        {/* 중앙: 캔버스 + 우측 인스펙터 — 데스크톱에서는 한 행으로 남은 높이를 공유한다.
            패널을 왼쪽에 도킹하면 행 방향을 뒤집어 [패널|스플리터|캔버스]가 된다. */}
        <div
          data-studio-inspector-dock={inspectorDockSide}
          className={
            inspectorDockSide === "left"
              ? "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row-reverse"
              : "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row"
          }
        >
          <StudioCuttoonEditorCanvasColumn {...s} />
          {/* Work-mode gate: the inspector column is the "right-panel" chrome.
              Same composed-gate pattern as the page pane and tool rail: a
              folded verdict mounts a slim strip whose expand button reuses
              the density advanced-expansion choice. "right-panel" is never
              folded by the current work-mode matrix (primary or visible in
              every mode) and mode "all" is the identity, so this renders the
              column exactly as before until a mode actually folds it. An
              unwired host (no uiChromeExposure) keeps the column mounted. */}
          {uiChromeExposure && uiChromeExposure("right-panel") === "folded" ? (
            <div
              data-studio-inspector-folded={workMode ?? undefined}
              className="hidden w-12 shrink-0 flex-col items-center border-l border-line bg-panel py-2 lg:flex"
            >
              <button
                type="button"
                onClick={() => setUiAdvancedToolsExpanded?.(true)}
                aria-label="접힌 속성 패널 펼치기"
                title="이 단계에서는 속성 패널을 접어 둡니다. 펼치면 바로 쓸 수 있어요."
                className="min-h-11 rounded-full border border-line px-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-panel"
              >
                속성 펼치기
              </button>
            </div>
          ) : (
            <StudioCuttoonEditorInspectorColumn {...s} />
          )}
        </div>
        <StudioCuttoonEditorPanels {...s} />
        <StudioCuttoonEditorSessionDialogs {...s} />
        <StudioWorkspaceArrangementToolbar disabled={isMobile || canvasOnlyMode || mobileImmersive || presentationPanelsHidden} />
      </div>
  );
}
