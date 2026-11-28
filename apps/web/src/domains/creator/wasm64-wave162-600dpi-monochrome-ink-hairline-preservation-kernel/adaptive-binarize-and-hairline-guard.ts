/**
 * Wave 162: 600DPI 1비트 펜선 이진화 및 머리카락 선 끊김(Hairline Dropout) 방지 솔버.
 *
 * 1) 비교 기준선용 전역 임계값(고정값 / Otsu 자동 임계값) 이진화
 * 2) 4방향(0°/45°/90°/135°) 어두운 능선 응답 검출기
 * 3) 적분 영상 기반 O(W*H) Sauvola 국소 적응 이진화 + 능선 보존 부스트
 * 4) 평행선 유착 차단 가드가 포함된 접선 정렬 1~2px 끊김 보간기
 * 5) 8연결 고립 먼지 노이즈(1px 섬) 정리기
 */

import type {
  BinaryInkBuffer,
  CollinearGapBridgeOptions,
  CollinearGapBridgeResult,
  DirectionalDarkRidgeMap,
  DirectionalDarkRidgeOptions,
  GlobalThresholdOptions,
  GlobalThresholdResult,
  GrayscaleInkBuffer,
  HairlinePreservationConfig,
  HairlinePreservationResult,
  SpeckleCleanupOptions,
  SpeckleCleanupResult,
} from './monochrome-ink-types';

interface OrientationVector {
  readonly code: 0 | 1 | 2 | 3;
  readonly tx: number;
  readonly ty: number;
  readonly nx: number;
  readonly ny: number;
  readonly fwdCone: readonly (readonly [number, number, number])[];
  readonly bwdCone: readonly (readonly [number, number, number])[];
  readonly isDiagonal: boolean;
}

// 각 콘 항목은 [dx, dy, weight]: 정확 접선(±t)은 1.0, 인접 보조 각도는 0.78 가중치를 적용한다.
const ORIENTATIONS: readonly OrientationVector[] = [
  {
    code: 0,
    tx: 1,
    ty: 0,
    nx: 0,
    ny: 1,
    fwdCone: [[1, -1, 0.78], [1, 0, 1.0], [1, 1, 0.78]],
    bwdCone: [[-1, -1, 0.78], [-1, 0, 1.0], [-1, 1, 0.78]],
    isDiagonal: false,
  },
  {
    code: 1,
    tx: 1,
    ty: 1,
    nx: 1,
    ny: -1,
    fwdCone: [[1, 0, 0.78], [1, 1, 1.0], [0, 1, 0.78]],
    bwdCone: [[-1, 0, 0.78], [-1, -1, 1.0], [0, -1, 0.78]],
    isDiagonal: true,
  },
  {
    code: 2,
    tx: 0,
    ty: 1,
    nx: 1,
    ny: 0,
    fwdCone: [[-1, 1, 0.78], [0, 1, 1.0], [1, 1, 0.78]],
    bwdCone: [[-1, -1, 0.78], [0, -1, 1.0], [1, -1, 0.78]],
    isDiagonal: false,
  },
  {
    code: 3,
    tx: 1,
    ty: -1,
    nx: 1,
    ny: 1,
    fwdCone: [[1, 0, 0.78], [1, -1, 1.0], [0, -1, 0.78]],
    bwdCone: [[-1, 0, 0.78], [-1, 1, 1.0], [0, 1, 0.78]],
    isDiagonal: true,
  },
];

const EIGHT_NEIGHBORS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

export function validateGrayscaleBuffer(buffer: GrayscaleInkBuffer): void {
  if (!Number.isInteger(buffer.width) || buffer.width <= 0) {
    throw new RangeError(`그레이스케일 버퍼 너비가 유효하지 않습니다: ${String(buffer.width)}`);
  }
  if (!Number.isInteger(buffer.height) || buffer.height <= 0) {
    throw new RangeError(`그레이스케일 버퍼 높이가 유효하지 않습니다: ${String(buffer.height)}`);
  }
  if (!Number.isFinite(buffer.dpi) || buffer.dpi <= 0) {
    throw new RangeError(`DPI 값이 유효하지 않습니다: ${String(buffer.dpi)}`);
  }
  const expected = buffer.width * buffer.height;
  if (buffer.pixels.length !== expected) {
    throw new RangeError(
      `그레이스케일 픽셀 길이(${String(buffer.pixels.length)})가 해상도(${String(expected)})와 다릅니다.`,
    );
  }
}

