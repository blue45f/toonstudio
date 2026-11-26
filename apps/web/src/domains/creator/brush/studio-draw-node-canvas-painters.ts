/**
 * `StudioDrawNode`용 순수 Canvas2D 래스터 페인터 모음 (Wave 3 #011).
 *
 * React 훅·Konva 런타임·에디터 생명주기 의존성 없이 `Konva.Context` / `Konva.Shape`
 * 타입 계약에만 의존하며, `StudioDrawNode.tsx`의 `sceneFunc` 콜백에서 직접 호출된다.
 */

import { renderStudioDynamicBrushCoverageMark } from "../studio-dynamic-brush-coverage-renderer";
import {
  planStudioFxBrushPressurePath,
  planStudioFxLuminousRibbonPass,
  type FxGlitterParticle,
  type FxPastelDab,
  type StudioFxLuminousBrushId,
  type StudioIncrementalFxPressurePathBuilder,
} from "../studio-fx-brush";
import {
  traceStudioHighlighterWashDetail,
  traceStudioHighlighterWashPlan,
  type StudioHighlighterWashPlan,
} from "../studio-highlighter-wash-ribbon";
import type { StudioRetainedMediaRibbonPlan } from "../studio-retained-media-ribbon";

import type { StudioBrushAliasPencilPass } from "./studio-brush-alias-profile";
import type { StudioCalligraphyRibbonPlan } from "./studio-calligraphy-ribbon";
import { drawFreehandPenSegments } from "./studio-draw-rendering";
import {
  fillStudioFxLuminousRibbonPass,
  type StudioFxLuminousRetainedPass,
} from "./studio-fx-luminous-retained-path";
import {
  STUDIO_PENCIL_RIBBON_ALPHA_BUCKET_COUNT,
  studioPencilRibbonAlphaBucket,
} from "./studio-pencil-alias-passes";
import { rasterizeStudioCoverageBands } from "./studio-stroke-coverage-raster";
import type { StudioAngledNibStrokeLocalCoveragePlan } from "./studio-stroke-local-coverage";
import type { WatercolorBrushDab } from "./studio-watercolor-brush";

import type {
  StudioCanvasContextLike,
  StudioShapeDrawContextLike,
  StudioShapeLike,
} from "../canvas/studio-stage-handle-types";
import type { DrawEl } from "../studio-element-model";

export interface StudioDrawPencilPassPlan {
  readonly pass: StudioBrushAliasPencilPass;
  readonly ribbon: StudioRetainedMediaRibbonPlan;
}

export interface StudioDrawLuminousPassPaintParams {
  readonly brushId: StudioFxLuminousBrushId;
  readonly points: readonly number[];
  readonly pressures: readonly number[] | undefined;
  readonly pressureModel: DrawEl["materialPressureModel"];
  readonly minimumDiameterRatio: number | undefined;
  readonly tension: number;
  readonly baseWidth: number;
  readonly passWidthScale: number;
  readonly passOpacity: number;
  readonly passColor: string;
  readonly luminousCore: boolean;
  readonly producer: StudioIncrementalFxPressurePathBuilder | null;
  readonly retained: StudioFxLuminousRetainedPass | null;
}

export interface StudioDrawFreehandPenStrokeParams {
  readonly smoothed: number[];
  readonly sampledPressures: readonly number[];
  readonly stroke: string;
  readonly aliasStrokeWidth: number;
  readonly composite: GlobalCompositeOperation;
  readonly freehandFill: string | undefined;
}

