/**
 * `StudioDrawNode`용 순수 스트로크 계산·보간·플래닝·진단 헬퍼 모음 (Wave 3 #011).
 *
 * React 훅·Konva 런타임·DOM 의존성이 없는 순수 함수 모듈이며,
 * `StudioDrawNode.tsx`에서 포인터 경계 계산, 탭 압력·폭 계산, 퍼펙트 아웃라인 판정,
 * 캘리그래피 리본·연필 패스 플래닝, 감사 진단 기록을 위임한다.
 */

import {
  buildCalligraphySegments,
  resolveStudioBrushRenderFamily,
  resolveStudioFreehandRenderPath,
  strokeRenderDistance,
  type CalligraphyStylusInput,
} from "../studio-brush";
import type {
  StudioDynamicBrushCoverageMarkPlan,
} from "../studio-dynamic-brush-coverage-renderer";
import {
  FX_OIL_DAB_CAP,
  fxBrushSeedFromKey,
  isStudioFxPressureBrushId,
  planGlitterBrushParticles,
  planGlowBrushPasses,
  planNeonBrushPasses,
  planStudioFxBrushPressurePath,
  resolveStudioFxBrushTapPressureResponse,
  resolveStudioFxPressurePassResponse,
  studioLuminousCoreColor,
  type FxGlitterParticle,
  type FxOilDab,
  type FxOilPlanInput,
  type StudioFxLuminousBrushId,
} from "../studio-fx-brush";
import {
  planStudioHighlighterWashRibbon,
  resolveStudioHighlighterWashBrushId,
  type StudioHighlighterWashPlan,
} from "../studio-highlighter-wash-ribbon";
import { STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1 } from "../studio-material-pressure-model";
import {
  buildStudioPerfectFreehandOutline,
  studioPerfectFreehandOutlineToPathData,
  type StudioPerfectFreehandProfile,
  type StudioPerfectFreehandStroker,
} from "../studio-perfect-freehand";
import { isStudioPixelPencilRenderMode } from "../studio-pixel-pencil";
import {
  planStudioRetainedMediaPressureCurve,
  resolveStudioRetainedMediaPressure,
  resolveStudioRetainedMediaPressureProfileId,
  type StudioRetainedMediaPressureProfileId,
} from "../studio-retained-media-pressure";
import { planStudioRetainedMediaRibbon } from "../studio-retained-media-ribbon";

import {
  isStudioBrushEraserAliasId,
  mapStudioBrushAliasPressure,
  mapStudioBrushAliasPressureSamples,
  resolveStudioBrushAliasPencilPasses,
  studioBrushAliasEffectiveDiameter,
  type StudioBrushAliasPencilPass,
} from "./studio-brush-alias-profile";
import { resolveStudioBrushSinglePointRoute } from "./studio-brush-runtime-contract";
import { resolveStudioCalligraphyRenderTip } from "./studio-calligraphy-nib-profile";
import {
  planStudioCalligraphyRibbon,
  type StudioCalligraphyRibbonPlan,
} from "./studio-calligraphy-ribbon";
import type { StudioDrawPencilPassPlan } from "./studio-draw-node-canvas-painters";
import { studioOilFamilyPlanFields } from "./studio-fluid-paint-reference";
import { studioFxLuminousDraftRetentionFits } from "./studio-fx-luminous-retained-path";
import type { StudioOilRibbonCarrierPlan } from "./studio-oil-ribbon-carrier";
import { studioPencilAliasPassPoints } from "./studio-pencil-alias-passes";
import type { StudioAngledNibPressureInput } from "./studio-stroke-local-coverage";

import type { DrawEl } from "../studio-element-model";

export type PerfectInkDebugState = {
  brush: string;
  pointCount: number;
  strokeDistance: number;
  isVeryShort: boolean;
  isSparseLong: boolean;
  profile: string;
  outlineDistance?: number;
  outlinePointCount?: number;
  isDegeneratePath?: boolean;
};

export function setPerfectInkDebugState(
  state: PerfectInkDebugState | null,
): void {
  if (typeof globalThis === "undefined") {
    return;
  }
  (
    globalThis as { __perfectInkDebugState?: PerfectInkDebugState | null }
  ).__perfectInkDebugState = state;
}

