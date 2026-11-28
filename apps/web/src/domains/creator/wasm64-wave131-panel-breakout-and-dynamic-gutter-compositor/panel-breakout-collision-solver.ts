/**
 * Wave 131 — 인접 컷 얼굴·말풍선 보호 영역 침범 및 좌우 캔버스 잘림(>10%) 감사기 &
 * 무침범 동적 거터 확장·수평 안전 클램핑 교정 솔버.
 */

import {
  cleanPolygonVertices,
  clipPolygonToHorizontalBand,
  computePolygonArea,
  computePolygonBounds,
  measurePolygonsCollision,
  roundFixed,
  sanitizeFinite,
  scalePolygonXAroundCenter,
  translatePolygon,
} from "./panel-breakout-geometry-primitives";
import { compilePanelBreakoutCompositor } from "./panel-frame-geometry-and-breakout";
import type {
  BreakoutCollisionAudit,
  BreakoutHorizontalClampRecord,
  BreakoutSubjectInput,
  CanvasHorizontalClipViolation,
  CollisionFreeBreakoutSolveResult,
  ComicPanelInput,
  CompiledPanelBreakoutLayout,
  NeighborCriticalZoneCollision,
  PanelBreakoutDocument,
  PanelCriticalZoneInput,
  PanelGutterShiftRecord,
  PanelWindingOrder,
  SolveBreakoutLayoutOptions,
  Vec2,
} from "./panel-breakout-types";

/**
 * 돌출 피사체의 인접 컷 얼굴·말풍선 보호 영역 침범 및 좌우 캔버스 잘림(>10%)을 정밀 감사한다.
 */
export function auditBreakoutCollisions(
  compiled: CompiledPanelBreakoutLayout,
): BreakoutCollisionAudit {
  const neighborCollisions: NeighborCriticalZoneCollision[] = [];
  const canvasViolations: CanvasHorizontalClipViolation[] = [];
  const zeroOverflowBreakoutSubjectIds: string[] = [];
  let maxHorizontalClipRatioObserved = 0;

  for (let i = 0; i < compiled.panels.length; i += 1) {
    const ownerPanel = compiled.panels[i];
    if (!ownerPanel) continue;

    for (let sIdx = 0; sIdx < ownerPanel.subjects.length; sIdx += 1) {
      const subject = ownerPanel.subjects[sIdx];
      if (!subject || subject.breakoutMode === "clipped-inside") continue;

      if (subject.originalAreaPx2 > 1e-3 && subject.breakoutOverflowAreaPx2 <= 1e-2) {
        zeroOverflowBreakoutSubjectIds.push(subject.subjectId);
      }

      const insideCanvasPoly = clipPolygonToHorizontalBand(
        subject.renderPolygon,
        0,
        compiled.canvasWidthPx,
      );
      const insideCanvasAreaPx2 = computePolygonArea(insideCanvasPoly);
      const clippedOutsideAreaPx2 = Math.max(0, subject.renderAreaPx2 - insideCanvasAreaPx2);
      const clippedOutsideRatio =
        subject.renderAreaPx2 > 1e-4 ? clippedOutsideAreaPx2 / subject.renderAreaPx2 : 0;

      if (clippedOutsideRatio > maxHorizontalClipRatioObserved) {
        maxHorizontalClipRatioObserved = clippedOutsideRatio;
      }

      const leftOverflowPx = Math.max(0, -subject.bounds.minX);
      const rightOverflowPx = Math.max(0, subject.bounds.maxX - compiled.canvasWidthPx);

      if (clippedOutsideRatio > compiled.maxHorizontalClipRatio + 1e-6) {
        canvasViolations.push({
          panelId: ownerPanel.panelId,
          subjectId: subject.subjectId,
          subjectLabelKo: subject.labelKo,
          breakoutMode: subject.breakoutMode,
          totalAreaPx2: subject.renderAreaPx2,
          clippedOutsideAreaPx2,
          clippedOutsideRatio,
          maxAllowedRatio: compiled.maxHorizontalClipRatio,
          leftOverflowPx,
          rightOverflowPx,
        });
      }

      for (let j = 0; j < compiled.panels.length; j += 1) {
        const neighborPanel = compiled.panels[j];
        if (!neighborPanel || neighborPanel.panelId === ownerPanel.panelId) continue;

        for (let zIdx = 0; zIdx < neighborPanel.criticalZones.length; zIdx += 1) {
          const zone = neighborPanel.criticalZones[zIdx];
          if (!zone || zone.polygon.length < 3) continue;

          const collision = measurePolygonsCollision(subject.renderPolygon, zone.polygon);
          if (collision.intersects) {
            const ownerIsUpper =
              ownerPanel.frame.bounds.minY < neighborPanel.frame.bounds.minY - 1e-3 ||
              (Math.abs(ownerPanel.frame.bounds.minY - neighborPanel.frame.bounds.minY) <= 1e-3 &&
                ownerPanel.orderIndex < neighborPanel.orderIndex);
            const requiredVerticalShiftPx = ownerIsUpper
              ? Math.max(0, subject.bounds.maxY - zone.bounds.minY)
              : Math.max(0, zone.bounds.maxY - subject.bounds.minY);

            neighborCollisions.push({
              ownerPanelId: ownerPanel.panelId,
              subjectId: subject.subjectId,
              subjectLabelKo: subject.labelKo,
              breakoutMode: subject.breakoutMode,
              neighborPanelId: neighborPanel.panelId,
              zoneId: zone.zoneId,
              zoneLabelKo: zone.labelKo,
              zoneKind: zone.kind,
              overlapAreaPx2: collision.overlapAreaPx2,
              penetrationDepthPx: collision.maxPenetrationDepthPx,
              requiredVerticalShiftPx,
            });
          }
        }
      }
    }
  }

  const passed = neighborCollisions.length === 0 && canvasViolations.length === 0;
  const verdict: BreakoutCollisionAudit["verdict"] = !passed
    ? "fail"
    : zeroOverflowBreakoutSubjectIds.length > 0
      ? "warn"
      : "pass";

  return {
    passed,
    verdict,
    neighborCriticalZoneCollisionCount: neighborCollisions.length,
    canvasHorizontalClipViolationCount: canvasViolations.length,
    neighborCriticalZoneCollisions: neighborCollisions,
    canvasHorizontalClipViolations: canvasViolations,
    totalBreakoutSubjectCount: compiled.totalBreakoutSubjectCount,
    totalBreakoutOverflowAreaPx2: compiled.totalBreakoutOverflowAreaPx2,
    maxHorizontalClipRatioObserved,
    zeroOverflowBreakoutSubjectIds,
  };
}

