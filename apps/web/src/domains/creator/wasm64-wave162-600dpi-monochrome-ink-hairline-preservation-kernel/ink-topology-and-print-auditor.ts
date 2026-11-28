/**
 * Wave 162: 1비트 흑백 펜선 위상 감사(8연결 컴포넌트·물리 선폭 mm·끊김/유착 검출) 및
 * 순수 ES2017 동기식 FIPS 180-4 SHA-256 지문 산출기.
 */

import {
  computeDirectionalDarkRidgeMap,
  validateBinaryBuffer,
  validateGrayscaleBuffer,
} from './adaptive-binarize-and-hairline-guard';
import {
  resolvePrintMonochromeProfile,
  type BinaryInkBuffer,
  type BinaryInkComponent,
  type BinaryInkComponentAnalysis,
  type BinaryInkQualityAuditOptions,
  type BinaryInkTopologyAudit,
  type DirectionalDarkRidgeMap,
  type GrayscaleInkBuffer,
  type InkBinarizationComparison,
  type MonochromeInkAuditStatus,
  type PrintMonochromeProfileId,
} from './monochrome-ink-types';

const EIGHT_NEIGHBORS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

const FOUR_AXES: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 0, 1],
  [1, 1, 1, -1],
  [0, 1, 1, 0],
  [1, -1, 1, 1],
];

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function readBit(bits: Uint8Array, w: number, h: number, x: number, y: number): 0 | 1 {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  return (bits[y * w + x] ?? 0) !== 0 ? 1 : 0;
}

function readGray(pixels: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 255;
  return pixels[y * w + x] ?? 255;
}

function countAxisRun(
  bits: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  limit = 64,
): number {
  let run = 1;
  for (let s = 1; s < limit && readBit(bits, w, h, x + dx * s, y + dy * s) === 1; s += 1) run += 1;
  for (let s = 1; s < limit && readBit(bits, w, h, x - dx * s, y - dy * s) === 1; s += 1) run += 1;
  return run;
}

/** 픽셀 단위 국소 선폭(px) 추정 — 직선/대각선 모두 1px 프린터 최소 도트 하한을 준수한다. */
export function estimateLocalStrokeWidthPx(
  bits: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (readBit(bits, width, height, x, y) === 0) return 0;
  const runH = countAxisRun(bits, width, height, x, y, 1, 0);
  const runV = countAxisRun(bits, width, height, x, y, 0, 1);
  const runD1 = countAxisRun(bits, width, height, x, y, 1, 1);
  const runD2 = countAxisRun(bits, width, height, x, y, 1, -1);

  if (Math.max(runD1, runD2) > Math.max(runH, runV) * 1.35 && runH >= 2 && runV >= 2) {
    return Math.max(1, 1 / Math.hypot(1 / runH, 1 / runV));
  }
  return Math.max(1, Math.min(runH, runV));
}

/** 픽셀 폭을 인쇄 DPI 기준 물리 밀리미터(mm)로 환산한다. */
export function pixelsToMillimeters(pixels: number, dpi: number): number {
  if (!Number.isFinite(pixels) || !Number.isFinite(dpi) || dpi <= 0 || pixels <= 0) return 0;
  return (pixels * 25.4) / dpi;
}

