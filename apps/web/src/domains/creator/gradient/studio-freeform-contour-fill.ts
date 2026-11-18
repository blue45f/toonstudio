/**
 * Studio Freeform Gradient & Contour Fill — CSP `자유형 그라데이션(Freeform gradient, vars 529~531)` 및
 * `등고선 채우기(Contour fill, ContourFill*)` 순수 수학 엔진.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 *
 * 1) 자유형 그라데이션: 색상이 지정된 시드 점/획으로부터 셰퍼드 역거리 가중(Shepard IDW) 또는
 *    디리클레 경계 조건 라플라스 조화 보간(Harmonic interpolation)으로 마스크 내부를 채운다.
 * 2) 등고선 채우기: Felzenszwalb & Huttenlocher (2012) 정확 O(W×H) 2차원 유클리드 거리 변환(EDT)으로
 *    경계 A(`dA`)와 경계 B(`dB`)까지 거리를 구한 뒤 `dA / (dA + dB)` 비율을 사용자 전이 곡선에 통과시켜 혼합한다.
 */

export type FreeformRgbaTuple = readonly [red: number, green: number, blue: number, alpha: number];

export interface FreeformImageLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export type FreeformColorSeed =
  | {
      readonly kind: "point";
      readonly x: number;
      readonly y: number;
      readonly color: FreeformRgbaTuple;
      readonly weight?: number;
    }
  | {
      readonly kind: "stroke";
      readonly points: readonly { readonly x: number; readonly y: number }[];
      readonly color: FreeformRgbaTuple;
      readonly sampleStepPx?: number;
      readonly weight?: number;
    };

export type FreeformInterpolationMethod = "shepard" | "harmonic";

export interface FreeformGradientRequest {
  readonly width: number;
  readonly height: number;
  readonly seeds: readonly FreeformColorSeed[];
  readonly target?: FreeformImageLike;
  /** 보간을 수행할 활성 영역 마스크(길이 width*height, >0 활성). 생략 시 전체 캔버스. */
  readonly regionMask?: Uint8Array;
  readonly method?: FreeformInterpolationMethod;
  /** Shepard 역거리 지수(기본 2). */
  readonly shepardPower?: number;
  /** Harmonic 모드 Gauss-Seidel/SOR 반복 횟수(기본 36). */
  readonly harmonicIterations?: number;
}

export type ContourTransferCurvePreset = "linear" | "smoothstep" | "ease-in" | "ease-out";

export type ContourTransferCurve =
  | ContourTransferCurvePreset
  | readonly { readonly x: number; readonly y: number }[];

export interface ContourFillRequest {
  readonly width: number;
  readonly height: number;
  /** 경계 A 마스크(>0 이면 A 선/경계 픽셀, 비율 t = 0 → colorA). */
  readonly boundaryAMask: Uint8Array;
  /** 경계 B 마스크(>0 이면 B 선/경계 픽셀, 비율 t = 1 → colorB). */
  readonly boundaryBMask: Uint8Array;
  readonly colorA: FreeformRgbaTuple;
  readonly colorB: FreeformRgbaTuple;
  readonly target?: FreeformImageLike;
  /** 채우기를 적용할 닫힌 영역 마스크(>0 활성). 생략 시 전체 캔버스. */
  readonly regionMask?: Uint8Array;
  /** `dA / (dA + dB)` 값을 재매핑할 전이 곡선. 기본 "linear". */
  readonly transferCurve?: ContourTransferCurve;
}

export interface FreeformContourRenderResult {
  readonly imageData: {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
  };
  readonly paintedPixelCount: number;
}

interface FlattenedSeedPoint {
  readonly x: number;
  readonly y: number;
  readonly color: FreeformRgbaTuple;
  readonly weight: number;
}

const EDT_INF = 1e18;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function clampByte(v: number): number {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

function flattenSeeds(seeds: readonly FreeformColorSeed[]): FlattenedSeedPoint[] {
  const out: FlattenedSeedPoint[] = [];
  for (const seed of seeds) {
    const weight = Math.max(0.01, seed.weight ?? 1);
    if (seed.kind === "point") {
      if (Number.isFinite(seed.x) && Number.isFinite(seed.y)) {
        out.push({ x: seed.x, y: seed.y, color: seed.color, weight });
      }
      continue;
    }
    const pts = seed.points;
    if (pts.length === 0) continue;
    const step = Math.max(1, seed.sampleStepPx ?? 3);
    out.push({ x: pts[0]!.x, y: pts[0]!.y, color: seed.color, weight });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.max(1, Math.ceil(dist / step));
      for (let k = 1; k <= count; k++) {
        const t = k / count;
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          color: seed.color,
          weight,
        });
      }
    }
  }
  return out;
}

