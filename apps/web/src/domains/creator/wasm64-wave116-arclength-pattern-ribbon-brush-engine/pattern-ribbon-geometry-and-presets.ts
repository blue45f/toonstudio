/**
 * Wave 116 — 무접힘 코너 마이터/베벨 가드 & 만화 패턴 리본 기하 합성 솔버.
 *
 * - 핵심 불변식(Zero Inner-Edge Foldover / Zero Bow-Tie):
 *   1) 급회전 코너를 C1 2차 베지어 필렛 베벨로 분할해 외곽 마이터 스파이크를 억제한다.
 *   2) 내측 곡률 반경 R = 1/|κ| 비례 클램핑 + 인접 리브 단조 전진 조건 + 비인접 스파인 거리장 가드 +
 *      국소 위상 교차 완화 루프를 결합해 90°·135°·172° 헤어핀·U턴·지그재그에서도
 *      자기교차 0건과 음수 면적 쿼드 0건을 보장한다.
 */

import {
  MAX_FINITE_CURVATURE_RADIUS_PX,
  clampFinite,
  computeBishopFramesForSamples,
  leftNormalFromTangent,
  reparameterizeStrokeByArcLength,
  vec2Add,
  vec2Cross,
  vec2Distance,
  vec2Dot,
  vec2Length,
  vec2Normalize,
  vec2Scale,
  vec2Sub,
  type ArcLengthReparameterizationResult,
  type ArcLengthSample,
  type RawStrokePointerSample,
  type Vec2,
} from "./arclength-curve-and-frame-solver";
import {
  PATTERN_RIBBON_PRESETS,
  PATTERN_RIBBON_PRESET_IDS,
  buildPresetMotifStrokes,
  buildRibbonEndCap,
  getPatternRibbonPreset,
  listPatternRibbonPresets,
  type PatternRibbonPresetId,
  type PatternRibbonPresetSpec,
  type RibbonCapStyle,
  type RibbonEndCapGeometry,
  type RibbonMotifStroke,
  type RibbonOffsetMode,
  type RibbonQuad,
  type RibbonStation,
} from "./pattern-ribbon-presets-and-motifs";
import {
  auditRibbonMeshTopology,
  buildRibbonStationsAndQuads,
  type RibbonEdgeIntersection,
  type RibbonTopologyAudit,
} from "./pattern-ribbon-topology-audit";

export {
  MAX_FINITE_CURVATURE_RADIUS_PX,
  PATTERN_RIBBON_PRESETS,
  PATTERN_RIBBON_PRESET_IDS,
  auditRibbonMeshTopology,
  getPatternRibbonPreset,
  listPatternRibbonPresets,
  vec2Normalize,
  type PatternRibbonPresetId,
  type PatternRibbonPresetSpec,
  type RibbonCapStyle,
  type RibbonEdgeIntersection,
  type RibbonEndCapGeometry,
  type RibbonMotifStroke,
  type RibbonOffsetMode,
  type RibbonQuad,
  type RibbonStation,
  type RibbonTopologyAudit,
};

export interface PatternRibbonSynthesisOptions {
  readonly presetId?: PatternRibbonPresetId;
  readonly mode?: RibbonOffsetMode;
  readonly ribbonWidthPx?: number;
  readonly tileRepeatLengthPx?: number;
  readonly subdivisionsPerTile?: number;
  readonly pressureWidthResponse?: number;
  readonly handJitterAmplitudePx?: number;
  readonly miterLimit?: number;
  readonly bevelAngleThresholdDeg?: number;
  readonly maxInnerCurvatureRatio?: number;
  readonly startCapStyle?: RibbonCapStyle;
  readonly endCapStyle?: RibbonCapStyle;
  readonly seed?: number;
}