export function validateBinaryBuffer(buffer: BinaryInkBuffer): void {
  if (!Number.isInteger(buffer.width) || buffer.width <= 0) {
    throw new RangeError(`이진 버퍼 너비가 유효하지 않습니다: ${String(buffer.width)}`);
  }
  if (!Number.isInteger(buffer.height) || buffer.height <= 0) {
    throw new RangeError(`이진 버퍼 높이가 유효하지 않습니다: ${String(buffer.height)}`);
  }
  if (!Number.isFinite(buffer.dpi) || buffer.dpi <= 0) {
    throw new RangeError(`DPI 값이 유효하지 않습니다: ${String(buffer.dpi)}`);
  }
  const expected = buffer.width * buffer.height;
  if (buffer.bits.length !== expected) {
    throw new RangeError(
      `이진 버퍼 길이(${String(buffer.bits.length)})가 해상도(${String(expected)})와 다릅니다.`,
    );
  }
}

function clampByte(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 128;
}

function sampleGrayClamped(pixels: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 255;
  return pixels[y * w + x] ?? 255;
}

function readBitSafe(bits: Uint8Array, w: number, h: number, x: number, y: number): 0 | 1 {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  return (bits[y * w + x] ?? 0) !== 0 ? 1 : 0;
}

/** 히스토그램 기반 Otsu 자동 임계값 산출 (단색 원고는 128로 안전 폴백). */
export function computeOtsuThreshold(buffer: GrayscaleInkBuffer): number {
  validateGrayscaleBuffer(buffer);
  const { pixels } = buffer;
  const total = pixels.length;
  const hist = new Uint32Array(256);
  let minVal = 255;
  let maxVal = 0;

  for (let i = 0; i < total; i += 1) {
    const v = pixels[i] ?? 255;
    hist[v] = (hist[v] ?? 0) + 1;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  if (minVal === maxVal) return 128;

  let totalMeanSum = 0;
  for (let t = 0; t < 256; t += 1) totalMeanSum += t * (hist[t] ?? 0);

  let weightBg = 0;
  let sumBg = 0;
  let maxBetweenVar = -1;
  let bestThreshold = 128;

  for (let t = 0; t < 255; t += 1) {
    const count = hist[t] ?? 0;
    weightBg += count;
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;

    sumBg += t * count;
    const diff = sumBg / weightBg - (totalMeanSum - sumBg) / weightFg;
    const betweenVar = weightBg * weightFg * diff * diff;
    if (betweenVar > maxBetweenVar) {
      maxBetweenVar = betweenVar;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

/** 단순 전역 임계값 이진화(고정값 또는 Otsu) — 보존 커널 개선폭 측정을 위한 기준선. */
export function binarizeGlobalThreshold(
  buffer: GrayscaleInkBuffer,
  options: GlobalThresholdOptions = {},
): GlobalThresholdResult {
  validateGrayscaleBuffer(buffer);
  const mode = options.mode ?? 'fixed';
  const thresholdUsed =
    mode === 'otsu' ? computeOtsuThreshold(buffer) : clampByte(options.threshold ?? 128);

  const { width, height, dpi, pixels } = buffer;
  const bits = new Uint8Array(pixels.length);
  let inkPixelCount = 0;

  for (let i = 0; i < pixels.length; i += 1) {
    if ((pixels[i] ?? 255) <= thresholdUsed) {
      bits[i] = 1;
      inkPixelCount += 1;
    }
  }
  return { binary: { width, height, dpi, bits }, thresholdUsed, mode, inkPixelCount };
}

function sampleConeMaxDark(
  pixels: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  cone: readonly (readonly [number, number, number])[],
): number {
  let maxDark = 0;
  for (let k = 0; k < cone.length; k += 1) {
    const off = cone[k];
    if (!off) continue;
    const weighted = (255 - sampleGrayClamped(pixels, w, h, x + off[0], y + off[1])) * off[2];
    if (weighted > maxDark) maxDark = weighted;
  }
  return maxDark;
}

/**
 * 4방향(0°/45°/90°/135°) 2차 어두운 능선 응답 검출기.
 *
 * 안티앨리어싱된 얇은 머리카락 선(밝기 120~210, 배경 255)은 법선 양쪽보다 국소적으로 어둡고
 * 접선 방향으로 연속성을 가진다. 고립 먼지는 접선 지지도가 0이라 억제되며, 평행선 사이의
 * 백색 골짜기는 법선 국소 최소값 조건을 통과하지 못해 0으로 유지된다.
 */
export function computeDirectionalDarkRidgeMap(
  buffer: GrayscaleInkBuffer,
  options: DirectionalDarkRidgeOptions = {},
): DirectionalDarkRidgeMap {
  validateGrayscaleBuffer(buffer);
  const { width, height, pixels } = buffer;
  const minCenterDarkness = options.minCenterDarkness ?? 18;
  const minTangentSupport = options.minTangentSupport ?? 14;
  const localMinTolerance = options.localMinTolerance ?? 4;
  const contrastNorm = Math.max(16, options.contrastNormalization ?? 128);

  const responses = new Float32Array(width * height);
  const orientations = new Uint8Array(width * height);
  orientations.fill(255);
  let peakResponse = 0;
  let activeRidgePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const center = pixels[idx] ?? 255;
      if (255 - center < minCenterDarkness) continue;

      let bestScore = 0;
      let bestOrientation: 0 | 1 | 2 | 3 | 255 = 255;

      for (let d = 0; d < ORIENTATIONS.length; d += 1) {
        const dir = ORIENTATIONS[d];
        if (!dir) continue;

        let immPlus: number;
        let immMinus: number;
        let flankPlus: number;
        let flankMinus: number;

        if (!dir.isDiagonal) {
          const p1 = sampleGrayClamped(pixels, width, height, x + dir.nx, y + dir.ny);
          const p2 = sampleGrayClamped(pixels, width, height, x + dir.nx * 2, y + dir.ny * 2);
          const m1 = sampleGrayClamped(pixels, width, height, x - dir.nx, y - dir.ny);
          const m2 = sampleGrayClamped(pixels, width, height, x - dir.nx * 2, y - dir.ny * 2);
          immPlus = p1;
          immMinus = m1;
          flankPlus = Math.max(p1, p2);
          flankMinus = Math.max(m1, m2);
        } else {
          const pDiag = sampleGrayClamped(pixels, width, height, x + dir.nx, y + dir.ny);
          const pA = sampleGrayClamped(pixels, width, height, x + dir.nx, y);
          const pB = sampleGrayClamped(pixels, width, height, x, y + dir.ny);
          const mDiag = sampleGrayClamped(pixels, width, height, x - dir.nx, y - dir.ny);
          const mA = sampleGrayClamped(pixels, width, height, x - dir.nx, y);
          const mB = sampleGrayClamped(pixels, width, height, x, y - dir.ny);
          immPlus = Math.min(pDiag, pA, pB);
          immMinus = Math.min(mDiag, mA, mB);
          flankPlus = Math.max(pDiag, pA, pB);
          flankMinus = Math.max(mDiag, mA, mB);
        }

        if (center > immPlus + localMinTolerance || center > immMinus + localMinTolerance) {
          continue;
        }
        const normalContrast = Math.min(flankPlus - center, flankMinus - center);
        if (normalContrast <= 0) continue;

        const fwdDark = sampleConeMaxDark(pixels, width, height, x, y, dir.fwdCone);
        const bwdDark = sampleConeMaxDark(pixels, width, height, x, y, dir.bwdCone);
        const tangentSupport = Math.max(
          Math.min(fwdDark, bwdDark),
          0.72 * Math.max(fwdDark, bwdDark),
        );
        if (tangentSupport < minTangentSupport) continue;

        const blended = Math.min(normalContrast, normalContrast * 0.65 + tangentSupport * 0.35);
        const normalized = Math.min(1, blended / contrastNorm);
        if (normalized > bestScore) {
          bestScore = normalized;
          bestOrientation = dir.code;
        }
      }

      if (bestScore > 0) {
        responses[idx] = bestScore;
        orientations[idx] = bestOrientation;
        activeRidgePixels += 1;
        if (bestScore > peakResponse) peakResponse = bestScore;
      }
    }
  }

  return { width, height, responses, orientations, peakResponse, activeRidgePixels };
}

function buildIntegralImages(
  pixels: Uint8Array,
  width: number,
  height: number,
): { readonly sum: Float64Array; readonly sumSq: Float64Array } {
  const stride = width + 1;
  const sum = new Float64Array(stride * (height + 1));
  const sumSq = new Float64Array(stride * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    let rowSumSq = 0;
    const srcRow = (y - 1) * width;
    const dstRow = y * stride;
    const prevRow = (y - 1) * stride;
    for (let x = 1; x <= width; x += 1) {
      const v = pixels[srcRow + (x - 1)] ?? 255;
      rowSum += v;
      rowSumSq += v * v;
      sum[dstRow + x] = (sum[prevRow + x] ?? 0) + rowSum;
      sumSq[dstRow + x] = (sumSq[prevRow + x] ?? 0) + rowSumSq;
    }
  }
  return { sum, sumSq };
}

function queryWindowStats(
  sum: Float64Array,
  sumSq: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): { readonly mean: number; readonly stdDev: number } {
  const stride = width + 1;
  const x0 = Math.max(0, x - radius);
  const y0 = Math.max(0, y - radius);
  const x1 = Math.min(width - 1, x + radius);
  const y1 = Math.min(height - 1, y + radius);
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  const a = y0 * stride + x0;
  const b = y0 * stride + (x1 + 1);
  const c = (y1 + 1) * stride + x0;
  const d = (y1 + 1) * stride + (x1 + 1);

  const total = (sum[d] ?? 0) - (sum[b] ?? 0) - (sum[c] ?? 0) + (sum[a] ?? 0);
  const totalSq = (sumSq[d] ?? 0) - (sumSq[b] ?? 0) - (sumSq[c] ?? 0) + (sumSq[a] ?? 0);
  const mean = total / area;
  return { mean, stdDev: Math.sqrt(Math.max(0, totalSq / area - mean * mean)) };
}

function hasGapNormalClearance(
  bits: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  dir: OrientationVector,
): boolean {
  if (
    readBitSafe(bits, w, h, x + dir.nx, y + dir.ny) === 1 ||
    readBitSafe(bits, w, h, x - dir.nx, y - dir.ny) === 1
  ) {
    return false;
  }
  if (!dir.isDiagonal) return true;
  return (
    readBitSafe(bits, w, h, x + dir.nx, y) === 0 &&
    readBitSafe(bits, w, h, x, y + dir.ny) === 0 &&
    readBitSafe(bits, w, h, x - dir.nx, y) === 0 &&
    readBitSafe(bits, w, h, x, y - dir.ny) === 0
  );
}

function isPerpendicularWallAnchor(
  bits: Uint8Array,
  w: number,
  h: number,
  ax: number,
  ay: number,
  dir: OrientationVector,
): boolean {
  if (
    readBitSafe(bits, w, h, ax + dir.nx, ay + dir.ny) === 1 &&
    readBitSafe(bits, w, h, ax - dir.nx, ay - dir.ny) === 1
  ) {
    return true;
  }
  if (!dir.isDiagonal) return false;
  const pHalf = readBitSafe(bits, w, h, ax + dir.nx, ay) | readBitSafe(bits, w, h, ax, ay + dir.ny);
  const mHalf = readBitSafe(bits, w, h, ax - dir.nx, ay) | readBitSafe(bits, w, h, ax, ay - dir.ny);
  return pHalf === 1 && mHalf === 1;
}

/**
 * 접선 정렬 1~2px 머리카락 끊김 보간기 + 평행선 유착 차단 가드.
 *
 * 양쪽 앵커가 보간 방향(±t)으로 실제 선분 연장선을 가지며 법선 방향 평행 벽면이 아닐 때만
 * 1~2px 끊김을 복구한다. 2~3px 간격 평행 머리카락 가닥 사이는 어떤 방향에서도 유착되지 않는다.
 */
export function bridgeCollinearHairlineGaps(
  binary: BinaryInkBuffer,
  options: CollinearGapBridgeOptions = {},
  sourceGrayscale?: GrayscaleInkBuffer,
): CollinearGapBridgeResult {
  validateBinaryBuffer(binary);
  if (sourceGrayscale !== undefined) validateGrayscaleBuffer(sourceGrayscale);

  const { width, height, dpi, bits } = binary;
  const maxGapPx = options.maxGapPx ?? 2;
  const maxGapPaperGray = options.maxGapPaperGray ?? 255;
  const out = new Uint8Array(bits);
  const bridgeMarks = new Uint8Array(bits.length);
  let bridgedGapCount = 0;
  let rejectedParallelBridgeCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if ((bits[idx] ?? 0) === 1 || (bridgeMarks[idx] ?? 0) === 1) continue;

      for (let d = 0; d < ORIENTATIONS.length; d += 1) {
        const dir = ORIENTATIONS[d];
        if (!dir) continue;
        const prevX = x - dir.tx;
        const prevY = y - dir.ty;
        if (readBitSafe(bits, width, height, prevX, prevY) !== 1) continue;

        let matchedGapLen = 0;
        for (let gapLen = 1; gapLen <= maxGapPx; gapLen += 1) {
          let zeroInside = true;
          for (let s = 0; s < gapLen; s += 1) {
            const gx = x + dir.tx * s;
            const gy = y + dir.ty * s;
            if (gx < 0 || gy < 0 || gx >= width || gy >= height || readBitSafe(bits, width, height, gx, gy) === 1) {
              zeroInside = false;
              break;
            }
          }
          if (!zeroInside) break;
          if (readBitSafe(bits, width, height, x + dir.tx * gapLen, y + dir.ty * gapLen) === 1) {
            matchedGapLen = gapLen;
            break;
          }
        }
        if (matchedGapLen === 0) continue;

        const nextX = x + dir.tx * matchedGapLen;
        const nextY = y + dir.ty * matchedGapLen;
        const hasPrevCont = readBitSafe(bits, width, height, prevX - dir.tx, prevY - dir.ty) === 1;
        const hasNextCont = readBitSafe(bits, width, height, nextX + dir.tx, nextY + dir.ty) === 1;
        const prevWall = isPerpendicularWallAnchor(bits, width, height, prevX, prevY, dir);
        const nextWall = isPerpendicularWallAnchor(bits, width, height, nextX, nextY, dir);

        if (!hasPrevCont || !hasNextCont || prevWall || nextWall) {
          if (prevWall || nextWall) rejectedParallelBridgeCount += 1;
          continue;
        }

        let validGap = true;
        for (let s = 0; s < matchedGapLen; s += 1) {
          const gx = x + dir.tx * s;
          const gy = y + dir.ty * s;
          if (!hasGapNormalClearance(bits, width, height, gx, gy, dir)) {
            validGap = false;
            break;
          }
          if (sourceGrayscale !== undefined && (sourceGrayscale.pixels[gy * width + gx] ?? 255) > maxGapPaperGray) {
            validGap = false;
            break;
          }
        }
        if (!validGap) continue;

        for (let s = 0; s < matchedGapLen; s += 1) {
          const gIdx = (y + dir.ty * s) * width + (x + dir.tx * s);
          bridgeMarks[gIdx] = 1;
          out[gIdx] = 1;
        }
        bridgedGapCount += 1;
        break;
      }
    }
  }

  let bridgedPixelCount = 0;
  for (let i = 0; i < bridgeMarks.length; i += 1) {
    if ((bridgeMarks[i] ?? 0) === 1) bridgedPixelCount += 1;
  }
  return {
    binary: { width, height, dpi, bits: out },
    bridgedPixelCount,
    bridgedGapCount,
    rejectedParallelBridgeCount,
  };
}

