/**
 * Clip Studio Paint Pro/EX 색채 변환(sRGB → OKLab/OKLCH) 및
 * 컬러라이즈(Colorize) 힌트 기반 경계 인식 자동 채색 엔진.
 */

export interface CspOklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly css: string;
}

export interface CspColorizeHint {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly strength01?: number;
  readonly labelKo?: string;
}

export interface CspColorizeHintAutoFillOptions {
  readonly lineArtRgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly hints: readonly CspColorizeHint[];
  readonly lineBarrierThreshold01?: number;
  readonly edgeBarrierCost?: number;
  readonly compositeLineArt?: boolean;
  readonly blendSmoothness?: number;
}

export interface CspColorizeHintAutoFillResult {
  readonly rgba: Uint8ClampedArray;
  readonly filledPixelCount: number;
  readonly detectedLinePixelCount: number;
  readonly appliedHintCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}

function srgbChannelToLinear(byteVal: number): number {
  const c = clamp(byteVal / 255, 0, 1);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB 바이트(0~255)를 정확한 OKLab 좌표(L, a, b)로 변환한다. */
export function rgbBytesToOklab(
  r: number,
  g: number,
  b: number,
): readonly [number, number, number] {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const lCbrt = Math.cbrt(Math.max(0, l));
  const mCbrt = Math.cbrt(Math.max(0, m));
  const sCbrt = Math.cbrt(Math.max(0, s));

  const okL = 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt;
  const okA = 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt;
  const okB = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt;
  return [okL, okA, okB];
}

/** sRGB 바이트(0~255)를 정확한 OKLCH 값과 CSS `oklch(...)` 문자열로 변환한다. */
export function rgbBytesToOklch(r: number, g: number, b: number): CspOklchColor {
  const [okL, okA, okB] = rgbBytesToOklab(r, g, b);
  const c = Math.hypot(okA, okB);
  const h = c < 1e-5 ? 0 : (((Math.atan2(okB, okA) * 180) / Math.PI) + 360) % 360;
  const lRounded = Number(clamp(okL, 0, 1).toFixed(3));
  const cRounded = Number(Math.max(0, c).toFixed(3));
  const hRounded = Number(h.toFixed(1));
  return {
    l: lRounded,
    c: cRounded,
    h: hRounded,
    css: `oklch(${lRounded} ${cRounded} ${hRounded})`,
  };
}

function pushMinHeap(heapIdx: number[], heapDist: number[], node: number, dist: number): void {
  heapIdx.push(node);
  heapDist.push(dist);
  let i = heapIdx.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if ((heapDist[parent] ?? Infinity) <= dist) break;
    heapIdx[i] = heapIdx[parent] ?? 0;
    heapDist[i] = heapDist[parent] ?? 0;
    i = parent;
  }
  heapIdx[i] = node;
  heapDist[i] = dist;
}

function popMinHeap(heapIdx: number[], heapDist: number[]): readonly [number, number] | null {
  const n = heapIdx.length;
  if (n === 0) return null;
  const topNode = heapIdx[0] ?? 0;
  const topDist = heapDist[0] ?? Infinity;
  const lastNode = heapIdx.pop() ?? 0;
  const lastDist = heapDist.pop() ?? Infinity;
  const len = heapIdx.length;
  if (len > 0) {
    heapIdx[0] = lastNode;
    heapDist[0] = lastDist;
    let cur = 0;
    while (true) {
      const left = cur * 2 + 1;
      const right = left + 1;
      let smallest = cur;
      if (left < len && (heapDist[left] ?? Infinity) < (heapDist[smallest] ?? Infinity)) {
        smallest = left;
      }
      if (right < len && (heapDist[right] ?? Infinity) < (heapDist[smallest] ?? Infinity)) {
        smallest = right;
      }
      if (smallest === cur) break;
      const tmpN = heapIdx[cur] ?? 0;
      const tmpD = heapDist[cur] ?? Infinity;
      heapIdx[cur] = heapIdx[smallest] ?? 0;
      heapDist[cur] = heapDist[smallest] ?? Infinity;
      heapIdx[smallest] = tmpN;
      heapDist[smallest] = tmpD;
      cur = smallest;
    }
  }
  return [topNode, topDist];
}

const NEIGHBOR_DX: readonly number[] = [-1, 1, 0, 0, -1, 1, -1, 1];
const NEIGHBOR_DY: readonly number[] = [0, 0, -1, 1, -1, -1, 1, 1];
const NEIGHBOR_COST: readonly number[] = [
  1,
  1,
  1,
  1,
  Math.SQRT2,
  Math.SQRT2,
  Math.SQRT2,
  Math.SQRT2,
];

/**
 * 선화 알파·휘도 경계 맵과 사용자 색상 힌트를 받아
 * 다중 소스 경계 인식 지오데식 전파(priority diffusion)로 RGBA 버퍼를 자동 채색한다.
 */
