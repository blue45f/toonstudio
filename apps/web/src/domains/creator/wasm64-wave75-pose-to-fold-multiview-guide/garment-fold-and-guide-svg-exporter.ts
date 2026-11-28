/**
 * Wave 75: 의상 주름 및 멀티뷰 턴어라운드 가이드 비파괴 오버레이 SVG / Canvas 익스포터.
 *
 * Calm Atelier 고대비 블루프린트 팔레트(OKLCH)와 5개 독립 레이어
 * (`tension-ridges`, `compression-creases`, `head-proportion-cage`,
 * `hair-volume-silhouette`, `chirality-markers`)로 비파괴 작화 가이드 SVG 및
 * 캔버스 드로우 명령 번들을 생성한다. `prefersReducedOpacity` 접근성 모드를 지원한다.
 */

import type {
  CubicBezier2d,
  GarmentFoldSolution,
  GarmentFoldStroke,
} from "./pose-to-fold-garment-solver";
import type {
  MultiviewTurnaroundGuide,
  ProjectedGuideContour,
  ProjectedLandmark2d,
} from "./multiview-character-turnaround-guide";

export type OverlayLayerId =
  | "tension-ridges"
  | "compression-creases"
  | "head-proportion-cage"
  | "hair-volume-silhouette"
  | "chirality-markers";

export interface GuideOverlayExportOptions {
  readonly folds?: GarmentFoldSolution;
  readonly guide?: MultiviewTurnaroundGuide;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  /** 잉킹 집중 시 가이드 투명도를 낮추는 Calm Atelier 저불투명도 모드 */
  readonly prefersReducedOpacity?: boolean;
  /** 가려진(occluded) 카이랄성 랜드마크를 점선 고스트 마커로 표시할지 여부 (기본 true) */
  readonly showOcclusionGhosts?: boolean;
  /** 개별 레이어 표시 여부 토글 */
  readonly visibleLayers?: Partial<Record<OverlayLayerId, boolean>>;
  /** 접근성 SVG 제목 (한국어) */
  readonly titleKo?: string;
}

export type CanvasOverlayCommand =
  | { readonly type: "beginLayer"; readonly layer: OverlayLayerId; readonly opacity: number }
  | {
      readonly type: "cubicBezier";
      readonly layer: OverlayLayerId;
      readonly id: string;
      readonly curve: CubicBezier2d;
      readonly strokeColor: string;
      readonly strokeWidthPx: number;
      readonly dashArray?: readonly number[];
    }
  | {
      readonly type: "polyline";
      readonly layer: OverlayLayerId;
      readonly id: string;
      readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
      readonly closed: boolean;
      readonly strokeColor: string;
      readonly strokeWidthPx: number;
      readonly dashArray?: readonly number[];
    }
  | {
      readonly type: "circleMarker";
      readonly layer: OverlayLayerId;
      readonly id: string;
      readonly cx: number;
      readonly cy: number;
      readonly radiusPx: number;
      readonly strokeColor: string;
      readonly strokeWidthPx: number;
      readonly dashed: boolean;
      readonly labelKo: string;
    }
  | { readonly type: "endLayer"; readonly layer: OverlayLayerId };

export interface OverlayLayerStat {
  readonly visible: boolean;
  readonly commandCount: number;
  readonly opacity: number;
  readonly averageStrokeWidthPx: number;
}

export interface GuideOverlayExportBundle {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly prefersReducedOpacity: boolean;
  readonly svg: string;
  readonly canvasCommands: readonly CanvasOverlayCommand[];
  readonly layerStats: Readonly<Record<OverlayLayerId, OverlayLayerStat>>;
  readonly inkWidthHierarchy: {
    readonly outerContourPx: number;
    readonly hairVolumePx: number;
    readonly interiorDetailPx: number;
    readonly compressionCreasePx: number;
    readonly tensionRidgePx: number;
  };
}

interface LayerTheme {
  readonly strokeColor: string;
  readonly defaultOpacity: number;
  readonly reducedOpacity: number;
}

const CALM_ATELIER_BLUEPRINT_THEMES: Readonly<Record<OverlayLayerId, LayerTheme>> = {
  "tension-ridges": {
    strokeColor: "oklch(0.45 0.12 245)",
    defaultOpacity: 0.84,
    reducedOpacity: 0.44,
  },
  "compression-creases": {
    strokeColor: "oklch(0.30 0.08 162)",
    defaultOpacity: 0.92,
    reducedOpacity: 0.48,
  },
  "head-proportion-cage": {
    strokeColor: "oklch(0.46 0.10 218)",
    defaultOpacity: 0.86,
    reducedOpacity: 0.45,
  },
  "hair-volume-silhouette": {
    strokeColor: "oklch(0.42 0.10 155)",
    defaultOpacity: 0.88,
    reducedOpacity: 0.46,
  },
  "chirality-markers": {
    strokeColor: "oklch(0.52 0.17 28)",
    defaultOpacity: 0.94,
    reducedOpacity: 0.50,
  },
};