/** 8연결 기준 고립 먼지(기본 1px 단독 점) 제거기 — 실제 세선(2px 이상)은 손상 없이 유지. */
export function removeIsolatedInkSpeckles(
  binary: BinaryInkBuffer,
  options: SpeckleCleanupOptions = {},
): SpeckleCleanupResult {
  validateBinaryBuffer(binary);
  const { width, height, dpi, bits } = binary;
  const maxSpeckleAreaPx = Math.max(0, Math.floor(options.maxSpeckleAreaPx ?? 1));
  const out = new Uint8Array(bits);
  if (maxSpeckleAreaPx === 0) {
    return { binary: { width, height, dpi, bits: out }, removedSpeckleCount: 0, removedPixelCount: 0 };
  }

  const visited = new Uint8Array(bits.length);
  const queue = new Int32Array(bits.length);
  const memberBuf = new Int32Array(maxSpeckleAreaPx + 2);
  let removedSpeckleCount = 0;
  let removedPixelCount = 0;

  for (let start = 0; start < bits.length; start += 1) {
    if ((bits[start] ?? 0) === 0 || (visited[start] ?? 0) === 1) continue;
    visited[start] = 1;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;

    let area = 0;
    while (head < tail) {
      const cur = queue[head] ?? 0;
      head += 1;
      if (area < memberBuf.length) memberBuf[area] = cur;
      area += 1;
      const cx = cur % width;
      const cy = (cur - cx) / width;

      for (let k = 0; k < EIGHT_NEIGHBORS.length; k += 1) {
        const off = EIGHT_NEIGHBORS[k];
        if (!off) continue;
        const nx = cx + off[0];
        const ny = cy + off[1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if ((bits[nIdx] ?? 0) === 1 && (visited[nIdx] ?? 0) === 0) {
          visited[nIdx] = 1;
          queue[tail] = nIdx;
          tail += 1;
        }
      }
    }

    if (area <= maxSpeckleAreaPx) {
      for (let i = 0; i < area; i += 1) out[memberBuf[i] ?? 0] = 0;
      removedSpeckleCount += 1;
      removedPixelCount += area;
    }
  }

  return { binary: { width, height, dpi, bits: out }, removedSpeckleCount, removedPixelCount };
}

/**
 * 구조 보존형 600DPI 1비트 흑백 펜선 이진화 파이프라인.
 *
 * 4방향 능선 응답 -> Sauvola 국소 적응 임계값 + 능선 보존 부스트 -> 접선 정렬 1~2px 끊김 보간 -> 고립 먼지 정리.
 */
export function binarizeWithHairlinePreservation(
  buffer: GrayscaleInkBuffer,
  config: HairlinePreservationConfig = {},
): HairlinePreservationResult {
  validateGrayscaleBuffer(buffer);
  const { width, height, dpi, pixels } = buffer;
  const baseThreshold = clampByte(config.baseThreshold ?? 128);
  const solidInkFloor = clampByte(config.solidInkFloor ?? 96);
  const paperWhiteCeiling = clampByte(config.paperWhiteCeiling ?? 232);
  const windowRadius = Math.max(1, Math.floor(config.sauvolaWindowRadius ?? 7));
  const sauvolaK = config.sauvolaK ?? 0.22;
  const sauvolaR = Math.max(16, config.sauvolaDynamicRange ?? 128);
  const ridgeMinResponse = config.ridgeMinResponse ?? 0.2;
  const ridgeBoostStrength = config.ridgeBoostStrength ?? 520;

  const ridgeMap = computeDirectionalDarkRidgeMap(buffer, config.ridgeOptions);
  const { sum, sumSq } = buildIntegralImages(pixels, width, height);
  const rawBits = new Uint8Array(pixels.length);
  let ridgePromotedPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const gray = pixels[idx] ?? 255;
      if (gray >= paperWhiteCeiling) continue;
      if (gray <= solidInkFloor) {
        rawBits[idx] = 1;
        continue;
      }

      const { mean, stdDev } = queryWindowStats(sum, sumSq, width, height, x, y, windowRadius);
      const sauvolaRaw = mean * (1 + sauvolaK * (stdDev / sauvolaR - 1));
      const sauvolaClamped = Math.max(solidInkFloor, Math.min(baseThreshold + 24, sauvolaRaw));
      const ridge = ridgeMap.responses[idx] ?? 0;

      if (gray <= sauvolaClamped) {
        rawBits[idx] = 1;
      } else if (ridge >= ridgeMinResponse) {
        const boostedThreshold = Math.min(
          paperWhiteCeiling - 1,
          Math.max(sauvolaClamped, baseThreshold) + ridge * ridgeBoostStrength,
        );
        if (gray <= boostedThreshold) {
          rawBits[idx] = 1;
          ridgePromotedPixelCount += 1;
        }
      }
    }
  }

  const bridged = bridgeCollinearHairlineGaps(
    { width, height, dpi, bits: rawBits },
    { maxGapPx: config.maxGapBridgePx ?? 2 },
    buffer,
  );
  const cleaned = removeIsolatedInkSpeckles(bridged.binary, {
    maxSpeckleAreaPx: config.maxSpeckleAreaPx ?? 1,
  });

  let inkPixelCount = 0;
  for (let i = 0; i < cleaned.binary.bits.length; i += 1) {
    if ((cleaned.binary.bits[i] ?? 0) === 1) inkPixelCount += 1;
  }

  return {
    binary: cleaned.binary,
    ridgeMap,
    ridgePromotedPixelCount,
    bridgedPixelCount: bridged.bridgedPixelCount,
    bridgedGapCount: bridged.bridgedGapCount,
    rejectedParallelBridgeCount: bridged.rejectedParallelBridgeCount,
    removedSpeckleCount: cleaned.removedSpeckleCount,
    removedSpecklePixelCount: cleaned.removedPixelCount,
    inkPixelCount,
  };
}
