/**
 * 웹툰 채색·마감 자동 검수용 미채색 구멍(Pinhole) · 선화 삐져나옴(Color-Bleed) 로컬 픽셀 스캐너.
 *
 * 1. 선화 폐곡선 내부에서 알파가 비었거나 순백색(L > 0.97)인 1~24px 미만 연결요소(미채색 구멍) 검출 및 Auto-Seal
 * 2. 선화 바깥 배경 영역으로 1~8px 삐져나온 비투명 밑색 픽셀 클러스터(선화 삐져나옴) 검출 및 Auto-Trim
 */

export type PixelDefectKind = "pinhole" | "color-bleed";
export type PinholeFillReason = "transparent" | "pure-white" | "mixed";

export interface PixelBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface AutoRedlinePinPayload {
  readonly id: string;
  readonly defectKind: PixelDefectKind;
  readonly xPx: number;
  readonly yPx: number;
  readonly radiusPx: number;
  readonly pixelCount: number;
  readonly label: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly stage: "coloring";
  readonly severity: "high" | "medium";
}

export interface PinholeDefect {
  readonly id: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly pixelCount: number;
  readonly bounds: PixelBoundingBox;
  readonly pixelIndices: readonly number[];
  readonly reason: PinholeFillReason;
  readonly redlinePin: AutoRedlinePinPayload;
}

export interface ColorBleedDefect {
  readonly id: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly pixelCount: number;
  readonly protrusionPx: number;
  readonly bounds: PixelBoundingBox;
  readonly pixelIndices: readonly number[];
  readonly dominantRgba: readonly [number, number, number, number];
  readonly redlinePin: AutoRedlinePinPayload;
}

export interface PinholeBleedScanOptions {
  readonly lineartAlphaThreshold?: number;
  readonly lineartMaxLuminance?: number;
  readonly flatAlphaThreshold?: number;
  readonly pureWhiteLuminanceThreshold?: number;
  readonly minPinholePixels?: number;
  /** 미채색 구멍 최대 픽셀 수 미만 상한 (기본: 24 → 1~23px) */
  readonly maxPinholePixels?: number;
  readonly minBleedDistancePx?: number;
  readonly maxBleedDistancePx?: number;
  readonly maxBleedContactGapPx?: number;
}

export interface ResolvedPinholeBleedScanOptions {
  readonly lineartAlphaThreshold: number;
  readonly lineartMaxLuminance: number;
  readonly flatAlphaThreshold: number;
  readonly pureWhiteLuminanceThreshold: number;
  readonly minPinholePixels: number;
  readonly maxPinholePixels: number;
  readonly minBleedDistancePx: number;
  readonly maxBleedDistancePx: number;
  readonly maxBleedContactGapPx: number;
}

export interface PinholeBleedScanResult {
  readonly width: number;
  readonly height: number;
  readonly options: ResolvedPinholeBleedScanOptions;
  readonly lineartPixelCount: number;
  readonly interiorPixelCount: number;
  readonly pinholes: readonly PinholeDefect[];
  readonly colorBleeds: readonly ColorBleedDefect[];
  readonly totalPinholePixels: number;
  readonly totalBleedPixels: number;
  readonly totalDefectCount: number;
  readonly redlinePins: readonly AutoRedlinePinPayload[];
  readonly elapsedMs: number;
}

export interface AutoSealTrimResult {
  readonly rgba: Uint8ClampedArray;
  readonly sealedPinholeCount: number;
  readonly sealedPixelCount: number;
  readonly trimmedBleedCount: number;
  readonly trimmedPixelCount: number;
  readonly modifiedPixelCount: number;
  readonly unresolvedPinholeCount: number;
}