/** 8연결 컴포넌트 분석 — 선분 수, 끝점 수, 고립 먼지, 국소 선폭을 계측한다. */
export function analyzeBinaryInkComponents(
  binary: BinaryInkBuffer,
  maxSpeckleAreaPx = 1,
): BinaryInkComponentAnalysis {
  validateBinaryBuffer(binary);
  const { width, height, bits } = binary;
  const total = bits.length;
  const labels = new Int32Array(total);
  const queue = new Int32Array(total);
  const components: BinaryInkComponent[] = [];
  let nextId = 0;
  let totalInkPixels = 0;

  for (let start = 0; start < total; start += 1) {
    if ((bits[start] ?? 0) === 0 || (labels[start] ?? 0) !== 0) continue;
    nextId += 1;
    labels[start] = nextId;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;

    let pixelCount = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let endpointCount = 0;
    let minLocalWidthPx = Number.POSITIVE_INFINITY;
    let sumLocalWidthPx = 0;

    while (head < tail) {
      const cur = queue[head] ?? 0;
      head += 1;
      const cx = cur % width;
      const cy = (cur - cx) / width;

      pixelCount += 1;
      totalInkPixels += 1;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      sumX += cx;
      sumY += cy;

      let neighborInkCount = 0;
      for (let k = 0; k < EIGHT_NEIGHBORS.length; k += 1) {
        const off = EIGHT_NEIGHBORS[k];
        if (!off) continue;
        const nx = cx + off[0];
        const ny = cy + off[1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if ((bits[nIdx] ?? 0) !== 0) {
          neighborInkCount += 1;
          if ((labels[nIdx] ?? 0) === 0) {
            labels[nIdx] = nextId;
            queue[tail] = nIdx;
            tail += 1;
          }
        }
      }
      if (neighborInkCount <= 1) endpointCount += 1;

      const localWidth = estimateLocalStrokeWidthPx(bits, width, height, cx, cy);
      if (localWidth < minLocalWidthPx) minLocalWidthPx = localWidth;
      sumLocalWidthPx += localWidth;
    }

    const meanLocalWidthPx = pixelCount > 0 ? sumLocalWidthPx / pixelCount : 0;
    const isSpeckle = pixelCount <= maxSpeckleAreaPx;
    components.push({
      id: nextId,
      pixelCount,
      bounds: { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
      centroidX: sumX / pixelCount,
      centroidY: sumY / pixelCount,
      endpointCount,
      minLocalWidthPx: Number.isFinite(minLocalWidthPx) ? minLocalWidthPx : 0,
      meanLocalWidthPx,
      isSpeckle,
      isHairlineLike: !isSpeckle && pixelCount >= 3 && meanLocalWidthPx <= 2.1,
    });
  }

  return { width, height, labels, componentCount: components.length, totalInkPixels, components };
}

function countMaskComponents(mask: Uint8Array, width: number, height: number): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let count = 0;

  for (let i = 0; i < mask.length; i += 1) {
    if ((mask[i] ?? 0) === 0 || (visited[i] ?? 0) !== 0) continue;
    count += 1;
    visited[i] = 1;
    let head = 0;
    let tail = 0;
    queue[tail] = i;
    tail += 1;

    while (head < tail) {
      const cur = queue[head] ?? 0;
      head += 1;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let k = 0; k < EIGHT_NEIGHBORS.length; k += 1) {
        const off = EIGHT_NEIGHBORS[k];
        if (!off) continue;
        const nx = cx + off[0];
        const ny = cy + off[1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if ((mask[nIdx] ?? 0) !== 0 && (visited[nIdx] ?? 0) === 0) {
          visited[nIdx] = 1;
          queue[tail] = nIdx;
          tail += 1;
        }
      }
    }
  }
  return count;
}

function countBinaryCollinearBreaks(binary: BinaryInkBuffer): number {
  const { width, height, bits } = binary;
  const breakMask = new Uint8Array(bits.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if ((bits[idx] ?? 0) !== 0 || (breakMask[idx] ?? 0) !== 0) continue;

      for (let a = 0; a < FOUR_AXES.length; a += 1) {
        const axis = FOUR_AXES[a];
        if (!axis) continue;
        const [tx, ty, nx, ny] = axis;
        if (readBit(bits, width, height, x - tx, y - ty) !== 1) continue;
        if (readBit(bits, width, height, x - tx * 2, y - ty * 2) !== 1) continue;

        let matchedLen = 0;
        for (let gapLen = 1; gapLen <= 2; gapLen += 1) {
          let zeroInside = true;
          for (let s = 0; s < gapLen; s += 1) {
            if (readBit(bits, width, height, x + tx * s, y + ty * s) === 1) {
              zeroInside = false;
              break;
            }
          }
          if (!zeroInside) break;
          if (
            readBit(bits, width, height, x + tx * gapLen, y + ty * gapLen) === 1 &&
            readBit(bits, width, height, x + tx * (gapLen + 1), y + ty * (gapLen + 1)) === 1
          ) {
            matchedLen = gapLen;
            break;
          }
        }
        if (matchedLen === 0) continue;

        const prevWall =
          readBit(bits, width, height, x - tx + nx, y - ty + ny) === 1 &&
          readBit(bits, width, height, x - tx - nx, y - ty - ny) === 1;
        const nextWall =
          readBit(bits, width, height, x + tx * matchedLen + nx, y + ty * matchedLen + ny) === 1 &&
          readBit(bits, width, height, x + tx * matchedLen - nx, y + ty * matchedLen - ny) === 1;
        if (prevWall || nextWall) continue;

        let clear = true;
        for (let s = 0; s < matchedLen; s += 1) {
          if (
            readBit(bits, width, height, x + tx * s + nx, y + ty * s + ny) === 1 ||
            readBit(bits, width, height, x + tx * s - nx, y + ty * s - ny) === 1
          ) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;

        for (let s = 0; s < matchedLen; s += 1) breakMask[(y + ty * s) * width + (x + tx * s)] = 1;
        break;
      }
    }
  }
  return countMaskComponents(breakMask, width, height);
}

function countDroppedSourceRidges(
  binary: BinaryInkBuffer,
  ridgeMap: DirectionalDarkRidgeMap,
): { readonly droppedPixels: number; readonly droppedSegments: number } {
  const { width, height, bits } = binary;
  const droppedMask = new Uint8Array(bits.length);
  let droppedPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if ((ridgeMap.responses[idx] ?? 0) < 0.24 || (bits[idx] ?? 0) === 1) continue;

      let hasAdjacentInk = false;
      for (let k = 0; k < EIGHT_NEIGHBORS.length; k += 1) {
        const off = EIGHT_NEIGHBORS[k];
        if (off && readBit(bits, width, height, x + off[0], y + off[1]) === 1) {
          hasAdjacentInk = true;
          break;
        }
      }
      if (!hasAdjacentInk) {
        droppedMask[idx] = 1;
        droppedPixels += 1;
      }
    }
  }
  return { droppedPixels, droppedSegments: countMaskComponents(droppedMask, width, height) };
}

