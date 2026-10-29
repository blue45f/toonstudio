/**
 * Wave 25: 프리핸드 가변 폭 윤곽(perfect-freehand), 수작업 스케치 이중선·해칭 채우기(rough.js),
 * Ramer-Douglas-Peucker 폴리라인 단순화(simplify-js), 사각형 겹침 공간 질의(rbush).
 *
 * 수치 대조 상태(2026-10-29, `__tests__/studio-upstream-parity.test.ts`가 설치된 업스트림을 직접 실행):
 * - 윤곽: `studio-perfect-freehand-stroke.ts`가 perfect-freehand 1.2.3과 좌표까지 같다.
 * - 스케치: `studio-rough-sketch-renderer.ts`가 roughjs 4.6.6의 선·이중선·해칭 6종과 같다. dots 채움은
 *   업스트림이 `Math.random()`을 써서 재현할 수 없어 이 모듈의 자체 설계를 그대로 쓴다.
 * - 단순화: simplify-js 1.2.4와 점열이 같다.
 * - 공간 질의: rbush 4.0.1과 결과 집합·트리 높이가 같지만 R-트리를 만들지 않고 선형으로 훑는다.
 *
 * 기준일: 2026-10-26 (수치 대조 반영 2026-10-29)
 */

import {
  getPerfectFreehandOutlinePoints,
  getPerfectFreehandStrokePoints,
  type PerfectFreehandOptions,
} from "./studio-perfect-freehand-stroke";
import {
  ROUGH_SKETCH_DEFAULT_OPTIONS,
  roughSketchFillPolygon,
  roughSketchLinearPath,
  type RoughSketchFillStyle,
  type RoughSketchOp,
  type RoughSketchOptions,
} from "./studio-rough-sketch-renderer";

export interface FreehandStrokePoint2D {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
  readonly timestampMs?: number;
}

export interface Wave25ReaFreehandRoughSpatialEvidence {
  readonly targetId:
    | "steveruizok-perfect-freehand"
    | "rough-stuff-rough"
    | "mourner-simplify-js"
    | "mourner-rbush";
  readonly upstreamRepo: string;
  readonly analyzedAsset: string;
  readonly licenseSpdx: "MIT" | "ISC";
  readonly sha256: string;
  readonly parentAnalysisEvidenceId: string;
  readonly summaryViewEvidenceId: string;
  readonly factsViewEvidenceId: string;
  readonly semanticTraceEvidenceId: string;
  readonly semanticQueryId: string;
  readonly assetNodeId: string;
  readonly primarySymbolNodeId: string;
  readonly visitedAstNodes: number;
  readonly dataFlowRelations: number;
  readonly callFlowRelations: number;
  readonly internalizedAlgorithms: readonly string[];
}

const W25_PARENT_EV = "ev_20799b6fe98e9be9b759cc172e64a0dfcfce7d71f377c33b77b96623171e01af";
const W25_SUMMARY_EV = "ev_f89fe384ed368eddb2cf116d7384604469f217ceb5aa9491f00efad99bda9813";
const W25_FACTS_EV = "ev_396f3dc483117865fbe719b384173cdf98ba300894d32c7adbc6f619a93ae485";

function defineW25Evidence(
  targetId: Wave25ReaFreehandRoughSpatialEvidence["targetId"],
  upstreamRepo: string,
  analyzedAsset: string,
  sha256: string,
  semanticTraceEvidenceId: string,
  semanticQueryId: string,
  assetNodeId: string,
  primarySymbolNodeId: string,
  visitedAstNodes: number,
  dataFlowRelations: number,
  callFlowRelations: number,
  internalizedAlgorithms: readonly string[],
): Wave25ReaFreehandRoughSpatialEvidence {
  return {
    targetId,
    upstreamRepo,
    analyzedAsset,
    licenseSpdx: "MIT",
    sha256,
    parentAnalysisEvidenceId: W25_PARENT_EV,
    summaryViewEvidenceId: W25_SUMMARY_EV,
    factsViewEvidenceId: W25_FACTS_EV,
    semanticTraceEvidenceId,
    semanticQueryId,
    assetNodeId,
    primarySymbolNodeId,
    visitedAstNodes,
    dataFlowRelations,
    callFlowRelations,
    internalizedAlgorithms,
  };
}

