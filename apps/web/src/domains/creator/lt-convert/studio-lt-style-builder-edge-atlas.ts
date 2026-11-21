/**
 * SketchUp Style Builder × Blender Line Art 3.0 클린룸 선화 아틀라스·모디파이어 스택 엔진.
 *
 * - 작가가 직접 그린 3~5개 길이 버킷(32/64/128/256/512px) 펜촉 스트로크로 재사용 아틀라스 생성
 * - 카메라 투영 3D 엣지(실루엣·크리즈·재질 경계·교차선)를 연속 화면 폴리라인으로 체이닝
 * - 비파괴 모디파이어 스택(길이 버킷 매핑, 백본 오버슈트, 필압 테이퍼, 원근 감쇠, 결정론적 지터)
 * - 실시간 리본 드로우콜과 6패스 LT 편집 가능 벡터 레이어 스트로크 어댑터 출력
 */

export const STYLE_BUILDER_BUCKET_LENGTHS_PX = [32, 64, 128, 256, 512] as const;
export const STYLE_BUILDER_MIN_BUCKETS = 3;
export const STYLE_BUILDER_PROFILE_SAMPLES = 16;

export type StyleBuilderBucketLengthPx =
  (typeof STYLE_BUILDER_BUCKET_LENGTHS_PX)[number];

export interface CreatorStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly pressure01: number;
  readonly alpha01?: number;
}

export interface StyleBuilderBucketEntry {
  readonly lengthPx: StyleBuilderBucketLengthPx;
  readonly widthProfile: readonly number[];
  readonly alphaProfile: readonly number[];
  readonly meanWidthPx: number;
  readonly wobbleAmplitudePx: number;
}

export interface StyleBuilderStrokeAtlas {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: 1;
  readonly seed: number;
  readonly buckets: readonly StyleBuilderBucketEntry[];
}

export type Projected3dEdgeKind =
  | "silhouette"
  | "crease"
  | "material-boundary"
  | "intersection";

export interface Projected3dEdgeSegment {
  readonly id: string;
  readonly ax: number;
  readonly ay: number;
  readonly azDepth: number;
  readonly bx: number;
  readonly by: number;
  readonly bzDepth: number;
  readonly kind: Projected3dEdgeKind;
  readonly dihedralAngleDeg: number;
  readonly materialBoundary: boolean;
  readonly intersectionEdge: boolean;
}

export interface ChainedEdgePoint {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

export interface ChainedEdgePolyline {
  readonly id: string;
  readonly kind: Projected3dEdgeKind;
  readonly points: readonly ChainedEdgePoint[];
  readonly totalLengthPx: number;
  readonly meanDepth: number;
}

export interface LineArtModifierStackConfig {
  readonly creaseAngleThresholdDeg: number;
  readonly enabledKinds: readonly Projected3dEdgeKind[];
  readonly overshootPx: number;
  readonly taperStartRatio01: number;
  readonly taperEndRatio01: number;
  readonly taperMinWidthScale: number;
  readonly perspectiveNearDepth: number;
  readonly perspectiveFarDepth: number;
  readonly perspectiveMinScale: number;
  readonly jitterAmplitudePx: number;
  readonly jitterFrequency: number;
  readonly jitterSeed: number;
  readonly baseWidthPx: number;
}

export interface EvaluatedLineArtPoint {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly alpha01: number;
  readonly uvU: number;
}

export interface EvaluatedLineArtStroke {
  readonly id: string;
  readonly sourcePolylineId: string;
  readonly kind: Projected3dEdgeKind;
  readonly selectedBucketPx: StyleBuilderBucketLengthPx;
  readonly points: readonly EvaluatedLineArtPoint[];
  readonly totalLengthPx: number;
}

export interface LineArtRibbonDrawCall {
  readonly strokeId: string;
  readonly atlasId: string;
  readonly bucketPx: StyleBuilderBucketLengthPx;
  readonly vertexPositions2d: Float32Array;
  readonly vertexUvs: Float32Array;
  readonly vertexAlphas: Float32Array;
  readonly indices: Uint32Array;
}

export interface EditableVectorLayerStroke {
  readonly id: string;
  readonly layerPass: "main-line";
  readonly edgeKind: Projected3dEdgeKind;
  readonly points: readonly {
    readonly x: number;
    readonly y: number;
    readonly pressure01: number;
    readonly opacity01: number;
  }[];
  readonly baseWidthPx: number;
  readonly atlasId: string;
  readonly bucketPx: StyleBuilderBucketLengthPx;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function dist2d(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * 결정론적 2D+인덱스 공간 해시 노이즈 [-1, 1] (비결정적 난수 미사용).
 */
export function deterministicSpatialNoise(
  seed: number,
  x: number,
  y: number,
  index: number,
): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b) | 0;
  const qx = Math.round(x * 16) | 0;
  const qy = Math.round(y * 16) | 0;
  h = Math.imul(h ^ qx, 0xc2b2ae35) | 0;
  h = Math.imul(h ^ qy, 0x27d4eb2f) | 0;
  h = Math.imul(h ^ (index | 0), 0x165667b1) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) | 0;
  h ^= h >>> 12;
  const normalized01 = (h >>> 0) / 0xffffffff;
  return normalized01 * 2 - 1;
}

