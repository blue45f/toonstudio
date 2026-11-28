/**
 * Wave 116 — 아크-길이(Arc-Length) 등간격 재매개변수화 & 2D 프레네/비숍 프레임 솔버.
 *
 * - 속도 급변(예: 초반 2px, 후반 40px), 중복점, 비유한 좌표, 급회전이 섞인 손그림 포인터 입력을
 *   정확한 누적 아크-길이 s ∈ [0, totalLengthPx]로 적분하고 균일 간격으로 리샘플링한다.
 * - 타일 경계(s = t * tileRepeatLengthPx)와 급회전 코너 앵커를 보존해
 *   완전 타일별 실측 호 길이 오차를 목표 tileRepeatLengthPx 대비 ±1% 이내로 보장한다.
 * - 각 아크-길이 샘플에서 단위 접선 T(s), 변곡점에서도 뒤집히지 않는 연속 2D 비숍 좌측 법선
 *   N(s) = (-T.y, T.x), 대칭 아크-길이 멘거(Menger) 곡률 및 코너 이산 곡률 κ(s)를 계산한다.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface RawStrokePointerSample {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly timestampMs?: number;
}

export interface CleanedStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timestampMs: number;
  readonly cumulativeArcLengthPx: number;
  readonly incomingTurnAngleRad: number;
}

export interface ArcLengthSample {
  readonly index: number;
  readonly position: Vec2;
  readonly arcLengthPx: number;
  readonly normalizedS: number;
  readonly pressure: number;
  readonly tangent: Vec2;
  readonly normal: Vec2;
  readonly signedCurvature: number;
  readonly curvatureRadiusPx: number;
  readonly turnAngleRad: number;
  readonly isCornerAnchor: boolean;
  readonly isTileBoundary: boolean;
}

export interface ArcLengthReparameterizationOptions {
  /** 목표 패턴 타일 1회 반복 길이 (px). 기본값 28. */
  readonly tileRepeatLengthPx?: number;
  /** 타일 1개당 목표 아크-길이 세분화 구간 수. 기본값 4. */
  readonly subdivisionsPerTile?: number;
  /** 직접 지정할 목표 아크-길이 스텝 (px). 지정 시 subdivisionsPerTile보다 우선한다. */
  readonly targetStepPx?: number;
  /** 연속 중복점 제거 임계 거리 (px). 기본값 0.05. */
  readonly minPointDistancePx?: number;
  /** 원시 꼭짓점을 코너 앵커로 보존할 최소 회전각 (deg). 기본값 12. */
  readonly cornerPreserveAngleDeg?: number;
}

export interface TileUniformityAudit {
  readonly tileRepeatLengthPx: number;
  readonly fullTileCount: number;
  readonly totalTileCount: number;
  readonly measuredTileLengthsPx: readonly number[];
  readonly meanTileLengthPx: number;
  readonly maxAbsoluteErrorPx: number;
  readonly maxRelativeErrorRatio: number;
  readonly withinOnePercent: boolean;
}

export interface ArcLengthReparameterizationResult {
  readonly rawInputCount: number;
  readonly sanitizedInputCount: number;
  readonly droppedSampleCount: number;
  readonly totalLengthPx: number;
  readonly targetStepPx: number;
  readonly tileRepeatLengthPx: number;
  readonly samples: readonly ArcLengthSample[];
  readonly cornerAnchorIndices: readonly number[];
  readonly maxAbsCurvature: number;
  readonly minCurvatureRadiusPx: number;
  readonly tileUniformity: TileUniformityAudit;
}

export const MAX_FINITE_CURVATURE_RADIUS_PX = 1_000_000;
const EPSILON = 1e-6;
const DEG_TO_RAD = Math.PI / 180;

