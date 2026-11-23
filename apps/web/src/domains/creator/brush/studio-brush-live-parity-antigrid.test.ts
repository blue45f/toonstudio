import { describe, expect, it } from "vitest";

import { StudioLiveRetainedMediaOverlayRenderer } from "../live/studio-live-retained-media-overlay";
import { resolveStudioFreehandRenderPath, strokeRenderDistance } from "../studio-brush";
import { planStudioDynamicBrushCoverageMarks } from "../studio-dynamic-brush-coverage-renderer";
import {
  planStudioDynamicBrushRender,
  type StudioDynamicBrushRenderPlanResult,
} from "../studio-dynamic-brush-render-plan";
import { planStudioHighlighterWashTap } from "../studio-highlighter-wash-ribbon";
import { STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1 } from "../studio-material-pressure-model";
import {
  measureStudioBrushSubPixelGridDispersion,
  resolveStudioRetainedCalligraphyRenderInput,
  resolveStudioRetainedEraserRenderInput,
  resolveStudioRetainedHighlighterTapInput,
  resolveStudioRetainedPencilRenderInput,
  STUDIO_BRUSH_HIGH_RES_FULL_TEXTURE_MIN_SIZE,
  studioDynamicBrushUsesFullTextureAuthority,
} from "./studio-brush-antigrid-parity";
import { studioBrushAliasEffectiveDiameter } from "./studio-brush-alias-profile";
import {
  normalizeStudioBrushDynamicsSettings,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
  type StudioDynamicBrushDab,
} from "./studio-brush-dynamics";
import {
  countStudioDynamicBrushMarksPerDab,
  STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
} from "./studio-brush-render-budget";
import {
  acquireStudioBrushTextureStampSurface,
  clearStudioBrushTextureStampCache,
  STUDIO_BRUSH_TEXTURE_STAMP_CACHE_BYTE_BUDGET,
  STUDIO_BRUSH_TEXTURE_STAMP_CACHE_ENTRY_LIMIT,
  STUDIO_BRUSH_TEXTURE_STAMP_SCRATCH_ENTRY_LIMIT,
  STUDIO_BRUSH_TEXTURE_STAMP_TINT_ENTRY_LIMIT,
  studioBrushTextureStampCacheStats,
  type StudioBrushTextureStampSurface,
  type StudioBrushTextureStampSurfaceContext,
  type StudioBrushTextureStampSurfaceFactory,
} from "./studio-brush-textured-stamp";
import {
  buildStudioBrushTipAlphaMap,
  DEFAULT_STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE,
  encodeStudioBrushTipAlphaMapBase64,
  type StudioBrushTipAlphaMap,
} from "./studio-brush-tip-stamp";
import { resolveStudioFxBrushTapPressureResponse } from "./studio-fx-brush-pressure-path";

import type { DrawEl } from "../studio-element-model";

function createFakeTextureSurfaceFactory(): StudioBrushTextureStampSurfaceFactory {
  return (width: number, height: number): StudioBrushTextureStampSurface => {
    const context: StudioBrushTextureStampSurfaceContext = {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "#000000",
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
        colorSpace: "srgb",
      }) as ImageData,
      putImageData: () => undefined,
      drawImage: () => undefined,
      fillRect: () => undefined,
    };
    return {
      width,
      height,
      getContext: (contextId: "2d") => (contextId === "2d" ? context : null),
    } as unknown as StudioBrushTextureStampSurface;
  };
}

function customAlphaBytes(size: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(size * size);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = centre === 0 ? 0 : (x - centre) / centre;
      const ny = centre === 0 ? 0 : (y - centre) / centre;
      const dist = Math.hypot(nx, ny);
      if (dist >= 1) continue;
      const wave = 0.55 + 0.45 * Math.sin((x + seed) * 0.7 + (y - seed) * 0.5);
      bytes[y * size + x] = Math.round(Math.max(0.15, (1 - dist) * wave) * 255);
    }
  }
  return bytes;
}

