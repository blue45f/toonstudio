import { describe, expect, it, vi } from "vitest";

import { createEmptyStudioCommentsDocument, type StudioCommentThread } from "../studio-comments";
import type { DrawEl, El, FrameEl, ImageEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { PixelSelection } from "../studio-selection-tools";
import {
  applyStudioScenarioScenePatch,
  computeStudioBubbleOutlinePointInsert,
  computeStudioBubbleOutlinePointRemoval,
  createStudioFocusLinesElement,
  createStudioSpeedLinesElement,
  extractStudioMacroCommandsFromPatch,
  planStudioAnimFrameCaptureElements,
  planStudioDiagonalSplitFrames,
  planStudioSplitFrameSelected,
} from "./studio-host-canvas-element-helpers";
import {
  applyLocalStudioCommentMutationPlan,
  deriveStudioActiveCommentAnchor,
  deriveStudioCanvasCommentBounds,
  deriveStudioCommentAnchorOptions,
  deriveStudioCommentPinReanchorDisabledReason,
  deriveStudioCommentPinReanchorableIds,
  deriveStudioOpenCanvasCommentThreads,
  fallbackLabelForStudioCommentAnchor,
  resolveStudioCommentPinClusterNavigation,
} from "./studio-host-comment-projection-helpers";
import {
  createStudioPendingPixelSelectionRasterGesture,
  runStudioPendingPixelSelectionRasterGestureFinish,
} from "./studio-host-liquify-and-selection-pointer-helpers";
import {
  deriveStudioMainMenuSurfaceState,
  deriveStudioMobileSelectionLocked,
  deriveStudioOptionsBarsSelectionModel,
  deriveStudioQuickAccessCommandAvailability,
  deriveStudioQuickActionsDisabledSet,
  deriveStudioRasterHandoffGates,
  deriveStudioSharedGutterSegments,
  resolveStudioMenuPixelSelectionTool,
} from "./studio-host-options-and-menu-derivations";
import {
  collectStudioPublishPackageCreditsText,
  deriveStudioContinuityScenes,
  deriveStudioProductionBibleAssetOptions,
  hasStudioFxPickerResults,
} from "./studio-host-publish-continuity-helpers";
import { runStudioVectorEraseToIntersectionAt } from "./studio-host-raster-edit-and-shape-helpers";
import {
  computeStudioMinimapClickScrollTarget,
  projectStudioHostClientPointToDocument,
  resolveStudioHostCanvasInsertionTarget,
  resolveStudioMinimapArrowScrollDelta,
  validateStudioSelectionResizeBegin,
} from "./studio-host-view-and-resize-helpers";

function makePage(overrides: Partial<PageState> = {}): PageState {
  return {
    id: "page-1",
    name: "1화",
    canvasH: 1200,
    bg: "#ffffff",
    bgGrad: null,
    elements: [],
    groups: [],
    ...overrides,
  };
}

function makeFrame(id: string, overrides: Partial<Extract<El, { type: "frame" }>> = {}): Extract<El, { type: "frame" }> {
  return {
    id,
    type: "frame",
    x: 24,
    y: 24,
    width: 752,
    height: 360,
    ...overrides,
  };
}

function makeImage(id: string, overrides: Partial<Extract<El, { type: "image" }>> = {}): Extract<El, { type: "image" }> {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,iVBORw0KGgo=",
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    rotation: 0,
    ...overrides,
  };
}

function makeBubble(id: string, overrides: Partial<Extract<El, { type: "bubble" }>> = {}): Extract<El, { type: "bubble" }> {
  return {
    id,
    type: "bubble",
    variant: "speech",
    text: "안녕",
    x: 40,
    y: 60,
    width: 240,
    height: 120,
    fill: "#ffffff",
    textFill: "#111111",
    rotation: 0,
    ...overrides,
  };
}