interface MutablePanelState {
  panelId: string;
  titleKo: string;
  style: ComicPanelInput["style"];
  bounds: { x: number; y: number; width: number; height: number };
  baseArtBounds?: { x: number; y: number; width: number; height: number };
  borderStrokeWidthPx?: number;
  winding?: PanelWindingOrder;
  slashTopSkewPx?: number;
  slashBottomSkewPx?: number;
  shatterTeethPerEdge?: number;
  shatterDepthRatio?: number;
  shatterSeed?: number;
  chamferSizePx?: number;
  breakoutSubjects: Array<{
    subjectId: string;
    labelKo: string;
    kind: BreakoutSubjectInput["kind"];
    breakoutMode: BreakoutSubjectInput["breakoutMode"];
    polygon: readonly Vec2[];
    zOffset?: number;
    allowHorizontalClamp?: boolean;
  }>;
  criticalZones: Array<{
    zoneId: string;
    labelKo: string;
    kind: PanelCriticalZoneInput["kind"];
    bounds: { x: number; y: number; width: number; height: number };
    polygon?: readonly Vec2[];
  }>;
}

function cloneDocumentForSolve(doc: PanelBreakoutDocument): MutablePanelState[] {
  return doc.panels.map((p) => ({
    panelId: p.panelId,
    titleKo: p.titleKo,
    style: p.style,
    bounds: {
      x: sanitizeFinite(p.bounds.x, 0, -1e5, 1e5),
      y: sanitizeFinite(p.bounds.y, 0, -1e5, 1e5),
      width: sanitizeFinite(p.bounds.width, 320, 24, 1e5),
      height: sanitizeFinite(p.bounds.height, 240, 24, 1e5),
    },
    baseArtBounds: p.baseArtBounds
      ? {
          x: sanitizeFinite(p.baseArtBounds.x, 0, -1e5, 1e5),
          y: sanitizeFinite(p.baseArtBounds.y, 0, -1e5, 1e5),
          width: sanitizeFinite(p.baseArtBounds.width, 320, 1, 1e5),
          height: sanitizeFinite(p.baseArtBounds.height, 240, 1, 1e5),
        }
      : undefined,
    borderStrokeWidthPx: p.borderStrokeWidthPx,
    winding: p.winding,
    slashTopSkewPx: p.slashTopSkewPx,
    slashBottomSkewPx: p.slashBottomSkewPx,
    shatterTeethPerEdge: p.shatterTeethPerEdge,
    shatterDepthRatio: p.shatterDepthRatio,
    shatterSeed: p.shatterSeed,
    chamferSizePx: p.chamferSizePx,
    breakoutSubjects: (p.breakoutSubjects ?? []).map((s) => ({
      subjectId: s.subjectId,
      labelKo: s.labelKo,
      kind: s.kind,
      breakoutMode: s.breakoutMode,
      polygon: cleanPolygonVertices(s.polygon),
      zOffset: s.zOffset,
      allowHorizontalClamp: s.allowHorizontalClamp,
    })),
    criticalZones: (p.criticalZones ?? []).map((z) => ({
      zoneId: z.zoneId,
      labelKo: z.labelKo,
      kind: z.kind,
      bounds: {
        x: sanitizeFinite(z.bounds.x, 0, -1e5, 1e5),
        y: sanitizeFinite(z.bounds.y, 0, -1e5, 1e5),
        width: sanitizeFinite(z.bounds.width, 1, 0, 1e5),
        height: sanitizeFinite(z.bounds.height, 1, 0, 1e5),
      },
      polygon: z.polygon ? cleanPolygonVertices(z.polygon) : undefined,
    })),
  }));
}