export function paintStudioDrawCalligraphyRibbon(
  context: StudioCanvasContextLike,
  ribbon: StudioCalligraphyRibbonPlan,
  smoothed: readonly number[],
  aliasStrokeWidth: number,
  stroke: string,
): void {
  if (ribbon.runs.length === 0 && smoothed.length >= 2) {
    context.beginPath();
    context.arc(
      smoothed[0]!,
      smoothed[1]!,
      Math.max(0.5, aliasStrokeWidth * 0.18),
      0,
      Math.PI * 2,
    );
    context.fillStyle = stroke;
    context.fill();
    return;
  }
  context.beginPath();
  for (const run of ribbon.runs) {
    const [firstX, firstY, ...outlineTail] = run.outlinePoints;
    if (firstX === undefined || firstY === undefined) continue;
    context.moveTo(firstX, firstY);
    for (let pointIndex = 0; pointIndex < outlineTail.length; pointIndex += 2) {
      context.lineTo(
        outlineTail[pointIndex]!,
        outlineTail[pointIndex + 1]!,
      );
    }
    context.closePath();
    context.moveTo(run.startCap.x + run.startCap.radius, run.startCap.y);
    context.arc(
      run.startCap.x,
      run.startCap.y,
      run.startCap.radius,
      0,
      Math.PI * 2,
    );
    context.moveTo(run.endCap.x + run.endCap.radius, run.endCap.y);
    context.arc(
      run.endCap.x,
      run.endCap.y,
      run.endCap.radius,
      0,
      Math.PI * 2,
    );
  }
  context.fillStyle = stroke;
  context.fill();
}

export function paintStudioDrawAngledNibCoverage(
  context: StudioShapeDrawContextLike,
  shape: StudioShapeLike,
  coveragePlan: StudioAngledNibStrokeLocalCoveragePlan,
  tonal: boolean,
  stroke: string,
): void {
  if (coveragePlan.polygons.length === 0) return;
  if (tonal) {
    // Device scale = the layer's own pixel ratio times everything the stage and
    // its groups scale this node by. Rasterising at anything less would make the
    // mark go soft the moment the artboard is zoomed in.
    const nodeScale = shape.getAbsoluteScale();
    const raster = rasterizeStudioCoverageBands(
      coveragePlan.bands,
      stroke,
      context.getCanvas().getPixelRatio()
        * Math.max(Math.abs(nodeScale.x), Math.abs(nodeScale.y)),
    );
    if (raster) {
      context.drawImage(
        raster.source,
        0,
        0,
        raster.sourceWidth,
        raster.sourceHeight,
        raster.x,
        raster.y,
        raster.width,
        raster.height,
      );
      return;
    }
    // Surface refused (no document, or a mark too large to scratch). Falling
    // through paints the silhouette flat rather than dropping the stroke.
  }
  context.beginPath();
  for (const polygon of coveragePlan.polygons) {
    context.moveTo(polygon.points[0]!, polygon.points[1]!);
    for (
      let coordinateIndex = 2;
      coordinateIndex < polygon.points.length;
      coordinateIndex += 2
    ) {
      context.lineTo(
        polygon.points[coordinateIndex]!,
        polygon.points[coordinateIndex + 1]!,
      );
    }
    context.closePath();
  }
  // All subpaths now have one winding, so non-zero fill is a monotonic union.
  // Konva applies the Shape opacity once to this complete stroke-local coverage.
  context.fillStrokeShape(shape);
}

export function paintStudioDrawWatercolorDab(
  context: StudioCanvasContextLike,
  dab: WatercolorBrushDab,
  stroke: string,
  opacity: number,
): void {
  context.globalAlpha = Math.min(1, Math.max(0, dab.opacity * opacity));
  context.beginPath();
  context.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
  if (dab.role === "diffuse") {
    // 외곽이 0 alpha로 사라지는 방사 그라디언트라, 별도 blur 필터 없이도 젖은
    // 종이 가장자리처럼 퍼진다. 중심 dab과 함께 그려져 단일 탭도 자연스러운 점이 된다.
    const gradient = context.createRadialGradient(
      dab.x,
      dab.y,
      0,
      dab.x,
      dab.y,
      dab.radius,
    );
    gradient.addColorStop(0, stroke);
    gradient.addColorStop(0.45, stroke);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
  } else {
    context.fillStyle = stroke;
  }
  context.fill();
}

export function paintStudioDrawScreentoneDots(
  context: StudioShapeDrawContextLike,
  shape: StudioShapeLike,
  dots: readonly number[],
  dotR: number,
): void {
  context.beginPath();
  for (let i = 0; i < dots.length; i += 2) {
    context.moveTo(dots[i]! + dotR, dots[i + 1]!);
    context.arc(dots[i]!, dots[i + 1]!, dotR, 0, Math.PI * 2);
  }
  context.fillStrokeShape(shape);
}

