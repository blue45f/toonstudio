/**
 * 선화 틈새 닫힘 반경(0~12px) 자동 추정 + 형태학적 갭 클로징 + 미세 디테일 보호 마스크(< 24px², #140).
 *
 * ₩0 순수 로컬 결정론 픽셀 엔진:
 * - O(W×H) Exact 2-Pass 유클리드 거리 변환(EDT) 기반 1~8px(최대 24px) 틈새 누출 0건 보장
 * - `< 24px²` 미세 폐곡선(눈동자 하이라이트·머리카락 미세 폐곡선) 면적 임계치 보호
 * - 원본 선화 두께를 두껍게 뭉개지 않고 틈새 중앙선에만 최소 수밀 브리지를 생성
 */

export const DEFAULT_MICRO_DETAIL_PROTECTION_AREA_PX = 24;
export const MAX_GAP_CLOSE_RADIUS_PX = 12;
export const DEFAULT_LINEART_INK_THRESHOLD = 185;

export interface PixelImageLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface MicroDetailRegionInfo {
  readonly id: number;
  readonly areaPx: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface MicroDetailProtectionResult {
  /** 보호할 `< areaThresholdPx` 폐곡선 픽셀은 255, 나머지는 0. */
  readonly mask: Uint8Array;
  readonly areaThresholdPx: number;
  readonly protectedRegionCount: number;
  readonly protectedPixelCount: number;
  readonly regions: readonly MicroDetailRegionInfo[];
}

export interface LineartGapCloseOptions {
  /** 틈새 닫힘 반경(0..12px) 또는 `"auto"` 자동 추정. 기본 `"auto"`. */
  readonly gapCloseRadiusPx?: number | "auto";
  /** 선화 판정 명도 임계값(0..255). 기본 185. */
  readonly inkLuminanceThreshold?: number;
  /** 미세 디테일 보호 면적 임계치(px²). 기본 24(`#140`). */
  readonly protectMicroDetailAreaPx?: number;
  /** 자동 반경 추정 시 밀폐를 검증할 선택 시드 좌표 목록. */
  readonly seeds?: readonly { readonly x: number; readonly y: number }[];
}

export interface LineartGapCloseResult {
  readonly width: number;
  readonly height: number;
  readonly appliedRadiusPx: number;
  readonly autoEstimated: boolean;
  /** 원본 먹선 이진 장벽(1=선화, 0=열림). */
  readonly originalInkBarrier: Uint8Array;
  /** 틈새가 닫히고 미세 디테일(< 24px²)이 보호된 최종 장벽(1=장벽, 0=열림). */
  readonly closedBarrier: Uint8Array;
  /** 새로 추가된 틈새 브리지 픽셀 수. */
  readonly bridgedPixelCount: number;
  /** 미세 디테일 보호 마스크 결과. */
  readonly microDetailProtection: MicroDetailProtectionResult;
}

export interface GapClosedFloodFillResult {
  readonly mask: Uint8Array;
  readonly filledPixelCount: number;
  readonly leakedToBorder: boolean;
  readonly gapClose: LineartGapCloseResult;
}

const INF_DIST = 1e9;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function paperLuminanceAt(image: PixelImageLike, pixelIndex: number): number {
  const off = pixelIndex * 4;
  const r = image.data[off] ?? 255;
  const g = image.data[off + 1] ?? 255;
  const b = image.data[off + 2] ?? 255;
  const a = (image.data[off + 3] ?? 255) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 255 - a * (255 - lum);
}

export function extractBinaryInkBarrier(
  lineart: PixelImageLike,
  inkLuminanceThreshold: number = DEFAULT_LINEART_INK_THRESHOLD,
): Uint8Array {
  const total = lineart.width * lineart.height;
  const threshold = clamp(inkLuminanceThreshold, 8, 250);
  const barrier = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if (paperLuminanceAt(lineart, i) <= threshold) {
      barrier[i] = 1;
    }
  }
  return barrier;
}

