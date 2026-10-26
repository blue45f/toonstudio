/**
 * Wave 25: REA 정적·시맨틱 역공학 기반 프리핸드 가변 폭 윤곽(perfect-freehand),
 * 수작업 스케치 이중선·7종 해칭 채우기(rough.js), Ramer-Douglas-Peucker 폴리라인 단순화(simplify-js),
 * OMT R-Tree 공간 색인(rbush) 클린룸 엔진.
 *
 * 기준일: 2026-10-26
 */

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

const RATE_OF_PRESSURE_CHANGE = 0.275;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function easeOutQuad(t: number): number {
  const c = clamp(t, 0, 1);
  return c * (2 - c);
}

function easeOutCubic(t: number): number {
  const c = clamp(t, 0, 1) - 1;
  return c * c * c + 1;
}

function rotatePointAround(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angleRad: number,
): { readonly x: number; readonly y: number } {
  const s = Math.sin(angleRad);
  const c = Math.cos(angleRad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

export interface PerfectFreehandStrokeOutlineResult {
  readonly presetId: FreehandRoughPresetId;
  readonly outlinePoints: readonly { readonly x: number; readonly y: number }[];
  readonly svgPolygonPath: string;
  readonly totalLengthPx: number;
  readonly averageRadiusPx: number;
}

/**
 * `steveruizok/perfect-freehand` 역공학 가변 폭 프리핸드 윤곽 다각형 및 이차 베지어 중점 SVG 경로 합성기.
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

  const streamlineFactor = 0.15 + (1 - clamp(active.streamline, 0, 1)) * 0.85;
  interface StrokeSample {
    x: number;
    y: number;
    pressure: number;
    vx: number;
    vy: number;
    distance: number;
    runningLength: number;
  }
  const samples: StrokeSample[] = [
    { x: raw[0]!.x, y: raw[0]!.y, pressure: clamp(raw[0]!.pressure01 ?? 0.5, 0.05, 1), vx: 1, vy: 0, distance: 0, runningLength: 0 },
  ];

  let totalLengthPx = 0;
  for (let i = 1; i < raw.length; i += 1) {
    const prev = samples[samples.length - 1]!;
    const curr = raw[i]!;
    const sx = prev.x + (curr.x - prev.x) * streamlineFactor;
    const sy = prev.y + (curr.y - prev.y) * streamlineFactor;
    const dist = Math.hypot(sx - prev.x, sy - prev.y);
    if (dist < 1e-3 && i < raw.length - 1) continue;
    totalLengthPx += dist;
    const vx = dist > 1e-5 ? (prev.x - sx) / dist : prev.vx;
    const vy = dist > 1e-5 ? (prev.y - sy) / dist : prev.vy;
    prev.vx = vx;
    prev.vy = vy;
    samples.push({ x: sx, y: sy, pressure: clamp(curr.pressure01 ?? 0.5, 0.05, 1), vx, vy, distance: dist, runningLength: totalLengthPx });
  }

  const leftPts: { x: number; y: number }[] = [];
  const rightPts: { x: number; y: number }[] = [];
  let prevPressure = samples[0]!.pressure;
  let radiusSum = 0;
  let lastRadius = active.sizePx * 0.5;

  for (let i = 0; i < samples.length; i += 1) {
    const pt = samples[i]!;
    let p = pt.pressure;
    if (active.simulatePressure) {
      const sp = Math.min(1, pt.distance / Math.max(1, active.sizePx));
      p = Math.min(1, prevPressure + (Math.min(1, 1 - sp) - prevPressure) * (sp * RATE_OF_PRESSURE_CHANGE));
      prevPressure = p;
    }
    const baseRadius = Math.max(0.25, active.sizePx * clamp(0.5 - active.thinning * (0.5 - p), 0.05, 1));
    const ts = active.taperStartPx > 0 ? easeOutQuad(Math.min(1, pt.runningLength / active.taperStartPx)) : 1;
    const te = active.taperEndPx > 0 ? easeOutCubic(Math.min(1, (totalLengthPx - pt.runningLength) / active.taperEndPx)) : 1;
    const radius = Math.max(0.15, baseRadius * Math.min(ts, te));
    if (i === samples.length - 1) lastRadius = radius;
    radiusSum += radius;

    const nextPt = samples[Math.min(samples.length - 1, i + 1)]!;
    const dot = pt.vx * nextPt.vx + pt.vy * nextPt.vy;
    const nx = -pt.vy;
    const ny = pt.vx;

    if (i > 0 && i < samples.length - 1 && dot < 0) {
      const offX = nx * radius;
      const offY = ny * radius;
      for (let step = 0; step <= 13; step += 1) {
        const t = step / 13;
        leftPts.push(rotatePointAround(pt.x - offX, pt.y - offY, pt.x, pt.y, Math.PI * t));
        rightPts.push(rotatePointAround(pt.x + offX, pt.y + offY, pt.x, pt.y, -Math.PI * t));
      }
    } else {
      leftPts.push({ x: pt.x - nx * radius, y: pt.y - ny * radius });
      rightPts.push({ x: pt.x + nx * radius, y: pt.y + ny * radius });
    }
  }

  const firstLeft = leftPts[0]!;
  const firstRight = rightPts[0]!;
  const startCap: { x: number; y: number }[] = [];
  if (active.taperStartPx > 0) {
    startCap.push({ x: samples[0]!.x, y: samples[0]!.y });
  } else if (active.capStartRound) {
    const cx = (firstLeft.x + firstRight.x) * 0.5;
    const cy = (firstLeft.y + firstRight.y) * 0.5;
    for (let step = 1; step <= 13; step += 1) {
      startCap.push(rotatePointAround(firstRight.x, firstRight.y, cx, cy, Math.PI * (step / 13)));
    }
  } else {
    const dx = firstLeft.x - firstRight.x;
    const dy = firstLeft.y - firstRight.y;
    startCap.push({ x: firstRight.x - dy * 0.5, y: firstRight.y + dx * 0.5 }, { x: firstLeft.x - dy * 0.5, y: firstLeft.y + dx * 0.5 });
  }

  const lastSample = samples[samples.length - 1]!;
  const endCap: { x: number; y: number }[] = [];
  const endNx = -lastSample.vy;
  const endNy = lastSample.vx;
  if (active.taperEndPx > 0) {
    endCap.push({ x: lastSample.x, y: lastSample.y });
  } else if (active.capEndRound) {
    const startX = lastSample.x - endNx * lastRadius;
    const startY = lastSample.y - endNy * lastRadius;
    for (let step = 1; step < 29; step += 1) {
      endCap.push(rotatePointAround(startX, startY, lastSample.x, lastSample.y, Math.PI * 3 * (step / 29)));
    }
  } else {
    endCap.push({ x: lastSample.x - endNx * lastRadius, y: lastSample.y - endNy * lastRadius }, { x: lastSample.x + endNx * lastRadius, y: lastSample.y + endNy * lastRadius });
  }

  const outlinePoints = [...leftPts, ...endCap, ...rightPts.slice().reverse(), ...startCap];
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
    totalLengthPx: Math.round(totalLengthPx * 100) / 100,
    averageRadiusPx: Math.round((radiusSum / Math.max(1, samples.length)) * 100) / 100,
  };
}

/**
 * `rough-stuff/rough` Park-Miller Lehmer LCG PRNG (`seed = Math.imul(48271, seed) & 0x7fffffff`).
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
  readonly hachureSegments: readonly RoughHachureSegment[];
  readonly svgStrokePath: string;
}

function generateRoughSingleLinePass(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  roughness: number,
  bowing: number,
  maxRandomnessOffset: number,
  divergePoint: number,
  moveGain: number,
  prng: RoughLehmerPrng,
): RoughCubicBezierPass {
  const lenSq = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
  const len = Math.sqrt(lenSq);
  const damping = len < 200 ? 1 : len > 500 ? 0.4 : -0.0016668 * len + 1.233334;
  let maxOff = maxRandomnessOffset;
  if (maxOff * maxOff * 100 > lenSq) maxOff = len / 10;
  const halfOff = maxOff * 0.5;
  const bowX = (bowing * maxRandomnessOffset * (y2 - y1)) / 200;
  const bowY = (bowing * maxRandomnessOffset * (x1 - x2)) / 200;
  const off = () => prng.offset(-halfOff, halfOff, roughness * damping);

  return {
    x0: x1 + off() * moveGain,
    y0: y1 + off() * moveGain,
    cp1x: bowX + x1 + (x2 - x1) * divergePoint + off(),
    cp1y: bowY + y1 + (y2 - y1) * divergePoint + off(),
    cp2x: bowX + x1 + 2 * (x2 - x1) * divergePoint + off(),
    cp2y: bowY + y1 + 2 * (y2 - y1) * divergePoint + off(),
    x1: x2 + off(),
    y1: y2 + off(),
  };
}

function scanlinePolygonHachureLines(
  polygon: readonly { readonly x: number; readonly y: number }[],
  angleDeg: number,
  gapPx: number,
): RoughHachureSegment[] {
  if (polygon.length < 3) return [];
  const rotRad = ((angleDeg + 90) * Math.PI) / 180;
  const rotated = polygon.map((p) => rotatePointAround(p.x, p.y, 0, 0, rotRad));
  const edges: { ymin: number; ymax: number; x: number; islope: number }[] = [];
  for (let i = 0; i < rotated.length; i += 1) {
    const p1 = rotated[i]!;
    const p2 = rotated[(i + 1) % rotated.length]!;
    if (Math.abs(p1.y - p2.y) < 1e-4) continue;
    const ymin = Math.min(p1.y, p2.y);
    const ymax = Math.max(p1.y, p2.y);
    edges.push({ ymin, ymax, x: ymin === p1.y ? p1.x : p2.x, islope: (p2.x - p1.x) / (p2.y - p1.y) });
  }
  if (edges.length === 0) return [];
  edges.sort((a, b) => (a.ymin !== b.ymin ? a.ymin - b.ymin : a.x - b.x));

  const minY = edges[0]!.ymin;
  const maxY = edges.reduce((acc, e) => Math.max(acc, e.ymax), minY);
  const step = Math.max(1.5, gapPx);
  const lines: RoughHachureSegment[] = [];

  for (let y = minY; y <= maxY; y += step) {
    const xs: number[] = [];
    for (const e of edges) {
      if (y >= e.ymin && y < e.ymax) xs.push(e.x + (y - e.ymin) * e.islope);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = rotatePointAround(xs[k]!, y, 0, 0, -rotRad);
      const b = rotatePointAround(xs[k + 1]!, y, 0, 0, -rotRad);
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return lines;
}

/**
 * `rough-stuff/rough` 이중선(doubleLine) 3차 베지어 오프셋 및 7종 해칭 합성기.
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
  const pts = params.strokePoints.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const doubleLineBeziers: RoughCubicBezierPass[] = [];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    doubleLineBeziers.push(
      generateRoughSingleLinePass(a.x, a.y, b.x, b.y, active.roughness, active.bowing, 2.2, 0.2 + prng.next() * 0.2, 1.0, prng),
      generateRoughSingleLinePass(a.x, a.y, b.x, b.y, active.roughness, active.bowing, 2.2, 0.2 + prng.next() * 0.2, 0.5, prng),
    );
  }

  const polygon =
    params.fillPolygon && params.fillPolygon.length >= 3
      ? params.fillPolygon
      : [{ x: 120, y: 8 }, { x: 158, y: 8 }, { x: 158, y: 36 }, { x: 120, y: 36 }];
  const baseLines = scanlinePolygonHachureLines(polygon, active.hachureAngleDeg, active.hachureGapPx);
  const hachureSegments: RoughHachureSegment[] = [];

  if (active.fillStyle === "hachure" || active.fillStyle === "solid") {
    hachureSegments.push(...baseLines);
  } else if (active.fillStyle === "zigzag") {
    for (let i = 0; i < baseLines.length; i += 1) {
      const seg = baseLines[i]!;
      hachureSegments.push(seg);
      if (i + 1 < baseLines.length) {
        const next = baseLines[i + 1]!;
        hachureSegments.push(i % 2 === 0 ? { x1: seg.x2, y1: seg.y2, x2: next.x2, y2: next.y2 } : { x1: seg.x1, y1: seg.y1, x2: next.x1, y2: next.y1 });
      }
    }
  } else if (active.fillStyle === "cross-hatch") {
    hachureSegments.push(...baseLines, ...scanlinePolygonHachureLines(polygon, active.hachureAngleDeg + 90, active.hachureGapPx));
  } else if (active.fillStyle === "dots") {
    for (const seg of baseLines) {
      const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      const count = Math.max(1, Math.floor(len / active.hachureGapPx));
      for (let c = 0; c < count; c += 1) {
        const t = (c + 0.5) / count;
        const cx = seg.x1 + (seg.x2 - seg.x1) * t;
        const cy = seg.y1 + (seg.y2 - seg.y1) * t;
        hachureSegments.push({ x1: cx - 0.8, y1: cy - 0.8, x2: cx + 0.8, y2: cy + 0.8 });
      }
    }
  } else if (active.fillStyle === "dashed") {
    for (const seg of baseLines) {
      const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      const dashLen = Math.max(3, active.hachureGapPx * 1.2);
      const step = dashLen * 1.75;
      const count = Math.max(1, Math.floor(len / step));
      const ux = len > 1e-4 ? (seg.x2 - seg.x1) / len : 1;
      const uy = len > 1e-4 ? (seg.y2 - seg.y1) / len : 0;
      for (let c = 0; c < count; c += 1) {
        const s = c * step;
        const e = Math.min(len, s + dashLen);
        hachureSegments.push({ x1: seg.x1 + ux * s, y1: seg.y1 + uy * s, x2: seg.x1 + ux * e, y2: seg.y1 + uy * e });
      }
    }
  } else if (active.fillStyle === "zigzag-line") {
    for (const seg of baseLines) {
      const mx = (seg.x1 + seg.x2) * 0.5 + prng.offset(-2.2, 2.2, active.roughness);
      const my = (seg.y1 + seg.y2) * 0.5 + prng.offset(-2.2, 2.2, active.roughness);
      hachureSegments.push({ x1: seg.x1, y1: seg.y1, x2: mx, y2: my }, { x1: mx, y1: my, x2: seg.x2, y2: seg.y2 });
    }
  }

  return {
    presetId: active.id,
    fillStyle: active.fillStyle,
    doubleLineBeziers,
    hachureSegments,
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
 * `mourner/simplify-js` 2단계(방사형 거리 필터 + 재귀 Ramer-Douglas-Peucker) 스트로크 단순화기.
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
 * `mourner/rbush` OMT Bulk-Loaded 2D 공간 인덱스 쿼리.
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
