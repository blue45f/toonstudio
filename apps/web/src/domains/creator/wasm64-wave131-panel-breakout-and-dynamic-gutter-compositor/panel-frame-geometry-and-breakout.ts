/**
 * Wave 131 — 5종 만화 컷 프레임 기하, Sutherland-Hodgman 2D 클리핑·Z-오더 합성 컴파일러
 * 및 결정론적 레이아웃 매니페스트 SHA-256 지문 계산.
 */

import {
  cleanPolygonVertices,
  clipSubjectByPanelPolygon,
  computePolygonArea,
  computePolygonBounds,
  computePolygonCentroid,
  computePolygonSignedArea,
  isPointInsideOrOnPolygon,
  isPolygonConvex,
  normalizePolygonWinding,
  rectToPolygon,
  roundFixed,
  sanitizeFinite,
} from "./panel-breakout-geometry-primitives";
import { sha256Utf8Hex } from "./panel-breakout-sha256";
import {
  PANEL_FRAME_STYLES,
  type BuiltPanelFramePolygon,
  type ComicPanelFrameGeometrySpec,
  type CompiledBreakoutSubject,
  type CompiledCompositorLayer,
  type CompiledCriticalZone,
  type CompiledPanelBreakoutLayout,
  type CompiledPanelEntry,
  type PanelBreakoutDocument,
  type PanelWindingOrder,
  type Rect2D,
  type Vec2,
} from "./panel-breakout-types";

const DEFAULT_CANVAS_WIDTH_PX = 800;
const DEFAULT_MIN_GUTTER_PX = 28;
const DEFAULT_MAX_HORIZONTAL_CLIP_RATIO = 0.1;

function deterministicNoiseUnit(seed: number, index: number): number {
  const s = (Math.floor(seed) * 747796405 + (index + 1) * 2891336453 + 277803737) >>> 0;
  const mixed = (((s >>> ((s >>> 28) + 4)) ^ s) * 277803737) >>> 0;
  const finalVal = ((mixed >>> 22) ^ mixed) >>> 0;
  return (finalVal & 0x00ffffff) / 16777215;
}

function buildShatteredPanelVertices(
  x: number,
  y: number,
  w: number,
  h: number,
  teethPerEdge: number,
  depthRatio: number,
  seed: number,
): readonly Vec2[] {
  const teeth = Math.max(2, Math.min(8, Math.round(teethPerEdge)));
  const maxDepth = Math.min(w, h) * Math.max(0.03, Math.min(0.14, depthRatio));
  const verts: Vec2[] = [];
  let cursor = 0;

  verts.push({ x, y });
  for (let i = 1; i <= teeth * 2 - 1; i += 1) {
    const t = i / (teeth * 2);
    const isPeak = i % 2 === 1;
    const mag = maxDepth * (0.55 + 0.45 * deterministicNoiseUnit(seed, cursor));
    cursor += 1;
    verts.push({ x: x + w * t, y: y + (isPeak ? -mag * 0.65 : mag) });
  }

  verts.push({ x: x + w, y });
  for (let i = 1; i <= teeth * 2 - 1; i += 1) {
    const t = i / (teeth * 2);
    const isPeak = i % 2 === 1;
    const mag = maxDepth * (0.55 + 0.45 * deterministicNoiseUnit(seed, cursor));
    cursor += 1;
    verts.push({ x: x + w + (isPeak ? mag * 0.65 : -mag), y: y + h * t });
  }

  verts.push({ x: x + w, y: y + h });
  for (let i = 1; i <= teeth * 2 - 1; i += 1) {
    const t = i / (teeth * 2);
    const isPeak = i % 2 === 1;
    const mag = maxDepth * (0.55 + 0.45 * deterministicNoiseUnit(seed, cursor));
    cursor += 1;
    verts.push({ x: x + w * (1 - t), y: y + h + (isPeak ? mag * 0.65 : -mag) });
  }

  verts.push({ x, y: y + h });
  for (let i = 1; i <= teeth * 2 - 1; i += 1) {
    const t = i / (teeth * 2);
    const isPeak = i % 2 === 1;
    const mag = maxDepth * (0.55 + 0.45 * deterministicNoiseUnit(seed, cursor));
    cursor += 1;
    verts.push({ x: x + (isPeak ? -mag * 0.65 : mag), y: y + h * (1 - t) });
  }

  return verts;
}

