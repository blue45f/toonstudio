/**
 * ToonStudio 범용 브러시·드로잉 생태계 역공학 내재화 실행 엔진 (Wave 21 & Wave 22).
 */

import {
  computePomaxBezierParallelOffsetEnvelope,
  executeWickCroquisBlobAndGapFill,
  fitSchneiderCubicBezierSpline,
  KLECKS_BRUSH_PRESETS,
  WAVE23_REA_DEEP_SEMANTIC_LEDGER,
} from "./studio-bezier-curve-fit-brushes";
import {
  decodeCleanRoomBrushQrPayload,
  encodeCleanRoomBrushQrPayload,
  filterPixelPerfectStroke,
} from "./studio-commercial-pixel-brush-kernels";
import {
  COREL_PARTICLE_BRUSH_PRESETS,
  evaluateMiltonAnalyticalCapsuleSdfCoverage01,
  evaluateSculptGlQuarticFalloff01,
} from "./studio-particle-pixol-brushes";
import {
  HARMONY_BRUSH_KINDS,
  IBIS_MEDIBANG_BRUSH_PRESETS,
  P5_BRUSH_PRESET_CATALOG,
  P5_BRUSH_VECTOR_FIELDS,
  SKETCHPAD_BRUSH_KINDS,
  UNIVERSAL_BRUSH_REA_EVIDENCE_LEDGER,
  type HarmonyBrushKind,
  type P5BrushPresetId,
  type P5BrushVectorFieldKind,
  type SketchpadBrushKind,
} from "./studio-universal-brush-presets";
import {
  FIVE_TILE_PATTERN_BRUSH_PRESETS,
  SKELETAL_ART_BRUSH_PRESETS,
  WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER,
} from "./studio-vector-skeletal-pattern-brushes";

export * from "./studio-universal-brush-presets";
export * from "./studio-commercial-pixel-brush-kernels";
export * from "./studio-vector-skeletal-pattern-brushes";
export * from "./studio-particle-pixol-brushes";
export * from "./studio-bezier-curve-fit-brushes";