describe("studio-cuttoon-edit extracted host helpers", () => {
  describe("publish & continuity helpers", () => {
    it("derives sorted continuity scenes and deduplicated credits text", () => {
      const topFrame = makeFrame("f-top", {
        y: 20,
        storyBeat: { type: "setup", summary: "첫 장면" },
      });
      const bottomFrame = makeFrame("f-bottom", {
        y: 420,
        storyBeat: { type: "escalation", summary: "두 번째 장면" },
      });
      const imageWithCredit = makeImage("img-1", {
        name: "배경 사진",
        stockImageCredit: {
          photographerName: "Kim",
          photographerProfileUrl: "https://example.com/kim",
          unsplashPhotoPageUrl: "https://example.com/photo/1",
        },
      });
      const pages = [makePage({ elements: [bottomFrame, topFrame, imageWithCredit] })];

      const scenes = deriveStudioContinuityScenes(true, pages);
      expect(scenes.map((scene) => scene.id)).toEqual(["f-top", "f-bottom"]);
      expect(scenes[0]?.label).toContain("장면 1 — 첫 장면");
      expect(deriveStudioContinuityScenes(false, pages)).toEqual([]);

      const credits = collectStudioPublishPackageCreditsText("직접 크레딧", pages);
      expect(credits).toContain("직접 크레딧");
      expect(credits).toContain("Kim · https://example.com/kim · https://example.com/photo/1");

      const bibleAssets = deriveStudioProductionBibleAssetOptions(true, pages);
      expect(bibleAssets).toEqual([{ id: "img-1", label: "1화 · 배경 사진" }]);
      expect(deriveStudioProductionBibleAssetOptions(false, pages)).toEqual([]);
    });

    it("evaluates FX picker result visibility across sections", () => {
      expect(
        hasStudioFxPickerResults({
          fxMenuOpen: true,
          sectionVisible: (section) => section === "sfx",
          rasterCount: 5,
          sfxCount: 0,
          emojiCount: 3,
          comicCount: 0,
          creatureCount: 0,
          propCount: 0,
          linePresetCount: 0,
          overlayCount: 0,
        }),
      ).toBe(false);
      expect(
        hasStudioFxPickerResults({
          fxMenuOpen: true,
          sectionVisible: (section) => section === "sfx",
          rasterCount: 0,
          sfxCount: 2,
          emojiCount: 0,
          comicCount: 0,
          creatureCount: 0,
          propCount: 0,
          linePresetCount: 0,
          overlayCount: 0,
        }),
      ).toBe(true);
    });
  });

  describe("comment projection helpers", () => {
    it("applies local mutations, resolves anchors, bounds, and reanchorable pins", () => {
      const actor = { id: "user-1", displayName: "작가" };
      const empty = createEmptyStudioCommentsDocument();
      const created = applyLocalStudioCommentMutationPlan(
        empty,
        {
          kind: "create",
          mutationId: "thread-1",
          anchor: { type: "point", pageId: "page-1", x: 0.25, y: 0.5 },
          body: "선 정리 필요",
          mentions: [],
        },
        actor,
        new Date("2026-11-22T00:00:00Z"),
      );
      expect(created.threads).toHaveLength(1);
      expect(created.threads[0]?.body).toBe("선 정리 필요");

      const frame = makeFrame("f-1");
      const page = makePage({ elements: [frame] });
      expect(
        deriveStudioActiveCommentAnchor({
          masterEditMode: false,
          selected: frame,
          activePageId: page.id,
          pointCommentAnchor: null,
        }),
      ).toEqual({ type: "frame", pageId: "page-1", frameId: "f-1" });

      const options = deriveStudioCommentAnchorOptions({
        pages: [page],
        masterEditMode: false,
        selected: null,
        pointCommentAnchor: { pageId: "page-1", x: 0.25, y: 0.5 },
        activePage: page,
        activePageIndex: 0,
      });
      expect(options.some((o) => o.anchor.type === "frame")).toBe(true);
      expect(options.some((o) => o.anchor.type === "point" && o.label.includes("25%, 50%"))).toBe(true);

      const openThreads = deriveStudioOpenCanvasCommentThreads({
        studioCommentPinsHidden: false,
        studioTeamCommentsWorkId: null,
        teamCanView: undefined,
        expectsSharedDocument: false,
        sharedCanView: undefined,
        masterEditMode: false,
        threads: created.threads,
        activePageId: "page-1",
      });
      expect(openThreads).toHaveLength(1);

      const reanchorable = deriveStudioCommentPinReanchorableIds({
        openThreads,
        studioTeamCommentsWorkId: null,
        collaborationDocumentLocked: false,
        legacyThreadIds: new Set(),
        teamCanReanchor: undefined,
        authUserId: "user-1",
      });
      expect(reanchorable.has("thread-1")).toBe(true);
      expect(
        deriveStudioCommentPinReanchorDisabledReason({
          studioTeamCommentsWorkId: null,
          capabilities: null,
          collaborationDocumentLocked: true,
          translate: (_key, fallback) => fallback,
        }),
      ).toContain("읽기 전용");
      expect(fallbackLabelForStudioCommentAnchor({ type: "point", pageId: "p", x: 0, y: 0 })).toBe("위치 댓글");

      const frameThread = {
        ...created.threads[0]!,
        id: "thread-frame",
        anchor: { type: "frame", pageId: "page-1", frameId: "f-1" },
      } satisfies StudioCommentThread;
      const bounds = deriveStudioCanvasCommentBounds([frameThread], [frame]);
      expect(bounds.get("f-1")).toEqual({ x: 24, y: 24, width: 752, height: 360 });

      const nav = resolveStudioCommentPinClusterNavigation(
        {
          open: true,
          selectedThread: created.threads[0]!,
          clusterThreads: [created.threads[0]!, frameThread],
          selectedClusterIndex: 0,
          selectedUnread: false,
          unreadClusterCount: 0,
          selectedResolved: false,
          selectedDraft: null,
          preservedDraft: null,
          draftTargetMissing: false,
          replyBlockedReason: null,
        },
        1,
      );
      expect(nav).toEqual({
        kind: "select",
        nextThread: frameThread,
        clusterThreadIds: ["thread-1", "thread-frame"],
      });
    });
  });

  describe("canvas element, view, and resize helpers", () => {
    it("extracts macro commands, splits frames, creates effect elements, and patches scenario drafts", () => {
      const cmds = extractStudioMacroCommandsFromPatch({
        opacity: 0.5,
        hidden: true,
        locked: false,
      } as Partial<El>);
      expect(cmds).toEqual([
        { type: "set-opacity", opacity: 0.5 },
        { type: "set-hidden", hidden: true },
        { type: "set-locked", locked: false },
      ]);

      let seq = 0;
      const allocateId = () => `id-${++seq}`;
      const frame = makeFrame("orig", { width: 700, height: 400 });
      const split = planStudioSplitFrameSelected({
        frame,
        orientation: "horizontal",
        panelSplitRatio: 50,
        panelGutter: 20,
        elements: [frame],
        groups: [],
        allocateId,
      });
      expect(split.elements).toHaveLength(2);
      expect((split.elements[0] as FrameEl).height).toBe(190);
      expect((split.elements[1] as FrameEl).y).toBe(24 + 190 + 20);
      expect(split.selectedId).toBe(split.elements[0]?.id);

      const diagonal = planStudioDiagonalSplitFrames({
        elements: [frame],
        groups: [],
        canvasHeight: 1000,
        allocateId,
      });
      expect(diagonal.elements).toHaveLength(3);
      expect(diagonal.canvasH).toBeGreaterThanOrEqual(408 + 440 + 24);

      expect(createStudioFocusLinesElement("fl-1").type).toBe("focusLines");
      expect(createStudioSpeedLinesElement("sl-1").type).toBe("speedLines");

      const square = [0, 0, 100, 0, 100, 100, 0, 100];
      const inserted = computeStudioBubbleOutlinePointInsert(square, null);
      expect(inserted?.points.length).toBe(10);
      const removed = computeStudioBubbleOutlinePointRemoval(square, 0);
      expect(removed.kind).toBe("removed");
      const tooFew = computeStudioBubbleOutlinePointRemoval([0, 0, 100, 0, 50, 100], 0);
      expect(tooFew.kind).toBe("minimum-points");

      const patched = applyStudioScenarioScenePatch(
        [
          {
            beatType: "setup",
            summary: "초안",
            imagePrompt: "old prompt",
            dialogue: "안녕",
            aspect: "landscape",
            frame: { x: 0, y: 0, width: 800, height: 400 },
            bubbles: [],
            imageDataUrl: "data:image/png;base64,old",
          },
        ],
        0,
        { imagePrompt: "new prompt" },
      );
      expect(patched[0]?.imagePrompt).toBe("new prompt");
      expect(patched[0]?.imageDataUrl).toBeUndefined();
    });

    it("computes anim frame capture overlap filtering and minimap/resize validations", () => {
      const target = makeImage("cell-1", { x: 0, y: 0, width: 200, height: 200 });
      const insideStroke: DrawEl = {
        id: "stroke-in",
        type: "draw",
        points: [10, 10, 50, 50],
        stroke: "#000000",
        strokeWidth: 4,
      };
      const outsideStroke: DrawEl = {
        id: "stroke-out",
        type: "draw",
        points: [400, 400, 450, 450],
        stroke: "#000000",
        strokeWidth: 4,
      };
      const next = planStudioAnimFrameCaptureElements({
        elements: [target, insideStroke, outsideStroke],
        target,
        capturedElementIds: new Set(["cell-1"]),
        newFrameId: "frame-2",
        src: "data:image/png;base64,captured",
      });
      expect(next.map((e) => e.id)).toEqual(["cell-1", "stroke-out"]);
      expect((next[0] as ImageEl).activeFrameId).toBe("frame-2");

      expect(resolveStudioMinimapArrowScrollDelta("ArrowRight", 800, 600)).toEqual({ dx: 200, dy: 0 });
      expect(resolveStudioMinimapArrowScrollDelta("Escape", 800, 600)).toBeNull();
      expect(
        projectStudioHostClientPointToDocument({
          clientX: 150,
          clientY: 200,
          hostRect: { left: 100, top: 100, width: 0, height: 200 },
          canvasHeight: 1000,
          canvasFlipH: false,
          canvasRotation: 0,
        }),
      ).toBeNull();
      const scroll = computeStudioMinimapClickScrollTarget({
        clientX: 50,
        clientY: 50,
        rect: { left: 0, top: 0, width: 100, height: 100 },
        canvasHeight: 1000,
        canvasFlipH: false,
        canvasRotation: 0,
        scale: 1,
        viewportWidth: 400,
        viewportHeight: 400,
      });
      expect(Number.isFinite(scroll.scrollLeft) && Number.isFinite(scroll.scrollTop)).toBe(true);

      const resizeInvalid = validateStudioSelectionResizeBegin({
        selectedIds: ["cell-1"],
        currentElements: [target],
        activeGroups: [],
        sourceBounds: { x: 0, y: 0, width: 200, height: 200 },
        activeSurfaceReviewLocked: false,
      });
      expect(resizeInvalid.ok).toBe(false);
      const resizeSingleDraw = validateStudioSelectionResizeBegin({
        selectedIds: ["stroke-in"],
        currentElements: [insideStroke],
        activeGroups: [],
        sourceBounds: { x: 10, y: 10, width: 40, height: 40 },
        activeSurfaceReviewLocked: false,
      });
      expect(resizeSingleDraw.ok).toBe(true);
    });
  });

  describe("options, menu, and raster retouch helpers", () => {
    it("derives selection bar models, quick actions availability, menu states, and handoff gates", () => {
      const bubble = makeBubble("b-1");
      const selModel = deriveStudioOptionsBarsSelectionModel({
        activeSurfaceReviewLocked: false,
        elements: [bubble],
        groups: [],
        marqueeIds: [],
        selectionLaneMounted: true,
        selectOptionsStripArmed: true,
        selected: bubble,
        selectedId: bubble.id,
      });
      expect(selModel.visible).toBe(true);
      expect(selModel.textEditLabel).toBe("대사 편집");
      expect(selModel.canFitBubble).toBe(true);

      expect(
        deriveStudioMobileSelectionLocked({
          elements: [{ ...bubble, locked: true }],
          groups: [],
          marqueeIds: [],
          selectedId: bubble.id,
        }),
      ).toBe(true);
      expect(deriveStudioSharedGutterSegments([], true)).toEqual([]);

      const disabled = deriveStudioQuickActionsDisabledSet({
        hi: 0,
        historyLength: 1,
        masterEditMode: false,
        collaborationDocumentLocked: false,
        selected: null,
        marqueeIdsLength: 0,
        activePageMutationLocked: false,
        selectedImageMutationLocked: false,
      });
      expect(disabled.has("undo")).toBe(true);
      expect(disabled.has("redo")).toBe(true);
      expect(disabled.has("quick-mask")).toBe(true);

      const availability = deriveStudioQuickAccessCommandAvailability({
        disabledActions: disabled,
        saving: false,
        collaborationDocumentLocked: false,
        scopedDraftSaveAvailable: false,
        advancedFillBusy: false,
        advancedFillUnsupportedReason: null,
        activePageMutationLocked: false,
        selected: null,
        pixelSel: null as PixelSelection | null,
        pixelBusy: false,
        selectedImageMutationLocked: false,
        viewTransformSuppressed: false,
      });
      expect(availability.save).toBe(true);
      expect(availability.undo).toBe(false);
      expect(availability.fill).toBe(true);

      expect(resolveStudioMenuPixelSelectionTool(true, "rect", false)).toBe("color-range");
      expect(resolveStudioMenuPixelSelectionTool(false, "ellipse", true)).toBe("circle");
      expect(
        deriveStudioMainMenuSurfaceState({
          pixelSelectionTool: "rect",
          quickMaskActive: false,
          animationTimelineOpen: true,
          onionSkinEnabled: false,
          documentCommentsOpen: false,
          canvasGridVisible: true,
          webtoonGuidesVisible: false,
          vectorEraseToIntersection: false,
          commandBarVisible: true,
          masterEditMode: false,
          pixelArtEnabled: false,
        }).animationTimelineOpen,
      ).toBe(true);

      const gates = deriveStudioRasterHandoffGates({
        isExporting: false,
        saving: false,
        timelapseCapturing: false,
        masterEditMode: false,
        selectedId: null,
        marqueeIdsLength: 0,
        editingActive: false,
        tool: "select",
        canvasRotation: 0,
        eyedropperActive: false,
        timelinePlaying: false,
        marqueeActive: false,
        userGuidesLength: 0,
        armedToolActive: false,
        pageGradeVignette: 0,
        elements: [],
        groups: [],
        localHiddenElementIds: new Set(),
      });
      expect(gates.exportActive).toBe(false);
      expect(gates.specialDraftActive).toBe(false);
    });

    it("handles pending pixel selection gesture journaling/finishing and vector erase error reporting", () => {
      const pointerEvent = {
        pointerId: 7,
        shiftKey: false,
        altKey: false,
        target: null,
      } as unknown as PointerEvent;
      const gesture = createStudioPendingPixelSelectionRasterGesture({
        runId: 3,
        event: pointerEvent,
        position: { x: 10, y: 20 },
        tool: "rect",
        forceCircle: false,
        captureFallback: null,
        pixelCombine: "replace",
        currentSelection: null,
      });
      expect(gesture.pointerId).toBe(7);
      expect(gesture.released).toBe(false);

      const pendingRef = { current: gesture };
      const releaseGesture = vi.fn();
      const handled = runStudioPendingPixelSelectionRasterGestureFinish({
        pointerEvent,
        cancelled: true,
        stage: null,
        pendingRef,
        releaseGesture,
      });
      expect(handled).toBe(true);
      expect(releaseGesture).toHaveBeenCalledTimes(1);
      expect(pendingRef.current).toBeNull();

      const setError = vi.fn();
      const announceDrawingShortcut = vi.fn();
      const commit = vi.fn(() => true);
      const consumed = runStudioVectorEraseToIntersectionAt({
        x: 50,
        y: 50,
        elements: [],
        groups: [],
        allocateId: () => "seg-1",
        commit,
        setError,
        announceDrawingShortcut,
      });
      expect(consumed).toBe(true);
      expect(setError).toHaveBeenCalledTimes(1);
      expect(commit).not.toHaveBeenCalled();

      const selectedFrame = makeFrame("frame-insert", { x: 40, y: 80, width: 600, height: 320 });
      const target = resolveStudioHostCanvasInsertionTarget({
        selected: selectedFrame,
        canvasHeight: 1200,
        activePageId: "page-1",
        masterEditMode: false,
        getVisiblePlacement: () => null,
      });
      expect(target.key).toBe("page-1:page:frame:frame-insert");
      expect(target.placement.bounds).toEqual({ x: 40, y: 80, width: 600, height: 320 });
    });
  });
});