export function isStudioDynamicSealDebugEnabled(): boolean {
  return (
    (globalThis as { __studioDynamicSealDebugEnabled?: boolean })
      .__studioDynamicSealDebugEnabled === true
  );
}

export function recordStudioDynamicCommitRouteDebug(params: {
  readonly el: DrawEl;
  readonly dynamicBrushId: string | null;
  readonly planStatus: string | null;
  readonly coverageOk: boolean | null;
  readonly stampBrushKind: string | null;
  readonly hasPerfectProfile: boolean;
}): void {
  (
    globalThis as { __studioCommitRouteDebug?: Record<string, unknown> }
  ).__studioCommitRouteDebug = {
    elId: params.el.id,
    brush: params.el.brush ?? null,
    brushCatalogId: params.el.brushCatalogId ?? null,
    dynamicBrushId: params.dynamicBrushId,
    planStatus: params.planStatus,
    coverageOk: params.coverageOk,
    paintModel: params.el.paintModel ?? null,
    watercolorPipeline: params.el.watercolorPipeline ?? null,
    stampPipeline: params.el.stampPipeline ?? null,
    paperModel: params.el.paperModel ?? null,
    hasDynamics:
      typeof params.el.brushDynamics === "object"
      && params.el.brushDynamics !== null,
    pointCount: Math.floor(params.el.points.length / 2),
    stampBrushKind: params.stampBrushKind,
    perfectProfile: params.hasPerfectProfile,
  };
}

export function recordStudioDynamicCommitRenderDebug(params: {
  readonly enabled: boolean;
  readonly elId: string;
  readonly branch: string;
  readonly result: unknown;
  readonly coveragePlan: StudioDynamicBrushCoverageMarkPlan | null;
  readonly legacyMarkCount: number;
  readonly opacity: number;
}): void {
  if (!params.enabled) return;
  const planMarks = params.coveragePlan?.ok ? params.coveragePlan.marks : [];
  (
    globalThis as { __studioCommitRenderDebug?: Record<string, unknown> }
  ).__studioCommitRenderDebug = {
    elId: params.elId,
    branch: params.branch,
    result: params.result,
    markCount: params.coveragePlan?.ok ? planMarks.length : -1,
    // 인앱 커밋 플랜의 강도 요약 — 오프라인 프로브와의 마지막 비교점.
    alphaPeak: planMarks.reduce((m, mark) => Math.max(m, mark.alpha), 0),
    energy: planMarks.reduce(
      (sum, mark) => sum + mark.alpha * mark.radiusX * mark.radiusY,
      0,
    ),
    textured: planMarks.filter((mark) => mark.texture).length,
    ribbons: planMarks.filter((mark) => mark.ribbon).length,
    legacyMarkCount: params.legacyMarkCount,
    opacity: params.opacity,
    at: performance.now(),
  };
}

export function computeStudioDrawPointSpan(
  points: readonly number[],
  measureBounds: boolean,
): Readonly<{ pointCount: number; strokeDistance: number }> {
  const pointCount = Math.floor(points.length / 2);
  if (!measureBounds || pointCount < 2) {
    return { pointCount, strokeDistance: 0 };
  }
  let minX = points[0] ?? 0;
  let maxX = minX;
  let minY = points[1] ?? 0;
  let maxY = minY;
  for (let index = 2; index + 1 < points.length; index += 2) {
    const px = points[index]!;
    const py = points[index + 1]!;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  return {
    pointCount,
    strokeDistance: Math.hypot(maxX - minX, maxY - minY),
  };
}

export function computeStudioOutlineErrorBounds(
  points: readonly number[],
): Readonly<{ minX: number; minY: number; width: number; height: number }> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (let pointIndex = 0; pointIndex + 1 < points.length; pointIndex += 2) {
    const x = points[pointIndex];
    const y = points[pointIndex + 1];
    if (
      typeof x === "number"
      && Number.isFinite(x)
      && typeof y === "number"
      && Number.isFinite(y)
    ) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      found = true;
    }
  }
  if (!found) {
    return { minX: 0, minY: 0, width: 16, height: 16 };
  }
  return {
    minX,
    minY,
    width: Math.max(16, maxX - minX),
    height: Math.max(16, maxY - minY),
  };
}

