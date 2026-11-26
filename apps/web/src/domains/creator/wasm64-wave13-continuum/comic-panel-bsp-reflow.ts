/**
 * 파라메트릭 BSP 만화 컷 칸새(Gutter) 및 도련(3mm)·안전 여백(5mm) 비파괴 리플로우 솔버.
 */

export type Point2D = readonly [number, number];
export type PrintPagePresetKind = "A4" | "B5";
export type ComicLayoutTargetFormat =
  | "webtoon-vertical"
  | "A4-single"
  | "A4-spread"
  | "B5-single"
  | "B5-spread";

export interface RectMm {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BalloonAnchorSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly uv: Point2D;
  readonly radiusMm: number;
}

export interface PanelBspLeafNode {
  readonly kind: "leaf";
  readonly panelId: string;
  readonly labelKo: string;
  readonly dramaticWeight?: number;
  readonly focalPointUv?: Point2D;
  readonly fullBleed?: boolean;
  readonly balloons?: readonly BalloonAnchorSpec[];
}

export interface PanelBspSplitNode {
  readonly kind: "split";
  readonly id: string;
  readonly axis: "horizontal" | "vertical";
  readonly ratio: number;
  readonly tiltDeg?: number;
  readonly gutterMm?: number;
  readonly primary: PanelBspNode;
  readonly secondary: PanelBspNode;
}

export type PanelBspNode = PanelBspLeafNode | PanelBspSplitNode;

export interface PrintPageGeometrySpec {
  readonly preset?: PrintPagePresetKind;
  readonly trimWidthMm?: number;
  readonly trimHeightMm?: number;
  readonly bleedMm?: number;
  readonly safeMarginMm?: number;
  readonly defaultGutterMm?: number;
  readonly isSpread?: boolean;
}

export interface ResolvedBalloonPlacement {
  readonly id: string;
  readonly labelKo: string;
  readonly centerMm: Point2D;
  readonly radiusMm: number;
  readonly wasClampedToSafeZone: boolean;
  readonly minSafeClearanceMm: number;
}

export interface SolvedPrintPanel {
  readonly panelId: string;
  readonly labelKo: string;
  readonly readingIndex: number;
  readonly fullBleed: boolean;
  readonly clipPolygonMm: readonly Point2D[];
  readonly safePolygonMm: readonly Point2D[];
  readonly boundsMm: RectMm;
  readonly areaMm2: number;
  readonly focalPointMm: Point2D;
  readonly cssClipPath: string;
  readonly balloons: readonly ResolvedBalloonPlacement[];
}

export interface SolvedPrintPageLayout {
  readonly trimBoxMm: RectMm;
  readonly bleedBoxMm: RectMm;
  readonly safeBoxMm: RectMm;
  readonly bleedMm: number;
  readonly safeMarginMm: number;
  readonly defaultGutterMm: number;
  readonly panels: readonly SolvedPrintPanel[];
}

export interface ReflowedWebtoonStripPanel {
  readonly panelId: string;
  readonly labelKo: string;
  readonly readingIndex: number;
  readonly frameRectMm: RectMm;
  readonly safeRectMm: RectMm;
  readonly pacingGapAfterMm: number;
  readonly focalPointMm: Point2D;
  readonly balloons: readonly ResolvedBalloonPlacement[];
}

export interface ReflowedComicLayoutResult {
  readonly format: ComicLayoutTargetFormat;
  readonly sourceTreeSnapshot: PanelBspNode;
  readonly printPages: readonly SolvedPrintPageLayout[];
  readonly webtoonStrip: {
    readonly stripWidthMm: number;
    readonly totalHeightMm: number;
    readonly safeHorizontalMarginMm: number;
    readonly panels: readonly ReflowedWebtoonStripPanel[];
  } | null;
}

export const PRINT_PAGE_DIMENSIONS_MM: Readonly<
  Record<PrintPagePresetKind, { readonly widthMm: number; readonly heightMm: number }>
> = {
  A4: { widthMm: 210, heightMm: 297 },
  B5: { widthMm: 182, heightMm: 257 },
};

function rectToPolygon(rect: RectMm): Point2D[] {
  return [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
}

export function computePolygonAreaMm2(polygon: readonly Point2D[]): number {
  if (polygon.length < 3) return 0;
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twiceArea) * 0.5;
}