function countFusedParallelStrands(
  binary: BinaryInkBuffer,
  sourceGrayscale?: GrayscaleInkBuffer,
): number {
  if (sourceGrayscale === undefined) return 0;
  const { width, height, bits } = binary;
  const { pixels } = sourceGrayscale;
  const fusedMask = new Uint8Array(bits.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if ((bits[idx] ?? 0) === 0) continue;
      const centerGray = pixels[idx] ?? 255;
      if (centerGray < 220) continue;

      for (let a = 0; a < FOUR_AXES.length; a += 1) {
        const axis = FOUR_AXES[a];
        if (!axis) continue;
        const [dx, dy, wx, wy] = axis;
        let sideA = -1;
        let sideB = -1;

        for (let r = 1; r <= 3; r += 1) {
          if (sideA < 0 && centerGray - readGray(pixels, width, height, x + dx * r, y + dy * r) >= 35) {
            const w1 = readGray(pixels, width, height, x + dx * r + wx, y + dy * r + wy);
            const w2 = readGray(pixels, width, height, x + dx * r - wx, y + dy * r - wy);
            if (centerGray - w1 >= 25 && centerGray - w2 >= 25) sideA = r;
          }
          if (sideB < 0 && centerGray - readGray(pixels, width, height, x - dx * r, y - dy * r) >= 35) {
            const w1 = readGray(pixels, width, height, x - dx * r + wx, y - dy * r + wy);
            const w2 = readGray(pixels, width, height, x - dx * r - wx, y - dy * r - wy);
            if (centerGray - w1 >= 25 && centerGray - w2 >= 25) sideB = r;
          }
        }
        if (sideA > 0 && sideB > 0) {
          fusedMask[idx] = 1;
          break;
        }
      }
    }
  }
  return countMaskComponents(fusedMask, width, height);
}

function hasDarkSourceInk(buffer: GrayscaleInkBuffer): boolean {
  for (let i = 0; i < buffer.pixels.length; i += 1) {
    if ((buffer.pixels[i] ?? 255) <= 210) return true;
  }
  return false;
}