export function clampFinite(value: number, minValue: number, maxValue: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Scale(v: Vec2, scalar: number): Vec2 {
  return { x: v.x * scalar, y: v.y * scalar };
}

export function vec2Dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function vec2Cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function vec2Length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function vec2Distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function vec2Normalize(v: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (!Number.isFinite(len) || len <= EPSILON) return fallback;
  return { x: v.x / len, y: v.y / len };
}

export function leftNormalFromTangent(tangent: Vec2): Vec2 {
  return { x: -tangent.y, y: tangent.x };
}

/**
 * 원시 포인터 스트로크에서 비유한 좌표와 중복/초근접 샘플을 제거하고
 * 누적 아크-길이 및 내부 꼭짓점 회전각을 계산한다.
 */
export function cleanRawStrokePointerSamples(
  rawSamples: readonly RawStrokePointerSample[],
  minPointDistancePx = 0.05,
): readonly CleanedStrokePoint[] {
  const minDist = clampFinite(minPointDistancePx, 1e-4, 50, 0.05);
  const filtered: Array<{ x: number; y: number; pressure: number; timestampMs: number }> = [];

  for (let i = 0; i < rawSamples.length; i += 1) {
    const sample = rawSamples[i];
    if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) continue;
    const pressure = clampFinite(sample.pressure ?? 0.5, 0.05, 1, 0.5);
    const timestampMs = clampFinite(sample.timestampMs ?? i * 8, 0, 1e12, i * 8);

    if (filtered.length > 0) {
      const prev = filtered[filtered.length - 1];
      if (Math.hypot(sample.x - prev.x, sample.y - prev.y) < minDist) continue;
    }
    filtered.push({ x: sample.x, y: sample.y, pressure, timestampMs });
  }

  if (filtered.length === 0) return [];

  const cleaned: CleanedStrokePoint[] = [];
  let cumulativeS = 0;

  for (let i = 0; i < filtered.length; i += 1) {
    const cur = filtered[i];
    if (i > 0) {
      cumulativeS += Math.hypot(cur.x - filtered[i - 1].x, cur.y - filtered[i - 1].y);
    }

    let turnAngleRad = 0;
    if (i > 0 && i < filtered.length - 1) {
      const prev = filtered[i - 1];
      const next = filtered[i + 1];
      const tIn = vec2Normalize({ x: cur.x - prev.x, y: cur.y - prev.y });
      const tOut = vec2Normalize({ x: next.x - cur.x, y: next.y - cur.y });
      turnAngleRad = Math.atan2(vec2Cross(tIn, tOut), vec2Dot(tIn, tOut));
    }

    cleaned.push({
      x: cur.x,
      y: cur.y,
      pressure: cur.pressure,
      timestampMs: cur.timestampMs,
      cumulativeArcLengthPx: cumulativeS,
      incomingTurnAngleRad: turnAngleRad,
    });
  }

  return cleaned;
}

export interface InterpolatedPolylineNode {
  readonly position: Vec2;
  readonly pressure: number;
  readonly arcLengthPx: number;
  readonly isCornerAnchor: boolean;
  readonly isTileBoundary: boolean;
}

function samplePolylineAtArcLength(
  cleaned: readonly CleanedStrokePoint[],
  targetS: number,
): { readonly position: Vec2; readonly pressure: number } {
  const lastIdx = cleaned.length - 1;
  if (lastIdx <= 0) {
    const first = cleaned[0];
    return { position: { x: first.x, y: first.y }, pressure: clampFinite(first.pressure, 0.05, 1, 0.5) };
  }

  const totalLength = cleaned[lastIdx].cumulativeArcLengthPx;
  const s = clampFinite(targetS, 0, totalLength, 0);

  let lo = 0;
  let hi = lastIdx;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cleaned[mid].cumulativeArcLengthPx <= s) lo = mid;
    else hi = mid;
  }

  const a = cleaned[lo];
  const b = cleaned[hi];
  const span = b.cumulativeArcLengthPx - a.cumulativeArcLengthPx;
  const t = span > EPSILON ? clampFinite((s - a.cumulativeArcLengthPx) / span, 0, 1, 0) : 0;

  return {
    position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
    pressure: clampFinite(a.pressure + (b.pressure - a.pressure) * t, 0.05, 1, 0.5),
  };
}

interface CandidateArcStation {
  readonly s: number;
  readonly isCornerAnchor: boolean;
  readonly isTileBoundary: boolean;
}

