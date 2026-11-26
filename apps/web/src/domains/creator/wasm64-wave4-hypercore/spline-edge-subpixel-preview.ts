/**
 * 센트리페탈 Catmull-Rom · 모폴로지 스플라인 스마트 에셋 최적화기 +
 * ₩0 정적 엣지 타일 매니페스트 · 속도 원뿔 프리페치 플래너 +
 * LCD RGB 서브픽셀 & 4× 회전 격자 슈퍼샘플링(RGSS) 초선명 선화 프리뷰 커널.
 *
 * - 모폴로지(Opening/Closing) 선폭 떨림 안정화 + 곡률 허용오차 기반 제어점 압축 후 Catmull-Rom 재복원
 * - 원점 연산 비용 ₩0 콘텐츠 해시 정적 타일 매니페스트 및 뷰포트 속도 벡터 기반 우선순위 프리페치
 * - 4× RGSS(`±0.125, ±0.375`) 해석적 거리장 커버리지 + 5탭 에너지 균형 LCD RGB 서브픽셀 필터링
 */

const FNV32_INIT = 0x811c9dc5;
const FNV32_MUL = 0x01000193;

/** 4× 회전 격자 슈퍼샘플링(RGSS) 서브픽셀 오프셋(4-Rook 패턴). */
export const RGSS_4X_OFFSETS: readonly (readonly [number, number])[] = Object.freeze([
  [-0.125, -0.375],
  [0.375, -0.125],
  [-0.375, 0.125],
  [0.125, 0.375],
]);

export interface SplineSamplePoint {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
}

export interface OptimizedSplineAsset {
  readonly knots: readonly SplineSamplePoint[];
  readonly originalPointCount: number;
  readonly retainedKnotCount: number;
  readonly compressionRatioPct: number;
  readonly maxPositionErrorPx: number;
  readonly widthJitterReductionPct: number;
}

export interface StaticEdgeTileEntry {
  readonly tileKey: string;
  readonly mipLevel: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly contentHashHex: string;
  readonly staticAssetPath: string;
  readonly byteLength: number;
}

export interface StaticEdgeTileManifest {
  readonly documentId: string;
  readonly tileSizePx: number;
  readonly tiles: readonly StaticEdgeTileEntry[];
  readonly totalBytes: number;
  readonly originComputeCostKrw: 0;
}

export interface ViewportPrefetchState {
  readonly centerX: number;
  readonly centerY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly velocityXPerSec: number;
  readonly velocityYPerSec: number;
  readonly desiredMipLevel: number;
  readonly lookaheadSec?: number;
  readonly maxPrefetchBytes?: number;
  readonly maxConcurrentFetches?: number;
  readonly residentTileKeys?: ReadonlySet<string>;
}

export interface PlannedTilePrefetch {
  readonly tile: StaticEdgeTileEntry;
  readonly tier: "viewport-visible" | "velocity-cone" | "coarse-mip-anchor";
  readonly priorityScore: number;
}

export interface LineSegmentStroke {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly halfWidthPx: number;
}

export interface SubpixelLinePreviewResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly subpixelMode: "lcd-rgb" | "rgss-grayscale";
  readonly colorFringeMaxDelta: number;
  readonly inkPixelCount: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function fnv1aHex(bytes: Uint8Array): string {
  let h = FNV32_INIT;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, FNV32_MUL) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** 1차원 형태학적 침식(Erosion)/팽창(Dilation) 연산으로 스타일러스 선폭 스파이크 노이즈를 제거한다. */
function morphologicalOpenCloseWidths(widths: readonly number[], radius = 1): number[] {
  const n = widths.length;
  if (n <= 2 || radius <= 0) return [...widths];

  const erode = (src: readonly number[]): number[] =>
    src.map((_, i) => {
      let minVal = src[i] ?? 0;
      for (let d = -radius; d <= radius; d += 1) {
        const idx = clamp(i + d, 0, n - 1);
        const v = src[idx] ?? minVal;
        if (v < minVal) minVal = v;
      }
      return minVal;
    });

  const dilate = (src: readonly number[]): number[] =>
    src.map((_, i) => {
      let maxVal = src[i] ?? 0;
      for (let d = -radius; d <= radius; d += 1) {
        const idx = clamp(i + d, 0, n - 1);
        const v = src[idx] ?? maxVal;
        if (v > maxVal) maxVal = v;
      }
      return maxVal;
    });

  // Opening(고립 양의 스파이크 제거) 후 Closing(고립 음의 드롭아웃 복원) 평균 결합
  const opened = dilate(erode(widths));
  const closed = erode(dilate(opened));
  return closed;
}