export interface DemoCutPixelBuffers {
  readonly width: number;
  readonly height: number;
  readonly lineartRgba: Uint8ClampedArray;
  readonly flatRgba: Uint8ClampedArray;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

const DEFAULT_SCAN_OPTIONS: ResolvedPinholeBleedScanOptions = Object.freeze({
  lineartAlphaThreshold: 96,
  lineartMaxLuminance: 0.78,
  flatAlphaThreshold: 16,
  pureWhiteLuminanceThreshold: 0.97,
  minPinholePixels: 1,
  maxPinholePixels: 24,
  minBleedDistancePx: 1,
  maxBleedDistancePx: 8,
  maxBleedContactGapPx: 2,
});

const NEIGHBORS_4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEIGHBORS_8: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function resolveOptions(options?: PinholeBleedScanOptions): ResolvedPinholeBleedScanOptions {
  const minPinholePixels = Math.round(clampFinite(options?.minPinholePixels, 1, 256, DEFAULT_SCAN_OPTIONS.minPinholePixels));
  const maxPinholePixels = Math.max(
    minPinholePixels + 1,
    Math.round(clampFinite(options?.maxPinholePixels, 2, 1024, DEFAULT_SCAN_OPTIONS.maxPinholePixels)),
  );
  const minBleedDistancePx = clampFinite(options?.minBleedDistancePx, 1, 32, DEFAULT_SCAN_OPTIONS.minBleedDistancePx);
  const maxBleedDistancePx = Math.max(
    minBleedDistancePx,
    clampFinite(options?.maxBleedDistancePx, 1, 64, DEFAULT_SCAN_OPTIONS.maxBleedDistancePx),
  );
  return {
    lineartAlphaThreshold: Math.round(clampFinite(options?.lineartAlphaThreshold, 1, 255, DEFAULT_SCAN_OPTIONS.lineartAlphaThreshold)),
    lineartMaxLuminance: clampFinite(options?.lineartMaxLuminance, 0.05, 0.99, DEFAULT_SCAN_OPTIONS.lineartMaxLuminance),
    flatAlphaThreshold: Math.round(clampFinite(options?.flatAlphaThreshold, 1, 255, DEFAULT_SCAN_OPTIONS.flatAlphaThreshold)),
    pureWhiteLuminanceThreshold: clampFinite(options?.pureWhiteLuminanceThreshold, 0.8, 1.0, DEFAULT_SCAN_OPTIONS.pureWhiteLuminanceThreshold),
    minPinholePixels,
    maxPinholePixels,
    minBleedDistancePx,
    maxBleedDistancePx,
    maxBleedContactGapPx: clampFinite(options?.maxBleedContactGapPx, 1, 8, DEFAULT_SCAN_OPTIONS.maxBleedContactGapPx),
  };
}

/** Rec.709 기반 상대 휘도 (0..1) */
export function computeRelativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function validateRgbaDimensions(
  lineartRgba: Uint8ClampedArray,
  flatRgba: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return false;
  const requiredBytes = width * height * 4;
  return lineartRgba.length >= requiredBytes && flatRgba.length >= requiredBytes;
}

function buildLineartAndExteriorMasks(
  lineartRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ResolvedPinholeBleedScanOptions,
): {
  readonly lineartMask: Uint8Array;
  readonly exteriorMask: Uint8Array;
  readonly lineartPixelCount: number;
  readonly interiorPixelCount: number;
} {
  const totalPixels = width * height;
  const lineartMask = new Uint8Array(totalPixels);
  let lineartPixelCount = 0;

  for (let idx = 0; idx < totalPixels; idx += 1) {
    const off = idx * 4;
    if ((lineartRgba[off + 3] ?? 0) >= options.lineartAlphaThreshold) {
      const lum = computeRelativeLuminance(lineartRgba[off] ?? 0, lineartRgba[off + 1] ?? 0, lineartRgba[off + 2] ?? 0);
      if (lum <= options.lineartMaxLuminance) {
        lineartMask[idx] = 1;
        lineartPixelCount += 1;
      }
    }
  }

  // 캔버스 외곽 4변에서 선화를 넘지 않고 도달 가능한 픽셀을 바깥(exterior)으로 표시한다.
  const exteriorMask = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const enqueueBorder = (x: number, y: number): void => {
    const idx = y * width + x;
    if (lineartMask[idx] === 1 || exteriorMask[idx] === 1) return;
    exteriorMask[idx] = 1;
    queue[tail] = idx;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueBorder(x, 0);
    if (height > 1) enqueueBorder(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueBorder(0, y);
    if (width > 1) enqueueBorder(width - 1, y);
  }

  while (head < tail) {
    const cur = queue[head] ?? 0;
    head += 1;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (lineartMask[nIdx] === 1 || exteriorMask[nIdx] === 1) continue;
      exteriorMask[nIdx] = 1;
      queue[tail] = nIdx;
      tail += 1;
    }
  }

  let interiorPixelCount = 0;
  for (let idx = 0; idx < totalPixels; idx += 1) {
    if (lineartMask[idx] === 0 && exteriorMask[idx] === 0) interiorPixelCount += 1;
  }

  return { lineartMask, exteriorMask, lineartPixelCount, interiorPixelCount };
}

/** 선화 픽셀로부터 각 픽셀까지의 유클리드 거리 맵을 멀티소스 BFS(최근접 시드 전파)로 계산한다. */
function buildDistanceFromLineart(
  lineartMask: Uint8Array,
  width: number,
  height: number,
  maxExpandSteps: number,
): Float32Array {
  const totalPixels = width * height;
  const dist = new Float32Array(totalPixels);
  dist.fill(Number.POSITIVE_INFINITY);

  const seedX = new Int32Array(totalPixels);
  const seedY = new Int32Array(totalPixels);
  const stepDepth = new Int32Array(totalPixels);
  stepDepth.fill(-1);

  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  for (let idx = 0; idx < totalPixels; idx += 1) {
    if (lineartMask[idx] === 1) {
      const x = idx % width;
      const y = (idx - x) / width;
      dist[idx] = 0;
      seedX[idx] = x;
      seedY[idx] = y;
      stepDepth[idx] = 0;
      queue[tail] = idx;
      tail += 1;
    }
  }

  while (head < tail) {
    const cur = queue[head] ?? 0;
    head += 1;
    const curDepth = stepDepth[cur] ?? 0;
    if (curDepth >= maxExpandSteps) continue;

    const cx = cur % width;
    const cy = (cur - cx) / width;
    const sx = seedX[cur] ?? cx;
    const sy = seedY[cur] ?? cy;

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      const candidateDist = Math.hypot(nx - sx, ny - sy);
      if (candidateDist + 1e-4 < (dist[nIdx] ?? Number.POSITIVE_INFINITY)) {
        dist[nIdx] = candidateDist;
        seedX[nIdx] = sx;
        seedY[nIdx] = sy;
        stepDepth[nIdx] = curDepth + 1;
        queue[tail] = nIdx;
        tail += 1;
      }
    }
  }

