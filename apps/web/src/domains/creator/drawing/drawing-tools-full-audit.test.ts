/**
 * 드로잉 툴 5대 특수 기능 전수 통합 회귀 감사 스위트.
 * 1) 변형  2) 확대/축소/팬/회전  3) 필터/보정/블렌드  4) 그룹핑/마스크  5) 순서 바꾸기 + Undo/Redo 왕복 불변식
 */
import { describe, expect, it } from "vitest";
import { planStudioDrawObjectTransformWithBounds } from "../brush/studio-draw-object-transform";
import { planStudioCanvasWheelNavigation } from "../canvas/studio-canvas-wheel-navigation";
import { applyStudioAdjustmentPixels, parseCubeLut } from "../filter/studio-adjustment-executor";
import { planStudioEffectGraphRender, redoStudioEffectGraphTransaction, serializeStudioAdjustmentEffectGraph, STUDIO_EFFECT_GRAPH_VERSION, transactStudioEffectGraph, undoStudioEffectGraphTransaction, type StudioAdjustmentEffectGraph } from "../filter/studio-adjustment-effect-graph";
import { applyTonalCorrectionToMultipleLayers, batchHideAllDraftLayers, batchRestoreAllDraftLayers, shouldIncludeLayerInExport, type StudioLayerModelItem } from "../layer/studio-layer-batch-operations";
import { resolveStudioLayerGroupDropIntent, resolveStudioLayerItemDropIntent, studioLayerDragSourceGroup, studioLayerDropIntentEqual, studioLayerDropSideFromPointer } from "../layer/studio-layer-drag";
import { planStudioLayerEffectsStack } from "../layer/studio-layer-effects-graph-adapter";
import { addLayerEffect, applyReliefLighting, computeEffectsBBoxPadding, createDefaultLayerEffect, EMPTY_LAYER_EFFECTS_STACK, parseColorToRgba, reorderLayerEffect, toggleLayerEffect } from "../layer/studio-layer-effects-stack";
import { bakeLayerMaskStroke, canLayerMask, compositeLayerMask, createLayerMaskCanvas, hasLayerMask, invertLayerMaskAlpha, layerMaskFeatherPx, shouldApplyLayerMask } from "../layer/studio-layer-mask";
import { createEpisodeMultiboardScene, evaluateMultiboardViewportLod, fitCameraToBoards, projectSpatialMinimap, updateMultiboardTileCache } from "../live/studio-spatial-multiboard-viewport";
import { computeAlignDeltas, computeDistributeDeltas, computeEqualGapDeltas } from "../selection/studio-object-selection-layout";
import { appendStudioAdjustmentEntry, createEmptyStudioAdjustmentStack, listEnabledStudioAdjustmentEngines, removeStudioAdjustmentEntry, reorderStudioAdjustmentEntry, setStudioAdjustmentEntryEnabled, studioAdjustmentOperationToFilterFields, studioAdjustmentStackEqual } from "../studio-adjustment-stack";
import { applyDistort, normalizeDistort } from "../studio-distort";
import { planStudioSelectionFlip, planStudioZoomToSelection } from "../studio-figma-selection-ux";
import { applyDuotone, applyInkThreshold, applySharpen, applyTemperature, IMAGE_FILTER_PRESETS, imageFilterResetPatch, STUDIO_PIXEL_FILTERS, type StudioImageDataLike } from "../studio-filters";
import { applySharedGutterDragPlan, applyVerticalGapDragPlan, createFrameFolderGroupForNewFrame, planBindSelectionToFrameFolder, planSharedGutterDrag, planSharedGutterSegments, planVerticalGapDrag } from "../studio-frame-folder";
import { EMPTY_GROUP_SELECTION, expandSelectionIdsToGroupUnits, planAtomicSelectionAffineTransform, planAtomicSelectionTranslation, planGroupClickSelection, planGroupClickSelectionRelease, planGroupEnter, planGroupEscape } from "../studio-group-selection";
import { planStudioGroupUniformResize, studioGroupUniformResizeMemberCanRotate } from "../studio-group-uniform-resize";
import { createStudioHistoryJournal, readStudioHistoryJournalRedoEntry, readStudioHistoryJournalUndoEntry, recordStudioHistoryJournalPagesSteps, seekStudioHistoryJournalToPagesDepth, stepStudioHistoryJournal } from "../studio-history-journal";
import { buildLayerTree, createLayerGroup, emptyGroupIds, groupItems, hasContiguousLayerGroups, insertLayerCopiesAdjacent, itemBelowId, moveLayerGroup, moveLayerItem, removeItemsFromGroups, removeLayerItems, reorderLayerItem, reorderLayerSelection, reorderLayerSelectionToTarget, setItemGroup, ungroupItems } from "../studio-layers";
import { applyLiquifyDisplacement, buildLiquifyDisplacementField } from "../studio-liquify";
import { clampZoom } from "../studio-page-shell-runtime";
import { computeNextActiveIdAfterBulkDelete, computeNextActiveIdAfterDelete, createBlankPage, deletePagesBulk, duplicateMirroredPage, insertBlankPageAt, movePage, movePagesBulk, reorderPages, type PageLike } from "../studio-pages";
import { summarizeStudioHistorySnapshot } from "../studio-pages-history-command-journal";
import { blendStudioStandardRgb, compositeStudioFilterResult, STUDIO_STANDARD_BLEND_MODES } from "../studio-standard-blend";
import { constrainStudioTransformBox, studioTransformMinimumDocumentSize } from "../studio-transform-interaction";
import { captureStudioView, clampStudioViewZoom, fitStudioViewToViewport, fitStudioViewToWidth, planStudioCanvasStageLayout, planStudioViewRestore, planStudioViewRotationTransition, planStudioViewZoomGestureFrame, projectStudioDocumentPointToView, projectStudioDocumentRectToViewRect, projectStudioViewPointToDocument, projectStudioViewRectToDocumentRect, rotateStudioViewLeft, rotateStudioViewRight, stepStudioViewWheelZoom, stepStudioViewZoom, STUDIO_VIEW_ZOOM_MAX, STUDIO_VIEW_ZOOM_MIN } from "../studio-view-controls";
import { STUDIO_Z, STUDIO_Z_CLASS } from "../studio-z-index";
import { classifyTap, defaultTouchGestureSettings, resolveTouchSequenceGesture, shouldRejectPalmTouch } from "../touch-gestures/touch-gesture-model";
import { applyCornerPinTransform, constrainIsopodTrapezoidQuad, constrainTrapezoidQuad, createIdentityCornerPinQuad, validateCornerPinQuad } from "../transform/studio-corner-pin-transform";
import { applyMultiLayerCornerPin, applyMultiLayerLiquify, createMultiLayerWarpCommitPlan, type MultiLayerWarpLayerInput } from "../transform/studio-multi-layer-warp-coordinator";
import { buildPuppetLatticeMesh, computeDeformedPosition, createPuppetPin, deformPuppetMesh, movePuppetPin, rasterizePuppetWarpedBuffer, resetPuppetPins, rotatePuppetPin, scalePuppetPin, type PuppetPin } from "../transform/studio-puppet-warp";
import { applyRasterMeshPreset, applyRasterMeshTransform, createRasterMeshLattice, moveRasterMeshNode, RASTER_MESH_PRESET_IDS, resetRasterMeshLattice } from "../transform/studio-raster-mesh-transform";
import { createLiveBooleanGroup, createLiveBooleanLeaf, evaluateLiveBooleanGroup, flattenLiveBooleanGroupToDrawElSeeds, insertLiveBooleanChild, removeLiveBooleanChild, reorderLiveBooleanChild, toggleLiveBooleanNodeVisibility } from "../vector/studio-live-boolean-group";
import type { DrawEl, El, FrameEl, ImageEl } from "../studio-element-model";
import type { MaskCanvasLike, MaskCtx2DLike, MaskImageSource, SelectionCanvasFactory } from "../studio-selection-tools";