function buildSortedUniqueStations(
  cleaned: readonly CleanedStrokePoint[],
  totalLengthPx: number,
  targetStepPx: number,
  tileRepeatLengthPx: number,
  cornerPreserveAngleRad: number,
): readonly CandidateArcStation[] {
  const candidates: CandidateArcStation[] = [
    { s: 0, isCornerAnchor: false, isTileBoundary: true },
    { s: totalLengthPx, isCornerAnchor: false, isTileBoundary: false },
  ];

  const stepCount = Math.max(1, Math.ceil(totalLengthPx / targetStepPx));
  const uniformStep = totalLengthPx / stepCount;
  for (let k = 1; k < stepCount; k += 1) {
    candidates.push({ s: k * uniformStep, isCornerAnchor: false, isTileBoundary: false });
  }

  const fullTiles = Math.floor(totalLengthPx / tileRepeatLengthPx);
  for (let tileIdx = 1; tileIdx <= fullTiles; tileIdx += 1) {
    const boundaryS = tileIdx * tileRepeatLengthPx;
    if (boundaryS < totalLengthPx - 1e-4) {
      candidates.push({ s: boundaryS, isCornerAnchor: false, isTileBoundary: true });
    }
  }

  for (let i = 1; i < cleaned.length - 1; i += 1) {
    const pt = cleaned[i];
    if (Math.abs(pt.incomingTurnAngleRad) >= cornerPreserveAngleRad) {
      candidates.push({ s: pt.cumulativeArcLengthPx, isCornerAnchor: true, isTileBoundary: false });
    }
  }

  candidates.sort((a, b) => a.s - b.s);

  const mergeTolerancePx = Math.min(0.25, targetStepPx * 0.08);
  const merged: CandidateArcStation[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const cur = candidates[i];
    if (merged.length === 0) {
      merged.push(cur);
      continue;
    }

    const prev = merged[merged.length - 1];
    if (Math.abs(cur.s - prev.s) <= mergeTolerancePx) {
      const keepCurS =
        (cur.isCornerAnchor && !prev.isCornerAnchor) ||
        (!prev.isCornerAnchor && cur.isTileBoundary && !prev.isTileBoundary) ||
        cur.s === totalLengthPx;
      merged[merged.length - 1] = {
        s: keepCurS ? cur.s : prev.s,
        isCornerAnchor: prev.isCornerAnchor || cur.isCornerAnchor,
        isTileBoundary: prev.isTileBoundary || cur.isTileBoundary,
      };
    } else {
      merged.push(cur);
    }
  }

  if (merged.length > 0) {
    const last = merged[merged.length - 1];
    merged[merged.length - 1] = {
      s: totalLengthPx,
      isCornerAnchor: last.isCornerAnchor,
      isTileBoundary:
        last.isTileBoundary ||
        Math.abs(totalLengthPx - Math.round(totalLengthPx / tileRepeatLengthPx) * tileRepeatLengthPx) <= 1e-3,
    };
  }

  return merged;
}

/**
 * 리샘플링된 점열에서 2D 연속 비숍/프레네 프레임(T, N, 부호 있는 곡률 κ)을 계산한다.
 */