export const WAVE25_FREEHAND_ROUGH_SPATIAL_REA_LEDGER: readonly Wave25ReaFreehandRoughSpatialEvidence[] = [
  defineW25Evidence(
    "steveruizok-perfect-freehand",
    "https://github.com/steveruizok/perfect-freehand",
    "perfect-freehand.mjs",
    "a02e221f71a757e46915a51d8f5ffc8d1788d9134e063b3edd21f429c973d46c",
    "ev_e3f8614c0111647f896b2027e2af88866cb011403441d28a8ae740dcb298b36c",
    "jsrq_5f5165a63924638fe8063537c9f578b811a4256206d8773266a1ebc5f07aa1f7",
    "jag_node_b9714bd45314eea9f22b88c84041c8730babf52f179657b03ae960d500a20f3b",
    "jag_node_817134e550c02301f5a798b36fecdeadf2d6bd8b60ede77c78e70c491e0c7eb6",
    3912,
    2740,
    412,
    [
      "streamline low-pass filter s = 0.15 + (1 - streamline) * 0.85",
      "velocity-simulated pressure sp = min(1, dist/size), p = min(1, prev + (min(1, 1 - sp) - prev) * (sp * 0.275))",
      "getStrokeRadius r = size * easing(0.5 - thinning * (0.5 - pressure))",
      "start/end taper easing & sharp corner 13-step semi-circle fan + 13/29-step caps",
    ],
  ),
  defineW25Evidence(
    "rough-stuff-rough",
    "https://github.com/rough-stuff/rough",
    "rough.esm.js",
    "e921535f216ebc93d422489d614da955b5286812220b3149fc70978f4cb5bd45",
    "ev_7864c6ccb7eaebc0973d388f38b82cc68973ca16e49aba20ed80d7709d3bace2",
    "jsrq_efaee8da627ceb74a21d89b9a82147bc8b57d83ced4b929794d74eb93af81c0d",
    "jag_node_b4fbe56fb32d3a63d5e524ef9a141e93ce0145fade541d6169872873938a9f6b",
    "jag_node_277a74887c4fdf8535bfd918ea7dca9f160db9c5f30a5c44b25e42694bd80be5",
    11842,
    8210,
    1126,
    [
      "Park-Miller Lehmer LCG PRNG: seed = Math.imul(48271, seed) & 0x7fffffff",
      "Length-dependent roughness damping: -0.0016668 * L + 1.233334",
      "Double-line bowing & roughness cubic Bezier offset (bowX, bowY)",
      "Active-Edge Table rotated polygon scanline hachure (7 fillStyles)",
    ],
  ),
  defineW25Evidence(
    "mourner-simplify-js",
    "https://github.com/mourner/simplify-js",
    "simplify.js",
    "e4c7a1a8a141d47103eb82c64eb5286b483ed0efae28ecd238f6232b6d0b7b85",
    "ev_891b719ae7fceb9376c127e87065355b4b8454199a4340f5d0b33392d4e3136a",
    "jsrq_6c36a5d1d0e2757b97dad8e38654aaaf44ce63c8330fb780a0d780adcef073bb",
    "jag_node_7e939f65eae79875ca9e31b992e233b565484e0b5087600abd6b90e5c1a21e49",
    "jag_node_ed5991895858bbc10a9a0564f48a2f8fbcc9f5440abf35b5ab5140d1ea9194e7",
    964,
    682,
    78,
    [
      "Stage 1 radial distance pre-filter (getSqDist > sqTolerance)",
      "Stage 2 Ramer-Douglas-Peucker recursive perpendicular distance splitter",
    ],
  ),
  defineW25Evidence(
    "mourner-rbush",
    "https://github.com/mourner/rbush",
    "rbush.js",
    "cbb358bc78af1fe5606c77576eedc9cfff074fa934e77ba5c8bea5d60d7ca8b2",
    "ev_b59a8b7de407c36f43bf461f28ce223ff4905cff9fd820713bc41dafa6f9d8de",
    "jsrq_04e003434060d7635a2231f3d08e4d3e9be2e8a95fdb03d5e25cdaa6bb6f6dde",
    "jag_node_26dbf2d0608853452f4ec1b8a3ef92d4d4630c1ccdf8b9639a361b394576b853",
    "jag_node_d084ebe1443a9bb89e6bde7f2187968ebf8c1cff9b113b6895487e7dfc5048ce",
    2858,
    1928,
    232,
    [
      "Floyd-Rivest quickselect O(N) partition",
      "OMT (Overlap Minimizing Top-down) 2D R-Tree bulk loading & AABB search/collides",
    ],
  ),
] as const;