export function resolveStudioDrawTapMetrics(params: {
  readonly brush: string;
  readonly brushFamily: string;
  readonly mode: DrawEl["mode"];
  readonly pressures: readonly number[] | undefined;
  readonly materialPressureModel: DrawEl["materialPressureModel"];
  readonly materialMinimumDiameterRatio: number | undefined;
  readonly aliasProfileEnabled: boolean;
  readonly isPerfectAliasBrush: boolean;
  readonly aliasStrokeWidth: number;
  readonly includeRetainedPressure: boolean;
}): Readonly<{ sourcePressure: number; width: number }> {
  const sourcePressure = Math.min(1, Math.max(0, params.pressures?.[0] ?? 0.5));
  const pressure = params.aliasProfileEnabled
    ? mapStudioBrushAliasPressure(params.brush, sourcePressure, 0.5)
    : sourcePressure;
  const retainedPressureProfile = params.includeRetainedPressure
    ? resolveStudioRetainedMediaPressureProfileId(params.brush)
    : null;
  const retainedPressure = retainedPressureProfile
    ? resolveStudioRetainedMediaPressure(
        retainedPressureProfile,
        params.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
          ? sourcePressure
          : undefined,
        params.materialMinimumDiameterRatio,
      )
    : null;
  const pressureAware =
    params.mode === "eraser"
    || params.brushFamily === "pen"
    || params.brushFamily === "gpen"
    || params.brushFamily === "calligraphy"
    || params.isPerfectAliasBrush
    || params.brushFamily === "marker"
    || retainedPressure !== null;
  const width = retainedPressure
    ? params.aliasStrokeWidth * retainedPressure.sizeScale
    : pressureAware
      ? params.aliasStrokeWidth * (0.3 + pressure * 1.4)
      : params.aliasStrokeWidth;
  return { sourcePressure, width };
}

export function evaluateStudioPerfectStrokeClassification(params: {
  readonly durableDocumentRender: boolean;
  readonly brush: string;
  readonly mode: DrawEl["mode"];
  readonly brushFamily: string;
  readonly pointCount: number;
  readonly strokeDistance: number;
  readonly aliasStrokeWidth: number;
  readonly perfectProfile: StudioPerfectFreehandProfile;
  readonly hasStroker: boolean;
}): Readonly<{
  debug: boolean;
  isVeryShortPerfectStroke: boolean;
  isSparseLongPerfectStroke: boolean;
}> {
  const debug = Boolean(
    params.durableDocumentRender
    && typeof globalThis !== "undefined"
    && (globalThis as { __debugPerfectInk?: boolean }).__debugPerfectInk,
  );
  if (debug) {
    console.log(
      `[debug-perfect-ink] render brush=${params.brush} mode=${params.mode} points=${params.pointCount} stroker=${params.hasStroker ? "loaded" : "missing"}`,
    );
  }
  // The historical perfect-* profiles deliberately keep their compact tap fallback.
  // G-pen nibs must not use it: even a two-point flick needs pressure and taper geometry.
  const isVeryShortPerfectStroke =
    params.brushFamily === "perfect"
    && params.pointCount <= 3
    && params.strokeDistance < 16;
  const sparseSpacingPx =
    params.strokeDistance / Math.max(1, params.pointCount - 1);
  const isSparseLongPerfectStroke =
    params.perfectProfile.id === "perfect-ink"
    && params.pointCount >= 4
    && params.strokeDistance >= 180
    && sparseSpacingPx >= Math.max(20, params.aliasStrokeWidth * 4);
  if (debug) {
    setPerfectInkDebugState({
      brush: params.brush,
      pointCount: params.pointCount,
      strokeDistance: params.strokeDistance,
      isVeryShort: isVeryShortPerfectStroke,
      isSparseLong: isSparseLongPerfectStroke,
      profile: params.perfectProfile.id,
    });
  }
  return { debug, isVeryShortPerfectStroke, isSparseLongPerfectStroke };
}