  return dist;
}

function classifyUnfilledFlatPixel(
  flatRgba: Uint8ClampedArray,
  idx: number,
  options: ResolvedPinholeBleedScanOptions,
): "transparent" | "pure-white" | null {
  const off = idx * 4;
  if ((flatRgba[off + 3] ?? 0) < options.flatAlphaThreshold) return "transparent";
  const lum = computeRelativeLuminance(flatRgba[off] ?? 0, flatRgba[off + 1] ?? 0, flatRgba[off + 2] ?? 0);
  return lum > options.pureWhiteLuminanceThreshold ? "pure-white" : null;
}

function computeBoundingBoxAndCenter(
  indices: readonly number[],
  width: number,
): { readonly bounds: PixelBoundingBox; readonly centerX: number; readonly centerY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sumX = 0;
  let sumY = 0;

  for (const idx of indices) {
    const x = idx % width;
    const y = (idx - x) / width;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    sumX += x;
    sumY += y;
  }

  const count = Math.max(1, indices.length);
  return {
    bounds: { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
    centerX: Math.round((sumX / count) * 10) / 10,
    centerY: Math.round((sumY / count) * 10) / 10,
  };
}

function pickMajorityRgbaFromIndices(
  rgba: Uint8ClampedArray,
  indices: readonly number[],
): readonly [number, number, number, number] {
  const counts = new Map<number, { count: number; r: number; g: number; b: number; a: number }>();
  for (const idx of indices) {
    const off = idx * 4;
    const r = rgba[off] ?? 0;
    const g = rgba[off + 1] ?? 0;
    const b = rgba[off + 2] ?? 0;
    const a = rgba[off + 3] ?? 0;
    const key = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      if (a > existing.a) existing.a = a;
    } else {
      counts.set(key, { count: 1, r, g, b, a });
    }
  }

  let best: { count: number; r: number; g: number; b: number; a: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.a > best.a)) {
      best = entry;
    }
  }
  return best ? [best.r, best.g, best.b, best.a] : [0, 0, 0, 0];
}

