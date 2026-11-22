/**
 * G'MIC / Krita 식 우선순위 큐 Watershed 선화 자동 플랫 채색 엔진
 * (100% 클린룸 수학·형태학 알고리즘 구현, ₩0 로컬).
 *
 * 공개 영상처리·형태학 원리(Meyer 1994 토폴로지 Watershed + Sobel 밝기 기울기 +
 * 미니맥스 장벽 우선순위 큐 + 안티앨리어싱 선화 하부 팽창)를 순수 TypeScript로 자체 구현했다.
 *
 * 핵심 동작:
 * 1. 선화 밝기(ink darkness)와 3×3 Sobel 기울기 크기(gradient magnitude)를 결합한 지형 고도맵을 생성한다.
 * 2. 소수의 컬러 힌트 포인트(또는 폴리라인 시드)에서 힙 기반 우선순위 큐로 Watershed 범람을 수행해
 *    종이 내부 영역을 모두 채운 뒤 선화 능선 중심선에서 인접 영역이 정확히 만나 경계 침범을 최소화한다.
 * 3. `antiAliasExpandPx`(0..4px)만큼 안티앨리어싱 선화 경계 아래로 플랫 색을 확장해 흰 테두리(halo)를 제거한다.
 */

export interface WatershedImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface WatershedColorHint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
  /** 시드 반경(px, 기본 0 = 단일 픽셀). */
  readonly radiusPx?: number;
  /** true이면 배경 등 투명 유지 마커로 동작한다. */
  readonly transparent?: boolean;
}

export interface WatershedColorizeOptions {
  /** 선화 어두움(255 - lum) 가중치 (기본 0.72). */
  readonly lineWeight?: number;
  /** 3×3 Sobel 밝기 기울기 크기 가중치 (기본 0.28). */
  readonly gradientWeight?: number;
  /** 선화 장벽으로 승격할 밝기 임계치(0..255, 기본 195 — 이보다 어두우면 능선 장벽). */
  readonly lineBarrierThreshold?: number;
  /** 안티앨리어싱 선화 아래로 확장할 픽셀 수 (0..4, 기본 1). */
  readonly antiAliasExpandPx?: number;
  /** 미세 선화 틈새를 봉합할 형태학적 닫힘 반경(0..6, 기본 0). */
  readonly gapSealRadiusPx?: number;
  /** 4연결 또는 8연결 이웃 탐색 (기본 4). */
  readonly connectivity?: 4 | 8;
  /** 원본 선화를 Multiply로 위에 합성할지 여부 (기본 false = 선화 아래 순수 밑색 레이어). */
  readonly compositeLineartMultiply?: boolean;
}

export interface WatershedColorizeStats {
  readonly width: number;
  readonly height: number;
  readonly hintCount: number;
  readonly seededPixelCount: number;
  readonly coloredPixelCount: number;
  readonly transparentPixelCount: number;
  readonly expandedEdgePixelCount: number;
  readonly ridgePixelCount: number;
  readonly regionPixelCounts: Readonly<Record<string, number>>;
}

export interface WatershedColorizeResult {
  readonly imageData: WatershedImageDataLike;
  /** 각 픽셀에 할당된 힌트 인덱스(`0..hints.length-1`, 미할당 `-1`). */
  readonly labelMap: Int32Array;
  /** 정규화된 지형 고도맵(`0..1023`). */
  readonly elevationMap: Uint16Array;
  /** 3×3 Sobel 밝기 기울기 크기(`0..255`). */
  readonly gradientMap: Uint8Array;
  readonly stats: WatershedColorizeStats;
}

interface NormalizedWatershedOptions {
  readonly lineWeight: number;
  readonly gradientWeight: number;
  readonly lineBarrierThreshold: number;
  readonly antiAliasExpandPx: number;
  readonly gapSealRadiusPx: number;
  readonly connectivity: 4 | 8;
  readonly compositeLineartMultiply: boolean;
}

const DEFAULT_WATERSHED_OPTIONS: NormalizedWatershedOptions = Object.freeze({
  lineWeight: 0.72,
  gradientWeight: 0.28,
  lineBarrierThreshold: 195,
  antiAliasExpandPx: 1,
  gapSealRadiusPx: 0,
  connectivity: 4,
  compositeLineartMultiply: false,
});