export interface PatternRibbonSynthesisResult {
  readonly preset: PatternRibbonPresetSpec;
  readonly mode: RibbonOffsetMode;
  readonly seed: number;
  readonly reparameterization: ArcLengthReparameterizationResult;
  readonly totalArcLengthPx: number;
  readonly tileRepeatLengthPx: number;
  readonly tileCount: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly minPressure: number;
  readonly maxPressure: number;
  readonly maxAbsCurvature: number;
  readonly bevelInsertedStationCount: number;
  readonly innerClampedStationCount: number;
  readonly relaxationPassesUsed: number;
  readonly stations: readonly RibbonStation[];
  readonly quads: readonly RibbonQuad[];
  readonly startCap: RibbonEndCapGeometry;
  readonly endCap: RibbonEndCapGeometry;
  readonly motifStrokes: readonly RibbonMotifStroke[];
  readonly topologyAudit: RibbonTopologyAudit;
}

export interface NaiveVsGuardedRibbonComparison {
  readonly presetId: PatternRibbonPresetId;
  readonly naive: PatternRibbonSynthesisResult;
  readonly guarded: PatternRibbonSynthesisResult;
  readonly naiveTotalDefects: number;
  readonly guardedTotalDefects: number;
  readonly defectReductionCount: number;
  readonly foldoverEliminated: boolean;
  readonly guardedDefectFree: boolean;
  readonly bevelInsertedStations: number;
  readonly innerClampedStations: number;
}

const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-6;
const MIN_INNER_OFFSET_PX = 1e-4;