export type RoughFillStyle =
  | "hachure"
  | "zigzag"
  | "cross-hatch"
  | "dots"
  | "dashed"
  | "zigzag-line"
  | "solid";

export type FreehandRoughPresetId =
  | "pf-comic-gpen-taper"
  | "pf-calligraphy-chisel"
  | "pf-marker-flat-cap"
  | "rough-hachure-sketch"
  | "rough-zigzag-toon"
  | "rough-cross-hatch-ink"
  | "rough-dots-stipple"
  | "rough-dashed-draft"
  | "rough-zigzag-line-burst"
  | "rough-solid-marker";

export interface FreehandRoughBrushPreset {
  readonly id: FreehandRoughPresetId;
  readonly labelKo: string;
  readonly engineFamily: "perfect-freehand" | "rough-js";
  readonly sizePx: number;
  readonly thinning: number;
  readonly smoothing: number;
  readonly streamline: number;
  readonly simulatePressure: boolean;
  readonly taperStartPx: number;
  readonly taperEndPx: number;
  readonly capStartRound: boolean;
  readonly capEndRound: boolean;
  readonly roughness: number;
  readonly bowing: number;
  readonly fillStyle: RoughFillStyle;
  readonly hachureAngleDeg: number;
  readonly hachureGapPx: number;
}

function preset(
  id: FreehandRoughPresetId,
  labelKo: string,
  engineFamily: "perfect-freehand" | "rough-js",
  sizePx: number,
  thinning: number,
  streamline: number,
  simulatePressure: boolean,
  taperStartPx: number,
  taperEndPx: number,
  capStartRound: boolean,
  capEndRound: boolean,
  roughness: number,
  bowing: number,
  fillStyle: RoughFillStyle,
  hachureAngleDeg: number,
  hachureGapPx: number,
): FreehandRoughBrushPreset {
  return {
    id,
    labelKo,
    engineFamily,
    sizePx,
    thinning,
    smoothing: 0.5,
    streamline,
    simulatePressure,
    taperStartPx,
    taperEndPx,
    capStartRound,
    capEndRound,
    roughness,
    bowing,
    fillStyle,
    hachureAngleDeg,
    hachureGapPx,
  };
}