const RIDGE_BASE_ELEVATION = 512;
const DIST_SCALE_SHIFT = 67_108_864; // 2^26 (<= 2^53 정확 정수 범위)

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

function normalizeOptions(options?: WatershedColorizeOptions): NormalizedWatershedOptions {
  const rawLineW = clamp(options?.lineWeight ?? DEFAULT_WATERSHED_OPTIONS.lineWeight, 0, 1);
  const rawGradW = clamp(options?.gradientWeight ?? DEFAULT_WATERSHED_OPTIONS.gradientWeight, 0, 1);
  const sumW = rawLineW + rawGradW;
  const lineWeight = sumW > 1e-6 ? rawLineW / sumW : 0.72;
  const gradientWeight = sumW > 1e-6 ? rawGradW / sumW : 0.28;
  return {
    lineWeight,
    gradientWeight,
    lineBarrierThreshold: clamp(
      Math.round(options?.lineBarrierThreshold ?? DEFAULT_WATERSHED_OPTIONS.lineBarrierThreshold),
      32,
      250,
    ),
    antiAliasExpandPx: clamp(
      Math.round(options?.antiAliasExpandPx ?? DEFAULT_WATERSHED_OPTIONS.antiAliasExpandPx),
      0,
      4,
    ),
    gapSealRadiusPx: clamp(
      Math.round(options?.gapSealRadiusPx ?? DEFAULT_WATERSHED_OPTIONS.gapSealRadiusPx),
      0,
      6,
    ),
    connectivity: options?.connectivity === 8 ? 8 : 4,
    compositeLineartMultiply: Boolean(options?.compositeLineartMultiply),
  };
}

/**
 * 제로-알로케이션 바이너리 최소 힙 (`Float64Array` 우선순위 + `Int32Array` 픽셀 인덱스).
 * GC 부담 없이 `(미니맥스 고도, 측지 거리)` 사전식 최솟값을 O(log N)으로 꺼낸다.
 */
class PixelPriorityQueue {
  private keys: Float64Array;
  private items: Int32Array;
  private count = 0;

  constructor(initialCapacity: number) {
    const cap = Math.max(64, initialCapacity);
    this.keys = new Float64Array(cap);
    this.items = new Int32Array(cap);
  }

  get size(): number {
    return this.count;
  }

  push(key: number, pixelIndex: number): void {
    if (this.count >= this.keys.length) {
      const nextCap = this.keys.length * 2;
      const nextKeys = new Float64Array(nextCap);
      const nextItems = new Int32Array(nextCap);
      nextKeys.set(this.keys);
      nextItems.set(this.items);
      this.keys = nextKeys;
      this.items = nextItems;
    }
    let idx = this.count;
    this.count += 1;
    this.keys[idx] = key;
    this.items[idx] = pixelIndex;

    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.keys[parent]! <= this.keys[idx]!) break;
      const tk = this.keys[parent]!;
      const ti = this.items[parent]!;
      this.keys[parent] = this.keys[idx]!;
      this.items[parent] = this.items[idx]!;
      this.keys[idx] = tk;
      this.items[idx] = ti;
      idx = parent;
    }
  }

  pop(): { readonly key: number; readonly pixelIndex: number } {
    const topKey = this.keys[0]!;
    const topItem = this.items[0]!;
    this.count -= 1;
    if (this.count > 0) {
      this.keys[0] = this.keys[this.count]!;
      this.items[0] = this.items[this.count]!;
      let idx = 0;
      while (true) {
        const left = (idx << 1) + 1;
        if (left >= this.count) break;
        const right = left + 1;
        let smallest = left;
        if (right < this.count && this.keys[right]! < this.keys[left]!) {
          smallest = right;
        }
        if (this.keys[idx]! <= this.keys[smallest]!) break;
        const tk = this.keys[idx]!;
        const ti = this.items[idx]!;
        this.keys[idx] = this.keys[smallest]!;
        this.items[idx] = this.items[smallest]!;
        this.keys[smallest] = tk;
        this.items[smallest] = ti;
        idx = smallest;
      }
    }
    return { key: topKey, pixelIndex: topItem };
  }
}