/**
 * 선화·밑색 RGBA 버퍼를 스캔해 (a) 폐곡선 내부 미채색 구멍(1~24px 미만)과
 * (b) 선화 바깥 1~8px 삐져나옴 클러스터 및 자동 붉은펜 핀 페이로드를 검출한다.
 */
export function scanPinholeAndColorBleed(
  lineartRgba: Uint8ClampedArray,
  flatRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options?: PinholeBleedScanOptions,
): PinholeBleedScanResult {
  const startedAt = nowMs();
  const resolved = resolveOptions(options);

  const emptyResult = (safeW: number, safeH: number): PinholeBleedScanResult => ({
    width: safeW, height: safeH, options: resolved,
    lineartPixelCount: 0, interiorPixelCount: 0,
    pinholes: [], colorBleeds: [],
    totalPinholePixels: 0, totalBleedPixels: 0, totalDefectCount: 0, redlinePins: [],
    elapsedMs: Math.round((nowMs() - startedAt) * 100) / 100,
  });

  if (!validateRgbaDimensions(lineartRgba, flatRgba, width, height)) {
    return emptyResult(Math.max(0, Math.floor(width)), Math.max(0, Math.floor(height)));
  }

  const totalPixels = width * height;
  const { lineartMask, exteriorMask, lineartPixelCount, interiorPixelCount } =
    buildLineartAndExteriorMasks(lineartRgba, width, height, resolved);
  if (lineartPixelCount === 0) return emptyResult(width, height);

  const bfsQueue = new Int32Array(totalPixels);

  // (a) 선화 폐곡선 내부 미채색 구멍(1~24px 미만 연결요소) 검출
  const visitedPinhole = new Uint8Array(totalPixels);
  const pinholes: PinholeDefect[] = [];

  for (let startIdx = 0; startIdx < totalPixels; startIdx += 1) {
    if (visitedPinhole[startIdx] === 1 || lineartMask[startIdx] === 1 || exteriorMask[startIdx] === 1) continue;
    if (classifyUnfilledFlatPixel(flatRgba, startIdx, resolved) === null) continue;

    let head = 0;
    let tail = 0;
    visitedPinhole[startIdx] = 1;
    bfsQueue[tail] = startIdx;
    tail += 1;

    const component: number[] = [];
    let hasTransparent = false;
    let hasPureWhite = false;

    while (head < tail) {
      const cur = bfsQueue[head] ?? 0;
      head += 1;
      component.push(cur);

      const curKind = classifyUnfilledFlatPixel(flatRgba, cur, resolved);
      if (curKind === "transparent") hasTransparent = true;
      if (curKind === "pure-white") hasPureWhite = true;

      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (visitedPinhole[nIdx] === 1 || lineartMask[nIdx] === 1 || exteriorMask[nIdx] === 1) continue;
        if (classifyUnfilledFlatPixel(flatRgba, nIdx, resolved) === null) continue;
        visitedPinhole[nIdx] = 1;
        bfsQueue[tail] = nIdx;
        tail += 1;
      }
    }

    if (component.length >= resolved.minPinholePixels && component.length < resolved.maxPinholePixels) {
      const defectOrder = pinholes.length + 1;
      const id = `pinhole-${defectOrder}`;
      const { bounds, centerX, centerY } = computeBoundingBoxAndCenter(component, width);
      const reason: PinholeFillReason = hasTransparent && hasPureWhite ? "mixed" : hasPureWhite ? "pure-white" : "transparent";
      const radiusPx = Math.max(2, Math.ceil(Math.hypot(bounds.width, bounds.height) * 0.5) + 1);
      const labelKo = `미채색 구멍 #${defectOrder} (${component.length}px)`;
      const labelEn = `Unfilled Pinhole #${defectOrder} (${component.length}px)`;

      const redlinePin: AutoRedlinePinPayload = {
        id: `auto-redline-${id}`,
        defectKind: "pinhole",
        xPx: Math.round(centerX),
        yPx: Math.round(centerY),
        radiusPx,
        pixelCount: component.length,
        label: labelKo,
        labelKo,
        labelEn,
        stage: "coloring",
        severity: component.length >= 6 ? "high" : "medium",
      };
      pinholes.push({ id, centerX, centerY, pixelCount: component.length, bounds, pixelIndices: component, reason, redlinePin });
    }
  }

  // (b) 선화 바깥 배경 영역으로 1~8px 삐져나온 비투명 밑색 픽셀 클러스터 검출
  const distFromLineart = buildDistanceFromLineart(lineartMask, width, height, Math.ceil(resolved.maxBleedDistancePx) + 2);
  const visitedBleed = new Uint8Array(totalPixels);
  const colorBleeds: ColorBleedDefect[] = [];

  for (let startIdx = 0; startIdx < totalPixels; startIdx += 1) {
    if (visitedBleed[startIdx] === 1 || exteriorMask[startIdx] === 0) continue;
    if ((flatRgba[startIdx * 4 + 3] ?? 0) < resolved.flatAlphaThreshold) continue;

    let head = 0;
    let tail = 0;
    visitedBleed[startIdx] = 1;
    bfsQueue[tail] = startIdx;
    tail += 1;

    const component: number[] = [];
    let minDist = Number.POSITIVE_INFINITY;
    let maxDist = 0;

    while (head < tail) {
      const cur = bfsQueue[head] ?? 0;
      head += 1;
      component.push(cur);

      const d = distFromLineart[cur] ?? Number.POSITIVE_INFINITY;
      if (d < minDist) minDist = d;
      if (d > maxDist) maxDist = d;

      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (visitedBleed[nIdx] === 1 || exteriorMask[nIdx] === 0) continue;
        if ((flatRgba[nIdx * 4 + 3] ?? 0) < resolved.flatAlphaThreshold) continue;
        visitedBleed[nIdx] = 1;
        bfsQueue[tail] = nIdx;
        tail += 1;
      }
    }

    const withinBleedBand =
      Number.isFinite(minDist) &&
      Number.isFinite(maxDist) &&
      minDist <= resolved.maxBleedContactGapPx + 0.05 &&
      maxDist >= resolved.minBleedDistancePx - 0.05 &&
      maxDist <= resolved.maxBleedDistancePx + 0.05;

    if (withinBleedBand) {
      const defectOrder = colorBleeds.length + 1;
      const id = `bleed-${defectOrder}`;
      const { bounds, centerX, centerY } = computeBoundingBoxAndCenter(component, width);
      const protrusionPx = Math.max(1, Math.min(resolved.maxBleedDistancePx, Math.round(maxDist)));
      const dominantRgba = pickMajorityRgbaFromIndices(flatRgba, component);
      const radiusPx = Math.max(2, Math.ceil(Math.hypot(bounds.width, bounds.height) * 0.5) + 1);
      const labelKo = `선화 삐져나옴 #${defectOrder} (${protrusionPx}px 돌출 · ${component.length}px)`;
      const labelEn = `Color Bleed #${defectOrder} (${protrusionPx}px out · ${component.length}px)`;

      const redlinePin: AutoRedlinePinPayload = {
        id: `auto-redline-${id}`, defectKind: "color-bleed",
        xPx: Math.round(centerX), yPx: Math.round(centerY), radiusPx,
        pixelCount: component.length, label: labelKo, labelKo, labelEn,
        stage: "coloring", severity: protrusionPx >= 4 || component.length >= 8 ? "high" : "medium",
      };
      colorBleeds.push({ id, centerX, centerY, pixelCount: component.length, protrusionPx, bounds, pixelIndices: component, dominantRgba, redlinePin });
    }
  }

  const totalPinholePixels = pinholes.reduce((sum, item) => sum + item.pixelCount, 0);
  const totalBleedPixels = colorBleeds.reduce((sum, item) => sum + item.pixelCount, 0);

  return {
    width, height, options: resolved, lineartPixelCount, interiorPixelCount,
    pinholes, colorBleeds, totalPinholePixels, totalBleedPixels,
    totalDefectCount: pinholes.length + colorBleeds.length,
    redlinePins: [...pinholes.map((item) => item.redlinePin), ...colorBleeds.map((item) => item.redlinePin)],
    elapsedMs: Math.round((nowMs() - startedAt) * 100) / 100,
  };
}