const ALL_LAYERS: readonly OverlayLayerId[] = [
  "tension-ridges",
  "compression-creases",
  "head-proportion-cage",
  "hair-volume-silhouette",
  "chirality-markers",
];

function safeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function fmtNum(value: number): string {
  const n = safeFinite(value, 0);
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? "0" : rounded.toFixed(2).replace(/\.00$/u, "");
}

function fmtWidth(value: number): string {
  const clamped = Math.max(0.25, Math.min(12, safeFinite(value, 1)));
  return fmtNum(clamped);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function isLayerVisible(layer: OverlayLayerId, overrides?: Partial<Record<OverlayLayerId, boolean>>): boolean {
  if (!overrides || overrides[layer] === undefined) return true;
  return Boolean(overrides[layer]);
}

function buildCubicPathData(curve: CubicBezier2d): string {
  return (
    `M ${fmtNum(curve.p0.x)} ${fmtNum(curve.p0.y)} ` +
    `C ${fmtNum(curve.p1.x)} ${fmtNum(curve.p1.y)}, ` +
    `${fmtNum(curve.p2.x)} ${fmtNum(curve.p2.y)}, ` +
    `${fmtNum(curve.p3.x)} ${fmtNum(curve.p3.y)}`
  );
}

function buildPolylinePathData(points: ReadonlyArray<{ readonly x: number; readonly y: number }>, closed: boolean): string {
  if (points.length === 0) return "";
  const segments: string[] = [`M ${fmtNum(points[0].x)} ${fmtNum(points[0].y)}`];
  for (let i = 1; i < points.length; i += 1) {
    segments.push(`L ${fmtNum(points[i].x)} ${fmtNum(points[i].y)}`);
  }
  if (closed) segments.push("Z");
  return segments.join(" ");
}

function splitContourByOcclusion(
  contour: ProjectedGuideContour,
): ReadonlyArray<{ readonly occluded: boolean; readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }> }> {
  if (contour.closed) {
    return [{ occluded: false, points: contour.points.map((p) => ({ x: safeFinite(p.x), y: safeFinite(p.y) })) }];
  }
  const runs: Array<{ readonly occluded: boolean; readonly points: Array<{ readonly x: number; readonly y: number }> }> = [];
  for (let i = 0; i < contour.points.length; i += 1) {
    const pt = contour.points[i];
    const clean = { x: safeFinite(pt.x), y: safeFinite(pt.y) };
    const prevRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (!prevRun || prevRun.occluded !== pt.occluded) {
      const seeded = prevRun && prevRun.points.length > 0 ? [prevRun.points[prevRun.points.length - 1], clean] : [clean];
      runs.push({ occluded: pt.occluded, points: seeded });
    } else {
      prevRun.points.push(clean);
    }
  }
  return runs.filter((r) => r.points.length >= 2);
}

/**
 * 의상 주름 해법 결과 및 멀티뷰 턴어라운드 가이드를 비파괴 5레이어 SVG 및 Canvas 명령 번들로 내보낸다.
 */