export function computePolygonBoundsMm(polygon: readonly Point2D[]): RectMm {
  if (polygon.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of polygon) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function computePolygonCentroidMm(polygon: readonly Point2D[]): Point2D {
  if (polygon.length === 0) return [0, 0];
  let cx = 0;
  let cy = 0;
  for (const [px, py] of polygon) {
    cx += px;
    cy += py;
  }
  return [cx / polygon.length, cy / polygon.length];
}

/** 서덜랜드-호지먼 반평면 클리핑: (p - anchor) · outwardNormal <= maxSignedDist. */
export function clipConvexPolygonByHalfPlane(
  polygon: readonly Point2D[],
  anchor: Point2D,
  outwardNormal: Point2D,
  maxSignedDist: number,
): Point2D[] {
  if (polygon.length < 3) return [];
  const out: Point2D[] = [];
  const signedDist = (pt: Point2D): number =>
    (pt[0] - anchor[0]) * outwardNormal[0] +
    (pt[1] - anchor[1]) * outwardNormal[1] -
    maxSignedDist;

  for (let i = 0; i < polygon.length; i += 1) {
    const curr = polygon[i];
    const prev = polygon[(i + polygon.length - 1) % polygon.length];
    const dCurr = signedDist(curr);
    const dPrev = signedDist(prev);
    const currInside = dCurr <= 1e-9;
    const prevInside = dPrev <= 1e-9;
    if (currInside !== prevInside) {
      const denom = dPrev - dCurr;
      const t = Math.abs(denom) <= 1e-12 ? 0 : dPrev / denom;
      out.push([prev[0] + t * (curr[0] - prev[0]), prev[1] + t * (curr[1] - prev[1])]);
    }
    if (currInside) out.push(curr);
  }
  return out;
}

/** 두 볼록 다각형 사이의 최소 유클리드 거리(mm)를 구한다. */
export function computeConvexPolygonDistanceMm(
  polyA: readonly Point2D[],
  polyB: readonly Point2D[],
): number {
  const ptSegDist = (p: Point2D, a: Point2D, b: Point2D): number => {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    if (lenSq <= 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lenSq));
    return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
  };
  let minDist = Infinity;
  for (const p of polyA) {
    for (let j = 0; j < polyB.length; j += 1) {
      const d = ptSegDist(p, polyB[j], polyB[(j + 1) % polyB.length]);
      if (d < minDist) minDist = d;
    }
  }
  for (const p of polyB) {
    for (let i = 0; i < polyA.length; i += 1) {
      const d = ptSegDist(p, polyA[i], polyA[(i + 1) % polyA.length]);
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}

function computeInwardClearanceMm(point: Point2D, polygon: readonly Point2D[]): number {
  if (polygon.length < 3) return -Infinity;
  let signedArea = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    signedArea += a[0] * b[1] - b[0] * a[1];
  }
  const orient = signedArea >= 0 ? 1 : -1;
  let minClearance = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len <= 1e-12) continue;
    const dist = (point[0] - a[0]) * ((-ey / len) * orient) + (point[1] - a[1]) * ((ex / len) * orient);
    if (dist < minClearance) minClearance = dist;
  }
  return minClearance;
}

function clampBalloonIntoSafePolygon(
  balloon: BalloonAnchorSpec,
  panelBounds: RectMm,
  safePolygon: readonly Point2D[],
): ResolvedBalloonPlacement {
  const rawCenter: Point2D = [
    panelBounds.x + balloon.uv[0] * panelBounds.width,
    panelBounds.y + balloon.uv[1] * panelBounds.height,
  ];
  const initialClearance = computeInwardClearanceMm(rawCenter, safePolygon) - balloon.radiusMm;
  if (initialClearance >= -1e-6 || safePolygon.length < 3) {
    return {
      id: balloon.id,
      labelKo: balloon.labelKo,
      centerMm: rawCenter,
      radiusMm: balloon.radiusMm,
      wasClampedToSafeZone: false,
      minSafeClearanceMm: Math.max(0, initialClearance),
    };
  }
  const centroid = computePolygonCentroidMm(safePolygon);
  let low = 0;
  let high = 1;
  let best: Point2D = centroid;
  for (let iter = 0; iter < 24; iter += 1) {
    const mid = (low + high) * 0.5;
    const candidate: Point2D = [
      rawCenter[0] + mid * (centroid[0] - rawCenter[0]),
      rawCenter[1] + mid * (centroid[1] - rawCenter[1]),
    ];
    if (computeInwardClearanceMm(candidate, safePolygon) - balloon.radiusMm >= 0) {
      best = candidate;
      high = mid;
    } else {
      low = mid;
    }
  }
  return {
    id: balloon.id,
    labelKo: balloon.labelKo,
    centerMm: best,
    radiusMm: balloon.radiusMm,
    wasClampedToSafeZone: true,
    minSafeClearanceMm: computeInwardClearanceMm(best, safePolygon) - balloon.radiusMm,
  };
}

