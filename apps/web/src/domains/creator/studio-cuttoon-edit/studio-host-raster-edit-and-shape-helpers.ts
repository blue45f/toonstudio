import type Konva from "konva";
import type { MutableRefObject } from "react";

import { canLayerMask, invertLayerMaskAlpha } from "../layer/studio-layer-mask";
import {
  bubbleShapeCanvasPointToLocal,
  insertBubbleShapePointAtClosestSegment,
  removeBubbleShapePoint,
} from "../lettering/studio-bubble-custom-shape";
import { studioKonvaRuntime as KonvaRuntime } from "../render/studio-konva-runtime";
import { resolveStudioVectorEraseResult } from "../status-i18n/studio-producer-error-i18n-vector";
import { isCropRectNoop, planCropApply, type CropRect } from "../studio-crop";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { BubbleEl, El } from "../studio-element-model";
import {
  bakeHistoryBrushStrokeToCanvas,
  planHistoryBrushDabs,
} from "../studio-history-brush";
import { isEffectivelyHidden, isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import {
  createStudioPixelEditCanvas,
  encodeStudioPixelEditResultPng,
  loadStudioPixelEditImage,
  yieldStudioPixelEditMainThread,
} from "../studio-legacy-editor-runtime-helpers";
import {
  beginNodeDrag,
  hitTestNodeHandle,
  type NodeDragSession,
  type NodeEditHandle,
} from "../studio-node-edit";
import { bakePuppetWarpToCanvas, isPuppetWarpNoop, type PuppetPin } from "../studio-puppet-warp";
import {
  buildSelectionMaskPlan,
  isSelectionUsable,
  rasterizeSelectionMask,
  type PixelSelection,
  type SelectionFrame,
  type SelPoint,
} from "../studio-selection-tools";
import {
  planStudioVectorEraseToIntersectionApply,
  STUDIO_ERASE_TO_INTERSECTION_LABEL,
} from "../studio-vector-erase-to-intersection-apply";
import type { BubbleShapePointerCaptureTarget } from "../vector/studio-node-bubble-edit-controller";

export interface StudioBubbleShapeDragSession {
  captureTarget: BubbleShapePointerCaptureTarget | null;
  elId: string;
  pointerId: number;
  session: NodeDragSession;
}

export async function runStudioApplyCropToSelectedImage(input: {
  readonly cropBusy: boolean;
  readonly cropRect: CropRect | null;
  readonly selected: El | null;
  readonly activeSurfaceReviewLocked: boolean;
  readonly groups: readonly LayerGroup[];
  readonly captureMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly isLatestLayerContentMutationLocked: (id: string) => boolean;
  readonly setCropBusy: (busy: boolean) => void;
  readonly setCropRect: (rect: CropRect | null) => void;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly setError: (message: string | null) => void;
  readonly translate: (key: string, fallback: string) => string;
}): Promise<void> {
  if (input.cropBusy || !input.cropRect) return;
  if (input.selected?.type !== "image") return;
  if (input.activeSurfaceReviewLocked || isEffectivelyLocked(input.selected, input.groups)) return;
  if (isCropRectNoop(input.cropRect)) {
    input.setCropRect(null);
    return;
  }
  const target = input.selected;
  const mutationTicket = input.captureMutationTicket();
  const rect = input.cropRect;
  input.setCropBusy(true);
  try {
    const img = await loadStudioPixelEditImage(target.src);
    const plan = planCropApply({
      rect,
      natural: { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height },
      frame: {
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
        rotation: target.rotation,
      },
      flipX: target.flipped,
      flipY: target.flippedY,
    });
    if (!plan) {
      throw new Error(input.translate("studio.hostStatus.cropRegionCalcFailed", "크롭 영역을 계산하지 못했습니다."));
    }
    const out = createStudioPixelEditCanvas(plan.source.sw, plan.source.sh);
    if (!out) {
      throw new Error(input.translate("studio.hostStatus.cropCanvasCreateFailed", "크롭 캔버스를 만들지 못했습니다."));
    }
    out.ctx.drawImage(
      img,
      plan.source.sx,
      plan.source.sy,
      plan.source.sw,
      plan.source.sh,
      0,
      0,
      plan.source.sw,
      plan.source.sh,
    );
    await yieldStudioPixelEditMainThread();
    const src = await encodeStudioPixelEditResultPng(out.canvas);
    if (!input.canApplyMutation(mutationTicket)) return;
    if (input.isLatestLayerContentMutationLocked(target.id)) return;
    input.patchEl(target.id, {
      src,
      x: plan.el.x,
      y: plan.el.y,
      width: plan.el.width,
      height: plan.el.height,
      maskSrc: target.maskSrc ? undefined : target.maskSrc,
      maskEnabled: target.maskSrc ? undefined : target.maskEnabled,
    } as Partial<El>);
    input.setCropRect(null);
    input.setError(null);
  } catch (err) {
    console.error("Failed to apply image crop:", err);
    input.setError(
      err instanceof Error
        ? err.message
        : input.translate("studio.hostStatus.imageCropFailed", "이미지 크롭에 실패했습니다."),
    );
  } finally {
    input.setCropBusy(false);
  }
}

export async function runStudioApplyPuppetWarpToSelectedImage(input: {
  readonly puppetWarpBusy: boolean;
  readonly puppetWarpPins: readonly PuppetPin[];
  readonly selected: El | null;
  readonly activeSurfaceReviewLocked: boolean;
  readonly groups: readonly LayerGroup[];
  readonly captureMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly isLatestLayerContentMutationLocked: (id: string) => boolean;
  readonly setPuppetWarpBusy: (busy: boolean) => void;
  readonly setPuppetWarpActive: (active: boolean) => void;
  readonly setPuppetWarpPins: (pins: PuppetPin[]) => void;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly setError: (message: string | null) => void;
  readonly translate: (key: string, fallback: string) => string;
}): Promise<void> {
  if (input.puppetWarpBusy || isPuppetWarpNoop(input.puppetWarpPins)) return;
  if (input.selected?.type !== "image") return;
  if (input.activeSurfaceReviewLocked || isEffectivelyLocked(input.selected, input.groups)) return;
  const target = input.selected;
  const mutationTicket = input.captureMutationTicket();
  const pins = input.puppetWarpPins;
  input.setPuppetWarpBusy(true);
  try {
    const img = await loadStudioPixelEditImage(target.src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const out = bakePuppetWarpToCanvas(img, w, h, pins, createStudioPixelEditCanvas, {
      flipX: target.flipped,
      flipY: target.flippedY,
    });
    if (!out) {
      throw new Error(input.translate("studio.hostStatus.puppetWarpResultCreateFailed", "퍼펫 워프 결과를 만들지 못했습니다."));
    }
    await yieldStudioPixelEditMainThread();
    const src = await encodeStudioPixelEditResultPng(out as HTMLCanvasElement);
    if (!input.canApplyMutation(mutationTicket)) return;
    if (input.isLatestLayerContentMutationLocked(target.id)) return;
    input.patchEl(target.id, { src } as Partial<El>);
    input.setPuppetWarpActive(false);
    input.setPuppetWarpPins([]);
    input.setError(null);
  } catch (err) {
    console.error("Failed to apply puppet warp:", err);
    input.setError(
      err instanceof Error
        ? err.message
        : input.translate("studio.hostStatus.puppetWarpApplyFailed", "퍼펫 워프 적용에 실패했습니다."),
    );
  } finally {
    input.setPuppetWarpBusy(false);
  }
}

export function runStudioCreateLayerMaskFromSelection(input: {
  readonly outside: boolean;
  readonly selected: El | null;
  readonly activeSurfaceReviewLocked: boolean;
  readonly groups: readonly LayerGroup[];
  readonly pixelSel: PixelSelection | null;
  readonly captureMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly isLatestLayerContentMutationLocked: (id: string) => boolean;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly setError: (message: string | null) => void;
  readonly translate: (key: string, fallback: string) => string;
}): void {
  if (
    input.selected?.type !== "image"
    || !canLayerMask(input.selected)
    || input.activeSurfaceReviewLocked
    || isEffectivelyLocked(input.selected, input.groups)
  ) {
    return;
  }
  if (!isSelectionUsable(input.pixelSel)) {
    input.setError("마스크로 만들 픽셀 영역을 먼저 선택하세요.");
    return;
  }
  const target = input.selected;
  const sel = input.pixelSel;
  const mutationTicket = input.captureMutationTicket();
  void (async () => {
    try {
      const img = await loadStudioPixelEditImage(target.src);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const maskPlan = buildSelectionMaskPlan(sel, w, h, {
        featherScale: target.width > 0 ? w / target.width : 1,
        flipX: target.flipped,
        flipY: target.flippedY,
      });
      if (!maskPlan) return;
      const selectionMask = rasterizeSelectionMask(maskPlan, createStudioPixelEditCanvas);
      if (!selectionMask) {
        throw new Error(input.translate("studio.hostStatus.selectionMaskCreateFailed", "선택 마스크를 만들지 못했습니다."));
      }
      const mask = input.outside
        ? invertLayerMaskAlpha(selectionMask, w, h, createStudioPixelEditCanvas)
        : selectionMask;
      if (!mask) {
        throw new Error(input.translate("studio.hostStatus.maskInvertFailed", "마스크를 반전하지 못했습니다."));
      }
      await yieldStudioPixelEditMainThread();
      const maskSrc = await encodeStudioPixelEditResultPng(mask as HTMLCanvasElement);
      if (!input.canApplyMutation(mutationTicket)) return;
      if (input.isLatestLayerContentMutationLocked(target.id)) return;
      input.patchEl(target.id, { maskSrc, maskEnabled: true } as Partial<El>);
      input.setError(null);
    } catch (err) {
      console.error("Failed to create layer mask from selection:", err);
      input.setError(
        err instanceof Error
          ? err.message
          : input.translate("studio.hostStatus.maskFromSelectionFailed", "선택 영역으로 마스크를 만들지 못했습니다."),
      );
    }
  })();
}

export async function runStudioBakeHistoryBrushDragStroke(input: {
  readonly session: {
    readonly elId: string;
    readonly frame: SelectionFrame;
    readonly radiusNorm: number;
    readonly points: SelPoint[];
  };
  readonly target: El | undefined;
  readonly activeSurfaceReviewLocked: boolean;
  readonly groups: readonly LayerGroup[];
  readonly historyBrushSourceSrc: string | null;
  readonly historyBrushRadius: number;
  readonly historyBrushHardness: number;
  readonly historyBrushOpacity: number;
  readonly captureMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly isLatestLayerContentMutationLocked: (id: string) => boolean;
  readonly setHistoryBrushBusy: (busy: boolean) => void;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly setError: (message: string | null) => void;
  readonly translate: (key: string, fallback: string) => string;
}): Promise<void> {
  const target = input.target;
  if (
    !target
    || target.type !== "image"
    || input.activeSurfaceReviewLocked
    || isEffectivelyLocked(target, input.groups)
  ) {
    return;
  }
  const mutationTicket = input.captureMutationTicket();
  const historySrc = input.historyBrushSourceSrc;
  if (!historySrc) return;
  input.setHistoryBrushBusy(true);
  try {
    const [historyImg, currentImg] = await Promise.all([
      loadStudioPixelEditImage(historySrc),
      loadStudioPixelEditImage(target.src),
    ]);
    const w = currentImg.naturalWidth || currentImg.width;
    const h = currentImg.naturalHeight || currentImg.height;
    const dabs = planHistoryBrushDabs(input.session.points, w, h, {
      flipX: target.flipped,
      flipY: target.flippedY,
    });
    if (dabs.length === 0) return;
    const radiusPxDevice = input.historyBrushRadius * (target.width > 0 ? w / target.width : 1);
    const out = bakeHistoryBrushStrokeToCanvas(
      historyImg,
      currentImg,
      w,
      h,
      dabs,
      {
        radiusPx: radiusPxDevice,
        hardness: input.historyBrushHardness,
        opacity: input.historyBrushOpacity,
      },
      createStudioPixelEditCanvas,
    );
    if (!out) {
      throw new Error(input.translate("studio.hostStatus.historyBrushResultCreateFailed", "히스토리 브러시 결과를 만들지 못했습니다."));
    }
    await yieldStudioPixelEditMainThread();
    const src = await encodeStudioPixelEditResultPng(out as HTMLCanvasElement);
    if (!input.canApplyMutation(mutationTicket)) return;
    if (input.isLatestLayerContentMutationLocked(target.id)) return;
    input.patchEl(target.id, { src } as Partial<El>);
    input.setError(null);
  } catch (err) {
    console.error("Failed to bake history brush stroke:", err);
    input.setError(
      err instanceof Error
        ? err.message
        : input.translate("studio.hostStatus.historyBrushApplyFailed", "히스토리 브러시 적용에 실패했습니다."),
    );
  } finally {
    input.setHistoryBrushBusy(false);
  }
}

export function runStudioBubbleShapePointerDown(input: {
  readonly event: Konva.KonvaEventObject<MouseEvent | TouchEvent>;
  readonly stagePointerEvent: PointerEvent;
  readonly bubbleShapeArmed: boolean;
  readonly selected: El | null;
  readonly isSpacePressed: boolean;
  readonly effScale: number;
  readonly bubbleShapeHandles: readonly NodeEditHandle[];
  readonly bubbleShapeDragRef: MutableRefObject<StudioBubbleShapeDragSession | null>;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly setBubbleShapeSelectedPointIndex: (index: number | null) => void;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly translate: (key: string, fallback: string) => string;
}): boolean {
  if (
    !input.bubbleShapeArmed
    || input.selected?.type !== "bubble"
    || input.isSpacePressed
    || input.event.target.getParent() instanceof KonvaRuntime.Transformer
  ) {
    return false;
  }
  const bubble: BubbleEl = input.selected;
  const pos = input.event.target.getStage()?.getRelativePointerPosition();
  if (!pos) return true;
  const local = bubbleShapeCanvasPointToLocal(pos.x, pos.y, {
    x: bubble.x,
    y: bubble.y,
    rotation: bubble.rotation,
  });
  const tolerance = 14 / input.effScale;
  const hitIdx = hitTestNodeHandle(local, input.bubbleShapeHandles, tolerance);
  if (hitIdx !== null) {
    if (input.event.evt.altKey) {
      const removed = removeBubbleShapePoint(bubble.customShapePoints ?? [], hitIdx);
      if (removed.changed) {
        input.patchEl(bubble.id, { customShapePoints: removed.points } as Partial<El>);
        const nextCount = removed.points.length / 2;
        input.setBubbleShapeSelectedPointIndex(Math.min(hitIdx, nextCount - 1));
        input.announceDrawingShortcut(`말풍선 외곽선 점 삭제 · ${nextCount}개`);
      } else if (removed.outcome === "minimum-points") {
        input.announceDrawingShortcut(
          input.translate("studio.hostStatus.bubbleMinPoints", "말풍선 외곽선에는 최소 3개의 점이 필요합니다"),
        );
      }
      return true;
    }
    input.setBubbleShapeSelectedPointIndex(hitIdx);
    const session = beginNodeDrag(
      bubble.customShapePoints ?? [],
      undefined,
      hitIdx,
      "move",
      local,
    );
    if (session) {
      const pointerId = Number.isFinite(input.stagePointerEvent.pointerId)
        ? input.stagePointerEvent.pointerId
        : 1;
      const nativeTarget = input.stagePointerEvent.currentTarget as
        | (EventTarget & {
            releasePointerCapture?: (capturedPointerId: number) => void;
            setPointerCapture?: (capturedPointerId: number) => void;
          })
        | null;
      let captureTarget: BubbleShapePointerCaptureTarget | null = null;
      if (nativeTarget?.setPointerCapture) {
        try {
          nativeTarget.setPointerCapture(pointerId);
          captureTarget = nativeTarget;
        } catch {
          // Some WebViews expose Pointer Events but reject capture for synthesized mouse input.
        }
      }
      input.bubbleShapeDragRef.current = {
        captureTarget,
        elId: bubble.id,
        pointerId,
        session,
      };
    }
  } else if (input.event.evt.shiftKey) {
    const inserted = insertBubbleShapePointAtClosestSegment(
      bubble.customShapePoints ?? [],
      local.x,
      local.y,
    );
    if (inserted.changed && inserted.pointIndex !== null) {
      input.patchEl(bubble.id, { customShapePoints: inserted.points } as Partial<El>);
      input.setBubbleShapeSelectedPointIndex(inserted.pointIndex);
      input.announceDrawingShortcut(`말풍선 외곽선 점 추가 · ${inserted.points.length / 2}개`);
    }
  }
  return true;
}

export function runStudioVectorEraseToIntersectionAt(input: {
  readonly x: number;
  readonly y: number;
  readonly elements: readonly El[];
  readonly groups: readonly LayerGroup[];
  readonly allocateId: () => string;
  readonly commit: (elements: El[]) => boolean;
  readonly setError: (message: string | null) => void;
  readonly announceDrawingShortcut: (message: string) => void;
}): boolean {
  const planned = planStudioVectorEraseToIntersectionApply({
    elements: input.elements,
    point: { x: input.x, y: input.y },
    allocateId: input.allocateId,
    isEditable: (el) =>
      !isEffectivelyLocked(el, input.groups) && !isEffectivelyHidden(el, input.groups),
  });
  if (!planned.ok) {
    input.setError(resolveStudioVectorEraseResult(planned) ?? planned.reason);
    return true;
  }
  if (!input.commit(planned.nextElements)) return true;
  input.announceDrawingShortcut(
    planned.pieceCount === 0
      ? `${STUDIO_ERASE_TO_INTERSECTION_LABEL} · 선 삭제`
      : planned.pieceCount === 1
        ? `${STUDIO_ERASE_TO_INTERSECTION_LABEL} · 구간 정리`
        : `${STUDIO_ERASE_TO_INTERSECTION_LABEL} · ${planned.pieceCount}조각`,
  );
  return true;
}