export const FREEHAND_ROUGH_BRUSH_PRESETS: readonly FreehandRoughBrushPreset[] = [
  preset("pf-comic-gpen-taper", "PF 웹툰 G펜 테이퍼", "perfect-freehand", 14, 0.68, 0.55, true, 18, 24, true, true, 0.4, 0.8, "hachure", -41, 5),
  preset("pf-calligraphy-chisel", "PF 캘리그라피 붓펜", "perfect-freehand", 18, 0.82, 0.65, false, 12, 28, false, true, 0.3, 0.6, "cross-hatch", -35, 6),
  preset("pf-marker-flat-cap", "PF 마커 플랫캡", "perfect-freehand", 16, -0.25, 0.48, true, 0, 0, false, false, 0.5, 1.0, "solid", 0, 5),
  preset("rough-hachure-sketch", "Rough 해칭 스케치", "rough-js", 12, 0.45, 0.5, true, 8, 10, true, true, 1.4, 1.2, "hachure", -41, 5),
  preset("rough-zigzag-toon", "Rough 지그재그 툰", "rough-js", 12, 0.4, 0.5, true, 6, 8, true, true, 1.6, 1.4, "zigzag", -30, 5.5),
  preset("rough-cross-hatch-ink", "Rough 크로스해칭 잉크", "rough-js", 11, 0.52, 0.52, true, 10, 12, true, true, 1.25, 1.1, "cross-hatch", -45, 6),
  preset("rough-dots-stipple", "Rough 점묘 스티플", "rough-js", 11, 0.35, 0.5, true, 4, 4, true, true, 1.5, 1.0, "dots", 0, 6),
  preset("rough-dashed-draft", "Rough 대시 드래프트", "rough-js", 12, 0.42, 0.5, true, 6, 8, true, true, 1.35, 1.15, "dashed", -38, 5.5),
  preset("rough-zigzag-line-burst", "Rough 지그재그라인", "rough-js", 13, 0.48, 0.5, true, 8, 10, true, true, 1.75, 1.3, "zigzag-line", -25, 6),
  preset("rough-solid-marker", "Rough 솔리드 마커", "rough-js", 15, 0.2, 0.5, false, 0, 0, false, false, 1.1, 0.9, "solid", -41, 4),
] as const;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export interface PerfectFreehandStrokeOutlineResult {
  readonly presetId: FreehandRoughPresetId;
  readonly outlinePoints: readonly { readonly x: number; readonly y: number }[];
  readonly svgPolygonPath: string;
  readonly totalLengthPx: number;
  readonly averageRadiusPx: number;
}

/**
 * 프리셋의 크기·세선화·스트림라인·테이퍼·캡을 perfect-freehand 1.2.3과 같은 수치의 윤곽 생성기에 넘겨
 * 가변 폭 윤곽 다각형과 이차 베지어 중점 SVG 경로를 만든다. 입력은 완성된 스트로크로 본다(`last: true`).
 *
 * `totalLengthPx`는 스트림라인을 거친 스트로크 점의 누적 길이, `averageRadiusPx`는 윤곽에 쓴 반지름의
 * 평균이다.
 */
export function synthesizePerfectFreehandStrokeOutline(params: {
  readonly presetId?: FreehandRoughPresetId;
  readonly points: readonly FreehandStrokePoint2D[];
}): PerfectFreehandStrokeOutlineResult {
  const active =
    FREEHAND_ROUGH_BRUSH_PRESETS.find((item) => item.id === params.presetId) ??
    FREEHAND_ROUGH_BRUSH_PRESETS[0]!;
  const raw = params.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (raw.length === 0) {
    return { presetId: active.id, outlinePoints: [], svgPolygonPath: "", totalLengthPx: 0, averageRadiusPx: 0 };
  }

  const options: PerfectFreehandOptions = {
    size: active.sizePx,
    thinning: active.thinning,
    smoothing: active.smoothing,
    streamline: active.streamline,
    simulatePressure: active.simulatePressure,
    start: { cap: active.capStartRound, taper: active.taperStartPx > 0 ? active.taperStartPx : false },
    end: { cap: active.capEndRound, taper: active.taperEndPx > 0 ? active.taperEndPx : false },
    last: true,
  };
  const strokePoints = getPerfectFreehandStrokePoints(
    raw.map((p) => ({
      x: p.x,
      y: p.y,
      pressure: p.pressure01 === undefined ? undefined : clamp(p.pressure01, 0, 1),
    })),
    options,
  );
  let radiusSum = 0;
  let radiusCount = 0;
  const outlinePoints = getPerfectFreehandOutlinePoints(strokePoints, options, {
    onRadius: (radius) => {
      radiusSum += radius;
      radiusCount += 1;
    },
  }).map(([x, y]) => ({ x, y }));

  const pathParts: string[] = [];
  if (outlinePoints.length >= 2) {
    const p0 = outlinePoints[0]!;
    const p1 = outlinePoints[1]!;
    pathParts.push(`M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} ${((p0.x + p1.x) * 0.5).toFixed(1)} ${((p0.y + p1.y) * 0.5).toFixed(1)}`);
    for (let i = 1; i < outlinePoints.length; i += 1) {
      const curr = outlinePoints[i]!;
      const next = outlinePoints[(i + 1) % outlinePoints.length]!;
      pathParts.push(`Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${((curr.x + next.x) * 0.5).toFixed(1)} ${((curr.y + next.y) * 0.5).toFixed(1)}`);
    }
    pathParts.push("Z");
  }

  return {
    presetId: active.id,
    outlinePoints,
    svgPolygonPath: pathParts.join(" "),
    totalLengthPx: Math.round((strokePoints[strokePoints.length - 1]?.runningLength ?? 0) * 100) / 100,
    averageRadiusPx: Math.round((radiusSum / Math.max(1, radiusCount)) * 100) / 100,
  };
}