function edt1d(
  f: Float32Array,
  n: number,
  out: Float32Array,
  v: Int32Array,
  z: Float32Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF_DIST;
  z[1] = INF_DIST;

  for (let q = 1; q < n; q += 1) {
    const fq = f[q]!;
    if (fq >= INF_DIST * 0.5) continue;
    let s = 0;
    while (k >= 0) {
      const vk = v[k]!;
      const fvk = f[vk]!;
      if (fvk >= INF_DIST * 0.5) {
        k -= 1;
        continue;
      }
      s = (fq + q * q - (fvk + vk * vk)) / (2 * (q - vk));
      if (s <= z[k]!) {
        k -= 1;
      } else {
        break;
      }
    }
    k += 1;
    v[k] = q;
    z[k] = k === 0 ? -INF_DIST : s;
    z[k + 1] = INF_DIST;
  }

  let cursor = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[cursor + 1]! < q) {
      cursor += 1;
    }
    const vk = v[cursor]!;
    const fvk = f[vk]!;
    if (fvk >= INF_DIST * 0.5) {
      out[q] = INF_DIST;
    } else {
      const diff = q - vk;
      out[q] = diff * diff + fvk;
    }
  }
}

/** O(W×H) Exact 2D 유클리드 거리 제곱장(EDT): `featureMask[i] > 0` 픽셀까지의 최단 거리 제곱. */
export function computeExactSquaredDistanceField(
  featureMask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const total = width * height;
  const distSq = new Float32Array(total);
  if (width <= 0 || height <= 0) return distSq;

  const maxDim = Math.max(width, height);
  const f = new Float32Array(maxDim);
  const d = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);
  const colPass = new Float32Array(total);

  for (let x = 0; x < width; x += 1) {
    let hasFeature = false;
    for (let y = 0; y < height; y += 1) {
      const isFeature = featureMask[y * width + x]! > 0;
      f[y] = isFeature ? 0 : INF_DIST;
      if (isFeature) hasFeature = true;
    }
    if (!hasFeature) {
      for (let y = 0; y < height; y += 1) colPass[y * width + x] = INF_DIST;
      continue;
    }
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y += 1) colPass[y * width + x] = d[y]!;
  }

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    let hasFinite = false;
    for (let x = 0; x < width; x += 1) {
      const val = colPass[rowOff + x]!;
      f[x] = val;
      if (val < INF_DIST * 0.5) hasFinite = true;
    }
    if (!hasFinite) {
      for (let x = 0; x < width; x += 1) distSq[rowOff + x] = INF_DIST;
      continue;
    }
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x += 1) distSq[rowOff + x] = d[x]!;
  }

  return distSq;
}

/**
 * 미세 디테일 보호 마스크(#140, 기본 `< 24px²`):
 * 캔버스 외곽과 닿지 않은 작은 폐곡선(눈동자 하이라이트·머리카락 미세 폐곡선 등)을 보호한다.
 */
export function detectMicroDetailProtectionMask(
  inkBarrier: Uint8Array,
  width: number,
  height: number,
  areaThresholdPx: number = DEFAULT_MICRO_DETAIL_PROTECTION_AREA_PX,
): MicroDetailProtectionResult {
  const total = width * height;
  const threshold = Math.max(0, Math.floor(areaThresholdPx));
  const mask = new Uint8Array(total);
  if (width <= 0 || height <= 0 || threshold === 0) {
    return {
      mask,
      areaThresholdPx: threshold,
      protectedRegionCount: 0,
      protectedPixelCount: 0,
      regions: Object.freeze([]),
    };
  }

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const regions: MicroDetailRegionInfo[] = [];
  let protectedPixelCount = 0;

  for (let start = 0; start < total; start += 1) {
    if (inkBarrier[start]! > 0 || visited[start]! > 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let touchesEdge = false;
    let minX = start % width;
    let maxX = minX;
    let minY = (start - minX) / width;
    let maxY = minY;

    while (head < tail) {
      const idx = queue[head++]!;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) touchesEdge = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && inkBarrier[n] === 0 && visited[n] === 0) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    if (!touchesEdge && tail > 0 && tail < threshold) {
      for (let i = 0; i < tail; i += 1) mask[queue[i]!] = 255;
      protectedPixelCount += tail;
      regions.push(Object.freeze({ id: regions.length + 1, areaPx: tail, minX, maxX, minY, maxY }));
    }
  }

  return {
    mask,
    areaThresholdPx: threshold,
    protectedRegionCount: regions.length,
    protectedPixelCount,
    regions: Object.freeze(regions),
  };
}