/**
 * 5종 만화 컷 프레임 스타일에 대한 닫힌 시계/반시계방향 2D 경계 다각형을 생성한다.
 */
export function buildComicPanelFramePolygon(
  spec: ComicPanelFrameGeometrySpec,
): BuiltPanelFramePolygon {
  const styleMeta = PANEL_FRAME_STYLES[spec.style];
  const winding: PanelWindingOrder = spec.winding ?? "cw";
  const canvasWidthPx = sanitizeFinite(
    spec.canvasWidthPx ?? DEFAULT_CANVAS_WIDTH_PX,
    DEFAULT_CANVAS_WIDTH_PX,
    160,
    4096,
  );

  const rawX = sanitizeFinite(spec.bounds.x, 0, -1e5, 1e5);
  const rawY = sanitizeFinite(spec.bounds.y, 0, -1e5, 1e5);
  const rawW = sanitizeFinite(spec.bounds.width, 320, 24, 1e5);
  const rawH = sanitizeFinite(spec.bounds.height, 240, 24, 1e5);

  let rawVertices: readonly Vec2[];
  let strokeWidth =
    spec.borderStrokeWidthPx !== undefined
      ? sanitizeFinite(spec.borderStrokeWidthPx, styleMeta.defaultBorderStrokeWidthPx, 0, 32)
      : styleMeta.defaultBorderStrokeWidthPx;

  switch (spec.style) {
    case "classic-rect": {
      rawVertices = [
        { x: rawX, y: rawY },
        { x: rawX + rawW, y: rawY },
        { x: rawX + rawW, y: rawY + rawH },
        { x: rawX, y: rawY + rawH },
      ];
      break;
    }
    case "diagonal-slash-cut": {
      const maxSkew = rawH * 0.34;
      const topSkew = sanitizeFinite(spec.slashTopSkewPx ?? 28, 28, -maxSkew, maxSkew);
      const bottomSkew = sanitizeFinite(spec.slashBottomSkewPx ?? -32, -32, -maxSkew, maxSkew);
      rawVertices = [
        { x: rawX, y: rawY + Math.max(0, topSkew) },
        { x: rawX + rawW, y: rawY + Math.max(0, -topSkew) },
        { x: rawX + rawW, y: rawY + rawH - Math.max(0, bottomSkew) },
        { x: rawX, y: rawY + rawH - Math.max(0, -bottomSkew) },
      ];
      break;
    }
    case "impact-shattered-border": {
      rawVertices = buildShatteredPanelVertices(
        rawX,
        rawY,
        rawW,
        rawH,
        spec.shatterTeethPerEdge ?? 3,
        spec.shatterDepthRatio ?? 0.085,
        spec.shatterSeed ?? 131,
      );
      break;
    }
    case "borderless-full-bleed": {
      strokeWidth = 0;
      rawVertices = [
        { x: 0, y: rawY },
        { x: canvasWidthPx, y: rawY },
        { x: canvasWidthPx, y: rawY + rawH },
        { x: 0, y: rawY + rawH },
      ];
      break;
    }
    case "inset-floating-overlay": {
      const maxChamfer = Math.min(rawW, rawH) * 0.25;
      const c = sanitizeFinite(spec.chamferSizePx ?? 14, 14, 2, maxChamfer);
      rawVertices = [
        { x: rawX + c, y: rawY },
        { x: rawX + rawW - c, y: rawY },
        { x: rawX + rawW, y: rawY + c },
        { x: rawX + rawW, y: rawY + rawH - c },
        { x: rawX + rawW - c, y: rawY + rawH },
        { x: rawX + c, y: rawY + rawH },
        { x: rawX, y: rawY + rawH - c },
        { x: rawX, y: rawY + c },
      ];
      break;
    }
  }

  const normalized = normalizePolygonWinding(rawVertices, winding);
  const signedAreaPx2 = computePolygonSignedArea(normalized);

  return {
    panelId: spec.panelId.trim() || "panel-unnamed",
    style: spec.style,
    winding,
    vertices: normalized,
    signedAreaPx2,
    areaPx2: Math.abs(signedAreaPx2),
    bounds: computePolygonBounds(normalized),
    centroid: computePolygonCentroid(normalized),
    isConvex: isPolygonConvex(normalized),
    borderStrokeWidthPx: strokeWidth,
  };
}