export function paintStudioDrawPencilRibbonPasses(
  context: StudioCanvasContextLike,
  passPlans: readonly StudioDrawPencilPassPlan[],
  stroke: string,
): void {
  context.save();
  const inheritedAlpha = context.globalAlpha;
  context.fillStyle = stroke;
  // Every adjacent cell shares one miter/bevel cross-section. Unlike independent
  // butt strokes, the pressure mesh has neither an outer hole nor a darker inner
  // overlap; each source segment still owns its canonical pigment response.
  for (const { pass, ribbon } of passPlans) {
    const buckets: number[][] = Array.from(
      { length: STUDIO_PENCIL_RIBBON_ALPHA_BUCKET_COUNT + 1 },
      () => [],
    );
    for (const run of ribbon.runs) {
      for (const cell of run.cells) {
        if (cell.points.length < 6) continue;
        const alpha = Math.min(
          1,
          pass.opacityScale * Math.sqrt(cell.opacityScale * cell.flowScale),
        );
        const bIndex = studioPencilRibbonAlphaBucket(alpha);
        if (bIndex > 0) {
          const bucket = buckets[bIndex]!;
          for (let ci = 0; ci < cell.points.length; ci += 1) {
            bucket.push(cell.points[ci]!);
          }
          bucket.push(Number.NaN);
        }
      }
      for (const cap of run.caps) {
        if (cap.points.length < 6) continue;
        const alpha = Math.min(
          1,
          pass.opacityScale * Math.sqrt(cap.opacityScale * cap.flowScale),
        );
        const bIndex = studioPencilRibbonAlphaBucket(alpha);
        if (bIndex > 0) {
          const bucket = buckets[bIndex]!;
          for (let ci = 0; ci < cap.points.length; ci += 1) {
            bucket.push(cap.points[ci]!);
          }
          bucket.push(Number.NaN);
        }
      }
    }

    for (let b = 1; b <= STUDIO_PENCIL_RIBBON_ALPHA_BUCKET_COUNT; b += 1) {
      const coords = buckets[b]!;
      if (coords.length === 0) continue;
      context.globalAlpha =
        inheritedAlpha * (b / STUDIO_PENCIL_RIBBON_ALPHA_BUCKET_COUNT);
      context.beginPath();
      let startIdx = 0;
      for (let i = 0; i <= coords.length; i += 1) {
        if (i === coords.length || Number.isNaN(coords[i])) {
          if (i - startIdx >= 6) {
            context.moveTo(coords[startIdx]!, coords[startIdx + 1]!);
            for (let c = startIdx + 2; c < i; c += 2) {
              context.lineTo(coords[c]!, coords[c + 1]!);
            }
            context.closePath();
          }
          startIdx = i + 1;
        }
      }
      context.fill();
    }
  }
  context.restore();
}

export function paintStudioDrawHighlighterWashTap(
  context: StudioCanvasContextLike,
  washPlan: StudioHighlighterWashPlan,
  stroke: string,
): void {
  if (washPlan.runs.length === 0) return;
  context.save();
  context.globalAlpha *= washPlan.opacityScale;
  context.fillStyle = stroke;
  context.beginPath();
  traceStudioHighlighterWashPlan(context, washPlan);
  context.fill();
  context.restore();
}

export function paintStudioDrawHighlighterWashRibbon(
  context: StudioCanvasContextLike,
  washPlan: StudioHighlighterWashPlan,
  stroke: string,
): void {
  if (washPlan.runs.length === 0) return;
  context.save();
  const washAlpha = context.globalAlpha * washPlan.opacityScale;
  context.globalAlpha = washAlpha;
  context.fillStyle = stroke;
  context.beginPath();
  traceStudioHighlighterWashPlan(context, washPlan);
  context.fill();
  // Rim pooling and fibre streaks: one extra compound fill, so a self-crossing
  // still receives at most one detail wash.
  if (washPlan.detailRuns.length > 0) {
    context.globalAlpha = washAlpha * washPlan.detailOpacityScale;
    context.beginPath();
    traceStudioHighlighterWashDetail(context, washPlan);
    context.fill();
  }
  context.restore();
}