function compositeOver(
  outData: Uint8ClampedArray,
  idx: number,
  sr: number,
  sg: number,
  sb: number,
  sa: number,
): void {
  const off = idx * 4;
  const srcA = clamp(sa / 255, 0, 1);
  if (srcA <= 0) return;
  const dstA = outData[off + 3]! / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 1e-6) return;
  outData[off] = clampByte((sr * srcA + outData[off]! * dstA * (1 - srcA)) / outA);
  outData[off + 1] = clampByte((sg * srcA + outData[off + 1]! * dstA * (1 - srcA)) / outA);
  outData[off + 2] = clampByte((sb * srcA + outData[off + 2]! * dstA * (1 - srcA)) / outA);
  outData[off + 3] = clampByte(outA * 255);
}

/**
 * 자유형 그라데이션(`Freeform gradient`) — 시드 점/색선으로부터 Shepard IDW 또는 라플라스 조화 보간을 수행한다.
 */
export function renderFreeformGradient(
  request: FreeformGradientRequest,
): FreeformContourRenderResult {
  const w = Math.max(0, Math.floor(request.width));
  const h = Math.max(0, Math.floor(request.height));
  const total = w * h;
  const outData =
    request.target && request.target.width === w && request.target.height === h
      ? new Uint8ClampedArray(request.target.data)
      : new Uint8ClampedArray(total * 4);

  const flatSeeds = flattenSeeds(request.seeds);
  if (w === 0 || h === 0 || flatSeeds.length === 0) {
    return { imageData: { data: outData, width: w, height: h }, paintedPixelCount: 0 };
  }

  const mask = request.regionMask && request.regionMask.length === total ? request.regionMask : null;
  const method = request.method ?? "shepard";
  const power = clamp(request.shepardPower ?? 2, 0.5, 8);

  // 각 픽셀의 R, G, B, A 부동소수점 필드(Shepard 초기값 계산 후 필요 시 Harmonic 완화)
  const fieldR = new Float32Array(total);
  const fieldG = new Float32Array(total);
  const fieldB = new Float32Array(total);
  const fieldA = new Float32Array(total);
  const pinned = new Uint8Array(total);

  for (let y = 0; y < h; y++) {
    const py = y + 0.5;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask && mask[idx] === 0) continue;
      const px = x + 0.5;

      let wSum = 0;
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;
      let exactColor: FreeformRgbaTuple | null = null;

      for (const s of flatSeeds) {
        const dx = px - s.x;
        const dy = py - s.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 0.25) {
          exactColor = s.color;
          pinned[idx] = 1;
          break;
        }
        const weight = power === 2
          ? s.weight / distSq
          : s.weight / Math.pow(Math.sqrt(distSq), power);
        wSum += weight;
        accR += s.color[0] * weight;
        accG += s.color[1] * weight;
        accB += s.color[2] * weight;
        accA += s.color[3] * weight;
      }

      if (exactColor) {
        fieldR[idx] = exactColor[0];
        fieldG[idx] = exactColor[1];
        fieldB[idx] = exactColor[2];
        fieldA[idx] = exactColor[3];
      } else if (wSum > 0) {
        fieldR[idx] = accR / wSum;
        fieldG[idx] = accG / wSum;
        fieldB[idx] = accB / wSum;
        fieldA[idx] = accA / wSum;
      }
    }
  }

  if (method === "harmonic") {
    // 디리클레 시드 고정점 추가 확보(좌표 반올림 픽셀 고정)
    for (const s of flatSeeds) {
      const sx = Math.floor(s.x);
      const sy = Math.floor(s.y);
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const sIdx = sy * w + sx;
        if (!mask || mask[sIdx]! > 0) {
          pinned[sIdx] = 1;
          fieldR[sIdx] = s.color[0];
          fieldG[sIdx] = s.color[1];
          fieldB[sIdx] = s.color[2];
          fieldA[sIdx] = s.color[3];
        }
      }
    }

    const iters = Math.max(1, Math.min(200, Math.floor(request.harmonicIterations ?? 36)));
    const omega = 1.35; // 과완화(SOR) 가속 계수
    for (let iter = 0; iter < iters; iter++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (pinned[idx] || (mask && mask[idx] === 0)) continue;
          let count = 0;
          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          let sumA = 0;
          if (x > 0 && (!mask || mask[idx - 1]! > 0)) {
            count++; sumR += fieldR[idx - 1]!; sumG += fieldG[idx - 1]!; sumB += fieldB[idx - 1]!; sumA += fieldA[idx - 1]!;
          }
          if (x + 1 < w && (!mask || mask[idx + 1]! > 0)) {
            count++; sumR += fieldR[idx + 1]!; sumG += fieldG[idx + 1]!; sumB += fieldB[idx + 1]!; sumA += fieldA[idx + 1]!;
          }
          if (y > 0 && (!mask || mask[idx - w]! > 0)) {
            count++; sumR += fieldR[idx - w]!; sumG += fieldG[idx - w]!; sumB += fieldB[idx - w]!; sumA += fieldA[idx - w]!;
          }
          if (y + 1 < h && (!mask || mask[idx + w]! > 0)) {
            count++; sumR += fieldR[idx + w]!; sumG += fieldG[idx + w]!; sumB += fieldB[idx + w]!; sumA += fieldA[idx + w]!;
          }
          if (count > 0) {
            fieldR[idx] = fieldR[idx]! + omega * (sumR / count - fieldR[idx]!);
            fieldG[idx] = fieldG[idx]! + omega * (sumG / count - fieldG[idx]!);
            fieldB[idx] = fieldB[idx]! + omega * (sumB / count - fieldB[idx]!);
            fieldA[idx] = fieldA[idx]! + omega * (sumA / count - fieldA[idx]!);
          }
        }
      }
    }
  }

  let paintedPixelCount = 0;
  for (let i = 0; i < total; i++) {
    const maskFactor = mask ? mask[i]! / 255 : 1;
    if (maskFactor <= 0) continue;
    compositeOver(outData, i, fieldR[i]!, fieldG[i]!, fieldB[i]!, fieldA[i]! * maskFactor);
    paintedPixelCount++;
  }

  return {
    imageData: { data: outData, width: w, height: h },
    paintedPixelCount,
  };
}