function polygonToCssClipPath(polygon: readonly Point2D[], containerBox: RectMm): string {
  const pts = polygon.map(([px, py]) => {
    const ux = containerBox.width > 0 ? ((px - containerBox.x) / containerBox.width) * 100 : 0;
    const uy = containerBox.height > 0 ? ((py - containerBox.y) / containerBox.height) * 100 : 0;
    return `${ux.toFixed(3)}% ${uy.toFixed(3)}%`;
  });
  return `polygon(${pts.join(", ")})`;
}

/** 파라메트릭 BSP 트리를 평가해 직교·사선 클립 경로, 균일 칸새, 3mm 도련, 5mm 안전 여백을 계산한다. */
export function solvePanelBspPageLayout(
  root: PanelBspNode,
  spec: PrintPageGeometrySpec = {},
): SolvedPrintPageLayout {
  const presetDims = PRINT_PAGE_DIMENSIONS_MM[spec.preset ?? "B5"];
  const singleTrimW = spec.trimWidthMm ?? presetDims.widthMm;
  const trimW = spec.isSpread ? singleTrimW * 2 : singleTrimW;
  const trimH = spec.trimHeightMm ?? presetDims.heightMm;
  const bleedMm = spec.bleedMm ?? 3;
  const safeMarginMm = spec.safeMarginMm ?? 5;
  const defaultGutterMm = spec.defaultGutterMm ?? 4;

  const trimBoxMm: RectMm = { x: 0, y: 0, width: trimW, height: trimH };
  const bleedBoxMm: RectMm = {
    x: -bleedMm,
    y: -bleedMm,
    width: trimW + 2 * bleedMm,
    height: trimH + 2 * bleedMm,
  };
  const safeBoxMm: RectMm = {
    x: safeMarginMm,
    y: safeMarginMm,
    width: Math.max(1, trimW - 2 * safeMarginMm),
    height: Math.max(1, trimH - 2 * safeMarginMm),
  };

  const panels: SolvedPrintPanel[] = [];
  const visit = (
    node: PanelBspNode,
    framedPoly: readonly Point2D[],
    bleedPoly: readonly Point2D[],
  ): void => {
    if (node.kind === "leaf") {
      const activePoly = node.fullBleed ? bleedPoly : framedPoly;
      const bounds = computePolygonBoundsMm(activePoly);
      const uv = node.focalPointUv ?? [0.5, 0.5];
      panels.push({
        panelId: node.panelId,
        labelKo: node.labelKo,
        readingIndex: panels.length,
        fullBleed: Boolean(node.fullBleed),
        clipPolygonMm: activePoly,
        safePolygonMm: framedPoly,
        boundsMm: bounds,
        areaMm2: computePolygonAreaMm2(activePoly),
        focalPointMm: [bounds.x + uv[0] * bounds.width, bounds.y + uv[1] * bounds.height],
        cssClipPath: polygonToCssClipPath(activePoly, bleedBoxMm),
        balloons: (node.balloons ?? []).map((b) =>
          clampBalloonIntoSafePolygon(b, bounds, framedPoly),
        ),
      });
      return;
    }

    const refBounds = computePolygonBoundsMm(framedPoly);
    const ratio = Math.min(0.9, Math.max(0.1, node.ratio));
    const tiltRad = (Math.min(45, Math.max(-45, node.tiltDeg ?? 0)) * Math.PI) / 180;
    const halfGutter = Math.max(0, node.gutterMm ?? defaultGutterMm) * 0.5;
    const anchor: Point2D =
      node.axis === "vertical"
        ? [refBounds.x + ratio * refBounds.width, refBounds.y + 0.5 * refBounds.height]
        : [refBounds.x + 0.5 * refBounds.width, refBounds.y + ratio * refBounds.height];
    const normal: Point2D =
      node.axis === "vertical"
        ? [Math.cos(tiltRad), Math.sin(tiltRad)]
        : [-Math.sin(tiltRad), Math.cos(tiltRad)];
    const negNormal: Point2D = [-normal[0], -normal[1]];

    visit(
      node.primary,
      clipConvexPolygonByHalfPlane(framedPoly, anchor, normal, -halfGutter),
      clipConvexPolygonByHalfPlane(bleedPoly, anchor, normal, -halfGutter),
    );
    visit(
      node.secondary,
      clipConvexPolygonByHalfPlane(framedPoly, anchor, negNormal, -halfGutter),
      clipConvexPolygonByHalfPlane(bleedPoly, anchor, negNormal, -halfGutter),
    );
  };

  visit(root, rectToPolygon(safeBoxMm), rectToPolygon(bleedBoxMm));
  return { trimBoxMm, bleedBoxMm, safeBoxMm, bleedMm, safeMarginMm, defaultGutterMm, panels };
}