function makeDynamicDrawElement(
  id: string,
  overrides: Partial<DrawEl>,
): DrawEl {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    brush: "dry-media",
    paintModel: "bounded-flow-v2",
    points: [0, 20, 4_000, 20],
    pressures: [0.85, 0.85],
    tangentialPressures: [0, 0],
    speeds: [0.2, 0.2],
    tiltXs: [0, 0],
    tiltYs: [0, 0],
    twists: [0, 0],
    stroke: "#2d4c78",
    strokeWidth: 16,
    opacity: 0.9,
    ...overrides,
  };
}

function requireReadyPlan(result: StudioDynamicBrushRenderPlanResult) {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    throw new Error(`예상한 ready 플랜이 아닙니다: ${result.status}`);
  }
  return result.plan;
}

interface RecordedCanvasOperation {
  readonly kind: "fill" | "stroke";
  readonly alpha: number;
  readonly lineWidth: number;
  readonly composite: GlobalCompositeOperation;
  readonly ellipses: readonly (readonly [number, number, number, number, number])[];
  readonly arcs: readonly (readonly [number, number, number])[];
  readonly segments: readonly (readonly [string, number, number])[];
}

function createRecordingRetainedCanvas(width = 640, height = 240) {
  let ops: RecordedCanvasOperation[] = [];
  let ellipses: [number, number, number, number, number][] = [];
  let arcs: [number, number, number][] = [];
  let segments: [string, number, number][] = [];
  const context = {
    canvas: { width, height },
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineCap: "round" as CanvasLineCap,
    lineJoin: "round" as CanvasLineJoin,
    lineWidth: 1,
    save() {},
    restore() {},
    setTransform() {},
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    beginPath() {
      ellipses = [];
      arcs = [];
      segments = [];
    },
    closePath() {},
    moveTo(x: number, y: number) {
      segments.push(["M", x, y]);
    },
    lineTo(x: number, y: number) {
      segments.push(["L", x, y]);
    },
    arc(x: number, y: number, radius: number) {
      arcs.push([x, y, radius]);
    },
    ellipse(x: number, y: number, rx: number, ry: number, rotation: number) {
      ellipses.push([x, y, rx, ry, rotation]);
    },
    fill() {
      ops.push({
        kind: "fill",
        alpha: context.globalAlpha,
        lineWidth: context.lineWidth,
        composite: context.globalCompositeOperation,
        ellipses: [...ellipses],
        arcs: [...arcs],
        segments: [...segments],
      });
    },
    stroke() {
      ops.push({
        kind: "stroke",
        alpha: context.globalAlpha,
        lineWidth: context.lineWidth,
        composite: context.globalCompositeOperation,
        ellipses: [...ellipses],
        arcs: [...arcs],
        segments: [...segments],
      });
    },
    clearRect() {
      ops = [];
    },
    drawImage(source: HTMLCanvasElement) {
      const read = (source as unknown as { readOps?: () => RecordedCanvasOperation[] }).readOps;
      if (read) ops.push(...read());
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4),
      width: w,
      height: h,
    }),
    putImageData() {},
  };
  const canvas = {
    width,
    height,
    getContext: () => context,
    readOps: () => [...ops],
  } as unknown as HTMLCanvasElement;
  return { canvas, readOps: () => [...ops] };
}

function attachRetainedRenderer(documentScale = 1) {
  const renderer = new StudioLiveRetainedMediaOverlayRenderer();
  const active = createRecordingRetainedCanvas();
  const settled = createRecordingRetainedCanvas();
  renderer.attach({ activeCanvas: active.canvas, settledCanvas: settled.canvas });
  renderer.setSurface({
    left: 0,
    top: 0,
    width: 640,
    height: 240,
    documentScale,
    documentWidth: 640,
    flipX: false,
  });
  return { renderer, active, settled };
}