export function evaluateStudioPerfectOutlinePath(params: {
  readonly stroker: StudioPerfectFreehandStroker;
  readonly brush: string;
  readonly brushFamily: string;
  readonly points: readonly number[];
  readonly pressures: readonly number[] | undefined;
  readonly pointCount: number;
  readonly strokeDistance: number;
  readonly aliasStrokeWidth: number;
  readonly perfectProfile: StudioPerfectFreehandProfile;
  readonly isVeryShortPerfectStroke: boolean;
  readonly isSparseLongPerfectStroke: boolean;
  readonly debug: boolean;
}): Readonly<{ pathData: string; isDegeneratePerfectPath: boolean }> {
  const outlinePressures =
    params.brushFamily === "gpen"
    || (params.pressures && params.pressures.length > 0)
      ? mapStudioBrushAliasPressureSamples(
          params.brush,
          params.pressures,
          params.pointCount,
          params.brushFamily === "gpen" ? 0.6 : 0.5,
        )
      : params.pressures;
  const perfectOutline = buildStudioPerfectFreehandOutline(params.stroker, {
    points: params.points,
    pressures: outlinePressures,
    strokeWidth: params.aliasStrokeWidth,
    profile: params.perfectProfile,
  });
  const pathData = studioPerfectFreehandOutlineToPathData(perfectOutline);
  let outlineDistance = 0;
  if (perfectOutline.length >= 2) {
    let minX = perfectOutline[0]?.[0] ?? 0;
    let maxX = minX;
    let minY = perfectOutline[0]?.[1] ?? 0;
    let maxY = minY;
    for (let i = 1; i < perfectOutline.length; i += 1) {
      const pt = perfectOutline[i]!;
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }
    outlineDistance = Math.hypot(maxX - minX, maxY - minY);
  }
  const isDegeneratePerfectPath =
    (perfectOutline.length < 12 && params.strokeDistance < 120)
    || outlineDistance < Math.max(6, params.strokeDistance * 0.35);
  if (params.debug) {
    console.log(
      `[debug-perfect-ink] pathDecision brush=${params.brush} points=${params.pointCount} `
        + `strokeDistance=${params.strokeDistance.toFixed(1)} `
        + `outlineDistance=${outlineDistance.toFixed(1)} `
        + `outlinePoints=${perfectOutline.length} `
        + `isDegenerate=${isDegeneratePerfectPath ? "true" : "false"} `
        + `pathLen=${pathData.length}`,
    );
    setPerfectInkDebugState({
      brush: params.brush,
      pointCount: params.pointCount,
      strokeDistance: params.strokeDistance,
      isVeryShort: params.isVeryShortPerfectStroke,
      isSparseLong: params.isSparseLongPerfectStroke,
      profile: params.perfectProfile.id,
      outlineDistance,
      outlinePointCount: perfectOutline.length,
      isDegeneratePath: isDegeneratePerfectPath,
    });
  }
  return { pathData, isDegeneratePerfectPath };
}

export function buildStudioCalligraphyDrawRibbon(params: {
  readonly el: DrawEl;
  readonly brush: string;
  readonly points: number[];
  readonly renderSampleDistance: number;
  readonly aliasStrokeWidth: number;
}): Readonly<{ smoothed: number[]; ribbon: StudioCalligraphyRibbonPlan }> {
  const smoothed = resolveStudioFreehandRenderPath(params.points, {
    sampleSpacing: params.el.sampleSpacing,
    legacyMinDistance: params.renderSampleDistance,
    legacyTension: 0,
  }).points;
  const sourcePointCount = Math.floor(params.points.length / 2);
  const sampleCount = Math.min(
    sourcePointCount,
    Math.max(
      params.el.tiltXs?.length ?? 0,
      params.el.tiltYs?.length ?? 0,
      params.el.twists?.length ?? 0,
    ),
  );
  const stylusSamples: CalligraphyStylusInput[] = Array.from(
    { length: sampleCount },
    (_, sampleIndex) => ({
      pointerType: "pen",
      tiltX: params.el.tiltXs?.[sampleIndex],
      tiltY: params.el.tiltYs?.[sampleIndex],
      twist: params.el.twists?.[sampleIndex],
    }),
  );
  const segments = buildCalligraphySegments(
    smoothed,
    mapStudioBrushAliasPressureSamples(
      params.brush,
      params.el.pressures,
      sourcePointCount,
      0.5,
    ),
    stylusSamples,
    params.aliasStrokeWidth,
    // Pre-nib-table documents carry no brushTip; the catalogue nib stands in so a stored
    // fountain/parallel pen renders as the pen it was drawn with.
    resolveStudioCalligraphyRenderTip(params.brush, params.el.brushTip),
  );
  return {
    smoothed,
    ribbon: planStudioCalligraphyRibbon(segments),
  };
}