function cloneBspTree(node: PanelBspNode): PanelBspNode {
  if (node.kind === "leaf") {
    return {
      kind: "leaf",
      panelId: node.panelId,
      labelKo: node.labelKo,
      dramaticWeight: node.dramaticWeight,
      focalPointUv: node.focalPointUv ? [node.focalPointUv[0], node.focalPointUv[1]] : undefined,
      fullBleed: node.fullBleed,
      balloons: node.balloons?.map((b) => ({
        id: b.id,
        labelKo: b.labelKo,
        uv: [b.uv[0], b.uv[1]],
        radiusMm: b.radiusMm,
      })),
    };
  }
  return {
    kind: "split",
    id: node.id,
    axis: node.axis,
    ratio: node.ratio,
    tiltDeg: node.tiltDeg,
    gutterMm: node.gutterMm,
    primary: cloneBspTree(node.primary),
    secondary: cloneBspTree(node.secondary),
  };
}

function collectOrderedLeaves(node: PanelBspNode, acc: PanelBspLeafNode[] = []): PanelBspLeafNode[] {
  if (node.kind === "leaf") {
    acc.push(node);
    return acc;
  }
  collectOrderedLeaves(node.primary, acc);
  collectOrderedLeaves(node.secondary, acc);
  return acc;
}

/** 원본 BSP 트리를 보존하며 세로 웹툰 스트립과 A4/B5 단면·펼침 인쇄 판형 간 비파괴 리플로우한다. */
export function reflowComicLayoutBetweenFormats(
  sourceTree: PanelBspNode,
  targetFormat: ComicLayoutTargetFormat,
  options: {
    readonly bleedMm?: number;
    readonly safeMarginMm?: number;
    readonly defaultGutterMm?: number;
    readonly webtoonStripWidthMm?: number;
    readonly baseWebtoonPacingGapMm?: number;
  } = {},
): ReflowedComicLayoutResult {
  const sourceTreeSnapshot = cloneBspTree(sourceTree);
  const bleedMm = options.bleedMm ?? 3;
  const safeMarginMm = options.safeMarginMm ?? 5;
  const defaultGutterMm = options.defaultGutterMm ?? 4;

  if (targetFormat === "webtoon-vertical") {
    const stripWidthMm = options.webtoonStripWidthMm ?? 160;
    const baseGapMm = options.baseWebtoonPacingGapMm ?? 18;
    const leaves = collectOrderedLeaves(sourceTreeSnapshot);
    const stripPanels: ReflowedWebtoonStripPanel[] = [];
    let cursorY = safeMarginMm;

    for (let idx = 0; idx < leaves.length; idx += 1) {
      const leaf = leaves[idx];
      const weight = Math.max(0.5, leaf.dramaticWeight ?? 1);
      const panelHeightMm = 110 * weight;
      const frameRectMm: RectMm = leaf.fullBleed
        ? { x: 0, y: cursorY, width: stripWidthMm, height: panelHeightMm }
        : { x: safeMarginMm, y: cursorY, width: stripWidthMm - 2 * safeMarginMm, height: panelHeightMm };
      const safeRectMm: RectMm = {
        x: safeMarginMm,
        y: cursorY + safeMarginMm,
        width: stripWidthMm - 2 * safeMarginMm,
        height: Math.max(10, panelHeightMm - 2 * safeMarginMm),
      };
      const uv = leaf.focalPointUv ?? [0.5, 0.5];
      const gapAfter = idx < leaves.length - 1 ? baseGapMm * weight : safeMarginMm;
      stripPanels.push({
        panelId: leaf.panelId,
        labelKo: leaf.labelKo,
        readingIndex: idx,
        frameRectMm,
        safeRectMm,
        pacingGapAfterMm: gapAfter,
        focalPointMm: [frameRectMm.x + uv[0] * frameRectMm.width, frameRectMm.y + uv[1] * frameRectMm.height],
        balloons: (leaf.balloons ?? []).map((b) =>
          clampBalloonIntoSafePolygon(b, frameRectMm, rectToPolygon(safeRectMm)),
        ),
      });
      cursorY += panelHeightMm + gapAfter;
    }

    return {
      format: targetFormat,
      sourceTreeSnapshot,
      printPages: [],
      webtoonStrip: {
        stripWidthMm,
        totalHeightMm: cursorY,
        safeHorizontalMarginMm: safeMarginMm,
        panels: stripPanels,
      },
    };
  }

  const isA4 = targetFormat === "A4-single" || targetFormat === "A4-spread";
  const isSpread = targetFormat === "A4-spread" || targetFormat === "B5-spread";
  return {
    format: targetFormat,
    sourceTreeSnapshot,
    printPages: [
      solvePanelBspPageLayout(sourceTreeSnapshot, {
        preset: isA4 ? "A4" : "B5",
        isSpread,
        bleedMm,
        safeMarginMm,
        defaultGutterMm,
      }),
    ],
    webtoonStrip: null,
  };
}