function serializePointsForCanonical(points: readonly Vec2[]): readonly (readonly [number, number])[] {
  return points.map((p) => [roundFixed(p.x, 3), roundFixed(p.y, 3)] as const);
}

/**
 * 레이아웃 문서 또는 컴파일 결과의 결정론적 FIPS 180-4 SHA-256 지문을 계산한다.
 */
export function computeBreakoutLayoutSha256Hex(
  target: PanelBreakoutDocument | CompiledPanelBreakoutLayout,
): string {
  if ("zStack" in target) {
    const canonical = {
      canvasWidthPx: roundFixed(target.canvasWidthPx, 3),
      contentHeightPx: roundFixed(target.contentHeightPx, 3),
      documentId: target.documentId.trim(),
      maxHorizontalClipRatio: roundFixed(target.maxHorizontalClipRatio, 4),
      minGutterPx: roundFixed(target.minGutterPx, 3),
      panels: target.panels.map((p) => ({
        baseArtClippedAreaPx2: roundFixed(p.baseArtClippedAreaPx2, 3),
        borderStrokeZ: p.borderStrokeZ,
        criticalZones: p.criticalZones.map((z) => ({
          kind: z.kind,
          polygon: serializePointsForCanonical(z.polygon),
          zoneId: z.zoneId,
        })),
        frameVertices: serializePointsForCanonical(p.frame.vertices),
        panelId: p.panelId,
        style: p.style,
        subjects: p.subjects.map((s) => ({
          breakoutMode: s.breakoutMode,
          breakoutOverflowAreaPx2: roundFixed(s.breakoutOverflowAreaPx2, 3),
          kind: s.kind,
          renderPolygon: serializePointsForCanonical(s.renderPolygon),
          subjectId: s.subjectId,
          zIndex: s.zIndex,
        })),
      })),
    };
    return sha256Utf8Hex(JSON.stringify(canonical));
  }

  const canonicalDoc = {
    canvasWidthPx: roundFixed(
      sanitizeFinite(target.canvasWidthPx, DEFAULT_CANVAS_WIDTH_PX, 160, 4096),
      3,
    ),
    documentId: target.documentId.trim(),
    maxHorizontalClipRatio: roundFixed(
      sanitizeFinite(
        target.maxHorizontalClipRatio ?? DEFAULT_MAX_HORIZONTAL_CLIP_RATIO,
        DEFAULT_MAX_HORIZONTAL_CLIP_RATIO,
        0,
        1,
      ),
      4,
    ),
    minGutterPx: roundFixed(
      sanitizeFinite(target.minGutterPx ?? DEFAULT_MIN_GUTTER_PX, DEFAULT_MIN_GUTTER_PX, 0, 1000),
      3,
    ),
    panels: target.panels.map((p) => ({
      bounds: [
        roundFixed(sanitizeFinite(p.bounds.x, 0, -1e5, 1e5), 3),
        roundFixed(sanitizeFinite(p.bounds.y, 0, -1e5, 1e5), 3),
        roundFixed(sanitizeFinite(p.bounds.width, 320, 24, 1e5), 3),
        roundFixed(sanitizeFinite(p.bounds.height, 240, 24, 1e5), 3),
      ],
      criticalZones: (p.criticalZones ?? []).map((z) => ({
        bounds: [
          roundFixed(sanitizeFinite(z.bounds.x, 0, -1e5, 1e5), 3),
          roundFixed(sanitizeFinite(z.bounds.y, 0, -1e5, 1e5), 3),
          roundFixed(sanitizeFinite(z.bounds.width, 1, 0, 1e5), 3),
          roundFixed(sanitizeFinite(z.bounds.height, 1, 0, 1e5), 3),
        ],
        kind: z.kind,
        zoneId: z.zoneId.trim(),
      })),
      panelId: p.panelId.trim(),
      style: p.style,
      subjects: (p.breakoutSubjects ?? []).map((s) => ({
        breakoutMode: s.breakoutMode,
        kind: s.kind,
        polygon: serializePointsForCanonical(cleanPolygonVertices(s.polygon)),
        subjectId: s.subjectId.trim(),
      })),
    })),
  };
  return sha256Utf8Hex(JSON.stringify(canonicalDoc));
}

