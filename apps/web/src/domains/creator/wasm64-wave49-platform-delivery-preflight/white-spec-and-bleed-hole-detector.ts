/**
 * Wave 49: 미봉합 미세 흰 점·투명 구멍(Unfilled White Specs & Bleed Holes) 탐지·1클릭 복원 커널.
 *
 * - 채색 완료 RGBA 컷 버퍼에서 선화 경계·채색 영역 안쪽에 고립된 미세 흰 점과 투명 구멍
 *   (기본 면적 `1~36px²`)을 4/8연결 Connected-Component Labeling(CCL)으로 정밀 탐지한다.
 * - 캔버스 외곽과 맞닿은 배경 여백, 말풍선·대형 흰 면(`> maxAreaPx`), 순수 흑색 잉크 내부의
 *   눈동자 하이라이트는 오탐 방지 규칙으로 제외한다.
 * - `healWhiteSpecs`는 탐지된 각 구멍 주변 채색 픽셀 최빈값(Mode)으로 1클릭 자동 메우기를 수행한다.
 */

export const DEFAULT_MIN_SPEC_AREA_PX = 1 as const;
export const DEFAULT_MAX_SPEC_AREA_PX = 36 as const;
export const DEFAULT_WHITE_LUMA_THRESHOLD = 242 as const;
export const DEFAULT_MAX_WHITE_CHROMA = 14 as const;
export const DEFAULT_TRANSPARENT_ALPHA_THRESHOLD = 32 as const;
export const DEFAULT_LINEART_MAX_LUMA = 64 as const;
export const DEFAULT_LINEART_MAX_CHROMA = 24 as const;

export interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface RgbaImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface SpecExclusionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WhiteSpecDetectorOptions {
  readonly minAreaPx?: number;
  readonly maxAreaPx?: number;
  readonly whiteLumaThreshold?: number;
  readonly maxWhiteChroma?: number;
  readonly transparentAlphaThreshold?: number;
  readonly lineartMaxLuma?: number;
  readonly lineartMaxChroma?: number;
  readonly connectivity?: 4 | 8;
  readonly allowPureLineartEnclosure?: boolean;
  readonly excludeRects?: readonly SpecExclusionRect[];
}

export type DetectedSpecKind = "white-spec" | "transparent-hole" | "mixed";

export interface DetectedWhiteSpec {
  readonly specId: number;
  readonly kind: DetectedSpecKind;
  readonly areaPx: number;
  readonly bounds: SpecExclusionRect;
  readonly centroid: { readonly x: number; readonly y: number };
  readonly touchesLineart: boolean;
  readonly surroundingFillCount: number;
  readonly suggestedFillRgba: RgbaColor;
  readonly pixelIndices: readonly number[];
}

export interface WhiteSpecDetectionReport {
  readonly width: number;
  readonly height: number;
  readonly specs: readonly DetectedWhiteSpec[];
  readonly totalSpecPixelCount: number;
  readonly ignoredBorderComponentCount: number;
  readonly ignoredOversizedComponentCount: number;
  readonly ignoredNoFillNeighborCount: number;
  readonly ignoredExcludedRectCount: number;
  readonly summaryKo: string;
}

export interface HealWhiteSpecsOptions {
  readonly specIds?: readonly number[];
  readonly inPlace?: boolean;
  readonly forceOpaqueAlpha?: boolean;
}

export interface HealWhiteSpecsResult {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly healedSpecCount: number;
  readonly healedPixelCount: number;
  readonly skippedSpecCount: number;
  readonly summaryKo: string;
}

const NEIGHBOR_4_DX = [1, -1, 0, 0] as const;
const NEIGHBOR_4_DY = [0, 0, 1, -1] as const;
const NEIGHBOR_8_DX = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const NEIGHBOR_8_DY = [0, 0, 1, -1, 1, -1, 1, -1] as const;