/**
 * 기본 Line Art 3.0 모디파이어 스택 설정을 생성한다.
 */
export function createDefaultLineArtModifierStackConfig(): LineArtModifierStackConfig {
  return {
    creaseAngleThresholdDeg: 35,
    enabledKinds: ["silhouette", "crease", "material-boundary", "intersection"],
    overshootPx: 3,
    taperStartRatio01: 0.14,
    taperEndRatio01: 0.18,
    taperMinWidthScale: 0.28,
    perspectiveNearDepth: 2,
    perspectiveFarDepth: 32,
    perspectiveMinScale: 0.42,
    jitterAmplitudePx: 0.65,
    jitterFrequency: 1.0,
    jitterSeed: 4091,
    baseWidthPx: 2.4,
  };
}

function resampleStrokeProfile(
  samples: readonly CreatorStrokeSample[],
  sampleCount: number,
): {
  readonly widthProfile: readonly number[];
  readonly alphaProfile: readonly number[];
  readonly meanWidthPx: number;
  readonly wobbleAmplitudePx: number;
} {
  if (samples.length < 2) {
    throw new Error("펜촉 스트로크 샘플은 최소 2개 이상의 점이 필요합니다.");
  }

  const cumulative: number[] = [0];
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    cumulative.push(cumulative[i - 1] + dist2d(prev.x, prev.y, curr.x, curr.y));
  }
  const totalLen = cumulative[cumulative.length - 1];
  const first = samples[0];
  const last = samples[samples.length - 1];
  const chordLen = Math.max(1e-5, dist2d(first.x, first.y, last.x, last.y));
  const chordDirX = (last.x - first.x) / chordLen;
  const chordDirY = (last.y - first.y) / chordLen;

  let maxPerpOffset = 0;
  for (const pt of samples) {
    const dx = pt.x - first.x;
    const dy = pt.y - first.y;
    const perp = Math.abs(dx * -chordDirY + dy * chordDirX);
    if (perp > maxPerpOffset) maxPerpOffset = perp;
  }

  const widthProfile: number[] = [];
  const alphaProfile: number[] = [];
  let sumPressure = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const targetDist = totalLen <= 1e-5 ? 0 : (i / (sampleCount - 1)) * totalLen;
    let segIdx = 0;
    while (segIdx < cumulative.length - 2 && cumulative[segIdx + 1] < targetDist) {
      segIdx += 1;
    }
    const segStart = cumulative[segIdx];
    const segEnd = cumulative[segIdx + 1];
    const t = segEnd - segStart > 1e-6 ? clamp((targetDist - segStart) / (segEnd - segStart), 0, 1) : 0;

    const a = samples[segIdx];
    const b = samples[segIdx + 1];
    const p = clamp(a.pressure01 + (b.pressure01 - a.pressure01) * t, 0.05, 1);
    const alA = a.alpha01 ?? 1;
    const alB = b.alpha01 ?? 1;
    const al = clamp(alA + (alB - alA) * t, 0.05, 1);

    widthProfile.push(p);
    alphaProfile.push(al);
    sumPressure += p;
  }

  const meanPressure = sumPressure / sampleCount;
  return {
    widthProfile,
    alphaProfile,
    meanWidthPx: Number((meanPressure * 3.0).toFixed(3)),
    wobbleAmplitudePx: Number(clamp(maxPerpOffset, 0, 16).toFixed(3)),
  };
}

/**
 * 작가의 3~5개 길이 버킷 스트로크에서 정규화 선화 스타일 아틀라스를 구축한다.
 */