export function buildStudioPencilPassPlans(params: {
  readonly passes: readonly StudioBrushAliasPencilPass[];
  readonly points: readonly number[];
  readonly pressures: readonly number[] | undefined;
  readonly materialPressureModel: DrawEl["materialPressureModel"];
  readonly materialMinimumDiameterRatio: number | undefined;
  readonly tension: number;
  readonly pressureProfile: StudioRetainedMediaPressureProfileId;
  readonly aliasStrokeWidth: number;
}): StudioDrawPencilPassPlan[] {
  return params.passes.map((pass) => {
    const curve = planStudioRetainedMediaPressureCurve(
      studioPencilAliasPassPoints(params.points, pass.jitterRadius),
      params.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
        ? params.pressures
        : undefined,
      params.pressureProfile,
      {
        tension: params.tension,
        minimumDiameterRatio: params.materialMinimumDiameterRatio,
      },
    );
    return {
      pass,
      ribbon: planStudioRetainedMediaRibbon(
        curve,
        Math.max(0.5, params.aliasStrokeWidth * pass.widthScale),
      ),
    };
  });
}

export function buildStudioOilRibbonPaintInput(
  carrier: StudioOilRibbonCarrierPlan,
  stroke: string,
  opacity: number,
  dabs: readonly FxOilDab[],
): {
  readonly carrier: StudioOilRibbonCarrierPlan;
  readonly stroke: string;
  readonly opacity: number;
  readonly points: Array<{ readonly x: number; readonly y: number }>;
  readonly radiusPx: number;
} {
  return {
    carrier,
    stroke,
    opacity,
    points: dabs.map((dab) => ({ x: dab.x, y: dab.y })),
    radiusPx: Math.max(
      1,
      dabs.reduce((sum, dab) => sum + dab.radiusY, 0) / Math.max(1, dabs.length),
    ),
  };
}

export interface StudioDrawFreehandContext {
  readonly brush: string;
  readonly brushFamily: ReturnType<typeof resolveStudioBrushRenderFamily>;
  readonly aliasProfileEnabled: boolean;
  readonly isPerfectAliasBrush: boolean;
  readonly pixelPencil: boolean;
  readonly aliasStrokeWidth: number;
  readonly aliasPencilPasses: readonly StudioBrushAliasPencilPass[];
  readonly singlePointRoute: ReturnType<typeof resolveStudioBrushSinglePointRoute>;
  readonly renderSampleDistance: number;
  readonly pointCount: number;
  readonly strokeDistance: number;
  readonly isCompactPerfectDotRoute: boolean;
}