function buildDocumentFromMutable(
  original: PanelBreakoutDocument,
  mutablePanels: readonly MutablePanelState[],
): PanelBreakoutDocument {
  return {
    documentId: original.documentId,
    titleKo: original.titleKo,
    canvasWidthPx: original.canvasWidthPx,
    minGutterPx: original.minGutterPx,
    maxHorizontalClipRatio: original.maxHorizontalClipRatio,
    panels: mutablePanels.map((p) => ({
      panelId: p.panelId,
      titleKo: p.titleKo,
      style: p.style,
      bounds: { ...p.bounds },
      baseArtBounds: p.baseArtBounds ? { ...p.baseArtBounds } : undefined,
      borderStrokeWidthPx: p.borderStrokeWidthPx,
      winding: p.winding,
      slashTopSkewPx: p.slashTopSkewPx,
      slashBottomSkewPx: p.slashBottomSkewPx,
      shatterTeethPerEdge: p.shatterTeethPerEdge,
      shatterDepthRatio: p.shatterDepthRatio,
      shatterSeed: p.shatterSeed,
      chamferSizePx: p.chamferSizePx,
      breakoutSubjects: p.breakoutSubjects.map((s) => ({
        subjectId: s.subjectId,
        labelKo: s.labelKo,
        kind: s.kind,
        breakoutMode: s.breakoutMode,
        polygon: s.polygon.slice(),
        zOffset: s.zOffset,
        allowHorizontalClamp: s.allowHorizontalClamp,
      })),
      criticalZones: p.criticalZones.map((z) => ({
        zoneId: z.zoneId,
        labelKo: z.labelKo,
        kind: z.kind,
        bounds: { ...z.bounds },
        polygon: z.polygon ? z.polygon.slice() : undefined,
      })),
    })),
  };
}

function shiftMutablePanelVertically(panel: MutablePanelState, deltaY: number): void {
  panel.bounds.y += deltaY;
  if (panel.baseArtBounds) panel.baseArtBounds.y += deltaY;
  for (let i = 0; i < panel.breakoutSubjects.length; i += 1) {
    const sub = panel.breakoutSubjects[i];
    if (sub) sub.polygon = translatePolygon(sub.polygon, 0, deltaY);
  }
  for (let i = 0; i < panel.criticalZones.length; i += 1) {
    const zone = panel.criticalZones[i];
    if (!zone) continue;
    zone.bounds.y += deltaY;
    if (zone.polygon) zone.polygon = translatePolygon(zone.polygon, 0, deltaY);
  }
}