export function buildStyleBuilderStrokeAtlas(input: {
  readonly id: string;
  readonly name: string;
  readonly seed?: number;
  readonly strokesByBucket: Partial<
    Record<StyleBuilderBucketLengthPx, readonly CreatorStrokeSample[]>
  >;
}): StyleBuilderStrokeAtlas {
  const buckets: StyleBuilderBucketEntry[] = [];

  for (const lengthPx of STYLE_BUILDER_BUCKET_LENGTHS_PX) {
    const samples = input.strokesByBucket[lengthPx];
    if (!samples) continue;
    const profile = resampleStrokeProfile(samples, STYLE_BUILDER_PROFILE_SAMPLES);
    buckets.push({
      lengthPx,
      ...profile,
    });
  }

  if (buckets.length < STYLE_BUILDER_MIN_BUCKETS) {
    throw new Error(
      `스타일 빌더 아틀라스는 최소 ${STYLE_BUILDER_MIN_BUCKETS}개 이상의 길이 버킷이 필요합니다.`,
    );
  }

  return {
    id: input.id.trim() || "style-atlas-default",
    name: input.name.trim() || "작가 기본 펜촉 아틀라스",
    schemaVersion: 1,
    seed: input.seed ?? 1337,
    buckets,
  };
}

/**
 * 폴리라인 화면 길이에 가장 적합한 아틀라스 길이 버킷을 로그 거리 기준으로 선택한다.
 */