export function applyCspColorizeHintAutoFill(
  options: CspColorizeHintAutoFillOptions,
): CspColorizeHintAutoFillResult {
  const { lineArtRgba, width, height } = options;
  const pixelCount = Math.max(0, width * height);
  const out = new Uint8ClampedArray(pixelCount * 4);
  if (pixelCount === 0 || options.hints.length === 0) {
    out.set(lineArtRgba.subarray(0, out.length));
    return { rgba: out, filledPixelCount: 0, detectedLinePixelCount: 0, appliedHintCount: 0 };
  }

  const lineThresh = clamp(options.lineBarrierThreshold01 ?? 0.42, 0.05, 0.98);
  const edgeBarrierCost = Math.max(2, options.edgeBarrierCost ?? 14);
  const compositeLineArt = options.compositeLineArt ?? true;
  const smoothness = clamp(options.blendSmoothness ?? 2, 0.3, 8);

  const barrier = new Float32Array(pixelCount);
  const isLine = new Uint8Array(pixelCount);
  let detectedLinePixelCount = 0;

  for (let p = 0; p < pixelCount; p += 1) {
    const idx = p * 4;
    const r = lineArtRgba[idx] ?? 0;
    const g = lineArtRgba[idx + 1] ?? 0;
    const b = lineArtRgba[idx + 2] ?? 0;
    const a = lineArtRgba[idx + 3] ?? 0;
    const alpha01 = a / 255;
    const darkness01 = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const ink01 = alpha01 * darkness01;
    barrier[p] = ink01;
    if (ink01 >= lineThresh) {
      isLine[p] = 1;
      detectedLinePixelCount += 1;
    }
  }

  const validHints = options.hints.slice(0, 16).map((hint) => ({
    x: clamp(Math.round(hint.x), 0, width - 1),
    y: clamp(Math.round(hint.y), 0, height - 1),
    r: clampByte(hint.r),
    g: clampByte(hint.g),
    b: clampByte(hint.b),
    strength: clamp(hint.strength01 ?? 1, 0.1, 2),
  }));

  const distMaps: Float32Array[] = [];
  for (const hint of validHints) {
    const dist = new Float32Array(pixelCount);
    dist.fill(Infinity);
    const startNode = hint.y * width + hint.x;
    dist[startNode] = 0;

    const heapIdx: number[] = [];
    const heapDist: number[] = [];
    pushMinHeap(heapIdx, heapDist, startNode, 0);

    while (heapIdx.length > 0) {
      const popped = popMinHeap(heapIdx, heapDist);
      if (!popped) break;
      const [node, curD] = popped;
      if (curD > (dist[node] ?? Infinity) + 1e-5) continue;

      const x = node % width;
      const y = (node - x) / width;

      for (let dir = 0; dir < 8; dir += 1) {
        const nx = x + (NEIGHBOR_DX[dir] ?? 0);
        const ny = y + (NEIGHBOR_DY[dir] ?? 0);
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nNode = ny * width + nx;
        const step = NEIGHBOR_COST[dir] ?? 1;
        const wallPenalty =
          isLine[nNode] === 1
            ? edgeBarrierCost * 6
            : (barrier[nNode] ?? 0) * edgeBarrierCost;
        const nextD = curD + step + wallPenalty;
        if (nextD < (dist[nNode] ?? Infinity)) {
          dist[nNode] = nextD;
          pushMinHeap(heapIdx, heapDist, nNode, nextD);
        }
      }
    }
    distMaps.push(dist);
  }

  const beta = 0.28 / Math.max(0.25, smoothness * 0.5);
  let filledPixelCount = 0;

  for (let p = 0; p < pixelCount; p += 1) {
    let minD = Infinity;
    for (let h = 0; h < distMaps.length; h += 1) {
      const d = distMaps[h]?.[p] ?? Infinity;
      if (d < minD) minD = d;
    }

    let sumW = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let h = 0; h < validHints.length; h += 1) {
      const hint = validHints[h];
      const d = distMaps[h]?.[p] ?? Infinity;
      if (!hint || !Number.isFinite(d)) continue;
      const w = hint.strength * Math.exp(-beta * Math.max(0, d - minD));
      sumW += w;
      sumR += hint.r * w;
      sumG += hint.g * w;
      sumB += hint.b * w;
    }

    const idx = p * 4;
    let fillR = sumW > 1e-9 ? sumR / sumW : 255;
    let fillG = sumW > 1e-9 ? sumG / sumW : 255;
    let fillB = sumW > 1e-9 ? sumB / sumW : 255;

    if (compositeLineArt) {
      const inkAlpha = clamp(barrier[p] ?? 0, 0, 1);
      const lineR = lineArtRgba[idx] ?? 0;
      const lineG = lineArtRgba[idx + 1] ?? 0;
      const lineB = lineArtRgba[idx + 2] ?? 0;
      fillR = fillR * (1 - inkAlpha) + lineR * inkAlpha;
      fillG = fillG * (1 - inkAlpha) + lineG * inkAlpha;
      fillB = fillB * (1 - inkAlpha) + lineB * inkAlpha;
    }

    out[idx] = clampByte(fillR);
    out[idx + 1] = clampByte(fillG);
    out[idx + 2] = clampByte(fillB);
    out[idx + 3] = 255;
    if (isLine[p] === 0 && sumW > 1e-9) {
      filledPixelCount += 1;
    }
  }

  return {
    rgba: out,
    filledPixelCount,
    detectedLinePixelCount,
    appliedHintCount: validHints.length,
  };
}