/**
 * Felzenszwalb & Huttenlocher (2012) 정확 O(W×H) 2차원 유클리드 거리 변환(EDT).
 * `seedMask[i] > 0` 인 모든 시드 픽셀까지의 정확한 유클리드 거리 `Float64Array`를 반환한다.
 */
export function computeExactEuclideanDistanceTransform2D(
  seedMask: Uint8Array,
  width: number,
  height: number,
): Float64Array {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const total = w * h;
  const dist = new Float64Array(total);
  if (w === 0 || h === 0 || seedMask.length < total) return dist;

  const sqDistCol = new Float64Array(total);

  // 1차원 열(수직) 패스: O(W * H)
  const colNearest = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    let lastSeedY = -1e9;
    for (let y = 0; y < h; y++) {
      if (seedMask[y * w + x]! > 0) lastSeedY = y;
      const dy = y - lastSeedY;
      colNearest[y] = lastSeedY < -1e8 ? EDT_INF : dy * dy;
    }
    lastSeedY = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (seedMask[y * w + x]! > 0) lastSeedY = y;
      if (lastSeedY < 1e8) {
        const dy = lastSeedY - y;
        const dSq = dy * dy;
        if (dSq < colNearest[y]!) colNearest[y] = dSq;
      }
      sqDistCol[y * w + x] = colNearest[y]!;
    }
  }

  // 2차원 행(수평) 포물선 하한 포락선(Lower Envelope of Parabolas) 패스: 행당 O(W), 전체 O(W * H)
  const v = new Int32Array(w);
  const z = new Float64Array(w + 1);
  const f = new Float64Array(w);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      f[x] = sqDistCol[rowOffset + x]!;
    }

    let k = 0;
    v[0] = 0;
    z[0] = -EDT_INF;
    z[1] = EDT_INF;

    for (let q = 1; q < w; q++) {
      let s = 0;
      while (k >= 0) {
        const vk = v[k]!;
        s = (f[q]! + q * q - (f[vk]! + vk * vk)) / (2 * (q - vk));
        if (s > z[k]!) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = EDT_INF;
    }

    k = 0;
    for (let q = 0; q < w; q++) {
      while (z[k + 1]! < q) k++;
      const vk = v[k]!;
      const dx = q - vk;
      const dSq = dx * dx + f[vk]!;
      dist[rowOffset + q] = dSq >= EDT_INF * 0.5 ? Number.POSITIVE_INFINITY : Math.sqrt(dSq);
    }
  }

  return dist;
}