export function selectBestAtlasBucket(
  atlas: StyleBuilderStrokeAtlas,
  polylineLengthPx: number,
): StyleBuilderBucketEntry {
  const safeLen = Math.max(1, polylineLengthPx);
  const logTarget = Math.log2(safeLen);
  let best = atlas.buckets[0];
  let bestDist = Math.abs(Math.log2(best.lengthPx) - logTarget);

  for (let i = 1; i < atlas.buckets.length; i += 1) {
    const candidate = atlas.buckets[i];
    const dist = Math.abs(Math.log2(candidate.lengthPx) - logTarget);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function isSegmentIncluded(
  seg: Projected3dEdgeSegment,
  enabledKinds: ReadonlySet<Projected3dEdgeKind>,
  creaseThresholdDeg: number,
): boolean {
  if (!enabledKinds.has(seg.kind)) return false;
  if (seg.kind === "crease" && seg.dihedralAngleDeg < creaseThresholdDeg) return false;
  if (seg.kind === "material-boundary" && !seg.materialBoundary) return false;
  if (seg.kind === "intersection" && !seg.intersectionEdge) return false;
  return dist2d(seg.ax, seg.ay, seg.bx, seg.by) > 1e-4;
}

function directionDot(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const l1 = dist2d(ax, ay, bx, by);
  const l2 = dist2d(bx, by, cx, cy);
  if (l1 <= 1e-6 || l2 <= 1e-6) return 1;
  return ((bx - ax) / l1) * ((cx - bx) / l2) + ((by - ay) / l1) * ((cy - by) / l2);
}

/**
 * 카메라 공간으로 투영된 3D 엣지 세그먼트를 같은 종류의 연속 폴리라인으로 체이닝한다.
 */
export function chainProjected3dEdges(
  segments: readonly Projected3dEdgeSegment[],
  options?: {
    readonly creaseAngleThresholdDeg?: number;
    readonly enabledKinds?: readonly Projected3dEdgeKind[];
    readonly weldTolerancePx?: number;
    readonly maxTurnAngleDeg?: number;
  },
): readonly ChainedEdgePolyline[] {
  const creaseThreshold = options?.creaseAngleThresholdDeg ?? 35;
  const enabledSet = new Set<Projected3dEdgeKind>(
    options?.enabledKinds ?? ["silhouette", "crease", "material-boundary", "intersection"],
  );
  const weldTol = clamp(options?.weldTolerancePx ?? 1.5, 0.05, 12);
  const minDot = Math.cos((clamp(options?.maxTurnAngleDeg ?? 75, 5, 175) * Math.PI) / 180);

  const filtered = segments.filter((seg) =>
    isSegmentIncluded(seg, enabledSet, creaseThreshold),
  );
  const used = new Array<boolean>(filtered.length).fill(false);
  const chains: ChainedEdgePolyline[] = [];

  for (let i = 0; i < filtered.length; i += 1) {
    if (used[i]) continue;
    used[i] = true;
    const seed = filtered[i];
    const pts: ChainedEdgePoint[] = [
      { x: seed.ax, y: seed.ay, depth: seed.azDepth },
      { x: seed.bx, y: seed.by, depth: seed.bzDepth },
    ];

    // 꼬리 방향 확장
    let extended = true;
    while (extended) {
      extended = false;
      const prev = pts[pts.length - 2];
      const tail = pts[pts.length - 1];
      let bestIdx = -1;
      let bestReverse = false;
      let bestDot = minDot;

      for (let j = 0; j < filtered.length; j += 1) {
        if (used[j] || filtered[j].kind !== seed.kind) continue;
        const cand = filtered[j];
        if (dist2d(tail.x, tail.y, cand.ax, cand.ay) <= weldTol) {
          const dot = directionDot(prev.x, prev.y, tail.x, tail.y, cand.bx, cand.by);
          if (dot >= bestDot) {
            bestDot = dot;
            bestIdx = j;
            bestReverse = false;
          }
        } else if (dist2d(tail.x, tail.y, cand.bx, cand.by) <= weldTol) {
          const dot = directionDot(prev.x, prev.y, tail.x, tail.y, cand.ax, cand.ay);
          if (dot >= bestDot) {
            bestDot = dot;
            bestIdx = j;
            bestReverse = true;
          }
        }
      }

      if (bestIdx !== -1) {
        used[bestIdx] = true;
        const matched = filtered[bestIdx];
        pts.push(
          bestReverse
            ? { x: matched.ax, y: matched.ay, depth: matched.azDepth }
            : { x: matched.bx, y: matched.by, depth: matched.bzDepth },
        );
        extended = true;
      }
    }

    // 머리 방향 확장
    extended = true;
    while (extended) {
      extended = false;
      const head = pts[0];
      const next = pts[1];
      let bestIdx = -1;
      let bestFromA = false;
      let bestDot = minDot;

      for (let j = 0; j < filtered.length; j += 1) {
        if (used[j] || filtered[j].kind !== seed.kind) continue;
        const cand = filtered[j];
        if (dist2d(head.x, head.y, cand.bx, cand.by) <= weldTol) {
          const dot = directionDot(next.x, next.y, head.x, head.y, cand.ax, cand.ay);
          if (dot >= bestDot) {
            bestDot = dot;
            bestIdx = j;
            bestFromA = true;
          }
        } else if (dist2d(head.x, head.y, cand.ax, cand.ay) <= weldTol) {
          const dot = directionDot(next.x, next.y, head.x, head.y, cand.bx, cand.by);
          if (dot >= bestDot) {
            bestDot = dot;
            bestIdx = j;
            bestFromA = false;
          }
        }
      }

      if (bestIdx !== -1) {
        used[bestIdx] = true;
        const matched = filtered[bestIdx];
        pts.unshift(
          bestFromA
            ? { x: matched.ax, y: matched.ay, depth: matched.azDepth }
            : { x: matched.bx, y: matched.by, depth: matched.bzDepth },
        );
        extended = true;
      }
    }

    let totalLen = 0;
    let depthSum = 0;
    for (let k = 0; k < pts.length; k += 1) {
      depthSum += pts[k].depth;
      if (k > 0) {
        totalLen += dist2d(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
      }
    }

    chains.push({
      id: `chain-${chains.length + 1}-${seed.kind}`,
      kind: seed.kind,
      points: pts,
      totalLengthPx: totalLen,
      meanDepth: depthSum / pts.length,
    });
  }

  return chains;
}

function sampleArrayLinear(profile: readonly number[], t01: number): number {
  const clampedT = clamp(t01, 0, 1);
  const scaled = clampedT * (profile.length - 1);
  const idx = Math.floor(scaled);
  const next = Math.min(profile.length - 1, idx + 1);
  const frac = scaled - idx;
  return profile[idx] + (profile[next] - profile[idx]) * frac;
}

function applyBackboneOvershoot(
  points: readonly ChainedEdgePoint[],
  overshootPx: number,
): readonly ChainedEdgePoint[] {
  if (overshootPx <= 0 || points.length < 2) return points;
  const p0 = points[0];
  const p1 = points[1];
  const startLen = dist2d(p0.x, p0.y, p1.x, p1.y);
  const startPoint: ChainedEdgePoint =
    startLen > 1e-5
      ? {
          x: p0.x - ((p1.x - p0.x) / startLen) * overshootPx,
          y: p0.y - ((p1.y - p0.y) / startLen) * overshootPx,
          depth: p0.depth,
        }
      : p0;

  const pn1 = points[points.length - 2];
  const pn = points[points.length - 1];
  const endLen = dist2d(pn1.x, pn1.y, pn.x, pn.y);
  const endPoint: ChainedEdgePoint =
    endLen > 1e-5
      ? {
          x: pn.x + ((pn.x - pn1.x) / endLen) * overshootPx,
          y: pn.y + ((pn.y - pn1.y) / endLen) * overshootPx,
          depth: pn.depth,
        }
      : pn;

  if (points.length === 2) {
    return [startPoint, p0, pn, endPoint];
  }
  return [startPoint, ...points, endPoint];
}

/**
 * 비파괴 Line Art 3.0 모디파이어 스택을 평가한다.
 */
export function evaluateLineArtModifierStack(
  polylines: readonly ChainedEdgePolyline[],
  atlas: StyleBuilderStrokeAtlas,
  config: LineArtModifierStackConfig,
): readonly EvaluatedLineArtStroke[] {
  const enabledSet = new Set(config.enabledKinds);
  const nearDepth = Math.max(0.1, config.perspectiveNearDepth);
  const farDepth = Math.max(nearDepth + 0.1, config.perspectiveFarDepth);
  const minPersp = clamp(config.perspectiveMinScale, 0.1, 1);

  const results: EvaluatedLineArtStroke[] = [];

  for (let pIdx = 0; pIdx < polylines.length; pIdx += 1) {
    const poly = polylines[pIdx];
    if (!enabledSet.has(poly.kind) || poly.points.length < 2) continue;

    const extended = applyBackboneOvershoot(poly.points, clamp(config.overshootPx, 0, 40));
    const arcLengths: number[] = [0];
    for (let i = 1; i < extended.length; i += 1) {
      arcLengths.push(
        arcLengths[i - 1] +
          dist2d(extended[i - 1].x, extended[i - 1].y, extended[i].x, extended[i].y),
      );
    }
    const totalLengthPx = arcLengths[arcLengths.length - 1];
    const bucket = selectBestAtlasBucket(atlas, totalLengthPx);

    const evaluatedPoints: EvaluatedLineArtPoint[] = [];
    for (let i = 0; i < extended.length; i += 1) {
      const pt = extended[i];
      const uvU = totalLengthPx > 1e-5 ? arcLengths[i] / totalLengthPx : 0;

      // 탄젠트·법선 계산
      const prev = extended[Math.max(0, i - 1)];
      const next = extended[Math.min(extended.length - 1, i + 1)];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const tLen = Math.hypot(tx, ty) || 1;
      const nx = -ty / tLen;
      const ny = tx / tLen;

      // 결정론적 공간 노이즈 지터
      const noise = deterministicSpatialNoise(
        config.jitterSeed ^ atlas.seed,
        pt.x * config.jitterFrequency,
        pt.y * config.jitterFrequency,
        pIdx * 1024 + i,
      );
      const jitterOffset = noise * clamp(config.jitterAmplitudePx, 0, 12);

      // 필압 테이퍼(시작·끝)
      let taperScale = 1;
      if (config.taperStartRatio01 > 0 && uvU < config.taperStartRatio01) {
        const k = uvU / config.taperStartRatio01;
        taperScale =
          config.taperMinWidthScale + (1 - config.taperMinWidthScale) * k;
      } else if (config.taperEndRatio01 > 0 && uvU > 1 - config.taperEndRatio01) {
        const k = (1 - uvU) / config.taperEndRatio01;
        taperScale =
          config.taperMinWidthScale + (1 - config.taperMinWidthScale) * k;
      }

      // 카메라 거리 원근 감쇠
      const depthT = clamp((pt.depth - nearDepth) / (farDepth - nearDepth), 0, 1);
      const perspectiveScale = 1 - depthT * (1 - minPersp);

      const atlasWidthFactor = sampleArrayLinear(bucket.widthProfile, uvU);
      const atlasAlpha = sampleArrayLinear(bucket.alphaProfile, uvU);
      const finalWidth = Math.max(
        0.25,
        config.baseWidthPx * atlasWidthFactor * taperScale * perspectiveScale,
      );

      evaluatedPoints.push({
        x: pt.x + nx * jitterOffset,
        y: pt.y + ny * jitterOffset,
        widthPx: finalWidth,
        alpha01: clamp(atlasAlpha, 0.05, 1),
        uvU,
      });
    }

    results.push({
      id: `lineart-stroke-${results.length + 1}`,
      sourcePolylineId: poly.id,
      kind: poly.kind,
      selectedBucketPx: bucket.lengthPx,
      points: evaluatedPoints,
      totalLengthPx,
    });
  }

  return results;
}

/**
 * 평가된 선화 스트로크를 실시간 프리뷰용 텍스처 리본 드로우콜로 변환한다.
 */
export function buildLineArtRibbonDrawCalls(
  strokes: readonly EvaluatedLineArtStroke[],
  atlasId: string,
): readonly LineArtRibbonDrawCall[] {
  return strokes.map((stroke) => {
    const count = stroke.points.length;
    const vertexPositions2d = new Float32Array(count * 4);
    const vertexUvs = new Float32Array(count * 4);
    const vertexAlphas = new Float32Array(count * 2);
    const indices = new Uint32Array(Math.max(0, count - 1) * 6);

    for (let i = 0; i < count; i += 1) {
      const pt = stroke.points[i];
      const prev = stroke.points[Math.max(0, i - 1)];
      const next = stroke.points[Math.min(count - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const halfW = pt.widthPx * 0.5;

      vertexPositions2d[i * 4] = pt.x + nx * halfW;
      vertexPositions2d[i * 4 + 1] = pt.y + ny * halfW;
      vertexPositions2d[i * 4 + 2] = pt.x - nx * halfW;
      vertexPositions2d[i * 4 + 3] = pt.y - ny * halfW;

      vertexUvs[i * 4] = pt.uvU;
      vertexUvs[i * 4 + 1] = 0;
      vertexUvs[i * 4 + 2] = pt.uvU;
      vertexUvs[i * 4 + 3] = 1;

      vertexAlphas[i * 2] = pt.alpha01;
      vertexAlphas[i * 2 + 1] = pt.alpha01;

      if (i < count - 1) {
        const v0 = i * 2;
        const base = i * 6;
        indices[base] = v0;
        indices[base + 1] = v0 + 1;
        indices[base + 2] = v0 + 2;
        indices[base + 3] = v0 + 1;
        indices[base + 4] = v0 + 3;
        indices[base + 5] = v0 + 2;
      }
    }

    return {
      strokeId: stroke.id,
      atlasId,
      bucketPx: stroke.selectedBucketPx,
      vertexPositions2d,
      vertexUvs,
      vertexAlphas,
      indices,
    };
  });
}

/**
 * 평가된 선화 스트로크를 6패스 LT 주선(main-line) 편집 가능 벡터 레이어 페이로드로 변환한다.
 */
export function toVectorLayerStrokes(
  strokes: readonly EvaluatedLineArtStroke[],
  atlasId: string,
): readonly EditableVectorLayerStroke[] {
  return strokes.map((stroke) => {
    const maxWidth = stroke.points.reduce((acc, pt) => Math.max(acc, pt.widthPx), 1);
    return {
      id: `vec-${stroke.id}`,
      layerPass: "main-line",
      edgeKind: stroke.kind,
      baseWidthPx: maxWidth,
      atlasId,
      bucketPx: stroke.selectedBucketPx,
      points: stroke.points.map((pt) => ({
        x: pt.x,
        y: pt.y,
        pressure01: clamp(pt.widthPx / maxWidth, 0.05, 1),
        opacity01: pt.alpha01,
      })),
    };
  });
}

/**
 * 작가 선화 스타일 아틀라스를 JSON 문자열로 직렬화한다.
 */
export function serializeStyleBuilderAtlas(atlas: StyleBuilderStrokeAtlas): string {
  return JSON.stringify(atlas);
}

/**
 * 직렬화된 선화 스타일 아틀라스를 검증하며 복원한다.
 */
export function deserializeStyleBuilderAtlas(rawJson: string): StyleBuilderStrokeAtlas {
  const parsed: unknown = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("유효하지 않은 선화 스타일 아틀라스 JSON입니다.");
  }
  const obj = parsed as Partial<StyleBuilderStrokeAtlas>;
  if (obj.schemaVersion !== 1 || !Array.isArray(obj.buckets)) {
    throw new Error("선화 스타일 아틀라스 버전 또는 버킷 구조가 올바르지 않습니다.");
  }
  if (obj.buckets.length < STYLE_BUILDER_MIN_BUCKETS) {
    throw new Error(
      `복원된 선화 아틀라스에 최소 ${STYLE_BUILDER_MIN_BUCKETS}개 버킷이 필요합니다.`,
    );
  }
  return {
    id: String(obj.id ?? "restored-atlas"),
    name: String(obj.name ?? "복원된 펜촉 아틀라스"),
    schemaVersion: 1,
    seed: Number.isFinite(obj.seed) ? Number(obj.seed) : 1337,
    buckets: obj.buckets,
  };
}