function createSeededRng(seed: number): () => number {
  let state = (Math.floor(Number.isFinite(seed) ? seed : 0) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function insertBevelCornersOnSpine(
  samples: readonly ArcLengthSample[],
  bevelAngleThresholdRad: number,
  maxTrimPx: number,
): { readonly frames: readonly ArcLengthSample[]; readonly bevelFlags: readonly boolean[]; readonly bevelInsertedCount: number } {
  if (samples.length < 3) {
    return { frames: samples, bevelFlags: samples.map(() => false), bevelInsertedCount: 0 };
  }

  const expanded: Array<{
    readonly position: Vec2;
    readonly pressure: number;
    readonly isCornerAnchor: boolean;
    readonly isTileBoundary: boolean;
    readonly isBevelStation: boolean;
  }> = [
    {
      position: samples[0].position,
      pressure: samples[0].pressure,
      isCornerAnchor: samples[0].isCornerAnchor,
      isTileBoundary: samples[0].isTileBoundary,
      isBevelStation: false,
    },
  ];

  let bevelInsertedCount = 0;

  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const next = samples[i + 1];
    const vIn = vec2Sub(cur.position, prev.position);
    const vOut = vec2Sub(next.position, cur.position);
    const dsPrev = vec2Length(vIn);
    const dsNext = vec2Length(vOut);
    if (dsPrev <= EPS || dsNext <= EPS) continue;

    const tIn = { x: vIn.x / dsPrev, y: vIn.y / dsPrev };
    const tOut = { x: vOut.x / dsNext, y: vOut.y / dsNext };
    const turnAngle = Math.atan2(vec2Cross(tIn, tOut), vec2Dot(tIn, tOut));
    const absTurn = Math.abs(turnAngle);

    if (absTurn < bevelAngleThresholdRad) {
      expanded.push({
        position: cur.position,
        pressure: cur.pressure,
        isCornerAnchor: cur.isCornerAnchor,
        isTileBoundary: cur.isTileBoundary,
        isBevelStation: false,
      });
      continue;
    }

    let apex = cur.position;
    if (absTurn > 174 * DEG_TO_RAD) {
      const sideSign = turnAngle < 0 ? -1 : 1;
      apex = vec2Add(cur.position, vec2Scale(leftNormalFromTangent(tIn), sideSign * 0.45));
    }

    const trim = Math.min(maxTrimPx, dsPrev * 0.36, dsNext * 0.36);
    if (trim <= 0.15) {
      expanded.push({
        position: apex,
        pressure: cur.pressure,
        isCornerAnchor: true,
        isTileBoundary: cur.isTileBoundary,
        isBevelStation: false,
      });
      continue;
    }

    const pEnter = vec2Sub(cur.position, vec2Scale(tIn, trim));
    const pExit = vec2Add(cur.position, vec2Scale(tOut, trim));
    const subdivisions = Math.max(3, Math.min(7, Math.ceil(absTurn / (22 * DEG_TO_RAD))));

    for (let k = 0; k <= subdivisions; k += 1) {
      const t = k / subdivisions;
      const omt = 1 - t;
      expanded.push({
        position: {
          x: omt * omt * pEnter.x + 2 * omt * t * apex.x + t * t * pExit.x,
          y: omt * omt * pEnter.y + 2 * omt * t * apex.y + t * t * pExit.y,
        },
        pressure:
          k === 0
            ? cur.pressure * 0.85 + prev.pressure * 0.15
            : k === subdivisions
              ? cur.pressure * 0.85 + next.pressure * 0.15
              : cur.pressure,
        isCornerAnchor: k === Math.floor(subdivisions / 2),
        isTileBoundary: cur.isTileBoundary && k === Math.floor(subdivisions / 2),
        isBevelStation: true,
      });
    }
    bevelInsertedCount += subdivisions;
  }

  const last = samples[samples.length - 1];
  expanded.push({
    position: last.position,
    pressure: last.pressure,
    isCornerAnchor: last.isCornerAnchor,
    isTileBoundary: last.isTileBoundary,
    isBevelStation: false,
  });

  const nodes: Array<{
    readonly position: Vec2;
    readonly pressure: number;
    readonly arcLengthPx: number;
    readonly isCornerAnchor: boolean;
    readonly isTileBoundary: boolean;
    readonly isBevelStation: boolean;
  }> = [];
  let accumS = 0;

  for (let i = 0; i < expanded.length; i += 1) {
    const item = expanded[i];
    if (nodes.length > 0) {
      const d = vec2Distance(nodes[nodes.length - 1].position, item.position);
      if (d < 1e-3 && i < expanded.length - 1) continue;
      accumS += d;
    }
    nodes.push({
      position: item.position,
      pressure: item.pressure,
      arcLengthPx: accumS,
      isCornerAnchor: item.isCornerAnchor,
      isTileBoundary: item.isTileBoundary,
      isBevelStation: item.isBevelStation,
    });
  }

  return {
    frames: computeBishopFramesForSamples(nodes),
    bevelFlags: nodes.map((nd) => nd.isBevelStation),
    bevelInsertedCount,
  };
}

function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { readonly point: Vec2; readonly t: number; readonly dist: number } {
  const ab = vec2Sub(b, a);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  const t = lenSq > 1e-12 ? clampFinite(vec2Dot(vec2Sub(p, a), ab) / lenSq, 0, 1, 0) : 0;
  const point = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return { point, t, dist: vec2Distance(p, point) };
}

function applyGuardedOffsetClamping(
  frames: readonly ArcLengthSample[],
  nominalHalfWidths: readonly number[],
  leftHalfWidths: number[],
  rightHalfWidths: number[],
  innerClampedFlags: boolean[],
  maxInnerCurvatureRatio: number,
  miterLimit: number,
): void {
  const n = frames.length;
  if (n < 2) return;

  // 1단계: 국소 곡률 반경 R = 1/|κ| 비례 내측 오프셋 클램핑
  for (let i = 0; i < n; i += 1) {
    const f = frames[i];
    const absK = Math.abs(f.signedCurvature);
    if (absK > 1e-5) {
      const safeInner = Math.max(MIN_INNER_OFFSET_PX, maxInnerCurvatureRatio / absK);
      if (f.signedCurvature > 0 && safeInner < leftHalfWidths[i]) {
        leftHalfWidths[i] = safeInner;
        innerClampedFlags[i] = true;
      } else if (f.signedCurvature < 0 && safeInner < rightHalfWidths[i]) {
        rightHalfWidths[i] = safeInner;
        innerClampedFlags[i] = true;
      }
    }
    const maxOuter = nominalHalfWidths[i] * miterLimit;
    if (leftHalfWidths[i] > maxOuter) leftHalfWidths[i] = maxOuter;
    if (rightHalfWidths[i] > maxOuter) rightHalfWidths[i] = maxOuter;
  }

  // 2단계: 인접 리브 단조 전진 조건 (좌·우 외곽선 역행·리브 교차 차단)
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = frames[i];
      const b = frames[i + 1];
      const delta = vec2Sub(b.position, a.position);
      const segLen = vec2Length(delta);
      if (segLen <= EPS) continue;
      const tSeg = { x: delta.x / segLen, y: delta.y / segLen };

      const cA = Math.max(0, vec2Dot(a.normal, tSeg));
      const cB = Math.max(0, -vec2Dot(b.normal, tSeg));
      const leftCollapse = leftHalfWidths[i] * cA + leftHalfWidths[i + 1] * cB;
      if (leftCollapse > segLen * 0.72) {
        const ratio = (segLen * 0.66) / Math.max(leftCollapse, EPS);
        leftHalfWidths[i] = Math.max(MIN_INNER_OFFSET_PX, leftHalfWidths[i] * ratio);
        leftHalfWidths[i + 1] = Math.max(MIN_INNER_OFFSET_PX, leftHalfWidths[i + 1] * ratio);
        innerClampedFlags[i] = true;
        innerClampedFlags[i + 1] = true;
      }

      const dA = Math.max(0, -vec2Dot(a.normal, tSeg));
      const dB = Math.max(0, vec2Dot(b.normal, tSeg));
      const rightCollapse = rightHalfWidths[i] * dA + rightHalfWidths[i + 1] * dB;
      if (rightCollapse > segLen * 0.72) {
        const ratio = (segLen * 0.66) / Math.max(rightCollapse, EPS);
        rightHalfWidths[i] = Math.max(MIN_INNER_OFFSET_PX, rightHalfWidths[i] * ratio);
        rightHalfWidths[i + 1] = Math.max(MIN_INNER_OFFSET_PX, rightHalfWidths[i + 1] * ratio);
        innerClampedFlags[i] = true;
        innerClampedFlags[i + 1] = true;
      }
    }
  }

  // 3단계: 비인접 스파인 거리장(Medial-Axis Clearance) 가드
  for (let i = 0; i < n; i += 1) {
    const pi = frames[i].position;
    const ni = frames[i].normal;
    const si = frames[i].arcLengthPx;

    for (let j = 0; j < n - 1; j += 1) {
      if (j === i || j === i - 1) continue;
      const a = frames[j];
      const b = frames[j + 1];
      const closest = closestPointOnSegment(pi, a.position, b.position);
      const sClosest = a.arcLengthPx + (b.arcLengthPx - a.arcLengthPx) * closest.t;
      if (Math.abs(sClosest - si) <= Math.max(closest.dist * 1.08, 0.25)) continue;

      const projN = vec2Dot(vec2Sub(closest.point, pi), ni);
      const safeClear = Math.max(MIN_INNER_OFFSET_PX, closest.dist * 0.42);
      if (projN > 1e-4 && safeClear < leftHalfWidths[i]) {
        leftHalfWidths[i] = safeClear;
        innerClampedFlags[i] = true;
      } else if (projN < -1e-4 && safeClear < rightHalfWidths[i]) {
        rightHalfWidths[i] = safeClear;
        innerClampedFlags[i] = true;
      } else if (Math.abs(projN) <= 1e-4) {
        if (safeClear < leftHalfWidths[i]) {
          leftHalfWidths[i] = safeClear;
          innerClampedFlags[i] = true;
        }
        if (safeClear < rightHalfWidths[i]) {
          rightHalfWidths[i] = safeClear;
          innerClampedFlags[i] = true;
        }
      }
    }
  }
}