export function resolveStudioDrawFreehandContext(params: {
  readonly el: DrawEl;
  readonly points: readonly number[];
  readonly strokeWidth: number;
  readonly hasPerfectProfile: boolean;
}): StudioDrawFreehandContext {
  const brush = params.el.brush ?? "pen";
  const brushFamily = resolveStudioBrushRenderFamily(brush);
  const aliasProfileEnabled =
    params.el.mode !== "eraser" || isStudioBrushEraserAliasId(brush);
  const isPerfectAliasBrush = brush.startsWith("perfect-");
  const pixelPencil = isStudioPixelPencilRenderMode(brush);
  const aliasStrokeWidth = aliasProfileEnabled
    ? studioBrushAliasEffectiveDiameter(brush, params.strokeWidth)
    : params.strokeWidth;
  const aliasPencilPasses = aliasProfileEnabled
    ? resolveStudioBrushAliasPencilPasses(brush)
    : [];
  const singlePointRoute = resolveStudioBrushSinglePointRoute({
    brushId: brush,
    mode: params.el.mode,
    causalInkEnabled:
      params.el.sampleSpacing !== undefined
      || params.el.pressureModel !== undefined,
  });
  const renderSampleDistance = strokeRenderDistance(params.el.sampleSpacing);
  const { pointCount, strokeDistance } = computeStudioDrawPointSpan(
    params.points,
    params.hasPerfectProfile,
  );
  const isCompactPerfectDotRoute =
    isPerfectAliasBrush
    && singlePointRoute === "generic-dot"
    && pointCount <= 4
    && strokeDistance < 16;
  return {
    brush,
    brushFamily,
    aliasProfileEnabled,
    isPerfectAliasBrush,
    pixelPencil,
    aliasStrokeWidth,
    aliasPencilPasses,
    singlePointRoute,
    renderSampleDistance,
    pointCount,
    strokeDistance,
    isCompactPerfectDotRoute,
  };
}

export function resolveStudioAngledNibCoveragePressureInput(params: {
  readonly el: DrawEl;
  readonly brush: string;
  readonly opacity: number;
}): StudioAngledNibPressureInput | undefined {
  if (
    params.el.materialPressureModel
    !== STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
  ) {
    return undefined;
  }
  return {
    profileId:
      params.brush === "flat-brush"
        ? ("flat-brush" as const)
        : params.brush === "marker--chisel-ribbon"
          ? ("marker-chisel" as const)
          : ("brush" as const),
    pressures: params.el.pressures,
    minimumDiameterRatio: params.el.materialMinimumDiameterRatio,
    elementOpacity: params.opacity,
  };
}

export function buildStudioHighlighterDrawWashPlan(params: {
  readonly el: DrawEl;
  readonly brush: string;
  readonly points: number[];
  readonly renderSampleDistance: number;
  readonly aliasStrokeWidth: number;
}): StudioHighlighterWashPlan {
  const renderPath = resolveStudioFreehandRenderPath(params.points, {
    sampleSpacing: params.el.sampleSpacing,
    acceptedTension: 0.35,
    legacyMinDistance: params.renderSampleDistance,
    legacyTension: 0.35,
  });
  const pressureBrush = isStudioFxPressureBrushId(params.brush)
    ? params.brush
    : "highlighter";
  const pressurePath = planStudioFxBrushPressurePath({
    brushId: pressureBrush,
    points: renderPath.points,
    pressures: params.el.pressures,
    pressureModel: params.el.materialPressureModel,
    minimumDiameterRatio: params.el.materialMinimumDiameterRatio,
    tension: renderPath.tension,
  });
  return planStudioHighlighterWashRibbon({
    brushId: resolveStudioHighlighterWashBrushId(params.brush),
    pressurePath,
    baseWidth: params.aliasStrokeWidth,
  });
}

export interface StudioLuminousPassSpec {
  readonly passIndex: number;
  readonly passColor: string;
  readonly widthScale: number;
  readonly opacity: number;
  readonly luminousCore: boolean;
  readonly legacyLineWidth: number;
  readonly legacyTapRadius: number;
  readonly canonicalTapRadius: number;
  readonly canonicalTapOpacity: number;
}

export interface StudioLuminousBrushRenderPlan {
  readonly brushId: StudioFxLuminousBrushId;
  readonly points: number[];
  readonly tension: number;
  readonly isCanonicalPressure: boolean;
  readonly retainLuminousPasses: boolean;
  readonly passes: readonly StudioLuminousPassSpec[];
}