/** 1비트 흑백 펜선 품질 및 제판 물리 선폭 감사. */
export function auditBinaryInkQuality(
  binary: BinaryInkBuffer,
  options: BinaryInkQualityAuditOptions = {},
): BinaryInkTopologyAudit {
  validateBinaryBuffer(binary);
  if (options.sourceGrayscale !== undefined) validateGrayscaleBuffer(options.sourceGrayscale);

  const profile = resolvePrintMonochromeProfile(options.profileId, binary.dpi);
  const minSafeStrokeWidthMm = options.minSafeStrokeWidthMm ?? profile.minSafeStrokeWidthMm;
  const maxSpeckleAreaPx = options.maxSpeckleAreaPx ?? profile.maxSpeckleAreaPx;
  const compAnalysis = analyzeBinaryInkComponents(binary, maxSpeckleAreaPx);

  let speckleCount = 0;
  let nonSpeckleComponents = 0;
  for (let i = 0; i < compAnalysis.components.length; i += 1) {
    const comp = compAnalysis.components[i];
    if (!comp) continue;
    if (comp.isSpeckle) speckleCount += 1;
    else nonSpeckleComponents += 1;
  }

  const { width, height, dpi, bits } = binary;
  const skipSpeckles = nonSpeckleComponents > 0;
  let minStrokeWidthPx = Number.POSITIVE_INFINITY;
  let sumStrokeWidthPx = 0;
  let measuredPixels = 0;
  let subThresholdInkPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if ((bits[idx] ?? 0) === 0) continue;
      const comp = compAnalysis.components[(compAnalysis.labels[idx] ?? 0) - 1];
      if (skipSpeckles && comp !== undefined && comp.isSpeckle) continue;
      const wPx = estimateLocalStrokeWidthPx(bits, width, height, x, y);
      if (wPx < minStrokeWidthPx) minStrokeWidthPx = wPx;
      sumStrokeWidthPx += wPx;
      measuredPixels += 1;
      if (pixelsToMillimeters(wPx, dpi) < minSafeStrokeWidthMm) subThresholdInkPixelCount += 1;
    }
  }

  const safeMinPx = measuredPixels > 0 && Number.isFinite(minStrokeWidthPx) ? minStrokeWidthPx : 0;
  const meanStrokeWidthPx = measuredPixels > 0 ? sumStrokeWidthPx / measuredPixels : 0;
  const minPhysicalWidthMm = pixelsToMillimeters(safeMinPx, dpi);
  const belowPrintMinimum = measuredPixels > 0 && minPhysicalWidthMm < minSafeStrokeWidthMm;

  const binaryBreakCount = countBinaryCollinearBreaks(binary);
  const ridgeMap =
    options.ridgeMap ??
    (options.sourceGrayscale !== undefined
      ? computeDirectionalDarkRidgeMap(options.sourceGrayscale)
      : undefined);
  const dropped =
    ridgeMap !== undefined
      ? countDroppedSourceRidges(binary, ridgeMap)
      : { droppedPixels: 0, droppedSegments: 0 };
  const hairlineDropoutCount = binaryBreakCount + dropped.droppedSegments;
  const fusedParallelStrandCount = countFusedParallelStrands(binary, options.sourceGrayscale);

  const warningsKo: string[] = [];
  if (fusedParallelStrandCount > 0) {
    warningsKo.push(`인접 평행 펜선 유착 ${String(fusedParallelStrandCount)}건 감지 — 백색 간격 보전 필요`);
  }
  if (hairlineDropoutCount > 0) {
    warningsKo.push(
      `머리카락 세선 끊김·유실 ${String(hairlineDropoutCount)}건 감지 (유실 능선 ${String(dropped.droppedPixels)}px)`,
    );
  }
  if (belowPrintMinimum) {
    warningsKo.push(
      `최소 물리 선폭 ${minPhysicalWidthMm.toFixed(3)}mm가 인쇄 기준 하한(${minSafeStrokeWidthMm.toFixed(3)}mm) 미만입니다.`,
    );
  }
  if (speckleCount > 0) {
    warningsKo.push(`고립 1px 먼지 노이즈 ${String(speckleCount)}개 잔존`);
  }

  const activeRidges = ridgeMap?.activeRidgePixels ?? 0;
  const droppedRatio = activeRidges > 0 ? dropped.droppedPixels / activeRidges : 0;
  const lostAllInk =
    options.sourceGrayscale !== undefined &&
    compAnalysis.totalInkPixels === 0 &&
    (activeRidges > 0 || hasDarkSourceInk(options.sourceGrayscale));

  let status: MonochromeInkAuditStatus = 'PASS';
  if (fusedParallelStrandCount > 0 || lostAllInk || (hairlineDropoutCount > 0 && droppedRatio > 0.25)) {
    status = 'FAIL';
  } else if (hairlineDropoutCount > 0 || belowPrintMinimum || speckleCount > 0) {
    status = 'WARN';
  }

  return {
    status,
    dpi,
    profileId: profile.id,
    totalInkPixels: compAnalysis.totalInkPixels,
    connectedComponents: compAnalysis.componentCount,
    nonSpeckleComponents,
    speckleCount,
    hairlineDropoutCount,
    binaryBreakCount,
    droppedRidgePixelCount: dropped.droppedPixels,
    fusedParallelStrandCount,
    minStrokeWidthPx: safeMinPx,
    meanStrokeWidthPx,
    minPhysicalWidthMm,
    minStrokeWidthMm: minPhysicalWidthMm,
    minSafeStrokeWidthMm,
    subThresholdInkPixelCount,
    belowPrintMinimum,
    warningsKo,
  };
}