describe("다중 브러시 스탬프 캐시 스래싱 제거 (Wave 15B)", () => {
  it("상향된 32 MiB · 1024/512/32 캐시 예산 계약을 노출한다", () => {
    expect(STUDIO_BRUSH_TEXTURE_STAMP_CACHE_BYTE_BUDGET).toBe(32 * 1024 * 1024);
    expect(STUDIO_BRUSH_TEXTURE_STAMP_CACHE_ENTRY_LIMIT).toBe(1024);
    expect(STUDIO_BRUSH_TEXTURE_STAMP_TINT_ENTRY_LIMIT).toBe(512);
    expect(STUDIO_BRUSH_TEXTURE_STAMP_SCRATCH_ENTRY_LIMIT).toBe(32);
  });

  it("12종 브러시 × 14색 혼합 작업에서 스래싱 0건과 적중률 90% 이상을 유지한다", () => {
    clearStudioBrushTextureStampCache();
    const factory = createFakeTextureSurfaceFactory();

    const brushMaps: StudioBrushTipAlphaMap[] = [
      buildStudioBrushTipAlphaMap({ shape: "grain", softness: 0.25 }),
      buildStudioBrushTipAlphaMap({ shape: "flake", softness: 0.3 }),
      buildStudioBrushTipAlphaMap({ shape: "bristle", softness: 0.35 }),
      buildStudioBrushTipAlphaMap({ shape: "sponge", softness: 0.3 }),
      buildStudioBrushTipAlphaMap({ shape: "sumi", softness: 0.2 }),
      buildStudioBrushTipAlphaMap({ shape: "halftone", softness: 0.2 }),
      buildStudioBrushTipAlphaMap({ shape: "star", softness: 0.15 }),
      buildStudioBrushTipAlphaMap({ shape: "spatter", parametric: { seed: 101, count: 16 } }),
      buildStudioBrushTipAlphaMap({ shape: "rake", parametric: { seed: 707, count: 9 } }),
      buildStudioBrushTipAlphaMap({ shape: "grass", parametric: { seed: 505, count: 11 } }),
      buildStudioBrushTipAlphaMap({
        shape: "hard",
        softness: 0.1,
        alphaMapSize: 64,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(customAlphaBytes(64, 1)),
      }),
      buildStudioBrushTipAlphaMap({
        shape: "hard",
        softness: 0.2,
        alphaMapSize: 64,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(customAlphaBytes(64, 2)),
      }),
    ];
    expect(brushMaps).toHaveLength(12);
    expect(brushMaps[0]!.size).toBe(DEFAULT_STUDIO_BRUSH_TIP_ALPHA_MAP_SIZE);

    const colors = Array.from({ length: 14 }, (_, index) => {
      const r = (32 + index * 15).toString(16).padStart(2, "0");
      const g = (64 + ((index * 23) % 160)).toString(16).padStart(2, "0");
      const b = (210 - index * 11).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    });

    // 12종 × 14색 = 168개 틴트 + 12개 마스크 (~11 MiB): 기존 8 MiB / 128 틴트 상한에서는 매 라운드 스래싱 발생.
    // 워밍업 2회로 틴트 캐시 승격 후 20라운드 교차 스트로크에서 추가 할당·축출 0건을 검증한다.
    let totalRequests = 0;
    for (let warmup = 0; warmup < 2; warmup += 1) {
      for (const map of brushMaps) {
        for (const color of colors) {
          expect(acquireStudioBrushTextureStampSurface(map, color, factory)).not.toBeNull();
          totalRequests += 1;
        }
      }
    }
    const afterWarmup = studioBrushTextureStampCacheStats();
    expect(afterWarmup.maskEntries).toBe(12);
    expect(afterWarmup.tintEntries).toBe(168);

    const mixedRounds = 24;
    for (let round = 0; round < mixedRounds; round += 1) {
      for (let b = 0; b < brushMaps.length; b += 1) {
        const map = brushMaps[(b + round) % brushMaps.length]!;
        for (let c = 0; c < colors.length; c += 1) {
          const color = colors[(c + round * 3) % colors.length]!;
          expect(acquireStudioBrushTextureStampSurface(map, color, factory)).not.toBeNull();
          totalRequests += 1;
        }
      }
    }

    const finalStats = studioBrushTextureStampCacheStats();
    const postWarmupRequests = mixedRounds * brushMaps.length * colors.length;
    const postWarmupTintHits = finalStats.tintHits - afterWarmup.tintHits;
    const overallHitRate = finalStats.tintHits / totalRequests;
    const postWarmupHitRate = postWarmupTintHits / postWarmupRequests;

    // 12종 × 14색 교차 혼합 중 축출·재할당·재틴트 0건(스래싱 0건) + 적중률 >= 90%
    expect(finalStats.maskEntries).toBe(12);
    expect(finalStats.tintEntries).toBe(168);
    expect(finalStats.surfaceAllocations).toBe(afterWarmup.surfaceAllocations);
    expect(finalStats.tintPasses).toBe(afterWarmup.tintPasses);
    expect(finalStats.maskMisses).toBe(afterWarmup.maskMisses);
    expect(overallHitRate).toBeGreaterThanOrEqual(0.9);
    expect(postWarmupHitRate).toBe(1);
    expect(finalStats.bytes).toBeLessThanOrEqual(STUDIO_BRUSH_TEXTURE_STAMP_CACHE_BYTE_BUDGET);
    expect(finalStats.maskEntries).toBeLessThanOrEqual(STUDIO_BRUSH_TEXTURE_STAMP_CACHE_ENTRY_LIMIT);
    expect(finalStats.tintEntries).toBeLessThanOrEqual(STUDIO_BRUSH_TEXTURE_STAMP_TINT_ENTRY_LIMIT);
  });
});