export function planStudioLuminousBrushRender(params: {
  readonly family: "neon" | "glow";
  readonly el: DrawEl;
  readonly points: number[];
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly renderSampleDistance: number;
  readonly activeDraft: boolean;
  readonly symmetryVariationCount: number;
}): StudioLuminousBrushRenderPlan {
  const renderPath = resolveStudioFreehandRenderPath(params.points, {
    sampleSpacing: params.el.sampleSpacing,
    acceptedTension: 0.3,
    legacyMinDistance: params.renderSampleDistance,
    legacyTension: 0.35,
  });
  const isNeon = params.family === "neon";
  const soft = !isNeon && (params.el.brush ?? "glow") === "soft-glow";
  const brushId: StudioFxLuminousBrushId = isNeon
    ? "neon"
    : soft
      ? "soft-glow"
      : "glow";
  const rawPasses = isNeon
    ? planNeonBrushPasses(params.strokeWidth)
    : planGlowBrushPasses(params.strokeWidth, soft);
  const retainLuminousPasses = studioFxLuminousDraftRetentionFits(
    params.activeDraft,
    renderPath.points.length,
    rawPasses.length,
    params.symmetryVariationCount,
  );
  const isCanonicalPressure =
    params.el.materialPressureModel
    === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1;
  const tapPressure = isCanonicalPressure
    ? resolveStudioFxBrushTapPressureResponse(
        brushId,
        params.el.pressures?.[0],
        params.el.materialPressureModel,
        params.el.materialMinimumDiameterRatio,
      )
    : null;
  const passes: StudioLuminousPassSpec[] = rawPasses.map((pass, passIndex) => {
    const luminousCore = isNeon
      ? "tone" in pass && pass.tone === "white-core"
      : passIndex === rawPasses.length - 1;
    const passColor =
      isNeon && luminousCore
        ? studioLuminousCoreColor(params.stroke)
        : params.stroke;
    const legacyLineWidth = Math.max(0.5, params.strokeWidth * pass.widthScale);
    const legacyTapRadius = Math.max(0.25, legacyLineWidth * 0.5);
    const tapPassPressure = tapPressure
      ? resolveStudioFxPressurePassResponse(
          tapPressure,
          pass.widthScale,
          luminousCore,
        )
      : null;
    const canonicalTapRadius = tapPassPressure
      ? Math.max(
          0.25,
          params.strokeWidth
          * pass.widthScale
          * tapPassPressure.widthScale
          * 0.5,
        )
      : legacyTapRadius;
    const canonicalTapOpacity = tapPassPressure
      ? Math.min(1, pass.opacity * tapPassPressure.opacityScale)
      : pass.opacity;
    return {
      passIndex,
      passColor,
      widthScale: pass.widthScale,
      opacity: pass.opacity,
      luminousCore,
      legacyLineWidth,
      legacyTapRadius,
      canonicalTapRadius,
      canonicalTapOpacity,
    };
  });
  return {
    brushId,
    points: renderPath.points,
    tension: renderPath.tension,
    isCanonicalPressure,
    retainLuminousPasses,
    passes,
  };
}

export function buildStudioGlitterBrushParticles(params: {
  readonly el: DrawEl;
  readonly points: number[];
  readonly renderSampleDistance: number;
  readonly aliasStrokeWidth: number;
}): FxGlitterParticle[] {
  const mode =
    (params.el.brush ?? "glitter") === "star-dust"
      ? "star-dust"
      : params.el.brush === "sparkle-star"
        ? "sparkle-star"
        : "glitter";
  return planGlitterBrushParticles({
    points: resolveStudioFreehandRenderPath(params.points, {
      sampleSpacing: params.el.sampleSpacing,
      legacyMinDistance: params.renderSampleDistance,
      legacyTension: 0,
    }).points,
    pressures: params.el.pressures,
    baseWidth: params.aliasStrokeWidth,
    seed: fxBrushSeedFromKey(params.el.id),
    mode,
    maxParticles: 512,
  });
}

export function buildStudioOilBrushPlanInput(params: {
  readonly el: DrawEl;
  readonly brush: string;
  readonly points: number[];
  readonly renderSampleDistance: number;
  readonly aliasStrokeWidth: number;
}): FxOilPlanInput {
  return {
    points: resolveStudioFreehandRenderPath(params.points, {
      sampleSpacing: params.el.sampleSpacing,
      legacyMinDistance: params.renderSampleDistance,
      legacyTension: 0,
    }).points,
    pressures: params.el.pressures,
    baseWidth: params.aliasStrokeWidth,
    seed: fxBrushSeedFromKey(params.el.id),
    maxDabs: FX_OIL_DAB_CAP,
    ...studioOilFamilyPlanFields(params.brush),
  };
}