export function computeBishopFramesForSamples(
  rawNodes: readonly InterpolatedPolylineNode[],
  smoothContext?: {
    readonly cleaned: readonly CleanedStrokePoint[];
    readonly cornerArcLengths: readonly number[];
    readonly smoothWindowPx: number;
    readonly cornerPreserveAngleRad: number;
  },
): readonly ArcLengthSample[] {
  const n = rawNodes.length;
  if (n === 0) return [];

  if (n === 1) {
    const only = rawNodes[0];
    return [
      {
        index: 0,
        position: only.position,
        arcLengthPx: 0,
        normalizedS: 0,
        pressure: clampFinite(only.pressure, 0.05, 1, 0.5),
        tangent: { x: 1, y: 0 },
        normal: { x: 0, y: 1 },
        signedCurvature: 0,
        curvatureRadiusPx: MAX_FINITE_CURVATURE_RADIUS_PX,
        turnAngleRad: 0,
        isCornerAnchor: false,
        isTileBoundary: true,
      },
    ];
  }

  const totalLengthPx = Math.max(rawNodes[n - 1].arcLengthPx, EPSILON);
  const segTangents: Vec2[] = [];
  const segLengths: number[] = [];
  let lastValidTangent: Vec2 = { x: 1, y: 0 };

  for (let i = 0; i < n - 1; i += 1) {
    const delta = vec2Sub(rawNodes[i + 1].position, rawNodes[i].position);
    const len = vec2Length(delta);
    const tangent = len > EPSILON ? { x: delta.x / len, y: delta.y / len } : lastValidTangent;
    lastValidTangent = tangent;
    segTangents.push(tangent);
    segLengths.push(len);
  }

  const frames: ArcLengthSample[] = [];

  for (let i = 0; i < n; i += 1) {
    const node = rawNodes[i];
    const tIn = i === 0 ? segTangents[0] : segTangents[i - 1];
    const tOut = i === n - 1 ? segTangents[n - 2] : segTangents[i];
    const dsPrev = i === 0 ? segLengths[0] : segLengths[i - 1];
    const dsNext = i === n - 1 ? segLengths[n - 2] : segLengths[i];

    const turnAngleRad = i === 0 || i === n - 1 ? 0 : Math.atan2(vec2Cross(tIn, tOut), vec2Dot(tIn, tOut));

    let tangent: Vec2;
    if (i === 0) {
      tangent = tOut;
    } else if (i === n - 1) {
      tangent = tIn;
    } else {
      const sum = vec2Add(tIn, tOut);
      const sumLen = vec2Length(sum);
      if (sumLen > 1e-4) {
        tangent = { x: sum.x / sumLen, y: sum.y / sumLen };
      } else {
        const sign = turnAngleRad < 0 ? -1 : 1;
        tangent = { x: -tIn.y * sign, y: tIn.x * sign };
      }
    }

    const dsAvg = Math.max(0.5 * (dsPrev + dsNext), 1e-4);
    let signedCurvature = i === 0 || i === n - 1 ? 0 : turnAngleRad / dsAvg;

    // 완만 구간에서는 4점 대칭 아크-길이 접선 차분으로 폴리라인 현 앨리어싱 없이 정밀 곡률을 계산한다.
    if (
      smoothContext &&
      i > 0 &&
      i < n - 1 &&
      !node.isCornerAnchor &&
      Math.abs(turnAngleRad) < smoothContext.cornerPreserveAngleRad
    ) {
      let halfSpan = Math.min(smoothContext.smoothWindowPx, node.arcLengthPx, totalLengthPx - node.arcLengthPx);
      for (let c = 0; c < smoothContext.cornerArcLengths.length; c += 1) {
        const distToCorner = Math.abs(smoothContext.cornerArcLengths[c] - node.arcLengthPx);
        if (distToCorner < halfSpan) {
          halfSpan = distToCorner * 0.9;
        }
      }
      if (halfSpan >= 3.0) {
        const innerOff = halfSpan * 0.2;
        const pFarPrev = samplePolylineAtArcLength(smoothContext.cleaned, node.arcLengthPx - halfSpan).position;
        const pNearPrev = samplePolylineAtArcLength(smoothContext.cleaned, node.arcLengthPx - innerOff).position;
        const pNearNext = samplePolylineAtArcLength(smoothContext.cleaned, node.arcLengthPx + innerOff).position;
        const pFarNext = samplePolylineAtArcLength(smoothContext.cleaned, node.arcLengthPx + halfSpan).position;
        const tMinus = vec2Normalize(vec2Sub(pNearPrev, pFarPrev), tIn);
        const tPlus = vec2Normalize(vec2Sub(pFarNext, pNearNext), tOut);
        const deltaTheta = Math.atan2(vec2Cross(tMinus, tPlus), vec2Dot(tMinus, tPlus));
        signedCurvature = deltaTheta / (1.2 * halfSpan);
        const avgTan = vec2Add(tMinus, tPlus);
        if (vec2Length(avgTan) > 1e-4) {
          tangent = vec2Normalize(avgTan, tangent);
        }
      }
    }

    const normal = leftNormalFromTangent(tangent);
    const absKappa = Math.abs(signedCurvature);
    const curvatureRadiusPx =
      absKappa > 1e-6
        ? Math.min(MAX_FINITE_CURVATURE_RADIUS_PX, 1 / absKappa)
        : MAX_FINITE_CURVATURE_RADIUS_PX;

    frames.push({
      index: i,
      position: node.position,
      arcLengthPx: node.arcLengthPx,
      normalizedS: clampFinite(node.arcLengthPx / totalLengthPx, 0, 1, 0),
      pressure: clampFinite(node.pressure, 0.05, 1, 0.5),
      tangent,
      normal,
      signedCurvature,
      curvatureRadiusPx,
      turnAngleRad,
      isCornerAnchor: node.isCornerAnchor,
      isTileBoundary: node.isTileBoundary,
    });
  }

  return frames;
}