/**
 * 등고선 채우기 비율 `t`(0..1)에 사용자 전이 곡선을 적용한다.
 */
export function evaluateContourTransferCurve(
  t: number,
  curve: ContourTransferCurve = "linear",
): number {
  const u = clamp(t, 0, 1);
  if (typeof curve === "string") {
    switch (curve) {
      case "linear":
        return u;
      case "smoothstep":
        return u * u * (3 - 2 * u);
      case "ease-in":
        return u * u;
      case "ease-out":
        return 1 - (1 - u) * (1 - u);
    }
  }
  if (curve.length === 0) return u;
  const sorted = [...curve]
    .map((p) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }))
    .sort((a, b) => a.x - b.x);
  if (u <= sorted[0]!.x) return sorted[0]!.y;
  const last = sorted[sorted.length - 1]!;
  if (u >= last.x) return last.y;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (u <= b.x || i === sorted.length - 2) {
      const span = b.x - a.x;
      const frac = span > 1e-9 ? clamp((u - a.x) / span, 0, 1) : 0;
      return a.y + (b.y - a.y) * frac;
    }
  }
  return last.y;
}

/**
 * 등고선 채우기(`Contour fill`) — 경계 A와 경계 B로부터 정확 2D 유클리드 거리 변환을 계산해
 * `dA / (dA + dB)` 비율로 두 등고선 사이의 색을 매끄럽게 블렌딩한다.
 */
export function renderContourFill(
  request: ContourFillRequest,
): FreeformContourRenderResult {
  const w = Math.max(0, Math.floor(request.width));
  const h = Math.max(0, Math.floor(request.height));
  const total = w * h;
  const outData =
    request.target && request.target.width === w && request.target.height === h
      ? new Uint8ClampedArray(request.target.data)
      : new Uint8ClampedArray(total * 4);

  if (
    w === 0 ||
    h === 0 ||
    request.boundaryAMask.length < total ||
    request.boundaryBMask.length < total
  ) {
    return { imageData: { data: outData, width: w, height: h }, paintedPixelCount: 0 };
  }

  const dA = computeExactEuclideanDistanceTransform2D(request.boundaryAMask, w, h);
  const dB = computeExactEuclideanDistanceTransform2D(request.boundaryBMask, w, h);
  const mask = request.regionMask && request.regionMask.length === total ? request.regionMask : null;
  const curve = request.transferCurve ?? "linear";

  const [ar, ag, ab, aa] = request.colorA;
  const [br, bg, bb, ba] = request.colorB;
  let paintedPixelCount = 0;

  for (let i = 0; i < total; i++) {
    const maskFactor = mask ? mask[i]! / 255 : 1;
    if (maskFactor <= 0) continue;

    const distA = dA[i]!;
    const distB = dB[i]!;
    let rawT = 0.5;
    if (!Number.isFinite(distA) && !Number.isFinite(distB)) {
      continue;
    } else if (!Number.isFinite(distB)) {
      rawT = 0;
    } else if (!Number.isFinite(distA)) {
      rawT = 1;
    } else if (distA + distB > 1e-9) {
      rawT = distA / (distA + distB);
    }

    const t = evaluateContourTransferCurve(rawT, curve);
    const sr = ar + (br - ar) * t;
    const sg = ag + (bg - ag) * t;
    const sb = ab + (bb - ab) * t;
    const sa = (aa + (ba - aa) * t) * maskFactor;
    compositeOver(outData, i, sr, sg, sb, sa);
    paintedPixelCount++;
  }

  return {
    imageData: { data: outData, width: w, height: h },
    paintedPixelCount,
  };
}