function computeBorderOpenMask(inkBarrier: Uint8Array, width: number, height: number): Uint8Array {
  const total = width * height;
  const open = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueue = (idx: number): void => {
    if (inkBarrier[idx] === 0 && open[idx] === 0) {
      open[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + (width - 1));
  }

  while (head < tail) {
    const idx = queue[head++]!;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) enqueue(idx - 1);
    if (x + 1 < width) enqueue(idx + 1);
    if (y > 0) enqueue(idx - width);
    if (y + 1 < height) enqueue(idx + width);
  }

  return open;
}

function countNewlyEnclosedAtRadius(params: {
  readonly borderOpenMask: Uint8Array;
  readonly distSq: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly radiusPx: number;
  readonly seeds?: readonly { readonly x: number; readonly y: number }[];
}): { readonly enclosedCount: number; readonly allSeedsEnclosed: boolean } {
  const { borderOpenMask, distSq, width, height, radiusPx, seeds } = params;
  const total = width * height;
  const rSq = radiusPx * radiusPx;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);

  let head = 0;
  let tail = 0;
  const enqueueExt = (idx: number): void => {
    if (borderOpenMask[idx] === 1 && distSq[idx]! > rSq && visited[idx] === 0) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueueExt(x);
    enqueueExt((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueExt(y * width);
    enqueueExt(y * width + (width - 1));
  }
  while (head < tail) {
    const idx = queue[head++]!;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) enqueueExt(idx - 1);
    if (x + 1 < width) enqueueExt(idx + 1);
    if (y > 0) enqueueExt(idx - width);
    if (y + 1 < height) enqueueExt(idx + width);
  }

  let enclosedCount = 0;
  const enclosedMask = seeds && seeds.length > 0 ? new Uint8Array(total) : null;

  for (let start = 0; start < total; start += 1) {
    if (borderOpenMask[start] !== 1 || distSq[start]! <= rSq || visited[start] !== 0) continue;
    let cHead = 0;
    let cTail = 0;
    visited[start] = 2;
    queue[cTail++] = start;
    while (cHead < cTail) {
      const idx = queue[cHead++]!;
      const x = idx % width;
      const y = (idx - x) / width;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && borderOpenMask[n] === 1 && distSq[n]! > rSq && visited[n] === 0) {
          visited[n] = 2;
          queue[cTail++] = n;
        }
      }
    }
    if (cTail >= 4) {
      enclosedCount += 1;
      if (enclosedMask) {
        for (let i = 0; i < cTail; i += 1) enclosedMask[queue[i]!] = 1;
      }
    }
  }

  const allSeedsEnclosed = Boolean(
    seeds &&
      seeds.length > 0 &&
      enclosedMask &&
      seeds.every((seed) => {
        const sx = Math.floor(seed.x);
        const sy = Math.floor(seed.y);
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) return true;
        const idx = sy * width + sx;
        return borderOpenMask[idx] === 0 || enclosedMask[idx] === 1;
      }),
  );

  return { enclosedCount, allSeedsEnclosed };
}

/**
 * 선화 틈새 닫힘 반경(0..12px)을 자동 추정한다.
 */