/**
 * 다중 만화 컷의 프레임 경계·내부 클리핑·돌출 Z-오더 승격을 일괄 컴파일한다.
 */
export function compilePanelBreakoutCompositor(
  document: PanelBreakoutDocument,
): CompiledPanelBreakoutLayout {
  const canvasWidthPx = sanitizeFinite(document.canvasWidthPx, DEFAULT_CANVAS_WIDTH_PX, 160, 4096);
  const minGutterPx = sanitizeFinite(
    document.minGutterPx ?? DEFAULT_MIN_GUTTER_PX,
    DEFAULT_MIN_GUTTER_PX,
    0,
    1000,
  );
  const maxHorizontalClipRatio = sanitizeFinite(
    document.maxHorizontalClipRatio ?? DEFAULT_MAX_HORIZONTAL_CLIP_RATIO,
    DEFAULT_MAX_HORIZONTAL_CLIP_RATIO,
    0,
    1,
  );

  const panelCount = document.panels.length;
  const maxPanelBorderZ = (panelCount + 1) * 100 + 90;

  const compiledPanels: CompiledPanelEntry[] = [];
  const zStack: CompiledCompositorLayer[] = [];
  let totalBreakoutSubjectCount = 0;
  let totalBreakoutOverflowAreaPx2 = 0;
  let maxY = 0;
  let globalBridgeSeq = 0;

  for (let pIdx = 0; pIdx < panelCount; pIdx += 1) {
    const rawPanel = document.panels[pIdx];
    if (!rawPanel) continue;

    const frame = buildComicPanelFramePolygon({
      panelId: rawPanel.panelId,
      style: rawPanel.style,
      bounds: rawPanel.bounds,
      canvasWidthPx,
      winding: rawPanel.winding ?? "cw",
      borderStrokeWidthPx: rawPanel.borderStrokeWidthPx,
      slashTopSkewPx: rawPanel.slashTopSkewPx,
      slashBottomSkewPx: rawPanel.slashBottomSkewPx,
      shatterTeethPerEdge: rawPanel.shatterTeethPerEdge,
      shatterDepthRatio: rawPanel.shatterDepthRatio,
      shatterSeed: rawPanel.shatterSeed,
      chamferSizePx: rawPanel.chamferSizePx,
    });

    const styleSpec = PANEL_FRAME_STYLES[rawPanel.style];
    const panelBaseZ = (pIdx + 1) * 100 + styleSpec.zBandBoost;
    const borderStrokeZ = panelBaseZ + 50;

    if (frame.bounds.maxY > maxY) maxY = frame.bounds.maxY;

    zStack.push({
      layerId: `${frame.panelId}::bg`,
      panelId: frame.panelId,
      subjectId: null,
      kind: "panel-background",
      zIndex: panelBaseZ + 10,
      clippedToPanelFrame: true,
      polygon: frame.vertices,
      pieces: [frame.vertices],
      areaPx2: frame.areaPx2,
      labelKo: `${rawPanel.titleKo} 배경`,
    });

    const baseArtRect: Rect2D = rawPanel.baseArtBounds ?? {
      x: frame.bounds.minX,
      y: frame.bounds.minY,
      width: frame.bounds.width,
      height: frame.bounds.height,
    };
    const baseArtOriginalPolygon = rectToPolygon(baseArtRect);
    const baseArtOriginalAreaPx2 = computePolygonArea(baseArtOriginalPolygon);
    const baseArtClip = clipSubjectByPanelPolygon(baseArtOriginalPolygon, frame.vertices);

    zStack.push({
      layerId: `${frame.panelId}::base-art`,
      panelId: frame.panelId,
      subjectId: null,
      kind: "base-art",
      zIndex: panelBaseZ + 20,
      clippedToPanelFrame: true,
      polygon: baseArtClip.primaryPolygon,
      pieces: baseArtClip.pieces,
      areaPx2: baseArtClip.totalClippedAreaPx2,
      labelKo: `${rawPanel.titleKo} 내부 원화`,
    });

    const compiledSubjects: CompiledBreakoutSubject[] = [];
    const rawSubjects = rawPanel.breakoutSubjects ?? [];

    for (let sIdx = 0; sIdx < rawSubjects.length; sIdx += 1) {
      const rawSubject = rawSubjects[sIdx];
      if (!rawSubject) continue;

      const cleanedOriginal = normalizePolygonWinding(rawSubject.polygon, "cw");
      const originalAreaPx2 = computePolygonArea(cleanedOriginal);
      const clippedToFrame = clipSubjectByPanelPolygon(cleanedOriginal, frame.vertices);
      const insideFrameAreaPx2 = Math.min(originalAreaPx2, clippedToFrame.totalClippedAreaPx2);
      const zExtra = Math.round(sanitizeFinite(rawSubject.zOffset ?? 0, 0, -5, 25));

      let zIndex: number;
      let renderPolygon: readonly Vec2[];
      let renderPieces: readonly (readonly Vec2[])[];
      let renderAreaPx2: number;
      let breakoutOverflowAreaPx2: number;
      let promotedAboveBorder: boolean;
      let layerKind: CompiledCompositorLayer["kind"];

      if (rawSubject.breakoutMode === "clipped-inside") {
        zIndex = panelBaseZ + 30 + sIdx + Math.max(0, zExtra);
        renderPolygon = clippedToFrame.primaryPolygon;
        renderPieces = clippedToFrame.pieces;
        renderAreaPx2 = clippedToFrame.totalClippedAreaPx2;
        breakoutOverflowAreaPx2 = 0;
        promotedAboveBorder = false;
        layerKind = "clipped-subject";
      } else if (rawSubject.breakoutMode === "gutter-breakout") {
        zIndex = borderStrokeZ + 20 + sIdx + Math.max(0, zExtra);
        renderPolygon = cleanedOriginal;
        renderPieces = cleanedOriginal.length >= 3 ? [cleanedOriginal] : [];
        renderAreaPx2 = originalAreaPx2;
        breakoutOverflowAreaPx2 = Math.max(0, originalAreaPx2 - insideFrameAreaPx2);
        promotedAboveBorder = true;
        layerKind = "gutter-breakout-subject";
        totalBreakoutSubjectCount += 1;
        totalBreakoutOverflowAreaPx2 += breakoutOverflowAreaPx2;
      } else {
        globalBridgeSeq += 1;
        zIndex = maxPanelBorderZ + 100 + globalBridgeSeq * 5 + Math.max(0, zExtra);
        renderPolygon = cleanedOriginal;
        renderPieces = cleanedOriginal.length >= 3 ? [cleanedOriginal] : [];
        renderAreaPx2 = originalAreaPx2;
        breakoutOverflowAreaPx2 = Math.max(0, originalAreaPx2 - insideFrameAreaPx2);
        promotedAboveBorder = true;
        layerKind = "cross-panel-bridge-subject";
        totalBreakoutSubjectCount += 1;
        totalBreakoutOverflowAreaPx2 += breakoutOverflowAreaPx2;
      }

      const allRenderVerticesInsideFrame =
        renderPieces.length > 0 &&
        renderPieces.every((piece) =>
          piece.every((pt) => isPointInsideOrOnPolygon(pt, frame.vertices, 0.25)),
        );

      const renderBounds = computePolygonBounds(renderPolygon);
      if (renderBounds.maxY > maxY) maxY = renderBounds.maxY;

      const compiledSubject: CompiledBreakoutSubject = {
        subjectId: rawSubject.subjectId.trim() || `${frame.panelId}-sub-${sIdx + 1}`,
        panelId: frame.panelId,
        labelKo: rawSubject.labelKo.trim() || "피사체",
        kind: rawSubject.kind,
        breakoutMode: rawSubject.breakoutMode,
        zIndex,
        borderStrokeZ,
        promotedAboveBorder,
        originalPolygon: cleanedOriginal,
        renderPolygon,
        clippedPieces: renderPieces,
        originalAreaPx2,
        insideFrameAreaPx2,
        renderAreaPx2,
        breakoutOverflowAreaPx2,
        allRenderVerticesInsideFrame,
        bounds: renderBounds,
        allowHorizontalClamp: rawSubject.allowHorizontalClamp ?? true,
      };
      compiledSubjects.push(compiledSubject);

      zStack.push({
        layerId: `${frame.panelId}::subject::${compiledSubject.subjectId}`,
        panelId: frame.panelId,
        subjectId: compiledSubject.subjectId,
        kind: layerKind,
        zIndex,
        clippedToPanelFrame: rawSubject.breakoutMode === "clipped-inside",
        polygon: renderPolygon,
        pieces: renderPieces,
        areaPx2: renderAreaPx2,
        labelKo: compiledSubject.labelKo,
      });
    }

    zStack.push({
      layerId: `${frame.panelId}::border`,
      panelId: frame.panelId,
      subjectId: null,
      kind: "panel-border-stroke",
      zIndex: borderStrokeZ,
      clippedToPanelFrame: false,
      polygon: frame.vertices,
      pieces: [frame.vertices],
      areaPx2: frame.areaPx2,
      labelKo: `${rawPanel.titleKo} 테두리 선`,
    });

    const compiledZones: CompiledCriticalZone[] = [];
    const rawZones = rawPanel.criticalZones ?? [];
    for (let zIdx = 0; zIdx < rawZones.length; zIdx += 1) {
      const rawZone = rawZones[zIdx];
      if (!rawZone) continue;
      const poly =
        rawZone.polygon && rawZone.polygon.length >= 3
          ? normalizePolygonWinding(rawZone.polygon, "cw")
          : rectToPolygon(rawZone.bounds);
      const zoneBounds = computePolygonBounds(poly);
      if (zoneBounds.maxY > maxY) maxY = zoneBounds.maxY;
      compiledZones.push({
        zoneId: rawZone.zoneId.trim() || `${frame.panelId}-zone-${zIdx + 1}`,
        panelId: frame.panelId,
        labelKo: rawZone.labelKo.trim() || "핵심 보호 영역",
        kind: rawZone.kind,
        bounds: zoneBounds,
        polygon: poly,
        areaPx2: computePolygonArea(poly),
      });
    }

    compiledPanels.push({
      panelId: frame.panelId,
      titleKo: rawPanel.titleKo.trim() || frame.panelId,
      style: rawPanel.style,
      orderIndex: pIdx,
      frame,
      panelBaseZ,
      borderStrokeZ,
      baseArtOriginalPolygon,
      baseArtClippedPolygon: baseArtClip.primaryPolygon,
      baseArtClippedPieces: baseArtClip.pieces,
      baseArtOriginalAreaPx2,
      baseArtClippedAreaPx2: baseArtClip.totalClippedAreaPx2,
      subjects: compiledSubjects,
      criticalZones: compiledZones,
    });
  }

  zStack.sort((a, b) => a.zIndex - b.zIndex || a.layerId.localeCompare(b.layerId));

  const partialLayout: CompiledPanelBreakoutLayout = {
    documentId: document.documentId.trim() || "wave131-doc",
    titleKo: document.titleKo.trim() || "만화 컷 경계 돌출 레이아웃",
    canvasWidthPx,
    contentHeightPx: Math.max(120, Math.ceil(maxY + minGutterPx)),
    minGutterPx,
    maxHorizontalClipRatio,
    panels: compiledPanels,
    zStack,
    totalBreakoutSubjectCount,
    totalBreakoutOverflowAreaPx2,
    manifestSha256Hex: "",
  };

  return {
    ...partialLayout,
    manifestSha256Hex: computeBreakoutLayoutSha256Hex(partialLayout),
  };
}
