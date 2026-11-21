// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COMPETITOR_PALETTE_STUDIO_TOOLS } from "@/shared/components/command-palette-competitor-aliases";
import { PALETTE_STUDIO_TOOLS } from "@/shared/components/command-palette-data";
import {
  inspectStudioCommandExecutionFromPalette,
  requestStudioCommandExecutionFromPalette,
  resetStudioCommandSearchBridgeForTests,
} from "@/shared/lib/studio-command-search-bridge";

import { StudioCommandSearchHost } from "../StudioCommandSearchHost";
import {
  createStudioCommandExecutionBindings,
  installStudioCommandExecutionBindings,
  resetStudioCommandExecutionBindingsForTests,
} from "../studio-command-execution-registry";
import {
  buildStudioMainMenuGroups,
  type StudioMainMenuBuilderState,
  type StudioMainMenuEditorActions,
  type StudioMainMenuUiActions,
} from "../studio-main-menu-groups";

const AVAILABLE_STATE: StudioMainMenuBuilderState = {
  sharedNonOwnerSave: false,
  saving: false,
  collaborationDocumentLocked: false,
  hasWorkId: true,
  projectArchiveBusy: false,
  interchangeImportBusy: false,
  psdImportBusy: false,
  edit: {
    undoDisabled: false,
    redoDisabled: false,
    cutDisabled: false,
    copyDisabled: false,
    pasteDisabled: false,
    selectAllDisabled: false,
    deselectDisabled: false,
    invertSelectionDisabled: false,
    clearSelectionDisabled: false,
    duplicateDisabled: false,
    reorderDisabled: false,
    cropLayerDisabled: false,
  },
  filterDisabled: false,
  filterUnavailableReason: null,
  viewTransformSuppressed: false,
  canvasFlipH: false,
  canvasRotation: 0,
  fullscreen: false,
  canvasRulersVisible: true,
  colorVisionMode: "none",
  referencePanelOpen: false,
  pageSequenceOpen: false,
  hasSavedView: true,
  perspectiveRulerActive: false,
  hasLocallyHiddenLayers: false,
  quickAccessPaletteOpen: false,
  quickAccessPaletteLoading: false,
  leftPanelOpen: true,
  rightPanelOpen: true,
  lastFilterDraft: null,
  clippingMaskActive: false,
  clippingMaskDisabled: false,
  imageLayerSelected: true,
  activeToolCommandId: "tool.pen",
  pixelSelectionTool: null,
  quickMaskActive: false,
  animationTimelineOpen: false,
  onionSkinEnabled: false,
  documentCommentsOpen: false,
  canvasGridVisible: false,
  webtoonGuidesVisible: false,
  vectorEraseToIntersection: false,
  masterEditMode: false,
  pixelArtEnabled: false,
};

function createTrackedMocks() {
  let invocations = 0;
  const track = () => vi.fn(() => {
    invocations += 1;
  });

  const editor: StudioMainMenuEditorActions = {
    copyImageToClipboard: track(),
    save: track(),
    exportProject: track(),
    exportProjectArchive: track(),
    undo: track(),
    redo: track(),
    cutSelectedElements: track(),
    copySelectedElements: track(),
    pasteElements: track(),
    openImagePastePicker: track(),
    selectAll: track(),
    deselect: track(),
    invertSelection: track(),
    clearSelection: track(),
    duplicateSelected: track(),
    reorder: track(),
    openSelectedLayerCrop: track(),
    toggleClippingMask: track(),
    addText: track(),
    addPage: track(),
    toggleHorizontalCanvasView: track(),
    rotateCanvasView: track(),
    resetCanvasViewRotation: track(),
    fitCanvasToWidth: track(),
    setActualPixelView: track(),
    toggleFullscreen: track(),
    toggleCanvasRulers: track(),
    setColorVisionMode: track(),
    saveCurrentStudioView: track(),
    restoreSavedStudioView: track(),
    togglePerspectiveGuideView: track(),
    showAllLocallyHiddenLayers: track(),
    setStudioUiDensity: track(),
    enterCanvasOnlyMode: track(),
    openFeatureTutorial: track(),
    openStudioFilter: track(),
    toggleAdvancedFill: track(),
  };

  const ui: StudioMainMenuUiActions = {
    correctCurrentStroke: track(),
    openExportDownload: track(),
    requestProjectImport: track(),
    requestInterchangeImport: track(),
    requestPsdImport: track(),
    openProjectTools: track(),
    toggleHistoryPanel: track(),
    openAppSettings: track(),
    openStudioMenu: track(),
    openAssetMenu: track(),
    requestImageInsert: track(),
    openMannequinPoser: track(),
    openVrmPoser: track(),
    openCharacterShaper: track(),
    openBackground3d: track(),
    openReferencePanel: track(),
    stepZoom: track(),
    toggleReferencePanel: track(),
    togglePageSequence: track(),
    openProductionInsights: track(),
    toggleAnimationTimeline: track(),
    openScrollPreview: track(),
    openStoryboardGrid: track(),
    collapseSidePanels: track(),
    expandSidePanels: track(),
    openToolsCompanion: track(),
    toggleQuickAccessPalette: track(),
    toggleLeftPanel: track(),
    toggleRightPanel: track(),
    openShortcuts: track(),
    selectDrawMode: track(),
    enableSmartShape: track(),
    activateTransformTool: track(),
    openImageAdjustments: track(),
    createAdjustmentLayer: track(),
    openLayerMask: track(),
    openBrushPresetBrowser: track(),
    openBrushStudio: track(),
    openBrushLab: track(),
    openBrushLibrary: track(),
    requestBrushPackImport: track(),
    openNaturalMediaBrushes: track(),
    activatePixelSelectionTool: track(),
    enterQuickMask: track(),
    commitQuickMask: track(),
    openFrameAnimation: track(),
    toggleOnionSkin: track(),
    openAnimaticTimeline: track(),
    openTeamPanel: track(),
    toggleDocumentComments: track(),
    openPageReview: track(),
    openCheckpoints: track(),
    openWriterRoom: track(),
    openContinuityCheck: track(),
    openProductionBible: track(),
    openQuickStart: track(),
    applyWebtoonCanvasPreset: track(),
    openPublishPackage: track(),
    openPublishPreflight: track(),
    openAssetRightsAudit: track(),
    openAutoActions: track(),
    openCanvasNavigator: track(),
    openCanvasSettings: track(),
    toggleCanvasGrid: track(),
    toggleWebtoonGuides: track(),
    toggleVectorEraseToIntersection: track(),
    openDialogueBatch: track(),
    openDialogueTranslate: track(),
    openLocalizationQa: track(),
    togglePixelArtMode: track(),
    insertDefaultStickyNote: track(),
    enableSilkSymmetry: track(),
    openSculptWorkbench: track(),
    startEphemeralWhiteboard: track(),
  };

  const onNavigateInspector = track();

  return {
    editor,
    ui,
    onNavigateInspector,
    getInvocations: () => invocations,
  };
}