/**
 * 인접 컷 얼굴·말풍선 침범 및 좌우 캔버스 잘림 위반을 자동으로 해소하는
 * 무침범 동적 거터 확장·수평 안전 클램핑 솔버.
 */
export function solveCollisionFreeBreakoutLayout(
  document: PanelBreakoutDocument,
  options?: SolveBreakoutLayoutOptions,
): CollisionFreeBreakoutSolveResult {
  const beforeCompiled = compilePanelBreakoutCompositor(document);
  const beforeAudit = auditBreakoutCollisions(beforeCompiled);

  const safetyPaddingPx = sanitizeFinite(options?.safetyPaddingPx ?? 16, 16, 2, 240);
  const canvasSafeMarginPx = sanitizeFinite(options?.canvasSafeMarginPx ?? 8, 8, 0, 120);
  const maxIterations = Math.round(
    sanitizeFinite(options?.maxIterations ?? Math.max(24, document.panels.length * 6), 24, 1, 120),
  );

  if (beforeAudit.passed) {
    return {
      solved: true,
      iterationsUsed: 0,
      totalAddedGutterPx: 0,
      gutterShifts: [],
      horizontalClamps: [],
      beforeCompiled,
      beforeAudit,
      afterDocument: document,
      afterCompiled: beforeCompiled,
      afterAudit: beforeAudit,
    };
  }

  const mutablePanels = cloneDocumentForSolve(document);
  const canvasWidthPx = beforeCompiled.canvasWidthPx;
  const maxHorizontalClipRatio = beforeCompiled.maxHorizontalClipRatio;
  const safeMinX = Math.min(canvasSafeMarginPx, canvasWidthPx * 0.1);
  const safeMaxX = Math.max(safeMinX + 8, canvasWidthPx - safeMinX);
  const availableWidth = safeMaxX - safeMinX;

  const horizontalClamps: BreakoutHorizontalClampRecord[] = [];
  const shiftAccumulator = new Map<string, { addedShiftYPx: number; reasons: string[] }>();
  let totalAddedGutterPx = 0;

  // 1단계: 좌우 캔버스 경계 잘림 위반 피사체 수평 안전 클램핑
  for (let pIdx = 0; pIdx < mutablePanels.length; pIdx += 1) {
    const panel = mutablePanels[pIdx];
    if (!panel) continue;
    for (let sIdx = 0; sIdx < panel.breakoutSubjects.length; sIdx += 1) {
      const sub = panel.breakoutSubjects[sIdx];
      if (!sub || sub.breakoutMode === "clipped-inside" || sub.polygon.length < 3) continue;
      const totalArea = computePolygonArea(sub.polygon);
      if (totalArea <= 1e-4) continue;
      const insideBefore = computePolygonArea(
        clipPolygonToHorizontalBand(sub.polygon, 0, canvasWidthPx),
      );
      const beforeRatio = Math.max(0, totalArea - insideBefore) / totalArea;
      if (beforeRatio <= maxHorizontalClipRatio + 1e-6) continue;

      let updatedPoly = sub.polygon;
      let appliedScaleX = 1;
      let appliedShiftX = 0;
      const bounds = computePolygonBounds(updatedPoly);

      if (bounds.width > availableWidth) {
        appliedScaleX = availableWidth / Math.max(bounds.width, 1);
        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        updatedPoly = scalePolygonXAroundCenter(updatedPoly, centerX, appliedScaleX);
      }

      const afterScaleBounds = computePolygonBounds(updatedPoly);
      if (afterScaleBounds.minX < safeMinX) {
        appliedShiftX = safeMinX - afterScaleBounds.minX;
      } else if (afterScaleBounds.maxX > safeMaxX) {
        appliedShiftX = safeMaxX - afterScaleBounds.maxX;
      }
      if (Math.abs(appliedShiftX) > 1e-4) {
        updatedPoly = translatePolygon(updatedPoly, appliedShiftX, 0);
      }

      sub.polygon = updatedPoly;
      const afterArea = computePolygonArea(updatedPoly);
      const insideAfter = computePolygonArea(
        clipPolygonToHorizontalBand(updatedPoly, 0, canvasWidthPx),
      );
      const afterRatio = afterArea > 1e-4 ? Math.max(0, afterArea - insideAfter) / afterArea : 0;

      horizontalClamps.push({
        panelId: panel.panelId,
        subjectId: sub.subjectId,
        shiftXPx: roundFixed(appliedShiftX, 2),
        scaleX: roundFixed(appliedScaleX, 4),
        beforeClipRatio: roundFixed(beforeRatio, 4),
        afterClipRatio: roundFixed(afterRatio, 4),
      });
    }
  }

  // 2단계: 인접 컷 얼굴·말풍선 침범 해소를 위한 반복 거터 확장 솔버
  let currentDoc = buildDocumentFromMutable(document, mutablePanels);
  let currentCompiled = compilePanelBreakoutCompositor(currentDoc);
  let currentAudit = auditBreakoutCollisions(currentCompiled);
  let iterationsUsed = 0;

  while (!currentAudit.passed && iterationsUsed < maxIterations) {
    iterationsUsed += 1;

    const collision = currentAudit.neighborCriticalZoneCollisions[0];
    if (!collision) break;

    const ownerIdx = mutablePanels.findIndex((p) => p.panelId === collision.ownerPanelId);
    const neighborIdx = mutablePanels.findIndex((p) => p.panelId === collision.neighborPanelId);
    if (ownerIdx < 0 || neighborIdx < 0) break;

    const ownerCompiled = currentCompiled.panels[ownerIdx];
    const neighborCompiled = currentCompiled.panels[neighborIdx];
    if (!ownerCompiled || !neighborCompiled) break;

    const ownerIsUpper =
      ownerCompiled.frame.bounds.minY < neighborCompiled.frame.bounds.minY - 1e-3 ||
      (Math.abs(ownerCompiled.frame.bounds.minY - neighborCompiled.frame.bounds.minY) <= 1e-3 &&
        ownerIdx < neighborIdx);

    const upperIdx = ownerIsUpper ? ownerIdx : neighborIdx;
    const lowerIdx = ownerIsUpper ? neighborIdx : ownerIdx;
    const lowerPanel = mutablePanels[lowerIdx];
    if (!lowerPanel) break;

    const shiftY = Math.ceil(Math.max(1, collision.requiredVerticalShiftPx) + safetyPaddingPx);
    const pivotY = lowerPanel.bounds.y;

    for (let k = 0; k < mutablePanels.length; k += 1) {
      const candidate = mutablePanels[k];
      if (!candidate || k === upperIdx) continue;
      if (k === lowerIdx || candidate.bounds.y >= pivotY - 1e-3) {
        shiftMutablePanelVertically(candidate, shiftY);
        const existing = shiftAccumulator.get(candidate.panelId) ?? {
          addedShiftYPx: 0,
          reasons: [],
        };
        existing.addedShiftYPx += shiftY;
        const reason = `${collision.subjectLabelKo} → ${collision.zoneLabelKo} 침범 해소`;
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        shiftAccumulator.set(candidate.panelId, existing);
      }
    }

    totalAddedGutterPx += shiftY;
    currentDoc = buildDocumentFromMutable(document, mutablePanels);
    currentCompiled = compilePanelBreakoutCompositor(currentDoc);
    currentAudit = auditBreakoutCollisions(currentCompiled);
  }

  const gutterShifts: PanelGutterShiftRecord[] = [];
  for (let i = 0; i < mutablePanels.length; i += 1) {
    const p = mutablePanels[i];
    if (!p) continue;
    const rec = shiftAccumulator.get(p.panelId);
    if (rec && rec.addedShiftYPx > 0) {
      gutterShifts.push({
        panelId: p.panelId,
        addedShiftYPx: rec.addedShiftYPx,
        reasonKo: rec.reasons.join(", "),
      });
    }
  }

  return {
    solved: currentAudit.passed,
    iterationsUsed,
    totalAddedGutterPx,
    gutterShifts,
    horizontalClamps,
    beforeCompiled,
    beforeAudit,
    afterDocument: currentDoc,
    afterCompiled: currentCompiled,
    afterAudit: currentAudit,
  };
}