describe("그리는 중(Live) vs 완료 후(Committed) 시각·입력 패리티", () => {
  it("고해상도 커스텀 텍스처(>=32px)와 해석 소프트·파라미터 동적 브러시는 라이브와 커밋 대브·폭·마크가 완전 일치한다", () => {
    const highResSize = STUDIO_BRUSH_HIGH_RES_FULL_TEXTURE_MIN_SIZE * 2;
    const highResDynamics = normalizeStudioBrushDynamicsSettings({
      seed: 19,
      width: { base: 18, mappings: [] },
      opacity: { base: 1, mappings: [] },
      flow: { base: 0.85, mappings: [] },
      spacingRatio: null,
      spacing: { base: 2, mappings: [] },
      scatterRatio: null,
      scatter: { base: 0, mappings: [] },
      roundness: { base: 0.8, mappings: [] },
      tip: {
        shape: "hard",
        softness: 0.15,
        alphaMapSize: highResSize,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(customAlphaBytes(highResSize, 7)),
      },
      taper: { enabled: false },
    });
    const softGrainDynamics = normalizeStudioBrushDynamicsSettings({
      seed: 23,
      width: { base: 24, mappings: [] },
      opacity: { base: 1, mappings: [] },
      flow: { base: 0.7, mappings: [] },
      spacingRatio: null,
      spacing: { base: 3, mappings: [] },
      scatterRatio: null,
      scatter: { base: 0, mappings: [] },
      roundness: { base: 1, mappings: [] },
      tip: { shape: "soft", softness: 0.75 },
      grain: { space: "canvas-fixed", amount: 0.45, scale: 6, contrast: 0.6, seed: 31 },
      taper: { enabled: false },
    });
    const parametricDynamics = normalizeStudioBrushDynamicsSettings({
      seed: 29,
      width: { base: 20, mappings: [] },
      opacity: { base: 1, mappings: [] },
      flow: { base: 0.9, mappings: [] },
      spacingRatio: null,
      spacing: { base: 3, mappings: [] },
      scatterRatio: null,
      scatter: { base: 0, mappings: [] },
      roundness: { base: 1, mappings: [] },
      tip: { shape: "spatter", softness: 0.2, parametric: { seed: 42, count: 18 } },
      taper: { enabled: false },
    });

    expect(studioDynamicBrushUsesFullTextureAuthority(highResDynamics)).toBe(true);
    expect(studioDynamicBrushUsesFullTextureAuthority(parametricDynamics)).toBe(true);
    expect(countStudioDynamicBrushMarksPerDab(highResDynamics, 7)).toBe(1);
    expect(countStudioDynamicBrushMarksPerDab(softGrainDynamics, 7)).toBe(1);
    expect(countStudioDynamicBrushMarksPerDab(parametricDynamics, 7)).toBe(1);

    const paperSurface = { kind: "rough" as const, seed: 73 };
    for (const [label, dynamics, expectedKind] of [
      ["high-res-custom", highResDynamics, "texture"],
      ["soft-analytic-grain", softGrainDynamics, "falloff"],
      ["parametric-spatter", parametricDynamics, "texture"],
    ] as const) {
      // 500+ 대브 × 8대칭 = 4,200+ 마크 (> 기존 4,096 라이브 상한)로 라이브 축소 없이 커밋과 일치함을 증명.
      const element = makeDynamicDrawElement(`parity-${label}`, {
        points: [0, 20, 2_400, 20],
        brushDynamics: dynamics,
        symmetry: { type: "radial", radialCount: 8, centerX: 500, centerY: 500 },
      });
      const livePlan = requireReadyPlan(
        planStudioDynamicBrushRender(element, "dry-media", true, paperSurface),
      );
      const committedPlan = requireReadyPlan(
        planStudioDynamicBrushRender(element, "dry-media", false, paperSurface),
      );

      expect(livePlan.markBudget).toBe(STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET);
      expect(committedPlan.markBudget).toBe(STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET);
      expect(livePlan.renderBudget).toEqual(committedPlan.renderBudget);
      expect(livePlan.renderBudget.estimatedMarks).toBeGreaterThan(
        STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
      );
      expect(livePlan.renderBudget.dabCapped).toBe(false);
      expect(livePlan.renderBudget.stampGridReduced).toBe(false);
      expect(livePlan.dabVariations).toEqual(committedPlan.dabVariations);
      expect(livePlan.paper).toEqual(committedPlan.paper);

      const liveCoverage = planStudioDynamicBrushCoverageMarks({
        dabVariations: livePlan.dabVariations,
        dynamics: livePlan.dynamics,
        materialIdentity: livePlan.materialIdentity,
        ...(livePlan.paper ? { paper: livePlan.paper } : {}),
        dynamicSeed: livePlan.seed,
        stroke: element.stroke,
        stampGrid: livePlan.renderBudget.stampGrid,
        markBudget: livePlan.markBudget,
      });
      const committedCoverage = planStudioDynamicBrushCoverageMarks({
        dabVariations: committedPlan.dabVariations,
        dynamics: committedPlan.dynamics,
        materialIdentity: committedPlan.materialIdentity,
        ...(committedPlan.paper ? { paper: committedPlan.paper } : {}),
        dynamicSeed: committedPlan.seed,
        stroke: element.stroke,
        stampGrid: committedPlan.renderBudget.stampGrid,
        markBudget: committedPlan.markBudget,
      });
      expect(liveCoverage.ok).toBe(true);
      expect(committedCoverage.ok).toBe(true);
      if (!liveCoverage.ok || !committedCoverage.ok) throw new Error("coverage plan failed");
      expect(liveCoverage.marks.length).toBe(committedCoverage.marks.length);
      expect(liveCoverage.marks.length).toBeGreaterThan(STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET);
      for (let index = 0; index < liveCoverage.marks.length; index += 1) {
        const liveMark = liveCoverage.marks[index]!;
        const committedMark = committedCoverage.marks[index]!;
        expect(liveMark.x).toBe(committedMark.x);
        expect(liveMark.y).toBe(committedMark.y);
        expect(liveMark.radiusX).toBe(committedMark.radiusX);
        expect(liveMark.radiusY).toBe(committedMark.radiusY);
        expect(liveMark.angleRadians).toBe(committedMark.angleRadians);
        expect(liveMark.alpha).toBe(committedMark.alpha);
        expect(liveMark.color).toBe(committedMark.color);
        expect(liveMark.texture?.alphaMap.revision).toBe(committedMark.texture?.alphaMap.revision);
        expect(liveMark.falloff).toEqual(committedMark.falloff);
      }
      if (expectedKind === "texture") {
        expect(liveCoverage.marks.every((mark) => mark.texture?.kind === "alpha-map")).toBe(true);
      } else {
        expect(liveCoverage.marks.every((mark) => mark.falloff?.kind === "analytic-radial")).toBe(true);
      }
    }
  });

  it("인과 텍스처 브러시와 종이 표면 설정이 라이브와 커밋에서 동일하게 적용된다", () => {
    const causalDynamics = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      seed: 11,
      width: { base: 20, mappings: [] },
      opacity: { base: 0.9, mappings: [] },
      flow: { base: 0.85, mappings: [] },
      tip: { shape: "grain", softness: 0.25, alphaMapSize: 32 },
      taper: { enabled: false },
    });
    const element = makeDynamicDrawElement("causal-paper-parity", {
      brush: "dry-media",
      brushDynamics: causalDynamics,
      points: [20, 40, 120, 42, 240, 48],
      pressures: [0.6, 0.8, 0.7],
      tangentialPressures: [0, 0, 0],
      speeds: [0.2, 0.3, 0.25],
      tiltXs: [0, 0, 0],
      tiltYs: [0, 0, 0],
      twists: [0, 0, 0],
    });
    const surface = { kind: "washi" as const, seed: 99 };
    const live = requireReadyPlan(planStudioDynamicBrushRender(element, "dry-media", true, surface));
    const committed = requireReadyPlan(planStudioDynamicBrushRender(element, "dry-media", false, surface));
    expect(live.markBudget).toBe(committed.markBudget);
    expect(live.renderBudget).toEqual(committed.renderBudget);
    expect(live.paper).toEqual(committed.paper);
    expect(live.dabVariations).toEqual(committed.dabVariations);
  });

  it("리테인드 미디어(연필·캘리그라피·형광펜·지우개) 라이브 오버레이 입력이 StudioDrawNode와 일치한다", () => {
    // 1) 연필: sampleSpacing 텐션(0.18) + 별칭 유효 폭 + 비정규 필압 차단 일치
    const pencilEl: DrawEl = {
      id: "parity-pencil",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "pencil--side-shade",
      sampleSpacing: 1.5,
      points: [10, 20, 40, 22, 80, 26],
      pressures: [0.2, 0.9, 0.4],
      stroke: "#222222",
      strokeWidth: 6,
      opacity: 0.8,
    };
    const pencilInput = resolveStudioRetainedPencilRenderInput(pencilEl);
    const expectedPencilPath = resolveStudioFreehandRenderPath(pencilEl.points, {
      sampleSpacing: pencilEl.sampleSpacing,
      acceptedTension: 0.18,
      legacyMinDistance: strokeRenderDistance(pencilEl.sampleSpacing),
      legacyTension: 0.2,
    });
    expect(pencilInput.width).toBe(studioBrushAliasEffectiveDiameter("pencil--side-shade", 6));
    expect(pencilInput.tension).toBe(0.18);
    expect(pencilInput.points).toEqual(expectedPencilPath.points);
    expect(pencilInput.canonicalPressures).toBeUndefined();

    // 2) 캘리그라피 1점 탭: StudioDrawNode와 동일한 각도 타원 반지름·회전 + 줌 독립 정착
    const calTapEl: DrawEl = {
      id: "parity-cal-tap",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "calligraphy",
      points: [120, 90],
      pressures: [0.75],
      brushTip: { tiltEnabled: false, angleDeg: -35, roundness: 0.28 },
      stroke: "#1c2433",
      strokeWidth: 18,
      opacity: 0.85,
    };
    const calInput = resolveStudioRetainedCalligraphyRenderInput(calTapEl);
    const normalCal = attachRetainedRenderer(1);
    const zoomedOutCal = attachRetainedRenderer(0.05);
    for (const host of [normalCal, zoomedOutCal]) {
      expect(host.renderer.begin(calTapEl)).toEqual({ status: "started", kind: "calligraphy" });
      expect(host.renderer.end(calTapEl)).toEqual({ status: "settled" });
    }
    const normalCalOps = normalCal.settled.readOps();
    const zoomedCalOps = zoomedOutCal.settled.readOps();
    expect(normalCalOps).toEqual(zoomedCalOps);
    expect(normalCalOps).toHaveLength(1);
    expect(normalCalOps[0]!.ellipses[0]).toEqual([
      120,
      90,
      calInput.tapEllipse.radiusX,
      calInput.tapEllipse.radiusY,
      calInput.tapEllipse.angleRadians,
    ]);
    expect(normalCalOps[0]!.alpha).toBeCloseTo(0.85, 9);

    // 3) 형광펜 1점 탭: 불투명도 이중 제곱 제거 + StudioDrawNode 필압 응답 일치
    const hlTapEl: DrawEl = {
      id: "parity-hl-tap",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "highlighter",
      points: [180, 100],
      pressures: [0.7],
      stroke: "#ffe042",
      strokeWidth: 20,
      opacity: 0.45,
      materialPressureModel: STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1,
    };
    const aliasHlWidth = studioBrushAliasEffectiveDiameter("highlighter", 20);
    const hlTapInput = resolveStudioRetainedHighlighterTapInput(hlTapEl, aliasHlWidth);
    const expectedFxPressure = resolveStudioFxBrushTapPressureResponse(
      "highlighter",
      0.7,
      STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1,
      undefined,
    );
    const expectedWashTap = planStudioHighlighterWashTap({
      brushId: "highlighter",
      x: 180,
      y: 100,
      width: aliasHlWidth * expectedFxPressure.widthScale,
      opacityScale: expectedFxPressure.opacityScale,
    });
    expect(hlTapInput.tapWidth).toBeCloseTo(aliasHlWidth * expectedFxPressure.widthScale, 9);
    expect(hlTapInput.opacityScale).toBeCloseTo(expectedFxPressure.opacityScale, 9);

    const hlHost = attachRetainedRenderer(1);
    expect(hlHost.renderer.begin(hlTapEl)).toEqual({ status: "started", kind: "highlighter" });
    expect(hlHost.renderer.end(hlTapEl)).toEqual({ status: "settled" });
    const hlOps = hlHost.settled.readOps();
    expect(hlOps).toHaveLength(1);
    // 수정 전에는 0.45 * (0.45 * washScale)로 제곱되었으나, 수정 후 StudioDrawNode와 정확히 일치한다.
    expect(hlOps[0]!.alpha).toBeCloseTo(0.45 * expectedWashTap.opacityScale, 9);

    // 4) 지우개 별칭 폭 + 요소 불투명도 + 줌 독립 정착 일치
    const eraserEl: DrawEl = {
      id: "parity-eraser",
      type: "draw",
      kind: "freehand",
      mode: "eraser",
      brush: "precision-eraser",
      points: [40, 60, 140, 60],
      stroke: "#000000",
      strokeWidth: 16,
      opacity: 0.6,
    };
    const eraserInput = resolveStudioRetainedEraserRenderInput(eraserEl);
    expect(eraserInput.width).toBe(studioBrushAliasEffectiveDiameter("precision-eraser", 16));
    expect(eraserInput.opacity).toBeCloseTo(0.6, 9);

    const normalEraser = attachRetainedRenderer(1);
    const zoomedOutEraser = attachRetainedRenderer(0.05);
    for (const host of [normalEraser, zoomedOutEraser]) {
      expect(host.renderer.begin(eraserEl)).toEqual({ status: "started", kind: "eraser" });
      expect(host.renderer.end(eraserEl)).toEqual({ status: "settled" });
    }
    const settledNormalEraser = normalEraser.settled.readOps();
    const settledZoomedEraser = zoomedOutEraser.settled.readOps();
    expect(settledZoomedEraser).toEqual(settledNormalEraser);
    expect(settledNormalEraser[0]!.lineWidth).toBeCloseTo(eraserInput.width, 9);
    expect(settledNormalEraser[0]!.alpha).toBeCloseTo(0.6, 9);
    expect(settledNormalEraser[0]!.composite).toBe("destination-out");
  });
});