function computeContinuityScore(audit: BinaryInkTopologyAudit, activeRidges: number): number {
  if (audit.totalInkPixels === 0 && activeRidges > 0) return 0;
  let score = 100;
  if (activeRidges > 0) score -= Math.min(1, audit.droppedRidgePixelCount / activeRidges) * 65;
  score -= Math.min(35, audit.binaryBreakCount * 12);
  score -= Math.min(40, audit.fusedParallelStrandCount * 25);
  score -= Math.min(10, audit.speckleCount * 2);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/** 기준선(전역 임계값) 대비 머리카락 보존 커널 이진화 결과의 정량 개선폭을 비교한다. */
export function compareInkBinarizationResults(
  baseline: BinaryInkBuffer,
  preserved: BinaryInkBuffer,
  options: BinaryInkQualityAuditOptions = {},
): InkBinarizationComparison {
  const sharedRidgeMap =
    options.ridgeMap ??
    (options.sourceGrayscale !== undefined
      ? computeDirectionalDarkRidgeMap(options.sourceGrayscale)
      : undefined);
  const auditOpts: BinaryInkQualityAuditOptions = { ...options, ridgeMap: sharedRidgeMap };
  const baselineAudit = auditBinaryInkQuality(baseline, auditOpts);
  const preservedAudit = auditBinaryInkQuality(preserved, auditOpts);
  const activeRidges = sharedRidgeMap?.activeRidgePixels ?? 0;

  const dropoutsEliminated = Math.max(0, baselineAudit.hairlineDropoutCount - preservedAudit.hairlineDropoutCount);
  const fragmentationReduction = Math.max(0, baselineAudit.nonSpeckleComponents - preservedAudit.nonSpeckleComponents);
  const recoveredInkPixels = Math.max(0, preservedAudit.totalInkPixels - baselineAudit.totalInkPixels);
  const specklesRemoved = Math.max(0, baselineAudit.speckleCount - preservedAudit.speckleCount);
  const parallelStrandsPreserved = preservedAudit.fusedParallelStrandCount === 0;
  const dropoutRecovered =
    parallelStrandsPreserved &&
    (dropoutsEliminated > 0 ||
      (baselineAudit.totalInkPixels === 0 && preservedAudit.totalInkPixels > 0) ||
      baselineAudit.droppedRidgePixelCount > preservedAudit.droppedRidgePixelCount);

  return {
    baselineAudit,
    preservedAudit,
    baselineInkPixels: baselineAudit.totalInkPixels,
    preservedInkPixels: preservedAudit.totalInkPixels,
    recoveredInkPixels,
    baselineConnectedComponents: baselineAudit.connectedComponents,
    preservedConnectedComponents: preservedAudit.connectedComponents,
    fragmentationReduction,
    baselineDropoutCount: baselineAudit.hairlineDropoutCount,
    preservedDropoutCount: preservedAudit.hairlineDropoutCount,
    dropoutsEliminated,
    dropoutRecovered,
    parallelStrandsPreserved,
    specklesRemoved,
    continuityScoreBefore: computeContinuityScore(baselineAudit, activeRidges),
    continuityScoreAfter: computeContinuityScore(preservedAudit, activeRidges),
  };
}

function encodeUtf8Bytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let cp = input.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function rotr32(value: number, shift: number): number {
  return ((value >>> shift) | (value << (32 - shift))) >>> 0;
}

/** 순수 ES2017 동기식 FIPS 180-4 SHA-256 64자리 16진수 해시. */
export function sha256InkHex(input: string | Uint8Array): string {
  const data = typeof input === 'string' ? encodeUtf8Bytes(input) : input;
  const byteLen = data.length;
  const paddedLen = Math.ceil((byteLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[byteLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(byteLen / 0x20000000) >>> 0, false);
  view.setUint32(paddedLen - 4, (byteLen << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, '0')).join('');
}

/** 1비트 또는 그레이스케일 잉크 버퍼의 결정론적 인쇄 판하 무결성 지문(SHA-256). */
export function computeInkManifestFingerprint(
  buffer: BinaryInkBuffer | GrayscaleInkBuffer,
  profileId: PrintMonochromeProfileId,
  metadataTag = 'wave162-v1',
): string {
  const isBinary = 'bits' in buffer;
  const payload = isBinary ? buffer.bits : buffer.pixels;
  const header = `toonstudio:${metadataTag}:${profileId}:${isBinary ? '1bit' : 'gray8'}:${String(buffer.width)}x${String(buffer.height)}@${String(buffer.dpi)}:`;
  const headerBytes = encodeUtf8Bytes(header);
  const combined = new Uint8Array(headerBytes.length + payload.length);
  combined.set(headerBytes, 0);
  combined.set(payload, headerBytes.length);
  return sha256InkHex(combined);
}