// 0=채색, 1=미봉합 흰 점, 2=투명 구멍, 3=검정 선화, 4=반투명 안티앨리어싱 경계
type PixelClass = 0 | 1 | 2 | 3 | 4;

interface ClassifierThresholds {
  readonly whiteLuma: number;
  readonly whiteChroma: number;
  readonly transparentAlpha: number;
  readonly lineartLuma: number;
  readonly lineartChroma: number;
}

function classifyPixel(
  r: number, g: number, b: number, a: number, t: ClassifierThresholds,
): PixelClass {
  if (a <= t.transparentAlpha) return 2;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (a >= 220 && luma >= t.whiteLuma && chroma <= t.whiteChroma) return 1;
  if (a >= 128 && luma <= t.lineartLuma && chroma <= t.lineartChroma) return 3;
  return a < 180 ? 4 : 0;
}

function isRectIntersecting(
  ax: number, ay: number, aw: number, ah: number, rect: SpecExclusionRect,
): boolean {
  return ax < rect.x + rect.width && ax + aw > rect.x && ay < rect.y + rect.height && ay + ah > rect.y;
}

interface ModeColorTracker {
  readonly counts: Map<number, number>;
  readonly reps: Map<number, RgbaColor>;
  totalVotes: number;
}

function addColorVote(tracker: ModeColorTracker, r: number, g: number, b: number, a: number): void {
  // 4단위 양자화로 안티앨리어싱 미세 편차를 묶어 지배적인 채색 톤을 안정적으로 추출한다.
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  tracker.counts.set(key, (tracker.counts.get(key) ?? 0) + 1);
  if (!tracker.reps.has(key)) tracker.reps.set(key, { r, g, b, a });
  tracker.totalVotes += 1;
}