export function exportGarmentFoldAndGuideOverlay(options: GuideOverlayExportOptions): GuideOverlayExportBundle {
  const prefersReducedOpacity = Boolean(options.prefersReducedOpacity);
  const showOcclusionGhosts = options.showOcclusionGhosts !== false;
  const viewportWidth = Math.max(
    120,
    safeFinite(
      options.viewportWidth ?? options.guide?.camera.viewportWidth ?? options.folds?.viewportWidth ?? 800,
      800,
    ),
  );
  const viewportHeight = Math.max(
    120,
    safeFinite(
      options.viewportHeight ?? options.guide?.camera.viewportHeight ?? options.folds?.viewportHeight ?? 1000,
      1000,
    ),
  );

  const canvasCommands: CanvasOverlayCommand[] = [];
  const layerSvgBlocks: string[] = [];
  const layerStatsMutable: Record<OverlayLayerId, OverlayLayerStat> = {
    "tension-ridges": { visible: false, commandCount: 0, opacity: 0, averageStrokeWidthPx: 0 },
    "compression-creases": { visible: false, commandCount: 0, opacity: 0, averageStrokeWidthPx: 0 },
    "head-proportion-cage": { visible: false, commandCount: 0, opacity: 0, averageStrokeWidthPx: 0 },
    "hair-volume-silhouette": { visible: false, commandCount: 0, opacity: 0, averageStrokeWidthPx: 0 },
    "chirality-markers": { visible: false, commandCount: 0, opacity: 0, averageStrokeWidthPx: 0 },
  };

  const tensionFolds: GarmentFoldStroke[] = [];
  const compressionFolds: GarmentFoldStroke[] = [];
  const allFolds = options.folds?.folds ?? [];
  for (let i = 0; i < allFolds.length; i += 1) {
    const f = allFolds[i];
    if (f.mode === "tension" || f.mode === "gravity-drape") {
      tensionFolds.push(f);
    } else {
      compressionFolds.push(f);
    }
  }

  for (let idx = 0; idx < ALL_LAYERS.length; idx += 1) {
    const layer = ALL_LAYERS[idx];
    const theme = CALM_ATELIER_BLUEPRINT_THEMES[layer];
    const opacity = prefersReducedOpacity ? theme.reducedOpacity : theme.defaultOpacity;
    const visible = isLayerVisible(layer, options.visibleLayers);

    if (!visible) {
      layerStatsMutable[layer] = { visible: false, commandCount: 0, opacity, averageStrokeWidthPx: 0 };
      continue;
    }

    const svgItems: string[] = [];
    let commandCount = 0;
    let widthSum = 0;

    canvasCommands.push({ type: "beginLayer", layer, opacity });

    if (layer === "tension-ridges" || layer === "compression-creases") {
      const list = layer === "tension-ridges" ? tensionFolds : compressionFolds;
      const dashArray = layer === "tension-ridges" ? undefined : undefined;
      for (let i = 0; i < list.length; i += 1) {
        const fold = list[i];
        const strokeWidthPx = Math.max(0.25, safeFinite(fold.strokeWidthMidPx, 1.2));
        const cleanCurve: CubicBezier2d = {
          p0: { x: safeFinite(fold.curve.p0.x), y: safeFinite(fold.curve.p0.y) },
          p1: { x: safeFinite(fold.curve.p1.x), y: safeFinite(fold.curve.p1.y) },
          p2: { x: safeFinite(fold.curve.p2.x), y: safeFinite(fold.curve.p2.y) },
          p3: { x: safeFinite(fold.curve.p3.x), y: safeFinite(fold.curve.p3.y) },
        };
        const d = buildCubicPathData(cleanCurve);
        svgItems.push(
          `    <path id="${escapeXml(fold.id)}" data-topology="${escapeXml(fold.topology)}" data-mode="${escapeXml(fold.mode)}" d="${d}" fill="none" stroke="${theme.strokeColor}" stroke-width="${fmtWidth(strokeWidthPx)}" stroke-linecap="round" />`,
        );
        canvasCommands.push({
          type: "cubicBezier",
          layer,
          id: fold.id,
          curve: cleanCurve,
          strokeColor: theme.strokeColor,
          strokeWidthPx,
          dashArray,
        });
        commandCount += 1;
        widthSum += strokeWidthPx;
      }
    } else if (layer === "head-proportion-cage" && options.guide) {
      const cageContours: readonly ProjectedGuideContour[] = [
        options.guide.contours.headSilhouette,
        options.guide.contours.jawLine,
        options.guide.contours.centerline,
        options.guide.contours.eyeLine,
        options.guide.contours.browLine,
      ];
      for (let c = 0; c < cageContours.length; c += 1) {
        const contour = cageContours[c];
        const runs = splitContourByOcclusion(contour);
        const strokeWidthPx = Math.max(0.25, safeFinite(contour.adaptedStrokeWidthPx, 1.1));
        for (let r = 0; r < runs.length; r += 1) {
          const run = runs[r];
          if (run.occluded && !showOcclusionGhosts) continue;
          const d = buildPolylinePathData(run.points, contour.closed);
          const dashAttr = run.occluded ? ' stroke-dasharray="4 4" stroke-opacity="0.45"' : "";
          svgItems.push(
            `    <path id="${escapeXml(`${contour.id}-${r}`)}" data-contour="${escapeXml(contour.id)}" d="${d}" fill="none" stroke="${theme.strokeColor}" stroke-width="${fmtWidth(strokeWidthPx)}" stroke-linecap="round" stroke-linejoin="round"${dashAttr} />`,
          );
          canvasCommands.push({
            type: "polyline",
            layer,
            id: `${contour.id}-${r}`,
            points: run.points,
            closed: contour.closed,
            strokeColor: theme.strokeColor,
            strokeWidthPx,
            dashArray: run.occluded ? [4, 4] : undefined,
          });
          commandCount += 1;
          widthSum += strokeWidthPx;
        }
      }
    } else if (layer === "hair-volume-silhouette" && options.guide) {
      const hair = options.guide.contours.hairVolumeSilhouette;
      const pts = hair.points.map((p) => ({ x: safeFinite(p.x), y: safeFinite(p.y) }));
      const strokeWidthPx = Math.max(0.25, safeFinite(hair.adaptedStrokeWidthPx, 1.6));
      const d = buildPolylinePathData(pts, hair.closed);
      svgItems.push(
        `    <path id="${escapeXml(hair.id)}" data-contour="${escapeXml(hair.id)}" d="${d}" fill="none" stroke="${theme.strokeColor}" stroke-width="${fmtWidth(strokeWidthPx)}" stroke-linecap="round" stroke-linejoin="round" />`,
      );
      canvasCommands.push({
        type: "polyline",
        layer,
        id: hair.id,
        points: pts,
        closed: hair.closed,
        strokeColor: theme.strokeColor,
        strokeWidthPx,
      });
      commandCount += 1;
      widthSum += strokeWidthPx;
    } else if (layer === "chirality-markers" && options.guide) {
      const landmarks: readonly ProjectedLandmark2d[] = options.guide.landmarks;
      for (let i = 0; i < landmarks.length; i += 1) {
        const lm = landmarks[i];
        if (lm.anatomicalSide === "center" && lm.category !== "signature") continue;
        if (lm.occluded && !showOcclusionGhosts) continue;

        const cx = safeFinite(lm.x);
        const cy = safeFinite(lm.y);
        const radiusPx = lm.category === "signature" ? 5.5 : 3.5;
        const strokeWidthPx = Math.max(0.5, safeFinite(lm.adaptedStrokeWidthPx, 1.1));
        const sideTag = lm.anatomicalSide === "left" ? "L" : lm.anatomicalSide === "right" ? "R" : "C";
        const dashAttr = lm.occluded ? ' stroke-dasharray="3 3" stroke-opacity="0.45"' : "";

        svgItems.push(
          `    <g id="marker-${escapeXml(lm.id)}" data-side="${escapeXml(lm.anatomicalSide)}" data-occluded="${lm.occluded ? "true" : "false"}">` +
            `<circle cx="${fmtNum(cx)}" cy="${fmtNum(cy)}" r="${fmtNum(radiusPx)}" fill="none" stroke="${theme.strokeColor}" stroke-width="${fmtWidth(strokeWidthPx)}"${dashAttr} />` +
            `<text x="${fmtNum(cx + radiusPx + 3)}" y="${fmtNum(cy + 3)}" font-size="10" fill="${theme.strokeColor}">${escapeXml(`${sideTag}:${lm.labelKo}`)}</text>` +
            `</g>`,
        );
        canvasCommands.push({
          type: "circleMarker",
          layer,
          id: lm.id,
          cx,
          cy,
          radiusPx,
          strokeColor: theme.strokeColor,
          strokeWidthPx,
          dashed: lm.occluded,
          labelKo: `${sideTag}:${lm.labelKo}`,
        });
        commandCount += 1;
        widthSum += strokeWidthPx;
      }
    }

    canvasCommands.push({ type: "endLayer", layer });
    layerSvgBlocks.push(
      `  <g id="layer-${layer}" data-layer="${layer}" opacity="${fmtNum(opacity)}">\n${svgItems.join("\n")}\n  </g>`,
    );
    layerStatsMutable[layer] = {
      visible: true,
      commandCount,
      opacity,
      averageStrokeWidthPx: commandCount > 0 ? widthSum / commandCount : 0,
    };
  }

  const titleKo = escapeXml(options.titleKo ?? "Wave 75 의상 주름 및 멀티뷰 턴어라운드 가이드");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(viewportWidth)} ${fmtNum(viewportHeight)}" width="${fmtNum(viewportWidth)}" height="${fmtNum(viewportHeight)}" role="img" aria-label="${titleKo}">`,
    `  <title>${titleKo}</title>`,
    ...layerSvgBlocks,
    "</svg>",
  ].join("\n");

  const inkWidthHierarchy = {
    outerContourPx: safeFinite(options.guide?.inkStrokeHierarchyPx.outerContourPx ?? 0),
    hairVolumePx: safeFinite(options.guide?.inkStrokeHierarchyPx.hairVolumePx ?? 0),
    interiorDetailPx: safeFinite(options.guide?.inkStrokeHierarchyPx.interiorDetailPx ?? 0),
    compressionCreasePx: safeFinite(layerStatsMutable["compression-creases"].averageStrokeWidthPx),
    tensionRidgePx: safeFinite(layerStatsMutable["tension-ridges"].averageStrokeWidthPx),
  };

  return {
    viewportWidth,
    viewportHeight,
    prefersReducedOpacity,
    svg,
    canvasCommands,
    layerStats: layerStatsMutable,
    inkWidthHierarchy,
  };
}