function totalWidthJitter(widths: readonly number[]): number {
  let sum = 0;
  for (let i = 1; i < widths.length; i += 1) {
    sum += Math.abs((widths[i] ?? 0) - (widths[i - 1] ?? 0));
  }
  return sum;
}

function perpendicularDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-10) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** 센트리페탈 Catmull-Rom(`alpha = 0.5`) 스플라인 구간을 `t ∈ [0, 1]`에서 보간한다. */
export function evaluateCentripetalCatmullRom(
  p0: SplineSamplePoint,
  p1: SplineSamplePoint,
  p2: SplineSamplePoint,
  p3: SplineSamplePoint,
  t: number,
): SplineSamplePoint {
  const knotStep = (a: SplineSamplePoint, b: SplineSamplePoint): number => {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.max(1e-4, Math.sqrt(d));
  };
  const t0 = 0;
  const t1 = t0 + knotStep(p0, p1);
  const t2 = t1 + knotStep(p1, p2);
  const t3 = t2 + knotStep(p2, p3);
  const u = t1 + clamp(t, 0, 1) * (t2 - t1);

  const lerpPt = (
    a: SplineSamplePoint,
    b: SplineSamplePoint,
    ta: number,
    tb: number,
    tu: number,
  ): SplineSamplePoint => {
    const denom = Math.max(1e-6, tb - ta);
    const w = (tu - ta) / denom;
    return {
      x: a.x + (b.x - a.x) * w,
      y: a.y + (b.y - a.y) * w,
      widthPx: a.widthPx + (b.widthPx - a.widthPx) * w,
    };
  };

  const a1 = lerpPt(p0, p1, t0, t1, u);
  const a2 = lerpPt(p1, p2, t1, t2, u);
  const a3 = lerpPt(p2, p3, t2, t3, u);
  const b1 = lerpPt(a1, a2, t0, t2, u);
  const b2 = lerpPt(a2, a3, t1, t3, u);
  return lerpPt(b1, b2, t1, t2, u);
}

/**
 * 모폴로지 선폭 안정화 + 곡률·오차 적응형 매듭(Knot) 가지치기로 고밀도 벡터 스트로크를 압축한다.
 */