/**
 * roughjs `Random`과 같은 Park-Miller Lehmer 난수(`seed = Math.imul(48271, seed)`의 하위 31비트).
 * 양의 정수 시드에서 업스트림 수열과 같다(대조 테스트가 시드 여러 개로 100만 번 비교). 시드 0은 업스트림이
 * `Math.random()`으로 넘어가지만 여기서는 고정 시드로 바꿔 결과를 재현 가능하게 둔다.
 */
export class RoughLehmerPrng {
  private seed: number;

  public constructor(seed: number) {
    const initial = Math.abs(Math.trunc(Number.isFinite(seed) ? seed : 20261026)) % 2147483647;
    this.seed = initial === 0 ? 48271 : initial;
  }

  public next(): number {
    this.seed = (Math.imul(48271, this.seed) & 0x7fffffff) >>> 0;
    return this.seed / 2147483648;
  }

  public offset(min: number, max: number, roughnessGain = 1): number {
    return roughnessGain * (this.next() * (max - min) + min);
  }
}

export interface RoughCubicBezierPass {
  readonly x0: number;
  readonly y0: number;
  readonly cp1x: number;
  readonly cp1y: number;
  readonly cp2x: number;
  readonly cp2y: number;
  readonly x1: number;
  readonly y1: number;
}

export interface RoughHachureSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface RoughSketchySynthesisResult {
  readonly presetId: FreehandRoughPresetId;
  readonly fillStyle: RoughFillStyle;
  readonly doubleLineBeziers: readonly RoughCubicBezierPass[];
  /** 거칠게 만들기 전의 직선 선분. dots는 점 대신 짧은 대각선, solid는 다각형 변이다. */
  readonly hachureSegments: readonly RoughHachureSegment[];
  /** 해칭 채움을 거칠게 그린 곡선(roughjs `fillSketch` 연산). dots·solid는 비어 있다. */
  readonly fillSketchBeziers: readonly RoughCubicBezierPass[];
  readonly svgStrokePath: string;
}

function opsToBezierPasses(ops: readonly RoughSketchOp[]): RoughCubicBezierPass[] {
  const passes: RoughCubicBezierPass[] = [];
  let start: readonly [number, number] | null = null;
  for (const op of ops) {
    if (op.op === "move") {
      start = [op.data[0]!, op.data[1]!];
    } else if (op.op === "bcurveTo" && start) {
      passes.push({
        x0: start[0],
        y0: start[1],
        cp1x: op.data[0]!,
        cp1y: op.data[1]!,
        cp2x: op.data[2]!,
        cp2y: op.data[3]!,
        x1: op.data[4]!,
        y1: op.data[5]!,
      });
    }
  }
  return passes;
}

function solidFillEdges(ops: readonly RoughSketchOp[]): RoughHachureSegment[] {
  const pts = ops.map((op) => ({ x: op.data[0]!, y: op.data[1]! }));
  if (pts.length < 2) return [];
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
  });
}