const CANONICAL_STUDIO_ACTION_PATHS = new Set([
  "/studio/canvas",
  "/studio/bg3d",
  "/studio/assets/characters/new",
  "/studio/assets/brushes/new",
  "/studio/import",
  "/studio/publish",
]);

describe("경쟁 앱 27종 커맨드 팔레트 라이브 실행 바인딩 실측 검증", () => {
  beforeEach(() => {
    resetStudioCommandExecutionBindingsForTests();
    resetStudioCommandSearchBridgeForTests();
  });

  afterEach(() => {
    cleanup();
    resetStudioCommandExecutionBindingsForTests();
    resetStudioCommandSearchBridgeForTests();
  });

  it("모든 경쟁 앱 도구 항목은 dead query string 없이 정본 스튜디오 라우트만 사용한다", () => {
    for (const tool of COMPETITOR_PALETTE_STUDIO_TOOLS) {
      expect(tool.actionPath, `${tool.id} actionPath`).toBeDefined();
      expect(tool.actionPath).not.toContain("?");
      expect(CANONICAL_STUDIO_ACTION_PATHS.has(tool.actionPath!)).toBe(true);
      expect(tool.studioCommandId, `${tool.id} studioCommandId`).toBeTruthy();
    }
  });

  it("실제 메뉴 레지스트리와 StudioCommandSearchHost에 마운트된 상태에서 경쟁 앱 별칭 보유 도구 전부가 라이브 실행된다", () => {
    const mocks = createTrackedMocks();
    const groups = buildStudioMainMenuGroups({
      state: AVAILABLE_STATE,
      editor: mocks.editor,
      ui: mocks.ui,
      t: (_key, fallback) => fallback ?? _key,
    });
    const bindings = createStudioCommandExecutionBindings(groups);
    const uninstall = installStudioCommandExecutionBindings(bindings);

    try {
      render(<StudioCommandSearchHost hideTrigger onNavigateInspector={mocks.onNavigateInspector} />);

      const competitorTools = PALETTE_STUDIO_TOOLS.filter(
        (tool) => (tool.competitorAliases?.length ?? 0) > 0,
      );
      expect(competitorTools.length).toBeGreaterThanOrEqual(27);

      for (const tool of competitorTools) {
        expect(tool.studioCommandId, `${tool.id} missing studioCommandId`).toBeTruthy();
        const request = {
          commandId: tool.studioCommandId!,
          toolId: tool.id,
          label: tool.name,
          shortcutKey: tool.shortcutKey,
        };
        const availability = inspectStudioCommandExecutionFromPalette(request);
        expect(availability.status, `${tool.id} (${tool.studioCommandId}) availability`).toBe("executable");

        const before = mocks.getInvocations();
        const ran = requestStudioCommandExecutionFromPalette(request);
        expect(ran, `${tool.id} (${tool.studioCommandId}) execute result`).toBe(true);
        expect(
          mocks.getInvocations(),
          `${tool.id} (${tool.studioCommandId}) should invoke a real menu/inspector action`,
        ).toBeGreaterThan(before);
      }
    } finally {
      uninstall();
    }
  });

  it("비활성(disabled) 상태인 필터 명령은 unavailableReason과 함께 실행을 거부한다", () => {
    const mocks = createTrackedMocks();
    const groups = buildStudioMainMenuGroups({
      state: {
        ...AVAILABLE_STATE,
        filterDisabled: true,
        filterUnavailableReason: "이미지가 있는 레이어를 선택한 뒤 실행해 주세요.",
      },
      editor: mocks.editor,
      ui: mocks.ui,
      t: (_key, fallback) => fallback ?? _key,
    });
    const bindings = createStudioCommandExecutionBindings(groups);
    const uninstall = installStudioCommandExecutionBindings(bindings);

    try {
      render(<StudioCommandSearchHost hideTrigger onNavigateInspector={mocks.onNavigateInspector} />);
      const request = { commandId: "filter.lens-blur", toolId: "tool-lens-blur", label: "렌즈 블러" };
      const availability = inspectStudioCommandExecutionFromPalette(request);
      expect(availability).toEqual({
        status: "disabled",
        reason: "이미지가 있는 레이어를 선택한 뒤 실행해 주세요.",
      });
      expect(requestStudioCommandExecutionFromPalette(request)).toBe(false);
      expect(mocks.editor.openStudioFilter).not.toHaveBeenCalled();
    } finally {
      uninstall();
    }
  });
});