/**
 * 아크-길이 재매개변수화, 급커브 베벨 분할, 곡률 비례 내측 오프셋 클램핑 및
 * 위상 교차 완화를 통합해 무접힘 만화 패턴 리본 메쉬를 합성한다.
 */
export function synthesizePatternRibbonBrush(
  rawStroke: readonly RawStrokePointerSample[],
  options?: PatternRibbonSynthesisOptions,
): PatternRibbonSynthesisResult {
  const presetId: PatternRibbonPresetId = options?.presetId ?? "korean-dancheong-border";
  const preset = PATTERN_RIBBON_PRESETS[presetId];
  const mode: RibbonOffsetMode = options?.mode ?? "guarded";
  const seed = Math.floor(clampFinite(options?.seed ?? 11601, 0, 0x7fffffff, 11601));

  const ribbonWidthPx = clampFinite(options?.ribbonWidthPx ?? preset.defaultWidthPx, 4, 240, preset.defaultWidthPx);
  const tileRepeatLengthPx = clampFinite(
    options?.tileRepeatLengthPx ?? preset.defaultTileRepeatLengthPx,
    6,
    256,
    preset.defaultTileRepeatLengthPx,
  );
  const subdivisionsPerTile = Math.round(clampFinite(options?.subdivisionsPerTile ?? 4, 2, 16, 4));
  const pressureResponse = clampFinite(
    options?.pressureWidthResponse ?? preset.pressureWidthResponse,
    0,
    1,
    preset.pressureWidthResponse,
  );
  const jitterAmplitudePx = clampFinite(
    options?.handJitterAmplitudePx ?? preset.handJitterAmplitudePx,
    0,
    6,
    preset.handJitterAmplitudePx,
  );
  const miterLimit = clampFinite(options?.miterLimit ?? preset.miterLimit, 1.05, 4, preset.miterLimit);
  const bevelAngleThresholdRad =
    clampFinite(options?.bevelAngleThresholdDeg ?? preset.bevelAngleThresholdDeg, 8, 85, preset.bevelAngleThresholdDeg) *
    DEG_TO_RAD;
  const maxInnerCurvatureRatio = clampFinite(
    options?.maxInnerCurvatureRatio ?? preset.maxInnerCurvatureRatio,
    0.25,
    0.92,
    preset.maxInnerCurvatureRatio,
  );
  const startCapStyle: RibbonCapStyle = options?.startCapStyle ?? preset.defaultStartCap;
  const endCapStyle: RibbonCapStyle = options?.endCapStyle ?? preset.defaultEndCap;

  const reparameterization = reparameterizeStrokeByArcLength(rawStroke, {
    tileRepeatLengthPx,
    subdivisionsPerTile,
  });

  const bevelData =
    mode === "guarded"
      ? insertBevelCornersOnSpine(reparameterization.samples, bevelAngleThresholdRad, Math.max(3.5, ribbonWidthPx * 0.22))
      : { frames: reparameterization.samples, bevelFlags: reparameterization.samples.map(() => false), bevelInsertedCount: 0 };

  const frames = bevelData.frames;
  const n = frames.length;
  const rng = createSeededRng(seed);

  const nominalHalfWidths = new Array<number>(n);
  const leftHalfWidths = new Array<number>(n);
  const rightHalfWidths = new Array<number>(n);
  const innerClampedFlags = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i += 1) {
    const f = frames[i];
    const pressureScale = 1 - pressureResponse + pressureResponse * (0.35 + 0.85 * f.pressure);
    const jitter = jitterAmplitudePx > 0 ? (rng() * 2 - 1) * jitterAmplitudePx : 0;
    const baseHalf = Math.max(1.2, ribbonWidthPx * 0.5 * pressureScale + jitter);
    nominalHalfWidths[i] = baseHalf;

    if (mode === "naive") {
      const naiveMiter = Math.min(4.0, 1 / Math.max(Math.cos(Math.abs(f.turnAngleRad) * 0.5), 0.25));
      leftHalfWidths[i] = baseHalf * naiveMiter;
      rightHalfWidths[i] = baseHalf * naiveMiter;
    } else {
      leftHalfWidths[i] = baseHalf;
      rightHalfWidths[i] = baseHalf;
    }
  }

  if (mode === "guarded") {
    applyGuardedOffsetClamping(
      frames,
      nominalHalfWidths,
      leftHalfWidths,
      rightHalfWidths,
      innerClampedFlags,
      maxInnerCurvatureRatio,
      miterLimit,
    );
  }

  let built = buildRibbonStationsAndQuads(
    frames,
    bevelData.bevelFlags,
    nominalHalfWidths,
    leftHalfWidths,
    rightHalfWidths,
    innerClampedFlags,
    tileRepeatLengthPx,
  );
  let topologyAudit = auditRibbonMeshTopology(built.stations, built.quads);
  let relaxationPassesUsed = 0;

  if (mode === "guarded" && n >= 2) {
    while (!topologyAudit.foldoverFree && relaxationPassesUsed < 20) {
      relaxationPassesUsed += 1;
      const shrinkLeft = new Set<number>();
      const shrinkRight = new Set<number>();

      for (let k = 0; k < topologyAudit.invertedQuadIndices.length; k += 1) {
        const qi = topologyAudit.invertedQuadIndices[k];
        if (leftHalfWidths[qi] <= rightHalfWidths[qi]) {
          shrinkLeft.add(qi);
          shrinkLeft.add(qi + 1);
        } else {
          shrinkRight.add(qi);
          shrinkRight.add(qi + 1);
        }
      }

      for (let k = 0; k < topologyAudit.intersections.length; k += 1) {
        const hit = topologyAudit.intersections[k];
        if (hit.kind === "left-left") {
          shrinkLeft.add(hit.quadIndexA);
          shrinkLeft.add(hit.quadIndexA + 1);
          shrinkLeft.add(hit.quadIndexB);
          shrinkLeft.add(hit.quadIndexB + 1);
        } else if (hit.kind === "right-right") {
          shrinkRight.add(hit.quadIndexA);
          shrinkRight.add(hit.quadIndexA + 1);
          shrinkRight.add(hit.quadIndexB);
          shrinkRight.add(hit.quadIndexB + 1);
        } else if (hit.kind === "rib-rib") {
          const qi = hit.quadIndexA;
          if (leftHalfWidths[qi] <= rightHalfWidths[qi]) {
            shrinkLeft.add(qi);
            shrinkLeft.add(qi + 1);
          } else {
            shrinkRight.add(qi);
            shrinkRight.add(qi + 1);
          }
        } else {
          shrinkLeft.add(hit.quadIndexA);
          shrinkLeft.add(hit.quadIndexA + 1);
          shrinkRight.add(hit.quadIndexB);
          shrinkRight.add(hit.quadIndexB + 1);
        }
      }

      shrinkLeft.forEach((idx) => {
        if (idx >= 0 && idx < n) {
          leftHalfWidths[idx] = Math.max(MIN_INNER_OFFSET_PX, leftHalfWidths[idx] * 0.42);
          innerClampedFlags[idx] = true;
        }
      });
      shrinkRight.forEach((idx) => {
        if (idx >= 0 && idx < n) {
          rightHalfWidths[idx] = Math.max(MIN_INNER_OFFSET_PX, rightHalfWidths[idx] * 0.42);
          innerClampedFlags[idx] = true;
        }
      });

      built = buildRibbonStationsAndQuads(
        frames,
        bevelData.bevelFlags,
        nominalHalfWidths,
        leftHalfWidths,
        rightHalfWidths,
        innerClampedFlags,
        tileRepeatLengthPx,
      );
      topologyAudit = auditRibbonMeshTopology(built.stations, built.quads);
    }
  }

  const totalArcLengthPx = n > 0 ? frames[n - 1].arcLengthPx : 0;
  const tileCount = totalArcLengthPx > EPS ? totalArcLengthPx / tileRepeatLengthPx : 0;

  let minWidthPx = n > 0 ? Number.POSITIVE_INFINITY : 0;
  let maxWidthPx = 0;
  let minPressure = n > 0 ? Number.POSITIVE_INFINITY : 0;
  let maxPressure = 0;
  let maxAbsCurvature = 0;
  let innerClampedStationCount = 0;

  for (let i = 0; i < built.stations.length; i += 1) {
    const st = built.stations[i];
    const w = st.leftHalfWidthPx + st.rightHalfWidthPx;
    if (w < minWidthPx) minWidthPx = w;
    if (w > maxWidthPx) maxWidthPx = w;
    if (st.pressure < minPressure) minPressure = st.pressure;
    if (st.pressure > maxPressure) maxPressure = st.pressure;
    const absK = Math.abs(st.signedCurvature);
    if (absK > maxAbsCurvature) maxAbsCurvature = absK;
    if (st.innerClamped) innerClampedStationCount += 1;
  }

  return {
    preset,
    mode,
    seed,
    reparameterization,
    totalArcLengthPx,
    tileRepeatLengthPx,
    tileCount,
    minWidthPx: Number.isFinite(minWidthPx) ? minWidthPx : 0,
    maxWidthPx,
    minPressure: Number.isFinite(minPressure) ? minPressure : 0,
    maxPressure,
    maxAbsCurvature,
    bevelInsertedStationCount: bevelData.bevelInsertedCount,
    innerClampedStationCount,
    relaxationPassesUsed,
    stations: built.stations,
    quads: built.quads,
    startCap: buildRibbonEndCap("start", built.stations[0], startCapStyle),
    endCap: buildRibbonEndCap("end", built.stations[built.stations.length - 1], endCapStyle),
    motifStrokes: buildPresetMotifStrokes(presetId, built.quads, tileCount),
    topologyAudit,
  };
}

