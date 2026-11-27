/* Extracted stage pointer retouch/mask release branches from studio-cuttoon-stage-pointers-up.ts. */
"use no memo";

import { applyMaskStrokeDabs } from "../studio-quick-mask";
import { thinStudioRasterRetouchPointsForApply } from "../render/studio-raster-retouch-stroke-sampling";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";

export function handleStudioStagePointerRetouchAndMaskUp(
  h: StudioCuttoonStagePointersHost,
): boolean {
  const {
    applyDodgeBurnStroke,
    applySmudgeStroke,
    applyWetMixStroke,
    bakeFilterMaskPaintStroke,
    bakeHealCloneDragStroke,
    bakeHistoryBrushDragStroke,
    bakeLayerMaskPaintStroke,
    clearFilterMaskDragPreview,
    clearHealCloneDragPreview,
    clearHistoryBrushDragPreview,
    clearLayerMaskDragPreview,
    clearPaintRetouchStrokePreview,
    clearQuickMaskDragPreview,
    dodgeBurnDragRef,
    filterMaskDragRef,
    finishQuickSelectionStroke,
    healCloneDragRef,
    historyBrushDragRef,
    layerMaskDragRef,
    quickMaskBrushMode,
    quickMaskDragRef,
    quickMaskHardness,
    quickMaskOpacity,
    quickMaskRadius,
    quickMaskSessionRef,
    quickSelectDragRef,
    refreshQuickMaskTint,
    smudgeDragRef,
    wetMixDragRef,
  } = h;

  if (quickSelectDragRef.current) {
    const session = quickSelectDragRef.current;
    quickSelectDragRef.current = null;
    if (session.points.length >= 1) {
      void finishQuickSelectionStroke(session);
    }
    return true;
  }

  if (smudgeDragRef.current) {
    const session = smudgeDragRef.current;
    smudgeDragRef.current = null;
    clearPaintRetouchStrokePreview();
    if (session.points.length >= 2) {
      void applySmudgeStroke(
        session.elId,
        thinStudioRasterRetouchPointsForApply(session.points),
      );
    }
    return true;
  }

  if (dodgeBurnDragRef.current) {
    const session = dodgeBurnDragRef.current;
    dodgeBurnDragRef.current = null;
    clearPaintRetouchStrokePreview();
    if (session.points.length >= 1) {
      void applyDodgeBurnStroke(
        session.elId,
        thinStudioRasterRetouchPointsForApply(session.points),
      );
    }
    return true;
  }

  if (wetMixDragRef.current) {
    const session = wetMixDragRef.current;
    wetMixDragRef.current = null;
    clearPaintRetouchStrokePreview();
    if (session.points.length >= 1) {
      void applyWetMixStroke(
        session.elId,
        thinStudioRasterRetouchPointsForApply(session.points),
      );
    }
    return true;
  }

  if (quickMaskDragRef.current) {
    const session = quickMaskDragRef.current;
    quickMaskDragRef.current = null;
    clearQuickMaskDragPreview();
    const qm = quickMaskSessionRef.current;
    if (qm && session.elId === qm.elId && session.points.length > 0) {
      applyMaskStrokeDabs(
        qm.mask,
        qm.maskW,
        qm.maskH,
        session.points.map((p: { x: number; y: number }) => ({
          x: p.x * qm.maskW,
          y: p.y * qm.maskH,
        })),
        {
          radius: Math.max(1, quickMaskRadius * qm.featherScale),
          hardness: quickMaskHardness,
          opacity: quickMaskOpacity,
          mode: quickMaskBrushMode,
        },
      );
      refreshQuickMaskTint();
    }
    return true;
  }

  if (layerMaskDragRef.current) {
    const session = layerMaskDragRef.current;
    layerMaskDragRef.current = null;
    clearLayerMaskDragPreview();
    if (session.points.length > 0) void bakeLayerMaskPaintStroke(session);
    return true;
  }

  if (filterMaskDragRef.current) {
    const session = filterMaskDragRef.current;
    filterMaskDragRef.current = null;
    clearFilterMaskDragPreview();
    if (session.points.length > 0) void bakeFilterMaskPaintStroke(session);
    return true;
  }

  if (healCloneDragRef.current) {
    const session = healCloneDragRef.current;
    healCloneDragRef.current = null;
    clearHealCloneDragPreview();
    if (session.points.length > 0) void bakeHealCloneDragStroke(session);
    return true;
  }

  if (historyBrushDragRef.current) {
    const session = historyBrushDragRef.current;
    historyBrushDragRef.current = null;
    clearHistoryBrushDragPreview();
    if (session.points.length > 0) void bakeHistoryBrushDragStroke(session);
    return true;
  }

  return false;
}