function makeGradientImage(width: number, height: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((x / Math.max(1, width - 1)) * 220 + 20);
      data[i + 1] = Math.round((y / Math.max(1, height - 1)) * 200 + 30);
      data[i + 2] = Math.round(((x + y) / Math.max(1, width + height - 2)) * 180 + 40);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const makeDrawEl = (id: string, points: number[], extra: Partial<DrawEl> = {}): DrawEl => ({
  id, type: "draw", points, stroke: "#111111", strokeWidth: 4, brush: "pen", ...extra,
});
const makeImageEl = (id: string, x: number, y: number, width: number, height: number, extra: Partial<ImageEl> = {}): ImageEl => ({
  id, type: "image", src: "data:image/png;base64,AA==", x, y, width, height, rotation: 0, ...extra,
});
const makeFrameEl = (id: string, x: number, y: number, width: number, height: number): FrameEl => ({
  id, type: "frame", x, y, width, height,
});

function createRecordingCanvasFactory() {
  const ops: string[] = [];
  const factory: SelectionCanvasFactory = (width, height) => {
    const ctx: MaskCtx2DLike = {
      globalCompositeOperation: "source-over", filter: "none", fillStyle: "#000",
      strokeStyle: "#000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
      clearRect: () => ops.push("clearRect"),
      fillRect: () => ops.push(`fillRect:${ctx.fillStyle}`),
      beginPath: () => ops.push("beginPath"),
      moveTo: () => ops.push("moveTo"),
      lineTo: () => ops.push("lineTo"),
      closePath: () => ops.push("closePath"),
      fill: () => ops.push("fill"),
      stroke: () => ops.push(`stroke:${ctx.globalCompositeOperation}:${ctx.filter}`),
      drawImage: () => ops.push(`drawImage:${ctx.globalCompositeOperation}`),
    };
    const canvas: MaskCanvasLike & MaskImageSource & { toDataURL: () => string } = {
      width, height, toDataURL: () => `data:image/png;base64,mock-${width}x${height}`,
    };
    return { canvas, ctx };
  };
  return { factory, ops };
}

describe("1. 변형(Transform) 전수 감사", () => {
  it("자유 변형(비균일 스케일·회전)이 선화 좌표·캘리그라피 닙 각도를 정확히 굽고 NaN 입력을 거부한다", () => {
    const stroke = makeDrawEl("d1", [10, 20, 110, 20, 110, 70], {
      brush: "calligraphy", brushTip: { tiltEnabled: false, angleDeg: 170, roundness: 0.4 },
    });
    const plan = planStudioDrawObjectTransformWithBounds({
      el: stroke, sourceBounds: { x: 10, y: 20, width: 100, height: 50 },
      targetBounds: { x: 30, y: 40, width: 200, height: 50 }, rotationDeg: 30, strokeWidthPolicy: "scale",
    });
    expect(plan).not.toBeNull();
    expect(plan!.rotationDeg).toBe(30);
    expect(plan!.element.points.every(Number.isFinite)).toBe(true);
    expect(plan!.element.brushTip?.angleDeg).toBe(-160);
    expect(plan!.element.strokeWidth).toBeCloseTo(4 * Math.SQRT2, 5);
    expect(planStudioDrawObjectTransformWithBounds({
      el: stroke, sourceBounds: { x: 10, y: 20, width: 100, height: 50 },
      targetBounds: { x: 30, y: 40, width: Number.NaN, height: 50 }, rotationDeg: 15,
    })).toBeNull();
  });

  it("4점 원근 코너핀·사다리꼴·등변사다리꼴이 항등 무손실·볼록성 가드·NaN 출력크기 방어를 지킨다", () => {
    const src = makeGradientImage(12, 12);
    const idQuad = createIdentityCornerPinQuad(12, 12);
    expect(applyCornerPinTransform(src, idQuad).data).toEqual(src.data);
    expect(constrainTrapezoidQuad(idQuad, "topLeft", { x: 2, y: 1 }, "horizontal").topRight.y).toBe(1);
    const isopod = constrainIsopodTrapezoidQuad(idQuad, "topLeft", { x: 3, y: 1 }, "horizontal");
    expect(isopod.topLeft.x + isopod.topRight.x).toBeCloseTo(idQuad.topLeft.x + idQuad.topRight.x, 5);
    expect(applyCornerPinTransform(src, isopod).data.some((v, idx) => v !== src.data[idx])).toBe(true);

    const bowtie = { topLeft: { x: 0, y: 0 }, topRight: { x: 11, y: 11 }, bottomRight: { x: 11, y: 0 }, bottomLeft: { x: 0, y: 11 } };
    expect(validateCornerPinQuad(bowtie).valid).toBe(false);
    expect(() => applyCornerPinTransform(src, bowtie)).toThrow();
    const safeNanOut = applyCornerPinTransform(src, idQuad, { outputWidth: Number.NaN, outputHeight: Number.NaN });
    expect(safeNanOut).toMatchObject({ width: 12, height: 12 });
  });

  it("메쉬 워프 4종 프리셋·제어점 이동/초기화·NaN 크기/좌표 방어가 정상 동작한다", () => {
    const src = makeGradientImage(16, 16);
    const base = createRasterMeshLattice(16, 16, 4, 4);
    expect(applyRasterMeshTransform(src, base).data).toEqual(src.data);
    for (const preset of RASTER_MESH_PRESET_IDS) {
      const out = applyRasterMeshTransform(src, applyRasterMeshPreset(base, preset, 0.6));
      expect(out.width === 16 && out.data.length === 16 * 16 * 4).toBe(true);
    }
    const moved = moveRasterMeshNode(base, 1, 1, 8, 9);
    expect(moveRasterMeshNode(moved, 1, 1, Number.NaN, 5)).toBe(moved);
    expect(applyRasterMeshTransform(src, resetRasterMeshLattice(moved)).data).toEqual(src.data);
    expect(createRasterMeshLattice(Number.NaN, Number.NaN, Number.NaN, 4)).toMatchObject({ width: 1, rows: 4 });
  });

  it("퍼핏 워프 변형/고정 핀·회전/배율·NaN 좌표/반경 가드 및 초기화 왕복을 검증한다", () => {
    const src = makeGradientImage(20, 20);
    const mesh = buildPuppetLatticeMesh(20, 20, 4, 4);
    let pins: readonly PuppetPin[] = [createPuppetPin(2, 18, "anchor", "foot"), createPuppetPin(10, 4, "deform", "head")];
    expect(movePuppetPin(pins, "head", Number.NaN, 10)).toBe(pins);
    pins = scalePuppetPin(rotatePuppetPin(movePuppetPin(pins, "head", 14, 6), "head", 15), "head", 1.1);
    const safePos = computeDeformedPosition(10, 10, pins, Number.NaN);
    expect(Number.isFinite(safePos[0]) && Number.isFinite(safePos[1])).toBe(true);
    const warped = rasterizePuppetWarpedBuffer(src.data, 20, 20, deformPuppetMesh(mesh, pins, 30), pins);
    expect(warped.length === src.data.length && warped.some((v) => v > 0)).toBe(true);
    expect(resetPuppetPins(pins).find((p) => p.id === "head")).toMatchObject({ x: 10, y: 4, rotationDeg: 0, scale: 1 });
    expect(buildPuppetLatticeMesh(Number.NaN, Number.NaN, Number.NaN, Number.NaN).vertices.length).toBeGreaterThan(0);
  });

  it("다중 레이어 동시 워프(Liquify/CornerPin)가 잠금·숨김을 건너뛰고 원자적 Undo 커밋 계획을 만든다", () => {
    const layers: MultiLayerWarpLayerInput[] = [
      { id: "line", name: "선화", image: makeGradientImage(16, 16), offsetX: 0, offsetY: 0, role: "lineart" },
      { id: "flat", name: "밑색", image: makeGradientImage(16, 16), offsetX: 4, offsetY: 4, role: "flat" },
      { id: "locked", name: "잠금", image: makeGradientImage(16, 16), offsetX: 0, offsetY: 0, locked: true },
      { id: "hidden", name: "숨김", image: makeGradientImage(16, 16), offsetX: 0, offsetY: 0, visible: false },
    ];
    const liqBatch = applyMultiLayerLiquify(layers, { points: [{ x: 4, y: 8 }, { x: 12, y: 8 }], radiusPx: 6, strength: 0.8, mode: "push" });
    expect(liqBatch.ok).toBe(true);
    expect(liqBatch.results.map((r) => r.layerId)).toEqual(["line", "flat"]);
    expect(liqBatch.skipped.map((s) => `${s.layerId}:${s.reason}`)).toEqual(["locked:locked", "hidden:hidden"]);
    expect(createMultiLayerWarpCommitPlan(layers, liqBatch)!.beforeByLayerId.line!.data).toEqual(layers[0]!.image.data);

    const cpBatch = applyMultiLayerCornerPin(layers, {
      destinationQuad: { topLeft: { x: 2, y: 1 }, topRight: { x: 17, y: 1 }, bottomRight: { x: 19, y: 19 }, bottomLeft: { x: 0, y: 19 } },
    });
    expect(cpBatch.ok && cpBatch.results.length === 2).toBe(true);
  });

  it("좌우/상하 반전 2회 왕복·최소 변형 박스 보간·정렬/균등 분배·페이지 좌우 미러링이 정확하다", () => {
    const img = makeImageEl("i1", 20, 30, 80, 40, { rotation: 25 });
    const draw = makeDrawEl("d1", [10, 10, 50, 40]);
    const flippedTwice = planStudioSelectionFlip(planStudioSelectionFlip([img, draw], ["i1", "d1"], "horizontal")!, ["i1", "d1"], "horizontal")!;
    expect((flippedTwice[0] as ImageEl).x).toBeCloseTo(20, 6);
    expect((flippedTwice[0] as ImageEl).rotation).toBeCloseTo(25, 6);
    expect((flippedTwice[0] as ImageEl).flipped).toBe(false);
    expect((flippedTwice[1] as DrawEl).points).toEqual([10, 10, 50, 40]);

    const minSize = studioTransformMinimumDocumentSize(2);
    expect(constrainStudioTransformBox({ x: 10, y: 10, width: 20, height: 20 }, { x: 25, y: 10, width: 0.1, height: 20 }, minSize).width)
      .toBeGreaterThanOrEqual(minSize - 1e-6);
    expect(computeAlignDeltas([{ x: 10, y: 0, w: 20, h: 20 }, { x: 60, y: 10, w: 40, h: 20 }], "left")).toEqual([{ dx: 0, dy: 0 }, { dx: -50, dy: 0 }]);
    expect(computeDistributeDeltas([{ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 }], "distributeH")![1]!.dx).toBe(35);
    expect(computeEqualGapDeltas([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 20, h: 10 }, { x: 90, y: 0, w: 10, h: 10 }], "spaceH")![1]!.dx).toBe(20);

    let seq = 0;
    const mirrored = duplicateMirroredPage({
      id: "p1", bg: "#fff", bgGrad: null, canvasH: 1000,
      elements: [{ id: "b1", type: "bubble", x: 100, y: 50, width: 200, height: 80, tail: "left", tailXRatio: 0.25 }],
    }, () => `m-${++seq}`, 800);
    expect(mirrored.elements[0]!).toMatchObject({ x: 500, tail: "right" });
    expect(mirrored.elements[0]!.tailXRatio).toBeCloseTo(0.75, 5);
  });

  it("그룹 균일 리사이즈/회전이 프레임·잠금·비균일 배율에서 전부 안전하게 fail-closed 된다", () => {
    const img = makeImageEl("i1", 10, 10, 40, 40);
    const draw = makeDrawEl("d1", [50, 10, 90, 50]);
    const frame = makeFrameEl("f1", 0, 0, 100, 100);
    const items: El[] = [img, draw, frame];
    expect(studioGroupUniformResizeMemberCanRotate(frame)).toBe(false);
    expect(studioGroupUniformResizeMemberCanRotate(img)).toBe(true);

    const resized = planStudioGroupUniformResize({
      items, selectedIds: ["i1", "d1"], sourceBounds: { x: 10, y: 10, width: 80, height: 40 },
      targetBounds: { x: 20, y: 20, width: 160, height: 80 }, isLocked: () => false, rotationDeg: 90,
    });
    expect(resized[0]).toMatchObject({ width: 80, rotation: 90 });

    const refused = planStudioGroupUniformResize({
      items, selectedIds: ["i1", "f1"], sourceBounds: { x: 0, y: 0, width: 100, height: 100 },
      targetBounds: { x: 0, y: 0, width: 100, height: 100 }, isLocked: () => false, rotationDeg: 45,
    });
    expect(refused[0]).toBe(img);
    expect(refused[2]).toBe(frame);
  });
});