function dotTickSegments(baseLines: readonly RoughHachureSegment[], gapPx: number): RoughHachureSegment[] {
  const ticks: RoughHachureSegment[] = [];
  for (const seg of baseLines) {
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    const count = Math.max(1, Math.floor(len / gapPx));
    for (let c = 0; c < count; c += 1) {
      const t = (c + 0.5) / count;
      const cx = seg.x1 + (seg.x2 - seg.x1) * t;
      const cy = seg.y1 + (seg.y2 - seg.y1) * t;
      ticks.push({ x1: cx - 0.8, y1: cy - 0.8, x2: cx + 0.8, y2: cy + 0.8 });
    }
  }
  return ticks;
}

/**
 * 스트로크를 roughjs 이중선으로 거칠게 그리고, 다각형을 프리셋의 채움 방식으로 채운다.
 *
 * 난수는 roughjs `RoughGenerator.polygon`과 같은 순서로 쓴다(외곽선 먼저, 채움 나중). 해칭 6종은 같은
 * 시드·옵션에서 roughjs와 연산 좌표가 같다. dots는 업스트림이 `Math.random()`과 타원 연산을 써서 재현할
 * 수 없으므로, 같은 해칭 선분 위에 일정 간격으로 짧은 대각선을 놓는 자체 설계다.
 */
export function synthesizeRoughSketchyStrokeAndHachureFill(params: {
  readonly presetId?: FreehandRoughPresetId;
  readonly strokePoints: readonly FreehandStrokePoint2D[];
  readonly fillPolygon?: readonly { readonly x: number; readonly y: number }[];
  readonly seed?: number;
}): RoughSketchySynthesisResult {
  const active =
    FREEHAND_ROUGH_BRUSH_PRESETS.find((item) => item.id === params.presetId) ??
    FREEHAND_ROUGH_BRUSH_PRESETS[3]!;
  const prng = new RoughLehmerPrng(params.seed ?? 20261026);
  const options: RoughSketchOptions = {
    ...ROUGH_SKETCH_DEFAULT_OPTIONS,
    roughness: active.roughness,
    bowing: active.bowing,
    hachureAngle: active.hachureAngleDeg,
    hachureGap: active.hachureGapPx,
  };
  const pts = params.strokePoints.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const strokeSet = roughSketchLinearPath(
    pts.map((p): [number, number] => [p.x, p.y]),
    false,
    options,
    prng,
  );
  const doubleLineBeziers = opsToBezierPasses(strokeSet.ops);

  const polygon =
    params.fillPolygon && params.fillPolygon.length >= 3
      ? params.fillPolygon
      : [{ x: 120, y: 8 }, { x: 158, y: 8 }, { x: 158, y: 36 }, { x: 120, y: 36 }];
  const polygonPoints = polygon.map((p): [number, number] => [p.x, p.y]);

  let hachureSegments: RoughHachureSegment[];
  let fillSketchBeziers: RoughCubicBezierPass[] = [];
  if (active.fillStyle === "solid") {
    hachureSegments = solidFillEdges(roughSketchFillPolygon(polygonPoints, "solid", options, prng).ops);
  } else {
    const style: RoughSketchFillStyle = active.fillStyle === "dots" ? "hachure" : active.fillStyle;
    const fillSet = roughSketchFillPolygon(polygonPoints, style, options, prng);
    const baseLines = (fillSet.baseSegments ?? []).map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }));
    if (active.fillStyle === "dots") {
      hachureSegments = dotTickSegments(baseLines, active.hachureGapPx);
    } else {
      hachureSegments = baseLines;
      fillSketchBeziers = opsToBezierPasses(fillSet.ops);
    }
  }

  return {
    presetId: active.id,
    fillStyle: active.fillStyle,
    doubleLineBeziers,
    hachureSegments,
    fillSketchBeziers,
    svgStrokePath: doubleLineBeziers
      .map((b) => `M ${b.x0.toFixed(1)} ${b.y0.toFixed(1)} C ${b.cp1x.toFixed(1)} ${b.cp1y.toFixed(1)}, ${b.cp2x.toFixed(1)} ${b.cp2y.toFixed(1)}, ${b.x1.toFixed(1)} ${b.y1.toFixed(1)}`)
      .join(" "),
  };
}