function findMajoritySealColorForPinhole(
  flatRgba: Uint8ClampedArray,
  lineartMask: Uint8Array,
  exteriorMask: Uint8Array,
  width: number,
  height: number,
  pinhole: PinholeDefect,
  options: ResolvedPinholeBleedScanOptions,
): readonly [number, number, number, number] | null {
  const pinholeSet = new Set<number>(pinhole.pixelIndices);
  const directDonors: number[] = [];

  for (const idx of pinhole.pixelIndices) {
    const cx = idx % width;
    const cy = (idx - cx) / width;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (pinholeSet.has(nIdx) || lineartMask[nIdx] === 1 || exteriorMask[nIdx] === 1) continue;
      if (classifyUnfilledFlatPixel(flatRgba, nIdx, options) === null) directDonors.push(nIdx);
    }
  }

  if (directDonors.length > 0) {
    const [r, g, b, a] = pickMajorityRgbaFromIndices(flatRgba, directDonors);
    return [r, g, b, Math.max(a, 255)];
  }

  // 좁은 선화 모서리에 갇힌 경우 반경 2~4px 내부 채색 픽셀에서 다수결 색을 탐색한다.
  for (let radius = 2; radius <= 4; radius += 1) {
    const expandedDonors: number[] = [];
    const minX = Math.max(0, pinhole.bounds.minX - radius);
    const maxX = Math.min(width - 1, pinhole.bounds.maxX + radius);
    const minY = Math.max(0, pinhole.bounds.minY - radius);
    const maxY = Math.min(height - 1, pinhole.bounds.maxY + radius);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const nIdx = y * width + x;
        if (pinholeSet.has(nIdx) || lineartMask[nIdx] === 1 || exteriorMask[nIdx] === 1) continue;
        if (classifyUnfilledFlatPixel(flatRgba, nIdx, options) === null) expandedDonors.push(nIdx);
      }
    }
    if (expandedDonors.length > 0) {
      const [r, g, b, a] = pickMajorityRgbaFromIndices(flatRgba, expandedDonors);
      return [r, g, b, Math.max(a, 255)];
    }
  }
  return null;
}