export function optimizeMorphologicalSplineAsset(
  rawPoints: readonly SplineSamplePoint[],
  tolerancePx = 0.45,
): OptimizedSplineAsset {
  const n = rawPoints.length;
  if (n <= 2) {
    return {
      knots: [...rawPoints],
      originalPointCount: n,
      retainedKnotCount: n,
      compressionRatioPct: 0,
      maxPositionErrorPx: 0,
      widthJitterReductionPct: 0,
    };
  }

  const rawWidths = rawPoints.map((p) => p.widthPx);
  const smoothWidths = morphologicalOpenCloseWidths(rawWidths, 1);
  const beforeJitter = totalWidthJitter(rawWidths);
  const afterJitter = totalWidthJitter(smoothWidths);
  const smoothed: SplineSamplePoint[] = rawPoints.map((p, idx) => ({
    x: p.x,
    y: p.y,
    widthPx: Math.max(0.25, smoothWidths[idx] ?? p.widthPx),
  }));

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];

  while (stack.length > 0) {
    const pair = stack.pop()!;
    const start = pair[0];
    const end = pair[1];
    if (end - start <= 1) continue;

    const a = smoothed[start]!;
    const b = smoothed[end]!;
    let worstIdx = -1;
    let worstErr = 0;

    for (let i = start + 1; i < end; i += 1) {
      const pt = smoothed[i]!;
      const posErr = perpendicularDist(pt.x, pt.y, a.x, a.y, b.x, b.y);
      const frac = (i - start) / (end - start);
      const interpWidth = a.widthPx + (b.widthPx - a.widthPx) * frac;
      const widthErr = Math.abs(pt.widthPx - interpWidth) * 0.5;
      const combinedErr = Math.max(posErr, widthErr);
      if (combinedErr > worstErr) {
        worstErr = combinedErr;
        worstIdx = i;
      }
    }

    if (worstIdx > start && worstErr > tolerancePx) {
      keep[worstIdx] = 1;
      stack.push([start, worstIdx], [worstIdx, end]);
    }
  }

  const keptIndices: number[] = [];
  const knots: SplineSamplePoint[] = [];
  for (let i = 0; i < n; i += 1) {
    if (keep[i] === 1) {
      keptIndices.push(i);
      knots.push(smoothed[i]!);
    }
  }

  // 압축된 Catmull-Rom 스플라인(끝점 반사 유령 제어점 적용)에서 원본 샘플까지의 최소 거리 오차를 실측한다.
  let maxPositionErrorPx = 0;
  for (let seg = 0; seg < knots.length - 1; seg += 1) {
    const i1 = keptIndices[seg] ?? 0;
    const i2 = keptIndices[seg + 1] ?? i1;
    if (i2 - i1 <= 1) continue;
    const k1 = knots[seg]!;
    const k2 = knots[seg + 1]!;
    const k0: SplineSamplePoint =
      seg > 0
        ? knots[seg - 1]!
        : { x: 2 * k1.x - k2.x, y: 2 * k1.y - k2.y, widthPx: k1.widthPx };
    const k3: SplineSamplePoint =
      seg + 2 < knots.length
        ? knots[seg + 2]!
        : { x: 2 * k2.x - k1.x, y: 2 * k2.y - k1.y, widthPx: k2.widthPx };

    const denseSamples: SplineSamplePoint[] = [];
    const steps = Math.max(8, (i2 - i1) * 2);
    for (let s = 0; s <= steps; s += 1) {
      denseSamples.push(evaluateCentripetalCatmullRom(k0, k1, k2, k3, s / steps));
    }

    for (let origIdx = i1 + 1; origIdx < i2; origIdx += 1) {
      const origPt = smoothed[origIdx]!;
      let bestDist = 1e9;
      for (let s = 0; s < denseSamples.length - 1; s += 1) {
        const d0 = denseSamples[s]!;
        const d1 = denseSamples[s + 1]!;
        const d = perpendicularDist(origPt.x, origPt.y, d0.x, d0.y, d1.x, d1.y);
        if (d < bestDist) bestDist = d;
      }
      if (bestDist > maxPositionErrorPx) maxPositionErrorPx = bestDist;
    }
  }

  return {
    knots,
    originalPointCount: n,
    retainedKnotCount: knots.length,
    compressionRatioPct: ((n - knots.length) / n) * 100,
    maxPositionErrorPx,
    widthJitterReductionPct:
      beforeJitter > 1e-6 ? Math.max(0, ((beforeJitter - afterJitter) / beforeJitter) * 100) : 0,
  };
}

/** ₩0 정적 CDN/R2 배포용 콘텐츠 주소 지정 타일 매니페스트를 빌드한다. */
export function buildStaticEdgeTileManifest(params: {
  readonly documentId: string;
  readonly tileSizePx?: number;
  readonly tiles: readonly {
    readonly mipLevel: number;
    readonly tileX: number;
    readonly tileY: number;
    readonly payload: Uint8Array;
  }[];
}): StaticEdgeTileManifest {
  const tileSizePx = Math.max(64, Math.round(params.tileSizePx ?? 256));
  let totalBytes = 0;
  const entries: StaticEdgeTileEntry[] = params.tiles.map((t) => {
    const hash = fnv1aHex(t.payload);
    const tileKey = `${params.documentId}:m${t.mipLevel}:${t.tileX}_${t.tileY}`;
    totalBytes += t.payload.byteLength;
    return {
      tileKey,
      mipLevel: t.mipLevel,
      tileX: t.tileX,
      tileY: t.tileY,
      contentHashHex: hash,
      staticAssetPath: `/assets/tiles/${params.documentId}/m${t.mipLevel}/${t.tileX}_${t.tileY}.${hash}.tile`,
      byteLength: t.payload.byteLength,
    };
  });

  return {
    documentId: params.documentId,
    tileSizePx,
    tiles: entries,
    totalBytes,
    originComputeCostKrw: 0,
  };
}