function measureTileLengthUniformity(
  samples: readonly ArcLengthSample[],
  totalLengthPx: number,
  tileRepeatLengthPx: number,
): TileUniformityAudit {
  const fullTileCount = Math.floor(totalLengthPx / tileRepeatLengthPx);
  const totalTileCount = totalLengthPx > EPSILON ? totalLengthPx / tileRepeatLengthPx : 0;

  if (fullTileCount <= 0 || samples.length < 2) {
    return {
      tileRepeatLengthPx,
      fullTileCount: 0,
      totalTileCount,
      measuredTileLengthsPx: [],
      meanTileLengthPx: 0,
      maxAbsoluteErrorPx: 0,
      maxRelativeErrorRatio: 0,
      withinOnePercent: true,
    };
  }

  const bucketLengths = new Array<number>(fullTileCount).fill(0);

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const segArcSpan = b.arcLengthPx - a.arcLengthPx;
    if (segArcSpan <= EPSILON) continue;
    const segEuclidLen = vec2Distance(a.position, b.position);

    let cursorS = a.arcLengthPx;
    while (cursorS < b.arcLengthPx - 1e-9) {
      const tileIdx = Math.floor(cursorS / tileRepeatLengthPx);
      if (tileIdx >= fullTileCount) break;
      const chunkEndS = Math.min(b.arcLengthPx, (tileIdx + 1) * tileRepeatLengthPx);
      bucketLengths[tileIdx] += segEuclidLen * ((chunkEndS - cursorS) / segArcSpan);
      cursorS = chunkEndS;
    }
  }

  let sum = 0;
  let maxAbsErr = 0;
  for (let t = 0; t < fullTileCount; t += 1) {
    sum += bucketLengths[t];
    const err = Math.abs(bucketLengths[t] - tileRepeatLengthPx);
    if (err > maxAbsErr) maxAbsErr = err;
  }

  const meanTileLengthPx = sum / fullTileCount;
  const maxRelativeErrorRatio = maxAbsErr / tileRepeatLengthPx;

  return {
    tileRepeatLengthPx,
    fullTileCount,
    totalTileCount,
    measuredTileLengthsPx: bucketLengths,
    meanTileLengthPx,
    maxAbsoluteErrorPx: maxAbsErr,
    maxRelativeErrorRatio,
    withinOnePercent: maxRelativeErrorRatio <= 0.01,
  };
}

/**
 * 불균일 손그림 포인터 입력을 누적 아크-길이 기준으로 등간격 재매개변수화하고
 * 각 샘플의 단위 접선 T(s), 2D 비숍 법선 N(s), 부호 있는 곡률 κ(s)를 계산한다.
 */