/** 1D 분리형 형태학 연산(팽창 max / 침식 min)으로 미세 선화 틈을 봉합한다. */
function morphologicalCloseUint16(
  src: Uint16Array,
  width: number,
  height: number,
  radius: number,
): Uint16Array {
  const total = width * height;
  const tmp = new Uint16Array(total);
  const dilated = new Uint16Array(total);
  const out = new Uint16Array(total);

  // 1) Dilation (horizontal → vertical)
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let best = 0;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let sx = x0; sx <= x1; sx += 1) {
        const v = src[row + sx]!;
        if (v > best) best = v;
      }
      tmp[row + x] = best;
    }
  }
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      let best = 0;
      for (let sy = y0; sy <= y1; sy += 1) {
        const v = tmp[sy * width + x]!;
        if (v > best) best = v;
      }
      dilated[y * width + x] = best;
    }
  }

  // 2) Erosion (horizontal → vertical)
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let best = 65535;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let sx = x0; sx <= x1; sx += 1) {
        const v = dilated[row + sx]!;
        if (v < best) best = v;
      }
      tmp[row + x] = best;
    }
  }
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      let best = 65535;
      for (let sy = y0; sy <= y1; sy += 1) {
        const v = tmp[sy * width + x]!;
        if (v < best) best = v;
      }
      out[y * width + x] = best;
    }
  }

  return out;
}

/** 선화 밝기와 3×3 Sobel 밝기 기울기 크기로 Watershed 지형 고도맵을 계산한다. */
export function computeLineartGradientElevation(
  lineArt: WatershedImageDataLike,
  options?: WatershedColorizeOptions,
): {
  readonly luminance: Float32Array;
  readonly inkDarkness: Uint8Array;
  readonly gradientMap: Uint8Array;
  readonly elevationMap: Uint16Array;
  readonly ridgeMask: Uint8Array;
  readonly ridgePixelCount: number;
} {
  const opts = normalizeOptions(options);
  const { width, height, data } = lineArt;
  const total = width * height;
  const luminance = new Float32Array(total);
  const inkDarkness = new Uint8Array(total);
  const gradientMap = new Uint8Array(total);
  const rawElevation = new Uint16Array(total);
  const ridgeMask = new Uint8Array(total);

  // 투명 배경 선화와 흰 배경 선화를 모두 동일하게 흰 종이 위 밝기로 환산
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    const a = data[off + 3] ?? 255;
    const invA = 255 - a;
    const effR = ((data[off] ?? 255) * a + 255 * invA) / 255;
    const effG = ((data[off + 1] ?? 255) * a + 255 * invA) / 255;
    const effB = ((data[off + 2] ?? 255) * a + 255 * invA) / 255;
    const lum = 0.299 * effR + 0.587 * effG + 0.114 * effB;
    luminance[i] = lum;
    inkDarkness[i] = clampByte(255 - lum);
  }

  const barrierInkCutoff = 255 - opts.lineBarrierThreshold;

  for (let y = 0; y < height; y += 1) {
    const y0 = y > 0 ? y - 1 : 0;
    const y2 = y + 1 < height ? y + 1 : height - 1;
    for (let x = 0; x < width; x += 1) {
      const x0 = x > 0 ? x - 1 : 0;
      const x2 = x + 1 < width ? x + 1 : width - 1;
      const idx = y * width + x;

      const tl = luminance[y0 * width + x0]!;
      const t = luminance[y0 * width + x]!;
      const tr = luminance[y0 * width + x2]!;
      const l = luminance[y * width + x0]!;
      const r = luminance[y * width + x2]!;
      const bl = luminance[y2 * width + x0]!;
      const b = luminance[y2 * width + x]!;
      const br = luminance[y2 * width + x2]!;

      const gx = -tl + tr - 2 * l + 2 * r - bl + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const grad = clampByte(Math.hypot(gx, gy) * 0.25);
      gradientMap[idx] = grad;

      const ink = inkDarkness[idx]!;
      const combined = opts.lineWeight * ink + opts.gradientWeight * grad;
      const scaled = clamp(Math.round(combined * 2), 0, 511);

      if (ink >= barrierInkCutoff) {
        rawElevation[idx] = RIDGE_BASE_ELEVATION + scaled;
      } else {
        rawElevation[idx] = scaled;
      }
    }
  }

  const elevationMap =
    opts.gapSealRadiusPx > 0
      ? morphologicalCloseUint16(rawElevation, width, height, opts.gapSealRadiusPx)
      : rawElevation;

  let ridgePixelCount = 0;
  for (let i = 0; i < total; i += 1) {
    if (elevationMap[i]! >= RIDGE_BASE_ELEVATION) {
      ridgeMask[i] = 1;
      ridgePixelCount += 1;
    }
  }

  return { luminance, inkDarkness, gradientMap, elevationMap, ridgeMask, ridgePixelCount };
}