describe("2. 확대/축소/팬/회전(Zoom & Viewport) 전수 감사", () => {
  it("극단 줌(0.05x~64x, 0, 음수, NaN, ±Infinity)에서 클램프·휠 스텝·제스처 프레임이 절대 NaN을 내지 않는다", () => {
    for (const z of [0.05, 0.2, 1, 5, 64, 0, -10, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const clamped of [clampStudioViewZoom(z), clampZoom(z)]) {
        expect(Number.isFinite(clamped) && clamped >= STUDIO_VIEW_ZOOM_MIN && clamped <= STUDIO_VIEW_ZOOM_MAX).toBe(true);
      }
      expect(Number.isFinite(stepStudioViewWheelZoom(z, -120, 0))).toBe(true);
      const frame = planStudioViewZoomGestureFrame({
        baseZoom: z, targetZoom: z * 2, originX: 400, originY: 300, originClientX: 400, originClientY: 300,
        clientX: 420, clientY: 310, baseLeft: 0, baseTop: 0, baseWidth: 800, baseHeight: 1200,
        wrapLeft: 0, wrapTop: 0, viewportWidth: 1000, viewportHeight: 800,
      });
      expect(Number.isFinite(frame.scale) && Number.isFinite(frame.translateX) && Number.isFinite(frame.targetScrollLeft)).toBe(true);
    }
    expect(stepStudioViewZoom(1, 1)).toBe(1.2);
    expect(stepStudioViewZoom(1, -1)).toBe(0.8);
  });

  it("캔버스 4방향 회전(0/90/180/270°) × 좌우 반전에서 문서↔뷰 좌표·사각형 투영이 오차 없이 왕복한다", () => {
    let angle = 0;
    for (let i = 0; i < 4; i += 1) angle = rotateStudioViewRight(angle);
    expect(angle).toBe(0);
    for (let i = 0; i < 4; i += 1) angle = rotateStudioViewLeft(angle);
    expect(angle).toBe(0);

    for (const canvasRotation of [0, 90, 180, 270] as const) {
      for (const canvasFlipH of [false, true]) {
        const viewPt = projectStudioDocumentPointToView({ documentWidth: 800, documentHeight: 1200, canvasFlipH, canvasRotation, x: 185, y: 420 });
        const backPt = projectStudioViewPointToDocument({ documentWidth: 800, documentHeight: 1200, canvasFlipH, canvasRotation, x: viewPt.x, y: viewPt.y });
        expect(backPt.x).toBeCloseTo(185, 6);
        expect(backPt.y).toBeCloseTo(420, 6);
        const rect = { x: 100, y: 200, width: 240, height: 160 };
        const viewRect = projectStudioDocumentRectToViewRect({ documentWidth: 800, documentHeight: 1200, canvasFlipH, canvasRotation, ...rect });
        expect(projectStudioViewRectToDocumentRect({ documentWidth: 800, documentHeight: 1200, canvasFlipH, canvasRotation, ...viewRect })).toEqual(rect);
      }
    }
    const transition = planStudioViewRotationTransition({
      documentWidth: 800, documentHeight: 1200, canvasFlipH: false, canvasRotation: 0,
      nextCanvasRotation: 90, scale: 2, scrollLeft: 200, scrollTop: 400, viewportWidth: 800, viewportHeight: 600,
    });
    expect(transition.canvasRotation === 90 && Number.isFinite(transition.scrollLeft) && Number.isFinite(transition.scrollTop)).toBe(true);
  });

  it("뷰 저장/복원·화면 맞춤·고배율 뷰포트 클립 및 캡처 시 클립 해제가 정확히 분리된다", () => {
    const snap = captureStudioView({
      pageId: "p1", scale: 1.25, zoom: 2, scrollLeft: 300, scrollTop: 450, viewportWidth: 1000,
      viewportHeight: 700, canvasWidth: 800, canvasHeight: 1600, canvasFlipH: true, canvasRotation: 90,
    });
    expect(planStudioViewRestore({ snapshot: snap, pageId: "p2", viewportWidth: 1000, viewportHeight: 700, canvasWidth: 800, canvasHeight: 1600 })).toBeNull();
    expect(planStudioViewRestore({ snapshot: snap, pageId: "p1", viewportWidth: 1000, viewportHeight: 700, canvasWidth: 800, canvasHeight: 1600 }))
      .toMatchObject({ canvasFlipH: true, canvasRotation: 90 });
    expect(fitStudioViewToWidth(1000, 800, 2.5)).toBeCloseTo(1.25, 5);
    expect(fitStudioViewToViewport(1000, 800, 800, 1600, 2.5, 90)).toBeGreaterThan(0);

    const shared = {
      documentWidth: 1000, documentHeight: 2000, scale: 4, canvasFlipH: true, canvasRotation: 90,
      viewportClip: { viewportWidth: 800, viewportHeight: 600, scrollLeft: 400, scrollTop: 300 },
    };
    expect(planStudioCanvasStageLayout({ ...shared, captureDocumentView: false }).clip).not.toBeNull();
    expect(planStudioCanvasStageLayout({ ...shared, captureDocumentView: true })).toMatchObject({ clip: null, rotation: 0, scaleX: 4 });
  });

  it("선택 영역 확대(planStudioZoomToSelection)가 NaN paddingRatio·역전 스케일·비유한 bounds를 안전하게 처리한다", () => {
    const plan = planStudioZoomToSelection({
      bounds: { x: 100, y: 200, w: 200, h: 100 }, viewportWidth: 1000, viewportHeight: 800,
      documentWidth: 1200, documentHeight: 1600, canvasRotation: 90, paddingRatio: Number.NaN, minScale: 3, maxScale: 1,
    });
    expect(plan !== null && Number.isFinite(plan.scale) && plan.scale >= 1 && plan.scale <= 3).toBe(true);
    expect(planStudioZoomToSelection({
      bounds: { x: Number.NaN, y: 10, w: 100, h: 100 }, viewportWidth: 1000, viewportHeight: 800, documentWidth: 1200, documentHeight: 1600,
    })).toBeNull();
  });

  it("휠 내비게이션(팬/수평 스크롤/Ctrl 줌 위임)과 멀티터치 제스처·팜 리젝션이 정확히 중재된다", () => {
    expect(planStudioCanvasWheelNavigation({
      deltaX: 0, deltaY: 120, deltaMode: 0, shiftKey: false, ctrlKey: true, metaKey: false,
      wheelMode: "pan", reverseWheel: false, viewportWidth: 1000, viewportHeight: 800,
    })).toBeNull();
    expect(planStudioCanvasWheelNavigation({
      deltaX: Number.NaN, deltaY: 3, deltaMode: 1, shiftKey: true, ctrlKey: false, metaKey: false,
      wheelMode: "zoom", reverseWheel: false, viewportWidth: 1000, viewportHeight: 800,
    })).toEqual({ deltaX: 48, deltaY: 0, source: "shift-horizontal" });

    const twoFingerTap = {
      startTime: 1000, fingerCount: 2,
      samples: [
        { pointerId: 1, x: 100, y: 100, t: 1000, pointerType: "touch" as const },
        { pointerId: 2, x: 140, y: 100, t: 1050, pointerType: "touch" as const },
      ],
    };
    expect(classifyTap(twoFingerTap)).toBe("tap");
    expect(resolveTouchSequenceGesture(twoFingerTap, defaultTouchGestureSettings(), null)).toBe("undo");
    expect(shouldRejectPalmTouch(twoFingerTap.samples[0]!, 900)).toBe(true);
    expect(resolveTouchSequenceGesture(twoFingerTap, defaultTouchGestureSettings(), 950)).toBe("none");
  });

  it("무한 멀티보드 60컷 뷰포트가 0.05x~64x 극단 줌 및 NaN/음수 줌에서 NaN 없이 LOD·미니맵·VRAM 캐시를 유지한다", () => {
    const scene = createEpisodeMultiboardScene("ep-audit", 60);
    expect(Number.isFinite(fitCameraToBoards(scene.boards, Number.NaN, 800, Number.NaN).zoom)).toBe(true);
    for (const zoom of [0.05, 1, 64, 0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const cam = { centerX: 400, centerY: 600, zoom, viewportWidthPx: 1440, viewportHeightPx: 900 };
      const lod = evaluateMultiboardViewportLod(scene, cam);
      expect(lod.visibleCount + lod.culledCount).toBe(60);
      expect(lod.assignments.every((a) => Number.isFinite(a.screenWidthPx) && a.screenWidthPx >= 0)).toBe(true);
      const mini = projectSpatialMinimap(scene, cam, [], [], 240, 160);
      expect(Number.isFinite(mini.viewportRect.width) && mini.viewportRect.width > 0).toBe(true);
    }
    const lodClose = evaluateMultiboardViewportLod(scene, { centerX: 400, centerY: 600, zoom: 1.5, viewportWidthPx: 1440, viewportHeightPx: 900 });
    expect(updateMultiboardTileCache({ budgetBytes: 8 * 1024 * 1024, tick: 0, entries: {} }, lodClose).usedBytes).toBeGreaterThan(0);
  });
});

describe("3. 필터/보정/블렌드(Filter & Effects) 전수 감사", () => {
  it("핵심 픽셀 필터(색온도·샤픈·먹선·듀오톤)와 프리셋이 알파 보존·NaN 무해성·초기화 패치를 보장한다", () => {
    const img = makeGradientImage(10, 10);
    const snapshot = new Uint8ClampedArray(img.data);
    applyTemperature(img, Number.NaN);
    applySharpen(img, Number.NaN);
    applyInkThreshold(img, Number.NaN);
    expect(img.data).toEqual(snapshot);

    applyTemperature(img, 50);
    expect(img.data[0]!).toBeGreaterThan(snapshot[0]!);
    applySharpen(img, 0.5);
    applyDuotone(img, "#102030", "#f0e0d0");
    STUDIO_PIXEL_FILTERS.InkThreshold!(img, { inkThreshold: 0.5 });
    for (let i = 0; i < img.data.length; i += 4) {
      expect((img.data[i] === 0 || img.data[i] === 255) && img.data[i + 3] === 255).toBe(true);
    }
    expect(IMAGE_FILTER_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(Object.values(imageFilterResetPatch()).every((v) => v === undefined)).toBe(true);
  });

  it("기하 왜곡(twirl/ripple/pinch/wave)과 리퀴파이 4종 모드가 비유한 좌표를 걸러내고 픽셀을 변위한다", () => {
    const img = makeGradientImage(16, 16);
    const orig = new Uint8ClampedArray(img.data);
    applyDistort(img, normalizeDistort({ type: "twirl", amount: 0, scale: 10 }));
    expect(img.data).toEqual(orig);
    for (const type of ["twirl", "ripple", "pinch", "wave"] as const) {
      const work = makeGradientImage(16, 16);
      applyDistort(work, normalizeDistort({ type, amount: 55, scale: 8 }));
      expect(work.data.some((v, idx) => v !== orig[idx])).toBe(true);
    }
    for (const mode of ["push", "twirl-clockwise", "pinch", "bloat"] as const) {
      const field = buildLiquifyDisplacementField([{ x: 4, y: 8 }, { x: Number.NaN, y: 8 }, { x: 12, y: 8 }], 6, 0.7, 16, 16, { mode });
      expect(field).not.toBeNull();
      const src = makeGradientImage(16, 16);
      const dst = { width: 16, height: 16, data: new Uint8ClampedArray(src.data) };
      applyLiquifyDisplacement(src, dst, field!);
      expect(dst.data.some((v, idx) => v !== src.data[idx])).toBe(true);
    }
  });

  it("PSD 호환 조정 실행기 10종(밝기/대비·반전·포스터라이즈·임계값·흑백·선택색상·3D LUT)이 정확히 실행된다", () => {
    const img = makeGradientImage(8, 8);
    const orig = new Uint8ClampedArray(img.data);
    expect(applyStudioAdjustmentPixels(img, "invert", {}) && applyStudioAdjustmentPixels(img, "invert", {})).toBe(true);
    expect(img.data).toEqual(orig);
    expect(applyStudioAdjustmentPixels(img, "brightness-contrast", { brightness: 30, contrast: 20 })).toBe(true);
    expect(applyStudioAdjustmentPixels(img, "posterize", { levels: 4 })).toBe(true);
    expect(applyStudioAdjustmentPixels(img, "black-white", { reds: 80, blues: 20 })).toBe(true);
    expect(applyStudioAdjustmentPixels(img, "selective-color", { mode: "relative", "range.neutrals": [10, -5, 5, 0] })).toBe(true);
    expect(applyStudioAdjustmentPixels(img, "threshold", { level: 128 })).toBe(true);

    const identityCube = ["LUT_3D_SIZE 2", "0 0 0", "1 0 0", "0 1 0", "1 1 0", "0 0 1", "1 0 1", "0 1 1", "1 1 1"].join("\n");
    expect(parseCubeLut(identityCube)?.size).toBe(2);
    const lutImg = makeGradientImage(4, 4);
    const lutOrig = new Uint8ClampedArray(lutImg.data);
    expect(applyStudioAdjustmentPixels(lutImg, "color-lookup", { lutBytes: Array.from(identityCube, (c) => c.charCodeAt(0)) })).toBe(true);
    expect(lutImg.data).toEqual(lutOrig);
  });

  it("16종 표준 블렌드 모드와 스마트 필터 불투명도 합성이 유한 [0..255] 범위와 알파 계약을 지킨다", () => {
    for (const mode of STUDIO_STANDARD_BLEND_MODES) {
      expect(blendStudioStandardRgb(mode, [180, 90, 40], [60, 210, 140]).every((ch) => Number.isFinite(ch) && ch >= 0 && ch <= 255)).toBe(true);
    }
    const base = makeGradientImage(4, 4);
    const baseCopy = new Uint8ClampedArray(base.data);
    const filtered = makeGradientImage(4, 4);
    applyTemperature(filtered, 80);
    compositeStudioFilterResult(base, filtered, 0, "multiply");
    expect(base.data).toEqual(baseCopy);
    compositeStudioFilterResult(base, filtered, 1, "normal");
    expect(base.data).toEqual(filtered.data);
  });

  it("비파괴 스마트 필터 스택(추가·순서변경·토글·삭제·범위초과/NaN 방어·필드 투영)이 결정적이다", () => {
    let stack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), { id: "s1", engine: "gaussian-blur", params: { radius: 6, strength: 80 } });
    stack = appendStudioAdjustmentEntry(stack, { id: "s2", engine: "sharpen", params: { amount: 0.4 } });
    stack = appendStudioAdjustmentEntry(stack, { id: "s3", engine: "levels", params: { black: 10, white: 240, gamma: 1.1 } });
    const reordered = reorderStudioAdjustmentEntry(stack, 0, 2);
    expect(listEnabledStudioAdjustmentEngines(reordered)).toEqual(["sharpen", "levels", "gaussian-blur"]);
    expect(studioAdjustmentStackEqual(reorderStudioAdjustmentEntry(reordered, 99, 0), reordered)).toBe(true);
    expect(studioAdjustmentStackEqual(reorderStudioAdjustmentEntry(reordered, Number.NaN, 1), reordered)).toBe(true);
    const toggled = setStudioAdjustmentEntryEnabled(reordered, "s2", false);
    expect(listEnabledStudioAdjustmentEngines(toggled)).toEqual(["levels", "gaussian-blur"]);
    expect(studioAdjustmentOperationToFilterFields(toggled.entries[2]!).blurFx?.type).toBe("gaussian");
    expect(removeStudioAdjustmentEntry(toggled, "s3").entries).toHaveLength(2);
  });

  it("레이어 효과 스택(투명 8자리 Hex·NaN/범위초과 리오더·양방향 그림자 패딩·부조 조명·그래프 플랜)이 정확하다", () => {
    expect(parseColorToRgba("#ffffff00")).toEqual({ r: 255, g: 255, b: 255, a: 0 });
    expect(parseColorToRgba("#11223380")).toEqual({ r: 17, g: 34, b: 51, a: 128 });
    const glowFx = createDefaultLayerEffect("glow", "g-in");
    if (glowFx.kind !== "glow") throw new Error("expected glow effect");
    let stack = addLayerEffect(EMPTY_LAYER_EFFECTS_STACK, { ...glowFx, type: "inner", blur: 20 });
    stack = addLayerEffect(stack, createDefaultLayerEffect("drop-shadow", "sh-1"));
    expect(reorderLayerEffect(stack, Number.NaN, 1)).toBe(stack);
    expect(reorderLayerEffect(stack, 0, 99)).toBe(stack);
    expect(reorderLayerEffect(stack, 0, 0)).toBe(stack);

    const reordered = reorderLayerEffect(stack, 0, 1);
    expect(reordered.effects.map((e) => e.id)).toEqual(["sh-1", "g-in"]);
    const pad = computeEffectsBBoxPadding(reordered);
    expect(pad.left >= 11 && pad.right >= 19).toBe(true);
    expect(computeEffectsBBoxPadding(toggleLayerEffect(reordered, "sh-1", false)).totalMargin).toBe(0);
    const relief = createDefaultLayerEffect("relief", "rel-1");
    if (relief.kind === "relief") expect(applyReliefLighting(makeGradientImage(8, 8).data, 8, 8, relief).length).toBe(256);
    expect(planStudioLayerEffectsStack(reordered, "sha256:layer-src", "webgpu").steps.length).toBe(4);
  });

  it("초안 레이어 일괄 숨김/복원 및 다중 레이어 톤 보정 NaN 입력 방어가 정확히 동작한다", () => {
    const layers: StudioLayerModelItem[] = [
      { id: "draft1", name: "러프1", visible: true, isDraft: true },
      { id: "draft2", name: "러프2", visible: false, isDraft: true },
      { id: "ink", name: "선화", visible: true, isDraft: false },
    ];
    const hidden = batchHideAllDraftLayers(layers);
    expect(hidden.affectedCount).toBe(1);
    expect(shouldIncludeLayerInExport(hidden.updatedLayers[0]!)).toBe(false);
    expect(shouldIncludeLayerInExport(hidden.updatedLayers[2]!)).toBe(true);
    const restored = batchRestoreAllDraftLayers(hidden.updatedLayers, hidden.snapshot);
    expect(restored.map((l) => l.visible)).toEqual([true, false, true]);
    expect(applyTonalCorrectionToMultipleLayers(restored, ["ink"], { kind: "levels", blackPoint: Number.NaN, whitePoint: 50, gamma: Number.NaN }).updatedLayers[2]!.levels)
      .toEqual({ blackPoint: 0, whitePoint: 50, gamma: 1 });
    const reversed = applyTonalCorrectionToMultipleLayers(restored, ["ink"], { kind: "levels", blackPoint: 180, whitePoint: 100, gamma: 1.2 }).updatedLayers[2]!.levels!;
    expect(reversed.whitePoint).toBeGreaterThanOrEqual(reversed.blackPoint);
  });
});