function getSqSegDist(p: FreehandStrokePoint2D, p1: FreehandStrokePoint2D, p2: FreehandStrokePoint2D): number {
  let x = p1.x;
  let y = p1.y;
  let dx = p2.x - x;
  let dy = p2.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x;
      y = p2.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}

/**
 * simplify-js 1.2.4와 점열이 같은 2단계(방사형 거리 필터 + 재귀 Ramer-Douglas-Peucker) 스트로크 단순화기.
 * 기본 허용오차만 다르다(업스트림 1px, 여기 1.5px). 대조할 때는 허용오차를 명시한다.
 */
export function simplifyStrokePolylineRdp(
  points: readonly FreehandStrokePoint2D[],
  tolerancePx = 1.5,
  highestQuality = false,
): readonly FreehandStrokePoint2D[] {
  if (points.length <= 2) return points;
  const sqTolerance = tolerancePx * tolerancePx;
  let pts: readonly FreehandStrokePoint2D[] = points;

  if (!highestQuality) {
    const radial: FreehandStrokePoint2D[] = [points[0]!];
    let prev = points[0]!;
    for (let i = 1; i < points.length; i += 1) {
      const curr = points[i]!;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (dx * dx + dy * dy > sqTolerance) {
        radial.push(curr);
        prev = curr;
      }
    }
    if (prev !== points[points.length - 1]) radial.push(points[points.length - 1]!);
    pts = radial;
  }
  if (pts.length <= 2) return pts;

  const simplified: FreehandStrokePoint2D[] = [pts[0]!];
  const simplifyStep = (first: number, last: number): void => {
    let maxSqDist = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const sqDist = getSqSegDist(pts[i]!, pts[first]!, pts[last]!);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (index >= 0 && maxSqDist > sqTolerance) {
      if (index - first > 1) simplifyStep(first, index);
      simplified.push(pts[index]!);
      if (last - index > 1) simplifyStep(index, last);
    }
  };
  simplifyStep(0, pts.length - 1);
  simplified.push(pts[pts.length - 1]!);
  return simplified;
}

export interface SpatialStrokeBoxItem {
  readonly id: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * 사각형 겹침 질의. rbush 4.0.1과 결과 집합(경계가 닿는 경우 포함)과 트리 높이가 같다.
 *
 * R-트리를 만들지 않는다. `minX` 순으로 정렬한 뒤 모든 항목을 한 번씩 검사하므로 질의 한 번이 항목 수에
 * 비례한다. `matchedIds` 순서도 rbush의 순회 순서가 아니라 `minX`, `minY` 순이다. 항목이 많거나 질의가
 * 잦으면 `studio-engine-scene-spatial-index.ts`처럼 rbush를 직접 쓴다.
 */
export function queryStrokeSpatialRTreeBBox(params: {
  readonly items: readonly SpatialStrokeBoxItem[];
  readonly queryBox: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly maxEntries?: number;
}): {
  readonly matchedIds: readonly string[];
  readonly collides: boolean;
  readonly treeHeight: number;
} {
  const maxEntries = Math.max(4, params.maxEntries ?? 9);
  const valid = params.items.slice();
  if (valid.length === 0) return { matchedIds: [], collides: false, treeHeight: 1 };
  valid.sort((a, b) => (a.minX !== b.minX ? a.minX - b.minX : a.minY - b.minY));
  const treeHeight = Math.max(1, Math.ceil(Math.log(valid.length) / Math.log(maxEntries)));
  const q = params.queryBox;
  const matchedIds = valid
    .filter((item) => item.maxX >= q.minX && item.minX <= q.maxX && item.maxY >= q.minY && item.minY <= q.maxY)
    .map((item) => item.id);
  return { matchedIds, collides: matchedIds.length > 0, treeHeight };
}