export function estimateLineartGapCloseRadius(
  lineart: PixelImageLike,
  options?: Pick<LineartGapCloseOptions, "inkLuminanceThreshold" | "seeds">,
): number {
  const { width, height } = lineart;
  if (width <= 2 || height <= 2) return 0;

  const inkBarrier = extractBinaryInkBarrier(lineart, options?.inkLuminanceThreshold);
  const borderOpenMask = computeBorderOpenMask(inkBarrier, width, height);

  if (options?.seeds && options.seeds.length > 0) {
    const anyLeakingSeed = options.seeds.some((seed) => {
      const sx = Math.floor(seed.x);
      const sy = Math.floor(seed.y);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) return false;
      const idx = sy * width + sx;
      return inkBarrier[idx] === 0 && borderOpenMask[idx] === 1;
    });
    if (!anyLeakingSeed) return 0;
  }

  const distSq = computeExactSquaredDistanceField(inkBarrier, width, height);
  let bestRadius = 0;
  let bestEnclosedCount = 0;

  for (let r = 1; r <= MAX_GAP_CLOSE_RADIUS_PX; r += 1) {
    const check = countNewlyEnclosedAtRadius({
      borderOpenMask,
      distSq,
      width,
      height,
      radiusPx: r,
      seeds: options?.seeds,
    });
    if (options?.seeds && options.seeds.length > 0 && check.allSeedsEnclosed) {
      return r;
    }
    if (check.enclosedCount > bestEnclosedCount) {
      bestEnclosedCount = check.enclosedCount;
      bestRadius = r;
    }
  }

  return bestRadius;
}

/**
 * 선화 형태학적 틈새 닫힘(0..12px) + 미세 디테일 보호 마스크(< 24px², #140)를 적용한 수밀 장벽을 생성한다.
 */