/** 현재 뷰포트 가시 영역과 스크롤/팬 속도 원뿔(Velocity Cone)을 결합해 정적 타일 프리페치 순서를 계획한다. */
export function planStaticEdgeTilePrefetch(
  manifest: StaticEdgeTileManifest,
  state: ViewportPrefetchState,
): readonly PlannedTilePrefetch[] {
  const lookaheadSec = clamp(state.lookaheadSec ?? 0.35, 0.05, 2.0);
  const maxBytes = Math.max(4096, state.maxPrefetchBytes ?? 4 * 1024 * 1024);
  const maxCount = Math.max(1, state.maxConcurrentFetches ?? 16);
  const resident = state.residentTileKeys;

  const halfW = state.viewportWidth * 0.5;
  const halfH = state.viewportHeight * 0.5;
  const futureCx = state.centerX + state.velocityXPerSec * lookaheadSec;
  const futureCy = state.centerY + state.velocityYPerSec * lookaheadSec;
  const speed = Math.hypot(state.velocityXPerSec, state.velocityYPerSec);

  const candidates: PlannedTilePrefetch[] = [];

  for (const tile of manifest.tiles) {
    if (resident?.has(tile.tileKey)) continue;
    const scale = 1 << tile.mipLevel;
    const worldTileSpan = manifest.tileSizePx * scale;
    const txCenter = (tile.tileX + 0.5) * worldTileSpan;
    const tyCenter = (tile.tileY + 0.5) * worldTileSpan;

    const inCurrentView =
      Math.abs(txCenter - state.centerX) <= halfW + worldTileSpan * 0.5 &&
      Math.abs(tyCenter - state.centerY) <= halfH + worldTileSpan * 0.5;

    const inVelocityView =
      speed > 1 &&
      Math.abs(txCenter - futureCx) <= halfW * 1.15 + worldTileSpan * 0.5 &&
      Math.abs(tyCenter - futureCy) <= halfH * 1.15 + worldTileSpan * 0.5;

    if (tile.mipLevel === state.desiredMipLevel && inCurrentView) {
      const dist = Math.hypot(txCenter - state.centerX, tyCenter - state.centerY);
      candidates.push({
        tile,
        tier: "viewport-visible",
        priorityScore: 1000 - dist / Math.max(1, worldTileSpan),
      });
    } else if (tile.mipLevel === state.desiredMipLevel && inVelocityView) {
      const distFuture = Math.hypot(txCenter - futureCx, tyCenter - futureCy);
      candidates.push({
        tile,
        tier: "velocity-cone",
        priorityScore: 600 - distFuture / Math.max(1, worldTileSpan),
      });
    } else if (tile.mipLevel === state.desiredMipLevel + 1 && (inCurrentView || inVelocityView)) {
      candidates.push({
        tile,
        tier: "coarse-mip-anchor",
        priorityScore: 300 - tile.mipLevel * 10,
      });
    }
  }

  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  const selected: PlannedTilePrefetch[] = [];
  let accBytes = 0;
  for (const item of candidates) {
    if (selected.length >= maxCount) break;
    if (accBytes + item.tile.byteLength > maxBytes && selected.length > 0) continue;
    selected.push(item);
    accBytes += item.tile.byteLength;
  }
  return selected;
}

function distanceToCapsule(px: number, py: number, seg: LineSegmentStroke): number {
  return perpendicularDist(px, py, seg.x0, seg.y0, seg.x1, seg.y1) - seg.halfWidthPx;
}

function minSignedDistance(px: number, py: number, strokes: readonly LineSegmentStroke[]): number {
  let best = 1e9;
  for (let i = 0; i < strokes.length; i += 1) {
    const d = distanceToCapsule(px, py, strokes[i]!);
    if (d < best) best = d;
  }
  return best;
}

/**
 * 4× 회전 격자 슈퍼샘플링(RGSS)과 선택적 5탭 에너지 균형 LCD RGB 서브픽셀 필터링으로
 * 계단 현상과 색 번짐(Color Fringing)을 억제한 초선명 흑백 선화 프리뷰를 렌더링한다.
 */