export function paintStudioDrawLuminousRibbonPass(
  context: StudioCanvasContextLike,
  params: StudioDrawLuminousPassPaintParams,
): void {
  const fxInput = {
    brushId: params.brushId,
    points: params.points,
    pressures: params.pressures,
    pressureModel: params.pressureModel,
    minimumDiameterRatio: params.minimumDiameterRatio,
    tension: params.tension,
  } as const;
  const passPlanInput = {
    brushId: params.brushId,
    pressurePath: params.producer
      ? params.producer.append(fxInput)
      : planStudioFxBrushPressurePath(fxInput),
    baseWidth: params.baseWidth,
    passWidthScale: params.passWidthScale,
    passOpacity: params.passOpacity,
    luminousCore: params.luminousCore,
  } as const;
  const ribbonPlan = params.producer && params.retained
    ? params.retained.builder.append({ ...passPlanInput, producer: params.producer })
    : planStudioFxLuminousRibbonPass(passPlanInput);
  if (ribbonPlan.polygons.length === 0) return;
  context.save();
  context.globalAlpha *= ribbonPlan.opacity;
  context.fillStyle = params.passColor;
  fillStudioFxLuminousRibbonPass(context, ribbonPlan, params.retained);
  context.restore();
}

export function paintStudioDrawGlitterParticles(
  context: StudioCanvasContextLike,
  particles: readonly FxGlitterParticle[],
  stroke: string,
  opacity: number,
): void {
  context.save();
  for (const particle of particles) {
    context.globalAlpha = Math.min(1, Math.max(0, particle.opacity * opacity));
    context.fillStyle = stroke;
    if (particle.kind === 1) {
      const s = particle.radius * 1.35;
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(Math.PI / 4);
      context.fillRect(-s * 0.5, -s * 0.5, s, s);
      context.restore();
    } else {
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

export function paintStudioDrawPastelDabs(
  context: StudioCanvasContextLike,
  dabs: readonly FxPastelDab[],
  stroke: string,
  opacity: number,
): void {
  context.save();
  for (const dab of dabs) {
    try {
      // Reuse the same high-resolution colourless falloff mask as dynamic soft
      // brushes. This is one cached affine drawImage per fibre instead of creating
      // thousands of radial gradients again on every retained-layer repaint.
      renderStudioDynamicBrushCoverageMark(
        context,
        {
          x: dab.x,
          y: dab.y,
          radiusX: dab.radiusX,
          radiusY: dab.radiusY,
          angleRadians: dab.angleRad,
          alpha: dab.opacity,
          color: stroke,
          falloff: {
            kind: "analytic-radial",
            exponent: 0.72,
          },
        },
        opacity,
      );
    } catch {
      // Restricted Canvas hosts without an allocatable stamp surface retain a
      // deterministic analytic-gradient fallback rather than dropping pigment.
      context.globalAlpha = Math.min(1, Math.max(0, dab.opacity * opacity));
      context.save();
      context.translate(dab.x, dab.y);
      context.rotate(dab.angleRad);
      context.scale(1, dab.radiusY / dab.radiusX);
      const gradient = context.createRadialGradient(
        0,
        0,
        0,
        0,
        0,
        dab.radiusX,
      );
      gradient.addColorStop(0, stroke);
      gradient.addColorStop(0.55, stroke);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.beginPath();
      context.arc(0, 0, dab.radiusX, 0, Math.PI * 2);
      context.fillStyle = gradient;
      context.fill();
      context.restore();
    }
  }
  context.restore();
}

export function paintStudioDrawFreehandPenStroke(
  context: StudioCanvasContextLike,
  params: StudioDrawFreehandPenStrokeParams,
): void {
  if (params.smoothed.length < 4) return;
  if (params.composite !== "source-over") {
    context.globalCompositeOperation = params.composite;
  }
  if (params.freehandFill && params.smoothed.length >= 6) {
    context.beginPath();
    context.moveTo(params.smoothed[0]!, params.smoothed[1]!);
    for (let i = 2; i < params.smoothed.length; i += 2) {
      context.lineTo(params.smoothed[i]!, params.smoothed[i + 1]!);
    }
    context.closePath();
    context.fillStyle = params.freehandFill;
    context.fill();
  }
  // 중점 이차곡선 보간 — 다이렉트 라이브 초안과 같은 래스터라이저를 공유한다.
  drawFreehandPenSegments(
    context,
    params.smoothed,
    params.sampledPressures,
    params.stroke,
    params.aliasStrokeWidth,
  );
}