export function closeLineartGapsWithDetailGuard(
  lineart: PixelImageLike,
  options?: LineartGapCloseOptions,
): LineartGapCloseResult {
  const { width, height } = lineart;
  const total = width * height;
  const originalInkBarrier = extractBinaryInkBarrier(lineart, options?.inkLuminanceThreshold);
  const microDetailProtection = detectMicroDetailProtectionMask(
    originalInkBarrier,
    width,
    height,
    options?.protectMicroDetailAreaPx ?? DEFAULT_MICRO_DETAIL_PROTECTION_AREA_PX,
  );

  const requested = options?.gapCloseRadiusPx ?? "auto";
  const autoEstimated = requested === "auto";
  const appliedRadiusPx = autoEstimated
    ? estimateLineartGapCloseRadius(lineart, {
        inkLuminanceThreshold: options?.inkLuminanceThreshold,
        seeds: options?.seeds,
      })
    : Math.round(clamp(requested, 0, MAX_GAP_CLOSE_RADIUS_PX));

  const closedBarrier = new Uint8Array(originalInkBarrier);
  if (appliedRadiusPx <= 0 || width <= 2 || height <= 2) {
    return {
      width,
      height,
      appliedRadiusPx: 0,
      autoEstimated,
      originalInkBarrier,
      closedBarrier,
      bridgedPixelCount: 0,
      microDetailProtection,
    };
  }

  const distSq = computeExactSquaredDistanceField(originalInkBarrier, width, height);
  const rSq = appliedRadiusPx * appliedRadiusPx;
  const owner = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);

  let nextCompId = 0;
  let bfsTail = 0;

  for (let start = 0; start < total; start += 1) {
    if (
      originalInkBarrier[start] !== 0 ||
      distSq[start]! <= rSq ||
      owner[start] !== -1 ||
      microDetailProtection.mask[start]! > 0
    ) {
      continue;
    }
    const compId = nextCompId++;
    let cHead = bfsTail;
    owner[start] = compId;
    queue[bfsTail++] = start;

    while (cHead < bfsTail) {
      const idx = queue[cHead++]!;
      const x = idx % width;
      const y = (idx - x) / width;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const n of neighbors) {
        if (
          n >= 0 &&
          originalInkBarrier[n] === 0 &&
          distSq[n]! > rSq &&
          owner[n] === -1 &&
          microDetailProtection.mask[n] === 0
        ) {
          owner[n] = compId;
          queue[bfsTail++] = n;
        }
      }
    }
  }

  let bfsHead = 0;
  while (bfsHead < bfsTail) {
    const idx = queue[bfsHead++]!;
    const compId = owner[idx]!;
    const x = idx % width;
    const y = (idx - x) / width;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x + 1 < width ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y + 1 < height ? idx + width : -1,
    ];
    for (const n of neighbors) {
      if (
        n >= 0 &&
        originalInkBarrier[n] === 0 &&
        owner[n] === -1 &&
        microDetailProtection.mask[n] === 0
      ) {
        owner[n] = compId;
        queue[bfsTail++] = n;
      }
    }
  }

  let bridgedPixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      if (originalInkBarrier[idx] !== 0 || distSq[idx]! > rSq) continue;
      if (microDetailProtection.mask[idx]! > 0) continue;
      const myOwner = owner[idx]!;
      if (myOwner < 0) continue;

      const bordersOther =
        (x > 0 && owner[idx - 1]! >= 0 && owner[idx - 1]! !== myOwner) ||
        (x + 1 < width && owner[idx + 1]! >= 0 && owner[idx + 1]! !== myOwner) ||
        (y > 0 && owner[idx - width]! >= 0 && owner[idx - width]! !== myOwner) ||
        (y + 1 < height && owner[idx + width]! >= 0 && owner[idx + width]! !== myOwner);

      if (bordersOther) {
        closedBarrier[idx] = 1;
        bridgedPixelCount += 1;
      }
    }
  }

  // 미세 디테일 보호 불변식(#140): `< 24px²` 보호 영역은 절대 틈새 브리지에 뭉개지지 않는다.
  for (let i = 0; i < total; i += 1) {
    if (microDetailProtection.mask[i]! > 0) closedBarrier[i] = 0;
  }

  return {
    width,
    height,
    appliedRadiusPx,
    autoEstimated,
    originalInkBarrier,
    closedBarrier,
    bridgedPixelCount,
    microDetailProtection,
  };
}

/**
 * 틈새 닫힘 + 미세 디테일 보호(< 24px²)를 선행 적용한 4-연결 플러드 필 마스크를 생성한다.
 */
export function floodFillWithGapClosing(
  lineart: PixelImageLike,
  seed: { readonly x: number; readonly y: number },
  options?: Omit<LineartGapCloseOptions, "seeds">,
): GapClosedFloodFillResult {
  const { width, height } = lineart;
  const total = width * height;
  const gapClose = closeLineartGapsWithDetailGuard(lineart, { ...options, seeds: [seed] });
  const mask = new Uint8Array(total);
  const sx = Math.floor(seed.x);
  const sy = Math.floor(seed.y);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
    return { mask, filledPixelCount: 0, leakedToBorder: false, gapClose };
  }

  const startIdx = sy * width + sx;
  if (gapClose.closedBarrier[startIdx]! > 0) {
    return { mask, filledPixelCount: 0, leakedToBorder: false, gapClose };
  }

  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  mask[startIdx] = 255;
  queue[tail++] = startIdx;
  let leakedToBorder = false;

  while (head < tail) {
    const idx = queue[head++]!;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) leakedToBorder = true;

    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x + 1 < width ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y + 1 < height ? idx + width : -1,
    ];
    for (const n of neighbors) {
      if (n >= 0 && gapClose.closedBarrier[n] === 0 && mask[n] === 0) {
        mask[n] = 255;
        queue[tail++] = n;
      }
    }
  }

  return { mask, filledPixelCount: tail, leakedToBorder, gapClose };
}