export interface BrushPoint2D {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
  readonly timestampMs?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function createDeterministicRng(seed: number): () => number {
  let state = (Math.trunc(Number.isFinite(seed) ? seed : 1) ^ 0x9e3779b9) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D01(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2D01(x: number, y: number, seed: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const n00 = hash2D01(x0, y0, seed);
  const n10 = hash2D01(x0 + 1, y0, seed);
  const n01 = hash2D01(x0, y0 + 1, seed);
  const n11 = hash2D01(x0 + 1, y0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return clamp01(nx0 + (nx1 - nx0) * v);
}

export interface HarmonySegmentPrimitive {
  readonly kind: "line" | "quad" | "quadratic-curve" | "circle";
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly cx?: number;
  readonly cy?: number;
  readonly radius?: number;
  readonly alpha01: number;
  readonly rgbShift01: readonly [number, number, number];
}

export interface HarmonyBrushExecutionResult {
  readonly brushKind: HarmonyBrushKind;
  readonly primitiveCount: number;
  readonly chordLinkCount: number;
  readonly primitives: readonly HarmonySegmentPrimitive[];
}

export function executeHarmonyProceduralBrush(
  brushKind: HarmonyBrushKind,
  points: readonly BrushPoint2D[],
  options?: {
    readonly pressure01?: number;
    readonly seed?: number;
  },
): HarmonyBrushExecutionResult {
  const validPoints = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (validPoints.length === 0) {
    return { brushKind, primitiveCount: 0, chordLinkCount: 0, primitives: [] };
  }

  const basePressure = clamp01(options?.pressure01 ?? 0.85);
  const rng = createDeterministicRng(options?.seed ?? 20261026);
  const primitives: HarmonySegmentPrimitive[] = [];
  let chordLinkCount = 0;

  if (brushKind === "ribbon") {
    const painters = Array.from({ length: 16 }, () => ({
      dx: validPoints[0].x,
      dy: validPoints[0].y,
      ax: 0,
      ay: 0,
      div: 0.1,
      ease: 0.6 + rng() * 0.2,
    }));

    for (let idx = 1; idx < validPoints.length; idx += 1) {
      const target = validPoints[idx];
      const p = clamp01(target.pressure01 ?? basePressure);
      for (const painter of painters) {
        const x0 = painter.dx;
        const y0 = painter.dy;
        painter.ax = (painter.ax + (painter.dx - target.x) * painter.div) * painter.ease;
        painter.ay = (painter.ay + (painter.dy - target.y) * painter.div) * painter.ease;
        painter.dx -= painter.ax;
        painter.dy -= painter.ay;
        primitives.push({
          kind: "line",
          x0,
          y0,
          x1: painter.dx,
          y1: painter.dy,
          alpha01: clamp01(0.05 * Math.max(0.15, p)),
          rgbShift01: [1, 1, 1],
        });
      }
    }
    return { brushKind, primitiveCount: primitives.length, chordLinkCount: 0, primitives };
  }

  const history: BrushPoint2D[] = [validPoints[0]];
  for (let count = 1; count < validPoints.length; count += 1) {
    const prev = validPoints[count - 1];
    const curr = validPoints[count];
    const p = clamp01(curr.pressure01 ?? basePressure);
    history.push(curr);

    if (brushKind === "simple") {
      primitives.push({
        kind: "line",
        x0: prev.x,
        y0: prev.y,
        x1: curr.x,
        y1: curr.y,
        alpha01: clamp01(0.5 * p),
        rgbShift01: [1, 1, 1],
      });
      continue;
    }

    if (brushKind === "squares") {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      primitives.push({
        kind: "quad",
        x0: prev.x + dy,
        y0: prev.y - dx,
        x1: curr.x - dy,
        y1: curr.y + dx,
        cx: prev.x - dy,
        cy: prev.y + dx,
        alpha01: p,
        rgbShift01: [1, 1, 1],
      });
      continue;
    }

    if (brushKind === "grid") {
      const cx = Math.round(curr.x / 100) * 100;
      const cy = Math.round(curr.y / 100) * 100;
      const dx = (cx - curr.x) * 10;
      const dy = (cy - curr.y) * 10;
      for (let i = 0; i < 8; i += 1) {
        primitives.push({
          kind: "quadratic-curve",
          x0: cx,
          y0: cy,
          x1: cx,
          y1: cy,
          cx: curr.x + rng() * dx,
          cy: curr.y + rng() * dy,
          alpha01: clamp01(0.04 * p),
          rgbShift01: [1, 1, 1],
        });
      }
      continue;
    }

    if (brushKind === "circles") {
      const d = Math.hypot(curr.x - prev.x, curr.y - prev.y) * 2;
      const cx = Math.floor(curr.x / 100) * 100 + 50;
      const cy = Math.floor(curr.y / 100) * 100 + 50;
      const steps = Math.max(1, Math.floor(rng() * 6) + 2);
      const stepDelta = d / steps;
      for (let i = 0; i < steps; i += 1) {
        primitives.push({
          kind: "circle",
          x0: cx,
          y0: cy,
          x1: cx,
          y1: cy,
          radius: Math.max(0.5, (steps - i) * stepDelta),
          alpha01: clamp01(0.1 * p),
          rgbShift01: [1, 1, 1],
        });
      }
      continue;
    }

    if (brushKind !== "shaded" && brushKind !== "longfur") {
      const baseAlpha = brushKind === "web" ? 0.5 * p : brushKind === "sketchy" ? 0.05 * p : 0.1 * p;
      primitives.push({
        kind: "line",
        x0: prev.x,
        y0: prev.y,
        x1: curr.x,
        y1: curr.y,
        alpha01: clamp01(baseAlpha),
        rgbShift01: [1, 1, 1],
      });
    }

    for (let i = 0; i < history.length - 1; i += 1) {
      const pt = history[i];
      const dx = pt.x - curr.x;
      const dy = pt.y - curr.y;
      const dSq = dx * dx + dy * dy;

      if (brushKind === "sketchy" && dSq < 4000 && rng() > dSq / 2000) {
        chordLinkCount += 1;
        primitives.push({
          kind: "line",
          x0: curr.x + dx * 0.3,
          y0: curr.y + dy * 0.3,
          x1: pt.x - dx * 0.3,
          y1: pt.y - dy * 0.3,
          alpha01: clamp01(0.05 * p),
          rgbShift01: [1, 1, 1],
        });
      } else if (brushKind === "shaded" && dSq < 1000) {
        chordLinkCount += 1;
        primitives.push({
          kind: "line",
          x0: curr.x,
          y0: curr.y,
          x1: pt.x,
          y1: pt.y,
          alpha01: clamp01((1 - dSq / 1000) * 0.1 * p),
          rgbShift01: [1, 1, 1],
        });
      } else if (brushKind === "chrome" && dSq < 1000) {
        chordLinkCount += 1;
        primitives.push({
          kind: "line",
          x0: curr.x + dx * 0.2,
          y0: curr.y + dy * 0.2,
          x1: pt.x - dx * 0.2,
          y1: pt.y - dy * 0.2,
          alpha01: clamp01(0.1 * p),
          rgbShift01: [rng(), rng(), rng()],
        });
      } else if (brushKind === "fur" && dSq < 2000 && rng() > dSq / 2000) {
        chordLinkCount += 1;
        primitives.push({
          kind: "line",
          x0: curr.x + dx * 0.5,
          y0: curr.y + dy * 0.5,
          x1: curr.x - dx * 0.5,
          y1: curr.y - dy * 0.5,
          alpha01: clamp01(0.1 * p),
          rgbShift01: [1, 1, 1],
        });
      } else if (brushKind === "longfur" && dSq < 4000 && rng() > dSq / 4000) {
        chordLinkCount += 1;
        const size = -rng();
        primitives.push({
          kind: "line",
          x0: curr.x + dx * size,
          y0: curr.y + dy * size,
          x1: pt.x - dx * size + rng() * 2,
          y1: pt.y - dy * size + rng() * 2,
          alpha01: clamp01(0.05 * p),
          rgbShift01: [1, 1, 1],
        });
      } else if (brushKind === "web" && dSq < 2500 && rng() > 0.4) {
        chordLinkCount += 1;
        primitives.push({
          kind: "line",
          x0: curr.x,
          y0: curr.y,
          x1: pt.x,
          y1: pt.y,
          alpha01: clamp01(0.1 * p),
          rgbShift01: [1, 1, 1],
        });
      }
    }
  }

  return { brushKind, primitiveCount: primitives.length, chordLinkCount, primitives };
}

export function evaluateP5BrushVectorFieldAngleDeg(
  fieldKind: P5BrushVectorFieldKind,
  xNorm: number,
  yNorm: number,
  seed = 42,
): number {
  const x = clampRange(xNorm, -2, 2, 0.5);
  const y = clampRange(yNorm, -2, 2, 0.5);
  const n = valueNoise2D01(x * 4, y * 4, seed);

  switch (fieldKind) {
    case "hand":
      return 3.5 * Math.sin(0.5 * x * y * 40 + 20) * Math.cos(seed) + (n - 0.5) * 12;
    case "curved":
      return (n * 2 - 1) * 24;
    case "zigzag":
      return ((Math.floor(x * 16) + Math.floor(y * 16)) & 1) === 0 ? 22 : -22;
    case "waves":
      return Math.sin(12 * x) * 28 * Math.cos(y * 4.5) + (n - 0.5) * 6;
    case "seabed":
      return 22 * Math.sin(0.6 * x * y * 36 + 18) * Math.cos(seed * 0.5);
    case "spiral":
      return (Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI + 72;
    case "columns":
      return Math.sin(x * 5.5) * 35;
  }
}

export interface P5BrushFlowLinePoint {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly opacity01: number;
  readonly angleDeg: number;
}

export function traceP5BrushFlowLine(params: {
  readonly presetId: P5BrushPresetId;
  readonly fieldKind: P5BrushVectorFieldKind;
  readonly startX: number;
  readonly startY: number;
  readonly lengthPx: number;
  readonly baseAngleDeg: number;
  readonly wiggleIntensity?: number;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly seed?: number;
}): readonly P5BrushFlowLinePoint[] {
  const preset =
    P5_BRUSH_PRESET_CATALOG.find((item) => item.id === params.presetId) ??
    P5_BRUSH_PRESET_CATALOG[0];
  const lengthPx = clampRange(params.lengthPx, 4, 2000, 120);
  const wiggle = clampRange(params.wiggleIntensity ?? 1, 0, 5, 1);
  const width = Math.max(64, params.canvasWidth ?? 512);
  const height = Math.max(64, params.canvasHeight ?? 512);
  const seed = params.seed ?? 1337;
  const stepPx = Math.max(2, preset.spacing * 24);
  const steps = Math.max(2, Math.min(256, Math.ceil(lengthPx / stepPx)));

  const points: P5BrushFlowLinePoint[] = [];
  let cx = Number.isFinite(params.startX) ? params.startX : 0;
  let cy = Number.isFinite(params.startY) ? params.startY : 0;

  for (let i = 0; i < steps; i += 1) {
    const t01 = steps > 1 ? i / (steps - 1) : 0;
    const fieldAngle =
      evaluateP5BrushVectorFieldAngleDeg(params.fieldKind, cx / width, cy / height, seed) * wiggle;
    const totalAngleDeg = (Number.isFinite(params.baseAngleDeg) ? params.baseAngleDeg : 0) + fieldAngle;
    const rad = (totalAngleDeg * Math.PI) / 180;
    const envelope01 = Math.sin(Math.PI * clamp01(t01 + preset.pressureCurve[0] * (1 - t01)));
    const pressureScale =
      preset.pressureMinMax[0] + (preset.pressureMinMax[1] - preset.pressureMinMax[0]) * envelope01;

    points.push({
      x: cx,
      y: cy,
      radiusPx: Math.max(0.25, preset.weight * 6 * pressureScale),
      opacity01: clamp01((preset.opacity255 / 255) * (0.55 + 0.45 * envelope01)),
      angleDeg: totalAngleDeg,
    });
    cx += Math.cos(rad) * stepPx;
    cy += Math.sin(rad) * stepPx;
  }
  return points;
}

export interface P5BrushBleedPolygonLayer {
  readonly layerIndex: number;
  readonly opacity01: number;
  readonly vertices: readonly BrushPoint2D[];
}

export function synthesizeP5BrushWatercolorBleedPolygon(params: {
  readonly vertices: readonly BrushPoint2D[];
  readonly bleedStrength01: number;
  readonly direction?: "out" | "in";
  readonly layerCount?: number;
  readonly textureStrength01?: number;
  readonly seed?: number;
}): readonly P5BrushBleedPolygonLayer[] {
  const valid = params.vertices.filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
  if (valid.length < 3) return [];

  const bleed = clampRange(params.bleedStrength01, 0, 1, 0.35);
  const texture = clamp01(params.textureStrength01 ?? 0.6);
  const layersCount = Math.max(3, Math.min(20, Math.round(params.layerCount ?? 8)));
  const rng = createDeterministicRng(params.seed ?? 9001);
  const dirSign = params.direction === "in" ? -1 : 1;

  let cx = 0;
  let cy = 0;
  for (const v of valid) {
    cx += v.x;
    cy += v.y;
  }
  cx /= valid.length;
  cy /= valid.length;

  const layers: P5BrushBleedPolygonLayer[] = [];
  let currentVertices = valid.map((v) => ({ x: v.x, y: v.y }));

  for (let layerIdx = 0; layerIdx < layersCount; layerIdx += 1) {
    const nextVertices: BrushPoint2D[] = [];
    for (let i = 0; i < currentVertices.length; i += 1) {
      const a = currentVertices[i];
      const b = currentVertices[(i + 1) % currentVertices.length];
      nextVertices.push(a);
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
      const radialX = mx - cx;
      const radialY = my - cy;
      const radialLen = Math.max(1e-4, Math.hypot(radialX, radialY));
      const jitter = (rng() - 0.35 * (1 - dirSign * 0.5)) * bleed * edgeLen * 0.32;
      nextVertices.push({
        x: mx + (radialX / radialLen) * jitter * dirSign,
        y: my + (radialY / radialLen) * jitter * dirSign,
      });
    }
    currentVertices =
      nextVertices.length > 64 ? nextVertices.filter((_, idx) => idx % 2 === 0) : nextVertices;
    const layerRatio01 = layerIdx / Math.max(1, layersCount - 1);
    const rimBoost = 1 + texture * 0.45 * Math.sin(layerRatio01 * Math.PI);
    layers.push({
      layerIndex: layerIdx,
      opacity01: clamp01((0.16 / Math.sqrt(layersCount)) * rimBoost),
      vertices: currentVertices,
    });
  }
  return layers;
}

export interface SketchpadDabSample {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly angleDeg: number;
  readonly hueDeg: number;
  readonly opacity01: number;
}

export function synthesizeSketchpadBrushDabs(
  brushKind: SketchpadBrushKind,
  points: readonly BrushPoint2D[],
  options?: {
    readonly baseSizePx?: number;
    readonly canvasWidth?: number;
    readonly canvasHeight?: number;
  },
): readonly SketchpadDabSample[] {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return [];

  const baseSizePx = clampRange(options?.baseSizePx ?? 12, 1, 200, 12);
  const width = Math.max(64, options?.canvasWidth ?? 512);
  const height = Math.max(64, options?.canvasHeight ?? 512);
  const samples: SketchpadDabSample[] = [];

  for (let i = 0; i < valid.length; i += 1) {
    const pt = valid[i];
    const prev = valid[Math.max(0, i - 1)];
    const angleDeg = (Math.atan2(pt.y - prev.y, pt.x - prev.x) * 180) / Math.PI;
    const p = clamp01(pt.pressure01 ?? 0.8);

    if (brushKind === "spirograph") {
      const R = baseSizePx * 2.2;
      const r = baseSizePx * 0.7;
      const d = baseSizePx * 1.25;
      for (let step = 0; step < 6; step += 1) {
        const theta = (i * 6 + step) * 0.35;
        samples.push({
          x: pt.x + (R - r) * Math.cos(theta) + d * Math.cos(((R - r) / r) * theta),
          y: pt.y + (R - r) * Math.sin(theta) - d * Math.sin(((R - r) / r) * theta),
          radiusPx: Math.max(1, baseSizePx * 0.18),
          angleDeg: (theta * 180) / Math.PI,
          hueDeg: (i * 15 + step * 6) % 360,
          opacity01: 0.75,
        });
      }
      continue;
    }

    if (brushKind === "mirror") {
      samples.push(
        { x: pt.x, y: pt.y, radiusPx: baseSizePx * p, angleDeg, hueDeg: 210, opacity01: 0.9 },
        { x: width - pt.x, y: pt.y, radiusPx: baseSizePx * p, angleDeg: 180 - angleDeg, hueDeg: 210, opacity01: 0.9 },
      );
      continue;
    }

    if (brushKind === "tile") {
      samples.push({
        x: ((pt.x % width) + width) % width,
        y: ((pt.y % height) + height) % height,
        radiusPx: baseSizePx * p,
        angleDeg,
        hueDeg: 160,
        opacity01: 0.9,
      });
      continue;
    }

    samples.push({
      x: pt.x,
      y: pt.y,
      radiusPx: Math.max(0.5, baseSizePx * (0.4 + 0.6 * p)),
      angleDeg: brushKind === "calligraphy" ? -45 : angleDeg,
      hueDeg: brushKind === "rainbow" ? (i * 18) % 360 : 220,
      opacity01: brushKind === "highlighter" ? 0.35 : 0.9,
    });
  }
  return samples;
}

export interface UniversalBrushTaxonomyBenchmarkMetrics {
  readonly reaEvidenceTargetCount: number;
  readonly wave22ReaEvidenceTargetCount: number;
  readonly wave23ReaSemanticTargetCount: number;
  readonly totalVisitedAstNodes: number;
  readonly totalSemanticDataFlowRelations: number;
  readonly harmonyBrushKindCount: number;
  readonly p5BrushPresetCount: number;
  readonly p5BrushVectorFieldCount: number;
  readonly sketchpadBrushKindCount: number;
  readonly ibisMediBangPresetCount: number;
  readonly skeletalArtBrushPresetCount: number;
  readonly fiveTilePatternPresetCount: number;
  readonly corelParticlePresetCount: number;
  readonly klecksPresetCount: number;
  readonly schneiderFittedSegmentCount: number;
  readonly pomaxOffsetCuspCount: number;
  readonly wickClosedGapCount: number;
  readonly harmonySketchyChordCount: number;
  readonly pixelPerfectReductionRatio: number;
  readonly sculptGlQuarticMidFalloff01: number;
  readonly miltonCapsuleCenterCoverage01: number;
  readonly qrCodecRoundtripVerified: boolean;
}

export function measureUniversalBrushTaxonomyEngineBenchmark(): UniversalBrushTaxonomyBenchmarkMetrics {
  const wave21Nodes = UNIVERSAL_BRUSH_REA_EVIDENCE_LEDGER.reduce(
    (sum, item) => sum + item.visitedAstNodes,
    0,
  );
  const wave22Nodes = WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER.reduce(
    (sum, item) => sum + item.visitedAstNodes,
    0,
  );
  const wave23Nodes = WAVE23_REA_DEEP_SEMANTIC_LEDGER.reduce(
    (sum, item) => sum + item.visitedAstNodes,
    0,
  );
  const totalSemanticDataFlowRelations = WAVE23_REA_DEEP_SEMANTIC_LEDGER.reduce(
    (sum, item) => sum + item.dataFlowRelations,
    0,
  );
  const totalVisitedAstNodes = wave21Nodes + wave22Nodes + wave23Nodes;
  const samplePoints: readonly BrushPoint2D[] = Array.from({ length: 14 }, (_, idx) => ({
    x: 20 + idx * 8,
    y: 30 + Math.sin(idx * 0.6) * 10,
    pressure01: 0.75,
  }));
  const harmonySketchy = executeHarmonyProceduralBrush("sketchy", samplePoints, { seed: 42 });
  const schneiderFit = fitSchneiderCubicBezierSpline(samplePoints, 2.5);
  const pomaxOffset = computePomaxBezierParallelOffsetEnvelope({
    segment: {
      p0: { x: 0, y: 0 },
      ctrl1: { x: 20, y: 80 },
      ctrl2: { x: 22, y: -80 },
      p3: { x: 40, y: 0 },
    },
    startRadiusPx: 28,
    endRadiusPx: 28,
    sampleSteps: 32,
  });
  const wickResult = executeWickCroquisBlobAndGapFill({
    points: samplePoints,
    baseRadiusPx: 10,
    gapEndpoints: [
      { a: { x: 10, y: 10 }, b: { x: 16, y: 12 } },
      { a: { x: 40, y: 40 }, b: { x: 95, y: 95 } },
    ],
    gapFillAmountPx: 12,
  });
  const noisyPixelLine = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ];
  const cleanPixelLine = filterPixelPerfectStroke(noisyPixelLine);
  const pixelPerfectReductionRatio =
    Math.round((noisyPixelLine.length / Math.max(1, cleanPixelLine.length)) * 100) / 100;
  const qrEncoded = encodeCleanRoomBrushQrPayload({
    presetId: "ribbon-petal-chain",
    baseDiameterPx: 28,
    opacity01: 0.92,
    spacingRatio: 0.42,
  });
  const qrDecoded = decodeCleanRoomBrushQrPayload(qrEncoded);
  const sculptGlQuarticMidFalloff01 = evaluateSculptGlQuarticFalloff01(0.5);
  const miltonCapsuleCenterCoverage01 = evaluateMiltonAnalyticalCapsuleSdfCoverage01({
    pixelCenterX: 50,
    pixelCenterY: 50,
    segAx: 40,
    segAy: 50,
    segBx: 60,
    segBy: 50,
    radiusA: 4,
    radiusB: 4,
  });

  return {
    reaEvidenceTargetCount:
      UNIVERSAL_BRUSH_REA_EVIDENCE_LEDGER.length +
      WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER.length +
      WAVE23_REA_DEEP_SEMANTIC_LEDGER.length,
    wave22ReaEvidenceTargetCount: WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER.length,
    wave23ReaSemanticTargetCount: WAVE23_REA_DEEP_SEMANTIC_LEDGER.length,
    totalVisitedAstNodes,
    totalSemanticDataFlowRelations,
    harmonyBrushKindCount: HARMONY_BRUSH_KINDS.length,
    p5BrushPresetCount: P5_BRUSH_PRESET_CATALOG.length,
    p5BrushVectorFieldCount: P5_BRUSH_VECTOR_FIELDS.length,
    sketchpadBrushKindCount: SKETCHPAD_BRUSH_KINDS.length,
    ibisMediBangPresetCount: IBIS_MEDIBANG_BRUSH_PRESETS.length,
    skeletalArtBrushPresetCount: SKELETAL_ART_BRUSH_PRESETS.length,
    fiveTilePatternPresetCount: FIVE_TILE_PATTERN_BRUSH_PRESETS.length,
    corelParticlePresetCount: COREL_PARTICLE_BRUSH_PRESETS.length,
    klecksPresetCount: KLECKS_BRUSH_PRESETS.length,
    schneiderFittedSegmentCount: schneiderFit.segments.length,
    pomaxOffsetCuspCount: pomaxOffset.cuspCount,
    wickClosedGapCount: wickResult.closedGapBridgeCount,
    harmonySketchyChordCount: harmonySketchy.chordLinkCount,
    pixelPerfectReductionRatio,
    sculptGlQuarticMidFalloff01,
    miltonCapsuleCenterCoverage01,
    qrCodecRoundtripVerified: qrDecoded?.presetId === "ribbon-petal-chain",
  };
}