describe("4. 그룹핑(Grouping & Mask) 전수 감사", () => {
  it("레이어 그룹 생성·연속성 유지·빈 그룹 이동 안전성·부분 해제·트리 구성이 완벽히 유지된다", () => {
    const g1 = createLayerGroup("g1", "캐릭터");
    const gEmpty = createLayerGroup("g-empty", "빈 폴더");
    const baseItems: Array<{ id: string; groupId?: string }> = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
    const grouped = groupItems(baseItems, ["b", "d"], "g1");
    expect(grouped.map((i) => i.id)).toEqual(["a", "c", "b", "d", "e"]);
    expect(hasContiguousLayerGroups(grouped)).toBe(true);
    expect(moveLayerGroup(grouped, "g-empty", "up")).toBe(grouped);
    expect(moveLayerGroup(grouped, "g-empty", "down")).toBe(grouped);
    expect(emptyGroupIds(grouped, [g1, gEmpty])).toEqual(["g-empty"]);

    const movedUp = moveLayerGroup(grouped, "g1", "up");
    expect(movedUp.map((i) => i.id)).toEqual(["a", "c", "e", "b", "d"]);
    expect(setItemGroup(removeItemsFromGroups(movedUp, ["b"]), "a", "g1").filter((i) => i.groupId === "g1").map((i) => i.id)).toEqual(["d", "a"]);
    expect(buildLayerTree([...movedUp].reverse(), [g1, gEmpty]).some((n) => n.kind === "group" && n.items.length === 2)).toBe(true);
    expect(ungroupItems(movedUp, "g1").every((i) => i.groupId === undefined)).toBe(true);
  });

  it("그룹 단위 클릭 선택·더블클릭 진입·Escape 탈출·원자적 이동(잠금/NaN fail-closed)이 정확하다", () => {
    const groups = [{ id: "g1" }];
    const items = [
      { id: "a", type: "image", x: 10, y: 10, width: 50, height: 50, groupId: "g1" },
      { id: "b", type: "draw", points: [20, 20, 40, 40], groupId: "g1" },
      { id: "c", type: "image", x: 100, y: 10, width: 30, height: 30 },
    ];
    expect(planGroupClickSelection({ items, groups, clickedId: "a", current: EMPTY_GROUP_SELECTION })).toEqual({ selectedId: null, marqueeIds: ["a", "b"], activeGroupId: null });
    const entered = planGroupEnter({ items, groups, clickedId: "b" });
    expect(entered).toEqual({ selectedId: "b", marqueeIds: [], activeGroupId: "g1" });
    expect(planGroupEscape({ items, current: entered })).toEqual({ selectedId: null, marqueeIds: ["a", "b"], activeGroupId: null });

    const multi = { selectedId: null, marqueeIds: ["a", "b", "c"], activeGroupId: null };
    expect(planGroupClickSelection({ items, groups, clickedId: "c", current: multi }).marqueeIds).toEqual(["a", "b", "c"]);
    expect(planGroupClickSelectionRelease({ items, groups, clickedId: "c", current: multi })).toEqual({ selectedId: "c", marqueeIds: [], activeGroupId: null });
    expect(expandSelectionIdsToGroupUnits(items, groups, ["a"], null)).toEqual(["a", "b"]);

    const translated = planAtomicSelectionTranslation({ items, selectedIds: ["a", "b"], deltaX: 15, deltaY: -5, isLocked: () => false });
    expect(translated[0]!.x).toBe(25);
    expect(translated[1]!.points).toEqual([35, 15, 55, 35]);
    expect(planAtomicSelectionTranslation({ items, selectedIds: ["a", "b"], deltaX: 15, deltaY: 0, isLocked: (i) => i.id === "b" })[0]).toBe(items[0]);
    expect(planAtomicSelectionTranslation({ items, selectedIds: ["a", "b"], deltaX: Number.NaN, deltaY: 0, isLocked: () => false })[0]).toBe(items[0]);
  });

  it("혼합 그룹 아핀 변형(음수 배율 미러링 포함)이 정규 양수 박스를 유지하고 빈 선택에서 no-op 된다", () => {
    const items = [{ id: "r1", type: "image", x: 10, y: 10, width: 40, height: 20 }, { id: "s1", type: "draw", points: [50, 10, 90, 30] }];
    const mirrored = planAtomicSelectionAffineTransform({
      items, selectedIds: ["r1", "s1"], sourceBounds: { x: 10, y: 10, width: 80, height: 20 },
      translateX: 80, translateY: 0, scaleX: -1, scaleY: 1, isLocked: () => false,
    });
    expect(mirrored.kind).toBe("applied");
    expect(mirrored.items[0]).toMatchObject({ width: 40, x: 50 });
    expect(planAtomicSelectionAffineTransform({
      items, selectedIds: [], sourceBounds: { x: 10, y: 10, width: 80, height: 20 },
      translateX: 10, translateY: 0, scaleX: 1, scaleY: 1, isLocked: () => false,
    }).kind).toBe("no-op");
  });

  it("컷 폴더 바인딩·공유 거터 동시 리사이즈·세로 컷 간격 드래그가 자식 요소를 정확히 리플로우한다", () => {
    expect(createFrameFolderGroupForNewFrame({ frameLabel: "컷 1", groupId: "fg-1" })?.name).toBe("컷 폴더 · 컷 1");
    const f1 = makeFrameEl("f1", 0, 0, 200, 200);
    const f2 = makeFrameEl("f2", 220, 0, 200, 200);
    const f3 = makeFrameEl("f3", 0, 220, 420, 200);
    const childB = { id: "c-b", type: "image", x: 250, y: 40, width: 60, height: 60, noClip: true };
    const childBottom = { id: "c-bot", type: "image", x: 50, y: 260, width: 60, height: 60 };

    const bound = planBindSelectionToFrameFolder({ frameId: "f2", frameLabel: "컷 2", groupId: "fg-2", seedIds: ["f2", "c-b"], items: [f1, f2, childB], groups: [] })!;
    expect(bound.clearedNoClipIds).toEqual(["c-b"]);
    const boundChild = bound.items.find((i) => i.id === "c-b");
    expect(boundChild && "noClip" in boundChild ? boundChild.noClip : undefined).toBe(false);

    const segments = planSharedGutterSegments([f1, f2, f3]);
    const afterGutter = applySharedGutterDragPlan([f1, f2, childB], planSharedGutterDrag({
      segment: segments.find((s) => s.axis === "v")!, framesById: new Map([[f1.id, f1], [f2.id, f2]]), delta: 20, elements: [f1, f2, childB],
    })!);
    expect(afterGutter.find((e) => e.id === "f1")!.width === 220 && afterGutter.find((e) => e.id === "c-b")!.x === 270).toBe(true);

    const afterVGap = applyVerticalGapDragPlan([f1, f2, f3, childBottom], planVerticalGapDrag({
      segment: segments.find((s) => s.axis === "h")!, frames: [f1, f2, f3], delta: 30, elements: [f1, f2, f3, childBottom],
    })!);
    expect(afterVGap.find((e) => e.id === "f3")!.y === 250 && afterVGap.find((e) => e.id === "c-bot")!.y === 290).toBe(true);
  });

  it("중첩 라이브 불리언 그룹이 비파괴 평가·Flatten·NaN/범위초과 리오더 참조 보존을 보장한다", async () => {
    const leafA = createLiveBooleanLeaf({ id: "leaf-a", name: "사각형", shape: { kind: "rect", points: [0, 0, 100, 100] } });
    const leafB = createLiveBooleanLeaf({
      id: "leaf-b", name: "사각형2", shape: { kind: "rect", points: [50, 20, 140, 80] },
      transform: { tx: Number.NaN, ty: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    });
    const inner = createLiveBooleanGroup({ id: "inner", name: "내부 합집합", op: "union", children: [leafA, leafB] });
    const leafCut = createLiveBooleanLeaf({ id: "leaf-cut", name: "구멍", shape: { kind: "rect", points: [20, 20, 40, 40] } });
    const root = insertLiveBooleanChild(createLiveBooleanGroup({ id: "root", name: "최상위 차집합", op: "subtract", children: [inner] }), "root", leafCut, Number.NaN);

    expect(reorderLiveBooleanChild(root, "inner", Number.NaN, 1)).toBe(root);
    expect(reorderLiveBooleanChild(root, "inner", 0, 99)).toBe(root);
    const evalRes = await evaluateLiveBooleanGroup(root);
    expect(evalRes.ok && evalRes.evaluatedLeafCount === 3).toBe(true);
    expect((await flattenLiveBooleanGroupToDrawElSeeds(root)).ok).toBe(true);
    expect(removeLiveBooleanChild(toggleLiveBooleanNodeVisibility(root, "leaf-cut"), "leaf-cut").children).toHaveLength(1);
  });

  it("비파괴 레이어 마스크(생성·스트로크 굽기·반전·합성·비유한 크기 방어)가 원본 래스터를 건드리지 않는다", () => {
    const imgEl = { type: "image", maskSrc: "data:image/png;base64,AA==", maskEnabled: true };
    expect(canLayerMask(imgEl) && hasLayerMask(imgEl) && shouldApplyLayerMask(imgEl)).toBe(true);
    expect(shouldApplyLayerMask({ ...imgEl, maskEnabled: false })).toBe(false);
    expect(layerMaskFeatherPx(40, 0.5)).toBeCloseTo(12, 5);

    const { factory, ops } = createRecordingCanvasFactory();
    const created = createLayerMaskCanvas(128, 128, "reveal", factory)!;
    expect(createLayerMaskCanvas(Number.NaN, 128, "reveal", factory)).toBeNull();
    const baked = bakeLayerMaskStroke(created, 128, 128, {
      points: [{ x: 10, y: 10 }, { x: 40, y: 40 }], radiusPx: 12, hardness: 0.5, strength: 0.8, mode: "conceal",
    }, factory)!;
    expect(ops.some((op) => op.startsWith("stroke:destination-out:"))).toBe(true);
    expect(compositeLayerMask(created, invertLayerMaskAlpha(baked, 128, 128, factory)!, 128, 128, factory)?.width).toBe(128);
    expect(ops.includes("drawImage:destination-in")).toBe(true);
  });
});

describe("5. 순서 바꾸기(Reordering) 및 Undo/Redo 왕복 불변식 전수 감사", () => {
  it("단일·다중 레이어 Z-order(맨 앞/뒤 · 한 칸 앞/뒤 · 타깃 드롭)가 그룹 연속성과 경계 no-op을 지킨다", () => {
    const items = [{ id: "bg" }, { id: "c1", groupId: "g1" }, { id: "c2", groupId: "g1" }, { id: "fg" }];
    expect(moveLayerItem(items, "c2", "up")).toBe(items);
    expect(moveLayerItem(items, "c1", "up").map((i) => i.id)).toEqual(["bg", "c2", "c1", "fg"]);
    const jumped = reorderLayerItem(items, "bg", "forward");
    expect(jumped.map((i) => i.id)).toEqual(["c1", "c2", "bg", "fg"]);
    expect(hasContiguousLayerGroups(jumped)).toBe(true);

    const toFront = reorderLayerSelection(items, ["c1"], "front");
    expect(toFront.map((i) => i.id)).toEqual(["bg", "fg", "c1", "c2"]);
    expect(reorderLayerSelection(toFront, ["c2"], "back").map((i) => i.id)).toEqual(["c1", "c2", "bg", "fg"]);
    const targeted = reorderLayerSelectionToTarget(items, ["fg"], "bg", "back");
    expect(targeted.map((i) => i.id)).toEqual(["fg", "bg", "c1", "c2"]);
    expect(reorderLayerSelectionToTarget(items, ["fg"], "missing", "front")).toBe(items);
    expect(itemBelowId(targeted.map((i) => i.id), "bg")).toBe("fg");
    expect(itemBelowId(targeted.map((i) => i.id), "fg")).toBeNull();
    const withCopy = insertLayerCopiesAdjacent(items, new Map([["c1", { id: "c1-copy", groupId: "g1" }]]));
    expect(hasContiguousLayerGroups(withCopy) && removeLayerItems(withCopy, ["c1-copy", "missing"]).removedIds[0] === "c1-copy").toBe(true);
  });

  it("레이어 패널 드래그 드롭 의도 해석이 자기 자신 드롭을 거부하고 NaN 포인터 좌표를 안전하게 처리한다", () => {
    const items = [{ id: "a", groupId: "g1" }, { id: "b", groupId: "g1" }, { id: "c" }];
    expect(studioLayerDragSourceGroup(items, ["a", "b"])).toBe("g1");
    expect(studioLayerDragSourceGroup(items, ["a", "c"])).toBe("mixed");
    expect(studioLayerDropSideFromPointer(Number.NaN, 100, Number.NaN)).toBe("back");
    const itemPayload = { kind: "items" as const, ids: ["c"], sourceGroupId: null, label: "c" };
    const intoGroup = resolveStudioLayerGroupDropIntent({
      payload: itemPayload, targetKey: "group:g1", targetGroupId: "g1", targetId: "b", relativeY: Number.NaN,
    });
    expect(studioLayerDropIntentEqual(intoGroup, { kind: "into-group", targetKey: "group:g1", groupId: "g1" })).toBe(true);
    expect(resolveStudioLayerItemDropIntent({ payload: itemPayload, targetKey: "item:c", targetId: "c", targetGroupId: null, side: "front" })).toBeNull();
  });

  it("페이지/컷 시퀀스 순서 바꾸기·삽입·일괄 이동/삭제가 인덱스 초과·음수·NaN·소수점 입력을 안전하게 차단한다", () => {
    let seq = 0;
    const makeId = () => `p-${++seq}`;
    const pages = [createBlankPage(makeId), createBlankPage(makeId), createBlankPage(makeId)];
    const origIds = pages.map((p) => p.id);
    expect(reorderPages(pages, 0, 2).map((p) => p.id)).toEqual(["p-2", "p-3", "p-1"]);
    expect(movePage(pages, "p-2", -1).map((p) => p.id)).toEqual(["p-2", "p-1", "p-3"]);
    for (const [from, to] of [[-1, 1], [0, 99], [Number.NaN, 1], [0, Number.NaN], [0.5, 2]] as const) {
      expect(reorderPages(pages, from, to).map((p) => p.id)).toEqual(origIds);
    }
    const insertedNaN = insertBlankPageAt(pages, Number.NaN, makeId);
    expect(insertedNaN.at(-1)!.id).toBe("p-4");
    const bulkMoved = movePagesBulk(insertedNaN, ["p-1", "p-3"], 2);
    expect(bulkMoved.map((p) => p.id)).toEqual(["p-2", "p-4", "p-1", "p-3"]);
    const bulkDeleted = deletePagesBulk(bulkMoved, bulkMoved.map((p) => p.id));
    expect(bulkDeleted.nextPages).toHaveLength(1);
    expect(computeNextActiveIdAfterDelete(pages, "p-2")).toBe("p-1");
    expect(computeNextActiveIdAfterBulkDelete(bulkMoved, bulkDeleted.nextPages, "p-3")).toBe(bulkDeleted.nextPages[0]!.id);
  });

  it("스튜디오 UI Z-Index 계층 상수(STUDIO_Z / STUDIO_Z_CLASS)가 엄격한 단조 스택 순서를 지킨다", () => {
    const order = [
      STUDIO_Z.canvasHud, STUDIO_Z.toolRail, STUDIO_Z.toolBelt, STUDIO_Z.optionsStrip, STUDIO_Z.menubar,
      STUDIO_Z.toolPopover, STUDIO_Z.modal, STUDIO_Z.confirm, STUDIO_Z.menubarMenu, STUDIO_Z.help, STUDIO_Z.legal, STUDIO_Z.destructiveConfirm,
    ];
    for (let i = 1; i < order.length; i += 1) expect(order[i - 1]!).toBeLessThan(order[i]!);
    expect(STUDIO_Z_CLASS.destructiveConfirm).toBe(`z-[${STUDIO_Z.destructiveConfirm}]`);
  });

  it("비파괴 효과 그래프 트랜잭션(활성 노드 추가/제거 + 간선 재배선) Undo/Redo가 해시·직렬화·플랜을 바이트 동일하게 복원한다", () => {
    const baseGraph: StudioAdjustmentEffectGraph = {
      version: STUDIO_EFFECT_GRAPH_VERSION, id: "graph-audit", revision: 0, outputNodeId: "out",
      nodes: [
        { id: "src", kind: "source", sourceHash: "sha256:base", embedded: true, enabled: true, opacity: 1, blendMode: "normal" },
        { id: "out", kind: "output", outputColorSpace: "srgb", enabled: true, opacity: 1, blendMode: "normal" },
      ],
      edges: [{ from: "src", to: "out", input: "source" }],
    };
    const addTx = transactStudioEffectGraph(baseGraph, "tx-add-blur", [
      { type: "add-node", node: { id: "fx-blur", kind: "live-effect", effect: "blur", parameters: { radius: 8 }, preferredBackend: "auto", enabled: true, opacity: 0.85, blendMode: "normal" } },
      { type: "remove-edge", edge: { from: "src", to: "out", input: "source" } },
      { type: "add-edge", edge: { from: "src", to: "fx-blur", input: "source" } },
      { type: "add-edge", edge: { from: "fx-blur", to: "out", input: "source" } },
    ]);
    expect(serializeStudioAdjustmentEffectGraph(undoStudioEffectGraphTransaction(addTx))).toBe(serializeStudioAdjustmentEffectGraph(baseGraph));
    const redone = redoStudioEffectGraphTransaction(addTx);
    expect(planStudioEffectGraphRender({ graph: redone, purpose: "preview", webGpuAvailable: true, sourceColorSpace: "srgb" }).steps.map((s) => s.nodeId)).toEqual(["src", "fx-blur", "out"]);

    const removeTx = transactStudioEffectGraph(redone, "tx-remove-blur", [
      { type: "remove-node", nodeId: "fx-blur" },
      { type: "add-edge", edge: { from: "src", to: "out", input: "source" } },
    ]);
    expect(removeTx.after.nodes.map((n) => n.id)).toEqual(["src", "out"]);
    expect(serializeStudioAdjustmentEffectGraph(undoStudioEffectGraphTransaction(removeTx))).toBe(serializeStudioAdjustmentEffectGraph(redone));
  });

  it("변형 → 비파괴 필터 → 그룹핑 → 순서 바꾸기 4단계 편집 세션이 통합 Undo/Redo 저널에서 Merkle 다이제스트 무손실 왕복한다", () => {
    const step0: PageLike[] = [{
      id: "page-1", bg: "#ffffff", bgGrad: null, canvasH: 1080, groups: [],
      elements: [makeDrawEl("d1", [10, 10, 90, 50]), makeImageEl("i1", 100, 100, 120, 120), makeImageEl("i2", 260, 100, 120, 120)],
    }];
    const transformedDraw = planStudioDrawObjectTransformWithBounds({
      el: step0[0]!.elements[0] as DrawEl, sourceBounds: { x: 10, y: 10, width: 80, height: 40 },
      targetBounds: { x: 20, y: 20, width: 160, height: 80 }, rotationDeg: 15,
    })!.element;
    const step1: PageLike[] = [{ ...step0[0]!, elements: [transformedDraw, step0[0]!.elements[1]!, step0[0]!.elements[2]!] }];
    const filterStack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), { id: "adj-blur", engine: "gaussian-blur", params: { radius: 6, strength: 75 } });
    const step2: PageLike[] = [{
      ...step1[0]!,
      elements: [step1[0]!.elements[0]!, { ...step1[0]!.elements[1]!, smartFilters: filterStack } as PageLike["elements"][number], step1[0]!.elements[2]!],
    }];
    const g1 = createLayerGroup("g-hero", "주인공");
    const step3: PageLike[] = [{ ...step2[0]!, groups: [g1], elements: groupItems(step2[0]!.elements as El[], ["d1", "i1"], g1.id) }];
    const step4: PageLike[] = [{ ...step3[0]!, elements: reorderLayerSelection(step3[0]!.elements as El[], ["i2"], "back") }];

    const snapshots = [step0, step1, step2, step3, step4];
    const digests = snapshots.map((pages, idx) => summarizeStudioHistorySnapshot(pages, idx).contentDigest);
    expect(new Set(digests).size).toBe(5);

    let journal = createStudioHistoryJournal<string, string>();
    for (let i = 1; i < snapshots.length; i += 1) {
      journal = recordStudioHistoryJournalPagesSteps(journal, { addedSteps: 1, nextUndoDepth: i, changedPageIds: ["page-1"] });
    }
    for (let depth = 4; depth >= 1; depth -= 1) {
      expect(readStudioHistoryJournalUndoEntry(journal)).not.toBeNull();
      journal = stepStudioHistoryJournal(journal, "undo");
      expect(summarizeStudioHistorySnapshot(snapshots[journal.cursor]!, journal.cursor).contentDigest).toBe(digests[depth - 1]);
    }
    expect(readStudioHistoryJournalUndoEntry(journal)).toBeNull();
    for (let depth = 0; depth < 4; depth += 1) {
      expect(readStudioHistoryJournalRedoEntry(journal)).not.toBeNull();
      journal = stepStudioHistoryJournal(journal, "redo");
      expect(summarizeStudioHistorySnapshot(snapshots[journal.cursor]!, journal.cursor).contentDigest).toBe(digests[depth + 1]);
    }
    journal = recordStudioHistoryJournalPagesSteps(seekStudioHistoryJournalToPagesDepth(journal, 2), { addedSteps: 1, nextUndoDepth: 3 });
    expect(journal.cursor === 3 && journal.entries.length === 3 && readStudioHistoryJournalRedoEntry(journal) === null).toBe(true);
  });
});