describe("종이질 격자·체커보드 주기성 억제 (R2 블루노이즈 서브픽셀 분산)", () => {
  it("샘플드 팁 폴백에서 R2 서브픽셀 지터가 정방 격자와 대브 반복을 깨면서 접미사 결정론을 유지한다", () => {
    const legacyEightByEight = normalizeStudioBrushDynamicsSettings({
      seed: 137,
      tip: {
        shape: "hard",
        softness: 0,
        alphaMapSize: 8,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(new Uint8Array(8 * 8).fill(255)),
      },
      grain: { amount: 0 },
      taper: { enabled: false },
    });

    const dabs: StudioDynamicBrushDab[] = Array.from({ length: 24 }, (_, index) => ({
      index,
      x: 40 + index * 10,
      y: 80,
      sourceX: 40 + index * 10,
      sourceY: 80,
      size: 36,
      opacity: 0.85,
      flow: 0.9,
      angle: 0,
      roundness: 1,
      spacing: 10,
      scatter: 0,
      progress: index / 23,
    }));

    const fullA = planStudioDynamicBrushCoverageMarks({
      dabVariations: [dabs],
      dynamics: legacyEightByEight,
      dynamicSeed: 137,
      stroke: "#3b4e6b",
      stampGrid: 5,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    const fullB = planStudioDynamicBrushCoverageMarks({
      dabVariations: [dabs],
      dynamics: legacyEightByEight,
      dynamicSeed: 137,
      stroke: "#3b4e6b",
      stampGrid: 5,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    expect(fullA.ok).toBe(true);
    expect(fullB.ok).toBe(true);
    if (!fullA.ok || !fullB.ok) throw new Error("sampled plan failed");
    // 완전 결정론: 동일 입력은 비트 단위로 동일한 마크를 생성한다.
    expect(fullB.marks).toEqual(fullA.marks);

    // 라이브 접미사 패리티: 마지막 6개 대브만 계획해도 전체 획 꼬리와 비트 단위로 같다.
    const suffixDabs = dabs.slice(-6);
    const suffix = planStudioDynamicBrushCoverageMarks({
      dabVariations: [suffixDabs],
      strokeOrigins: [{ x: dabs[0]!.x, y: dabs[0]!.y }],
      dynamics: legacyEightByEight,
      dynamicSeed: 137,
      stroke: "#3b4e6b",
      stampGrid: 5,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    expect(suffix.ok).toBe(true);
    if (!suffix.ok) throw new Error("suffix plan failed");
    expect(suffix.marks).toEqual(fullA.marks.slice(-suffix.marks.length));

    // 대브 간 상대 오프셋 반복(레일 격자) 붕괴 검증: 연속 대브의 서브샘플 상대 좌표가 달라야 한다.
    const marksPerDab = fullA.marks.length / dabs.length;
    expect(marksPerDab).toBe(25);
    const dab0Rel = fullA.marks.slice(0, marksPerDab).map((m) => `${(m.x - dabs[0]!.x).toFixed(3)},${(m.y - dabs[0]!.y).toFixed(3)}`);
    const dab1Rel = fullA.marks.slice(marksPerDab, marksPerDab * 2).map((m) => `${(m.x - dabs[1]!.x).toFixed(3)},${(m.y - dabs[1]!.y).toFixed(3)}`);
    expect(dab1Rel).not.toEqual(dab0Rel);

    // 8×8 서브픽셀 토러스 분산 및 축 정렬 억제 검증 (단일 격자 쏠림 없음).
    const dispersion = measureStudioBrushSubPixelGridDispersion(fullA.marks, 8);
    expect(dispersion.uniqueSubPixelBuckets).toBeGreaterThanOrEqual(48);
    expect(dispersion.bucketCoverageRatio).toBeGreaterThanOrEqual(0.75);
    expect(dispersion.axisAlignmentScore).toBeLessThanOrEqual(0.22);
  });

  it("스펀지 절차적 팁은 정방 블록 계단 현상 없이 유기적 보로노이 기공을 유지한다", () => {
    const mapA = buildStudioBrushTipAlphaMap({ shape: "sponge", softness: 0.3, alphaMapSize: 128 });
    const mapB = buildStudioBrushTipAlphaMap({ shape: "sponge", softness: 0.3, alphaMapSize: 128 });
    expect(Array.from(mapA.alphas)).toEqual(Array.from(mapB.alphas));

    // 기존 `Math.floor((nx+1)*6)` 구현은 약 10px 너비 정방 셀 내부가 완전히 같은 pore 상수였다.
    // 중심부 40×40 영역에서 인접 픽셀 변화량을 확인해 정방 평탄 블록이 사라졌음을 증명한다.
    let varyingNeighbors = 0;
    let totalChecked = 0;
    for (let y = 44; y < 84; y += 1) {
      for (let x = 44; x < 84; x += 1) {
        const cur = mapA.alphas[y * 128 + x]!;
        const right = mapA.alphas[y * 128 + x + 1]!;
        const down = mapA.alphas[(y + 1) * 128 + x]!;
        if (Math.abs(cur - right) > 1e-4 || Math.abs(cur - down) > 1e-4) {
          varyingNeighbors += 1;
        }
        totalChecked += 1;
      }
    }
    expect(varyingNeighbors / totalChecked).toBeGreaterThan(0.95);
  });
});