/**
 * 선화 밝기 기울기 기반 우선순위 큐 Watershed 분할로 소수 컬러 힌트 포인트만으로
 * 컷 전체 플랫 밑색을 자동 채색한다. 입력 `lineArt`는 절대 변형하지 않는다.
 */
export function colorizeLineartWithWatershed(
  lineArt: WatershedImageDataLike,
  hints: readonly WatershedColorHint[],
  options?: WatershedColorizeOptions,
): WatershedColorizeResult {
  const opts = normalizeOptions(options);
  const { width, height, data } = lineArt;
  const total = width * height;
  const { luminance, gradientMap, elevationMap, ridgeMask, ridgePixelCount } =
    computeLineartGradientElevation(lineArt, opts);

  const labelMap = new Int32Array(total).fill(-1);
  const outData = new Uint8ClampedArray(total * 4);
  const regionCounts: Record<string, number> = {};
  for (const hint of hints) {
    regionCounts[hint.id] = 0;
  }

  if (total === 0 || hints.length === 0) {
    return {
      imageData: { width, height, data: outData },
      labelMap,
      elevationMap,
      gradientMap,
      stats: {
        width,
        height,
        hintCount: hints.length,
        seededPixelCount: 0,
        coloredPixelCount: 0,
        transparentPixelCount: total,
        expandedEdgePixelCount: 0,
        ridgePixelCount,
        regionPixelCounts: regionCounts,
      },
    };
  }

  const bestCost = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  const settled = new Uint8Array(total);
  const queue = new PixelPriorityQueue(Math.min(total, 4096));
  let seededPixelCount = 0;

  // 1) 시드 힌트 등록
  for (let hIdx = 0; hIdx < hints.length; hIdx += 1) {
    const hint = hints[hIdx]!;
    const cx = clamp(Math.round(hint.x), 0, width - 1);
    const cy = clamp(Math.round(hint.y), 0, height - 1);
    const rad = clamp(Math.round(hint.radiusPx ?? 0), 0, 16);

    const minX = Math.max(0, cx - rad);
    const maxX = Math.min(width - 1, cx + rad);
    const minY = Math.max(0, cy - rad);
    const maxY = Math.min(height - 1, cy + rad);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (rad > 0 && Math.hypot(x - cx, y - cy) > rad + 0.25) continue;
        const p = y * width + x;
        const elev = elevationMap[p]!;
        // 선화 능선 위에 찍힌 시드보다 종이 내부 시드가 우선하도록 고도 반영
        const seedCost = elev * DIST_SCALE_SHIFT;
        if (seedCost < bestCost[p]!) {
          bestCost[p] = seedCost;
          labelMap[p] = hIdx;
          queue.push(seedCost, p);
          seededPixelCount += 1;
        }
      }
    }
  }

  // 2) 우선순위 큐 Watershed 범람 (미니맥스 장벽 고도 우선 + 측지 최단거리 타이브레이크)
  const neighbors4: readonly (readonly [number, number, number])[] = [
    [1, 0, 10],
    [-1, 0, 10],
    [0, 1, 10],
    [0, -1, 10],
  ];
  const neighbors8: readonly (readonly [number, number, number])[] = [
    ...neighbors4,
    [1, 1, 14],
    [-1, 1, 14],
    [1, -1, 14],
    [-1, -1, 14],
  ];
  const neighbors = opts.connectivity === 8 ? neighbors8 : neighbors4;

  while (queue.size > 0) {
    const { key, pixelIndex: p } = queue.pop();
    if (settled[p] === 1) continue;
    settled[p] = 1;

    const pLabel = labelMap[p]!;
    if (pLabel < 0) continue;

    const pPeak = Math.floor(key / DIST_SCALE_SHIFT);
    const pDist = key - pPeak * DIST_SCALE_SHIFT;
    const px = p % width;
    const py = (p - px) / width;

    for (let n = 0; n < neighbors.length; n += 1) {
      const [dx, dy, stepDist] = neighbors[n]!;
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const np = ny * width + nx;
      if (settled[np] === 1) continue;

      const nElev = elevationMap[np]!;
      const nextPeak = nElev > pPeak ? nElev : pPeak;
      const nextDist = pDist + stepDist;
      const nextCost = nextPeak * DIST_SCALE_SHIFT + nextDist;

      if (nextCost < bestCost[np]!) {
        bestCost[np] = nextCost;
        labelMap[np] = pLabel;
        queue.push(nextCost, np);
      }
    }
  }

  // 3) 선화 능선 안티앨리어싱 팽창 거리 계산 (종이 내부 → 선화 능선 내부로 최대 antiAliasExpandPx)
  const distFromInterior = new Int16Array(total).fill(-1);
  if (opts.antiAliasExpandPx > 0) {
    const bfsQueue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < total; i += 1) {
      if (ridgeMask[i] === 0 && labelMap[i]! >= 0) {
        distFromInterior[i] = 0;
        bfsQueue[tail] = i;
        tail += 1;
      }
    }
    while (head < tail) {
      const p = bfsQueue[head]!;
      head += 1;
      const d = distFromInterior[p]!;
      if (d >= opts.antiAliasExpandPx) continue;
      const px = p % width;
      const py = (p - px) / width;
      const nextD = d + 1;
      if (px > 0 && distFromInterior[p - 1] === -1) {
        distFromInterior[p - 1] = nextD;
        bfsQueue[tail++] = p - 1;
      }
      if (px + 1 < width && distFromInterior[p + 1] === -1) {
        distFromInterior[p + 1] = nextD;
        bfsQueue[tail++] = p + 1;
      }
      if (py > 0 && distFromInterior[p - width] === -1) {
        distFromInterior[p - width] = nextD;
        bfsQueue[tail++] = p - width;
      }
      if (py + 1 < height && distFromInterior[p + width] === -1) {
        distFromInterior[p + width] = nextD;
        bfsQueue[tail++] = p + width;
      }
    }
  }

  // 4) 최종 플랫 RGBA 출력 생성 (Watershed 능선 중심선 분할이 선화 하부 침범을 자동 차단)
  let coloredPixelCount = 0;
  let transparentPixelCount = 0;
  let expandedEdgePixelCount = 0;

  for (let i = 0; i < total; i += 1) {
    const hIdx = labelMap[i]!;
    if (hIdx < 0) {
      transparentPixelCount += 1;
      continue;
    }
    const hint = hints[hIdx]!;
    const isRidge = ridgeMask[i] === 1;
    const allowPaint =
      !isRidge || (opts.antiAliasExpandPx > 0 && distFromInterior[i]! > 0 && distFromInterior[i]! <= opts.antiAliasExpandPx);

    if (!allowPaint || hint.transparent) {
      transparentPixelCount += 1;
      continue;
    }

    const off = i * 4;
    let r = clampByte(hint.r);
    let g = clampByte(hint.g);
    let b = clampByte(hint.b);
    const a = clampByte(hint.a ?? 255);

    if (opts.compositeLineartMultiply) {
      const lumNorm = clamp((luminance[i] ?? 255) / 255, 0, 1);
      r = clampByte(r * lumNorm);
      g = clampByte(g * lumNorm);
      b = clampByte(b * lumNorm);
    }

    outData[off] = r;
    outData[off + 1] = g;
    outData[off + 2] = b;
    outData[off + 3] = a;

    coloredPixelCount += 1;
    if (isRidge) expandedEdgePixelCount += 1;
    regionCounts[hint.id] = (regionCounts[hint.id] ?? 0) + 1;
  }

  // 입력 선화 불변 확인용 참조 방지 — data는 읽기 전용으로만 접근했다.
  void data;

  return {
    imageData: { width, height, data: outData },
    labelMap,
    elevationMap,
    gradientMap,
    stats: {
      width,
      height,
      hintCount: hints.length,
      seededPixelCount,
      coloredPixelCount,
      transparentPixelCount,
      expandedEdgePixelCount,
      ridgePixelCount,
      regionPixelCounts: regionCounts,
    },
  };
}