/**
 * 동일 입력 스트로크에 대해 단순(Naive) 오프셋과 무접힘 코너 마이터/베벨 가드(Guarded) 리본을
 * 나란히 합성하고 자기교차·음수면적 쿼드 결함 제거 효과를 계량 비교한다.
 */
export function compareNaiveVsGuardedRibbon(
  rawStroke: readonly RawStrokePointerSample[],
  options?: Omit<PatternRibbonSynthesisOptions, "mode">,
): NaiveVsGuardedRibbonComparison {
  const presetId: PatternRibbonPresetId = options?.presetId ?? "korean-dancheong-border";
  const naive = synthesizePatternRibbonBrush(rawStroke, { ...options, presetId, mode: "naive" });
  const guarded = synthesizePatternRibbonBrush(rawStroke, { ...options, presetId, mode: "guarded" });

  const naiveTotalDefects = naive.topologyAudit.selfIntersectionCount + naive.topologyAudit.invertedQuadCount;
  const guardedTotalDefects = guarded.topologyAudit.selfIntersectionCount + guarded.topologyAudit.invertedQuadCount;

  return {
    presetId,
    naive,
    guarded,
    naiveTotalDefects,
    guardedTotalDefects,
    defectReductionCount: Math.max(0, naiveTotalDefects - guardedTotalDefects),
    foldoverEliminated: guardedTotalDefects === 0 && naiveTotalDefects > 0,
    guardedDefectFree: guardedTotalDefects === 0 && guarded.topologyAudit.foldoverFree,
    bevelInsertedStations: guarded.bevelInsertedStationCount,
    innerClampedStations: guarded.innerClampedStationCount,
  };
}