export function renderSubpixelRgssLineArtPreview(params: {
  readonly width: number;
  readonly height: number;
  readonly strokes: readonly LineSegmentStroke[];
  readonly subpixelMode?: "lcd-rgb" | "rgss-grayscale";
  readonly paperLuma?: number;
  readonly inkLuma?: number;
}): SubpixelLinePreviewResult {
  const width = Math.max(1, Math.round(params.width));
  const height = Math.max(1, Math.round(params.height));
  const mode = params.subpixelMode ?? "lcd-rgb";
  const paper = clamp(Math.round(params.paperLuma ?? 250), 0, 255);
  const ink = clamp(Math.round(params.inkLuma ?? 18), 0, 255);
  const rgba = new Uint8ClampedArray(width * height * 4);

  let inkPixelCount = 0;
  let colorFringeMaxDelta = 0;

  if (mode === "rgss-grayscale") {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let coverage = 0;
        for (let s = 0; s < RGSS_4X_OFFSETS.length; s += 1) {
          const off = RGSS_4X_OFFSETS[s]!;
          const sd = minSignedDistance(x + 0.5 + off[0], y + 0.5 + off[1], params.strokes);
          coverage += clamp(0.5 - sd, 0, 1);
        }
        coverage *= 0.25;
        if (coverage > 0.02) inkPixelCount += 1;
        const luma = Math.round(paper + (ink - paper) * coverage);
        const idx = (y * width + x) * 4;
        rgba[idx] = luma;
        rgba[idx + 1] = luma;
        rgba[idx + 2] = luma;
        rgba[idx + 3] = 255;
      }
    }
  } else {
    // 가로 3배 해상도 서브픽셀 커버리지 배열을 4× 수직/회전 샘플로 구한 뒤 [1, 2, 3, 2, 1]/9 필터를 씌운다.
    const subW = width * 3;
    const subCov = new Float32Array(subW);
    const vOffsets = [-0.375, -0.125, 0.125, 0.375];

    for (let y = 0; y < height; y += 1) {
      for (let sx = 0; sx < subW; sx += 1) {
        const px = (sx + 0.5) / 3;
        let cov = 0;
        for (let v = 0; v < 4; v += 1) {
          const sd = minSignedDistance(px, y + 0.5 + (vOffsets[v] ?? 0), params.strokes);
          cov += clamp(0.5 - sd * 1.15, 0, 1);
        }
        subCov[sx] = cov * 0.25;
      }

      const sampleSub = (idx: number): number => subCov[clamp(idx, 0, subW - 1)] ?? 0;
      for (let x = 0; x < width; x += 1) {
        const base = x * 3;
        const covR =
          (sampleSub(base - 2) +
            2 * sampleSub(base - 1) +
            3 * sampleSub(base) +
            2 * sampleSub(base + 1) +
            sampleSub(base + 2)) /
          9;
        const covG =
          (sampleSub(base - 1) +
            2 * sampleSub(base) +
            3 * sampleSub(base + 1) +
            2 * sampleSub(base + 2) +
            sampleSub(base + 3)) /
          9;
        const covB =
          (sampleSub(base) +
            2 * sampleSub(base + 1) +
            3 * sampleSub(base + 2) +
            2 * sampleSub(base + 3) +
            sampleSub(base + 4)) /
          9;

        if (covR + covG + covB > 0.06) inkPixelCount += 1;
        const r = Math.round(paper + (ink - paper) * covR);
        const g = Math.round(paper + (ink - paper) * covG);
        const b = Math.round(paper + (ink - paper) * covB);
        const fringe = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        if (fringe > colorFringeMaxDelta) colorFringeMaxDelta = fringe;

        const outIdx = (y * width + x) * 4;
        rgba[outIdx] = r;
        rgba[outIdx + 1] = g;
        rgba[outIdx + 2] = b;
        rgba[outIdx + 3] = 255;
      }
    }
  }

  return {
    width,
    height,
    rgba,
    subpixelMode: mode,
    colorFringeMaxDelta,
    inkPixelCount,
  };
}