function resolveModeColor(tracker: ModeColorTracker): RgbaColor | null {
  let bestKey = -1;
  let bestCount = -1;
  for (const [key, count] of tracker.counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey >= 0 ? (tracker.reps.get(bestKey) ?? null) : null;
}

function validateImageBuffer(image: RgbaImageBuffer): void {
  if (!Number.isInteger(image.width) || image.width <= 0) {
    throw new RangeError(`이미지 가로 크기(${image.width})는 양의 정수여야 합니다.`);
  }
  if (!Number.isInteger(image.height) || image.height <= 0) {
    throw new RangeError(`이미지 세로 크기(${image.height})는 양의 정수여야 합니다.`);
  }
  const expected = image.width * image.height * 4;
  if (image.data.length < expected) {
    throw new RangeError(`RGBA 버퍼 길이(${image.data.length})가 해상도(${expected})보다 짧습니다.`);
  }
}

/**
 * RGBA 컷 버퍼에서 선화 경계·채색 영역 내부에 고립된 미세 흰 점·투명 구멍을
 * Connected-Component Labeling으로 탐지하고 각 구멍의 최적 메우기 색상을 산출한다.
 */
export function detectWhiteSpecsAndBleedHoles(
  image: RgbaImageBuffer,
  options: WhiteSpecDetectorOptions = {},
): WhiteSpecDetectionReport {
  validateImageBuffer(image);
  const { width, height, data } = image;
  const totalPixels = width * height;
  const minAreaPx = Math.max(1, Math.round(options.minAreaPx ?? DEFAULT_MIN_SPEC_AREA_PX));
  const maxAreaPx = Math.max(minAreaPx, Math.round(options.maxAreaPx ?? DEFAULT_MAX_SPEC_AREA_PX));
  const thresholds: ClassifierThresholds = {
    whiteLuma: options.whiteLumaThreshold ?? DEFAULT_WHITE_LUMA_THRESHOLD,
    whiteChroma: options.maxWhiteChroma ?? DEFAULT_MAX_WHITE_CHROMA,
    transparentAlpha: options.transparentAlphaThreshold ?? DEFAULT_TRANSPARENT_ALPHA_THRESHOLD,
    lineartLuma: options.lineartMaxLuma ?? DEFAULT_LINEART_MAX_LUMA,
    lineartChroma: options.lineartMaxChroma ?? DEFAULT_LINEART_MAX_CHROMA,
  };
  const allowPureLineartEnclosure = options.allowPureLineartEnclosure ?? false;
  const excludeRects = options.excludeRects ?? [];
  const cclDx = options.connectivity === 8 ? NEIGHBOR_8_DX : NEIGHBOR_4_DX;
  const cclDy = options.connectivity === 8 ? NEIGHBOR_8_DY : NEIGHBOR_4_DY;

  const classes = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i += 1) {
    const o = i * 4;
    classes[i] = classifyPixel(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0, data[o + 3] ?? 0, thresholds);
  }

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const ringStamp = new Int32Array(totalPixels);
  let stamp = 0;

  const specs: DetectedWhiteSpec[] = [];
  let ignoredBorderComponentCount = 0;
  let ignoredOversizedComponentCount = 0;
  let ignoredNoFillNeighborCount = 0;
  let ignoredExcludedRectCount = 0;

  for (let startIdx = 0; startIdx < totalPixels; startIdx += 1) {
    const startClass = classes[startIdx];
    if ((startClass !== 1 && startClass !== 2) || visited[startIdx] === 1) continue;

    let head = 0;
    let tail = 1;
    queue[0] = startIdx;
    visited[startIdx] = 1;

    let touchesBorder = false;
    let whiteCount = 0;
    let transparentCount = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    const pixels: number[] = [];

    while (head < tail) {
      const idx = queue[head] ?? 0;
      head += 1;
      if (classes[idx] === 1) whiteCount += 1;
      else transparentCount += 1;

      const x = idx % width;
      const y = (idx - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      if (pixels.length <= maxAreaPx) pixels.push(idx);

      for (let d = 0; d < cclDx.length; d += 1) {
        const nx = x + (cclDx[d] ?? 0);
        const ny = y + (cclDy[d] ?? 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (visited[nIdx] === 1) continue;
        const nCls = classes[nIdx];
        if (nCls === 1 || nCls === 2) {
          visited[nIdx] = 1;
          queue[tail] = nIdx;
          tail += 1;
        }
      }
    }

    const areaPx = tail;
    if (touchesBorder) {
      ignoredBorderComponentCount += 1;
      continue;
    }
    if (areaPx < minAreaPx || areaPx > maxAreaPx) {
      if (areaPx > maxAreaPx) ignoredOversizedComponentCount += 1;
      continue;
    }

    const boundsWidth = maxX - minX + 1;
    const boundsHeight = maxY - minY + 1;
    if (excludeRects.some((r) => isRectIntersecting(minX, minY, boundsWidth, boundsHeight, r))) {
      ignoredExcludedRectCount += 1;
      continue;
    }

    stamp += 1;
    let touchesLineart = false;
    const fillTracker: ModeColorTracker = { counts: new Map(), reps: new Map(), totalVotes: 0 };
    const fallbackTracker: ModeColorTracker = { counts: new Map(), reps: new Map(), totalVotes: 0 };

    for (const idx of pixels) {
      const x = idx % width;
      const y = (idx - x) / width;
      for (let d = 0; d < NEIGHBOR_8_DX.length; d += 1) {
        const nx = x + (NEIGHBOR_8_DX[d] ?? 0);
        const ny = y + (NEIGHBOR_8_DY[d] ?? 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        const nCls = classes[nIdx];
        if (nCls === 1 || nCls === 2 || ringStamp[nIdx] === stamp) continue;
        ringStamp[nIdx] = stamp;
        const o = nIdx * 4;
        const r = data[o] ?? 0;
        const g = data[o + 1] ?? 0;
        const b = data[o + 2] ?? 0;
        const a = data[o + 3] ?? 255;

        if (nCls === 0) addColorVote(fillTracker, r, g, b, a);
        else {
          if (nCls === 3) touchesLineart = true;
          addColorVote(fallbackTracker, r, g, b, a);
        }
      }
    }

    if (fillTracker.totalVotes === 0 && !allowPureLineartEnclosure) {
      ignoredNoFillNeighborCount += 1;
      continue;
    }

    const suggestedFillRgba =
      resolveModeColor(fillTracker) ?? resolveModeColor(fallbackTracker) ?? { r: 0, g: 0, b: 0, a: 255 };
    const kind: DetectedSpecKind =
      whiteCount > 0 && transparentCount > 0
        ? "mixed"
        : transparentCount > 0
          ? "transparent-hole"
          : "white-spec";

    specs.push({
      specId: specs.length + 1, kind, areaPx,
      bounds: { x: minX, y: minY, width: boundsWidth, height: boundsHeight },
      centroid: {
        x: Math.round((sumX / areaPx) * 100) / 100,
        y: Math.round((sumY / areaPx) * 100) / 100,
      },
      touchesLineart, surroundingFillCount: fillTracker.totalVotes,
      suggestedFillRgba, pixelIndices: pixels,
    });
  }

  const totalSpecPixelCount = specs.reduce((acc, spec) => acc + spec.areaPx, 0);
  return {
    width, height, specs, totalSpecPixelCount,
    ignoredBorderComponentCount, ignoredOversizedComponentCount,
    ignoredNoFillNeighborCount, ignoredExcludedRectCount,
    summaryKo: specs.length === 0
      ? "미봉합 흰 점과 투명 구멍이 발견되지 않았습니다."
      : `미봉합 흰 점·투명 구멍 ${specs.length}곳(총 ${totalSpecPixelCount}px²)을 찾았습니다. 1클릭 자동 메우기로 보정할 수 있습니다.`,
  };
}

/**
 * 탐지된 미봉합 흰 점·투명 구멍을 각 구멍 주변 채색 픽셀 최빈값으로 1클릭 복원한다.
 * 기본값은 원본 버퍼를 보존한 복제본을 반환해 즉시 실행 취소(Undo)와 호환된다.
 */
export function healWhiteSpecs(
  image: RgbaImageBuffer,
  specs: readonly DetectedWhiteSpec[],
  options: HealWhiteSpecsOptions = {},
): HealWhiteSpecsResult {
  validateImageBuffer(image);
  const output = options.inPlace ? image.data : new Uint8ClampedArray(image.data);
  const selectedIds = options.specIds ? new Set(options.specIds) : null;
  const forceOpaqueAlpha = options.forceOpaqueAlpha ?? true;

  let healedSpecCount = 0;
  let healedPixelCount = 0;
  let skippedSpecCount = 0;

  for (const spec of specs) {
    if (selectedIds && !selectedIds.has(spec.specId)) {
      skippedSpecCount += 1;
      continue;
    }
    const { r, g, b, a } = spec.suggestedFillRgba;
    const fillAlpha = forceOpaqueAlpha ? 255 : a;
    for (const pixelIndex of spec.pixelIndices) {
      const o = pixelIndex * 4;
      if (o < 0 || o + 3 >= output.length) continue;
      output[o] = r;
      output[o + 1] = g;
      output[o + 2] = b;
      output[o + 3] = fillAlpha;
      healedPixelCount += 1;
    }
    healedSpecCount += 1;
  }

  return {
    width: image.width, height: image.height, data: output,
    healedSpecCount, healedPixelCount, skippedSpecCount,
    summaryKo: healedSpecCount === 0
      ? "메울 대상 흰 점이 없어 원본 버퍼를 유지했습니다."
      : `미봉합 영역 ${healedSpecCount}곳(${healedPixelCount}px²)을 주변 채색 최빈값으로 메웠습니다.`,
  };
}