/**
 * 1클릭 Auto-Seal(주변 채색 픽셀 다수결 채우기) + Auto-Trim(바깥 삐져나옴 알파 0 제거)을 적용해
 * 새 `Uint8ClampedArray`와 수정 픽셀 수를 반환한다. 입력 버퍼는 변경하지 않는다.
 */
export function autoSealPinholesAndTrimBleed(
  lineartRgba: Uint8ClampedArray,
  flatRgba: Uint8ClampedArray,
  width: number,
  height: number,
  scanResult?: PinholeBleedScanResult,
): AutoSealTrimResult {
  const output = new Uint8ClampedArray(flatRgba);
  if (!validateRgbaDimensions(lineartRgba, flatRgba, width, height)) {
    return {
      rgba: output,
      sealedPinholeCount: 0,
      sealedPixelCount: 0,
      trimmedBleedCount: 0,
      trimmedPixelCount: 0,
      modifiedPixelCount: 0,
      unresolvedPinholeCount: 0,
    };
  }

  const effectiveScan = scanResult ?? scanPinholeAndColorBleed(lineartRgba, flatRgba, width, height);
  const { lineartMask, exteriorMask } = buildLineartAndExteriorMasks(lineartRgba, width, height, effectiveScan.options);

  let sealedPinholeCount = 0;
  let sealedPixelCount = 0;
  let unresolvedPinholeCount = 0;

  for (const pinhole of effectiveScan.pinholes) {
    const donorColor = findMajoritySealColorForPinhole(
      flatRgba, lineartMask, exteriorMask, width, height, pinhole, effectiveScan.options,
    );
    if (!donorColor) {
      unresolvedPinholeCount += 1;
      continue;
    }
    const [sr, sg, sb, sa] = donorColor;
    for (const idx of pinhole.pixelIndices) {
      const off = idx * 4;
      if (output[off] !== sr || output[off + 1] !== sg || output[off + 2] !== sb || output[off + 3] !== sa) {
        output[off] = sr;
        output[off + 1] = sg;
        output[off + 2] = sb;
        output[off + 3] = sa;
        sealedPixelCount += 1;
      }
    }
    sealedPinholeCount += 1;
  }

  let trimmedBleedCount = 0;
  let trimmedPixelCount = 0;

  for (const bleed of effectiveScan.colorBleeds) {
    for (const idx of bleed.pixelIndices) {
      const off = idx * 4;
      if ((output[off + 3] ?? 0) !== 0 || (output[off] ?? 0) !== 0 || (output[off + 1] ?? 0) !== 0 || (output[off + 2] ?? 0) !== 0) {
        output[off] = 0;
        output[off + 1] = 0;
        output[off + 2] = 0;
        output[off + 3] = 0;
        trimmedPixelCount += 1;
      }
    }
    trimmedBleedCount += 1;
  }

  return {
    rgba: output,
    sealedPinholeCount,
    sealedPixelCount,
    trimmedBleedCount,
    trimmedPixelCount,
    modifiedPixelCount: sealedPixelCount + trimmedPixelCount,
    unresolvedPinholeCount,
  };
}