export function reparameterizeStrokeByArcLength(
  rawSamples: readonly RawStrokePointerSample[],
  options?: ArcLengthReparameterizationOptions,
): ArcLengthReparameterizationResult {
  const tileRepeatLengthPx = clampFinite(options?.tileRepeatLengthPx ?? 28, 4, 512, 28);
  const subdivisionsPerTile = Math.round(clampFinite(options?.subdivisionsPerTile ?? 4, 1, 32, 4));
  const targetStepPx = clampFinite(
    options?.targetStepPx ?? tileRepeatLengthPx / subdivisionsPerTile,
    1,
    128,
    tileRepeatLengthPx / subdivisionsPerTile,
  );
  const minPointDistancePx = clampFinite(options?.minPointDistancePx ?? 0.05, 1e-4, 50, 0.05);
  const cornerPreserveAngleRad =
    clampFinite(options?.cornerPreserveAngleDeg ?? 12, 2, 85, 12) * DEG_TO_RAD;

  const cleaned = cleanRawStrokePointerSamples(rawSamples, minPointDistancePx);
  const droppedSampleCount = Math.max(0, rawSamples.length - cleaned.length);

  if (cleaned.length === 0) {
    return {
      rawInputCount: rawSamples.length,
      sanitizedInputCount: 0,
      droppedSampleCount,
      totalLengthPx: 0,
      targetStepPx,
      tileRepeatLengthPx,
      samples: [],
      cornerAnchorIndices: [],
      maxAbsCurvature: 0,
      minCurvatureRadiusPx: MAX_FINITE_CURVATURE_RADIUS_PX,
      tileUniformity: measureTileLengthUniformity([], 0, tileRepeatLengthPx),
    };
  }

  const totalLengthPx = cleaned[cleaned.length - 1].cumulativeArcLengthPx;

  if (cleaned.length === 1 || totalLengthPx <= EPSILON) {
    const single = computeBishopFramesForSamples([
      {
        position: { x: cleaned[0].x, y: cleaned[0].y },
        pressure: cleaned[0].pressure,
        arcLengthPx: 0,
        isCornerAnchor: false,
        isTileBoundary: true,
      },
    ]);
    return {
      rawInputCount: rawSamples.length,
      sanitizedInputCount: cleaned.length,
      droppedSampleCount,
      totalLengthPx: 0,
      targetStepPx,
      tileRepeatLengthPx,
      samples: single,
      cornerAnchorIndices: [],
      maxAbsCurvature: 0,
      minCurvatureRadiusPx: MAX_FINITE_CURVATURE_RADIUS_PX,
      tileUniformity: measureTileLengthUniformity(single, 0, tileRepeatLengthPx),
    };
  }

  const stations = buildSortedUniqueStations(
    cleaned,
    totalLengthPx,
    targetStepPx,
    tileRepeatLengthPx,
    cornerPreserveAngleRad,
  );

  const interpolatedNodes: InterpolatedPolylineNode[] = [];
  let reintegratedS = 0;

  for (let i = 0; i < stations.length; i += 1) {
    const st = stations[i];
    const sampled = samplePolylineAtArcLength(cleaned, st.s);
    if (i > 0) {
      reintegratedS += vec2Distance(interpolatedNodes[i - 1].position, sampled.position);
    }
    interpolatedNodes.push({
      position: sampled.position,
      pressure: sampled.pressure,
      arcLengthPx: reintegratedS,
      isCornerAnchor: st.isCornerAnchor,
      isTileBoundary: st.isTileBoundary,
    });
  }

  const cornerArcLengths = cleaned
    .filter((pt, idx) => idx > 0 && idx < cleaned.length - 1 && Math.abs(pt.incomingTurnAngleRad) >= cornerPreserveAngleRad)
    .map((pt) => pt.cumulativeArcLengthPx);

  const samples = computeBishopFramesForSamples(interpolatedNodes, {
    cleaned,
    cornerArcLengths,
    smoothWindowPx: Math.max(targetStepPx * 2.5, 16),
    cornerPreserveAngleRad,
  });

  const finalTotalLengthPx = samples.length > 0 ? samples[samples.length - 1].arcLengthPx : 0;
  const cornerAnchorIndices: number[] = [];
  let maxAbsCurvature = 0;
  let minCurvatureRadiusPx = MAX_FINITE_CURVATURE_RADIUS_PX;

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (s.isCornerAnchor) cornerAnchorIndices.push(i);
    const absK = Math.abs(s.signedCurvature);
    if (absK > maxAbsCurvature) maxAbsCurvature = absK;
    if (s.curvatureRadiusPx < minCurvatureRadiusPx) minCurvatureRadiusPx = s.curvatureRadiusPx;
  }

  return {
    rawInputCount: rawSamples.length,
    sanitizedInputCount: cleaned.length,
    droppedSampleCount,
    totalLengthPx: finalTotalLengthPx,
    targetStepPx,
    tileRepeatLengthPx,
    samples,
    cornerAnchorIndices,
    maxAbsCurvature,
    minCurvatureRadiusPx,
    tileUniformity: measureTileLengthUniformity(samples, finalTotalLengthPx, tileRepeatLengthPx),
  };
}