function fillRectRgba(
  rgba: Uint8ClampedArray, width: number, height: number,
  x0: number, y0: number, x1: number, y1: number,
  r: number, g: number, b: number, a: number,
): void {
  const minX = Math.max(0, x0);
  const maxX = Math.min(width - 1, x1);
  const minY = Math.max(0, y0);
  const maxY = Math.min(height - 1, y1);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const off = (y * width + x) * 4;
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = a;
    }
  }
}

function strokeRectRgba(
  rgba: Uint8ClampedArray, width: number, height: number,
  x0: number, y0: number, x1: number, y1: number, thickness: number,
  r: number, g: number, b: number, a: number,
): void {
  const t = Math.max(1, thickness);
  fillRectRgba(rgba, width, height, x0, y0, x1, y0 + t - 1, r, g, b, a);
  fillRectRgba(rgba, width, height, x0, y1 - t + 1, x1, y1, r, g, b, a);
  fillRectRgba(rgba, width, height, x0, y0, x0 + t - 1, y1, r, g, b, a);
  fillRectRgba(rgba, width, height, x1 - t + 1, y0, x1, y1, r, g, b, a);
}

/**
 * 실시간 스캐너 UI 및 테스트용 96×96 캐릭터 상반신 데모 컷 버퍼를 생성한다.
 * - 미채색 구멍 3곳(투명 4px · 순백색 9px · 투명 6px) + 정상 흰 셔츠 30px(>=24px 유지)
 * - 선화 바깥 삐져나옴 2곳(우측 4px · 좌측 5px)
 */
export function createDemoCutPixelBuffers(): DemoCutPixelBuffers {
  const width = 96;
  const height = 96;
  const lineartRgba = new Uint8ClampedArray(width * height * 4);
  const flatRgba = new Uint8ClampedArray(width * height * 4);

  strokeRectRgba(lineartRgba, width, height, 18, 10, 76, 42, 2, 24, 24, 30, 255);
  strokeRectRgba(lineartRgba, width, height, 26, 32, 68, 60, 2, 24, 24, 30, 255);
  strokeRectRgba(lineartRgba, width, height, 14, 60, 80, 86, 2, 24, 24, 30, 255);

  fillRectRgba(flatRgba, width, height, 20, 12, 74, 40, 56, 74, 126, 255);
  fillRectRgba(flatRgba, width, height, 28, 34, 66, 58, 242, 206, 184, 255);
  fillRectRgba(flatRgba, width, height, 16, 62, 78, 84, 166, 88, 68, 255);
  // 의도된 흰색 셔츠 칼라 영역 (6×5 = 30px >= 24px)
  fillRectRgba(flatRgba, width, height, 44, 64, 49, 68, 255, 255, 255, 255);

  // 미채색 구멍 3곳 (< 24px)
  fillRectRgba(flatRgba, width, height, 34, 18, 35, 19, 0, 0, 0, 0);
  fillRectRgba(flatRgba, width, height, 58, 44, 60, 46, 255, 255, 255, 255);
  fillRectRgba(flatRgba, width, height, 24, 72, 26, 73, 0, 0, 0, 0);

  // 선화 바깥 삐져나옴 2곳 (1~8px)
  fillRectRgba(flatRgba, width, height, 77, 20, 80, 22, 56, 74, 126, 255);
  fillRectRgba(flatRgba, width, height, 9, 70, 13, 71, 166, 88, 68, 255);

  return {
    width,
    height,
    lineartRgba,
    flatRgba,
    descriptionKo: "96×96 캐릭터 상반신 데모 컷 (미채색 구멍 3건 · 선화 삐져나옴 2건 · 정상 흰 셔츠 30px 포함)",
    descriptionEn: "96×96 character bust demo cut (3 pinholes, 2 color bleeds, plus 1 intentional 30px white collar)",
  };
}
