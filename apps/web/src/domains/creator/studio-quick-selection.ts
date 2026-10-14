/**
 * studio-quick-selection.ts
 *
 * 빠른 선택(Quick Selection) 브러시의 순수 영역 확장 로직.
 *
 * 배경: 선택 도구에는 매직 완드(`studio-magic-wand.ts`, 클릭 지점 플러드)와
 * 올가미·도형·브러시·색상 범위가 있지만, 브러시로 문지르면 경계를 따라 선택이
 * 자라는 Photoshop 식 빠른 선택 브러시는 없었다. 이 모듈은 그 핵심 알고리즘을
 * 순수 함수로 제공한다. 캔버스·Worker 오케스트레이션은
 * `studio-quick-selection-browser.ts` / `-worker-client.ts` 가
 * `studio-magic-wand-browser.ts` 패턴을 따라 담당한다.
 *
 * 알고리즘(결정적, 시드 기반 영역 성장):
 *  1. 브러시 자국(seed discs) 아래 픽셀들의 색상 평균·분산을 구한다.
 *  2. 시드 픽셀에서 시작해 4방향 이웃으로 성장한다. 이웃 픽셀의 색이
 *     시드 통계와 tolerance 이내로 가까우면 선택에 편입하고 성장 프론티어에 넣는다.
 *  3. 시드 디스크 자체는 무조건 선택된다(사용자가 칠한 자리).
 * 색 거리 = RGB 정규화 유클리드 거리(0..1). 알파 0인 픽셀은 성장 대상에서 제외.
 *
 * 큰 캔버스에서는 다운샘플한 프록시 위에서 돌리는 것을 전제로 하며, 이 모듈
 * 자체는 입력 크기 예산을 검증만 한다(호출자가 타일/프록시를 책임진다).
 */
import { traceMaskContours, type MagicWandRegion } from "./studio-magic-wand";

/** 허용 오차 슬라이더 범위 — 정규화 색 거리(0..1)를 100배 한 표시 단위. */
export const QUICK_SELECTION_TOLERANCE_RANGE = { min: 0, max: 60, step: 1 } as const;
/** 허용 오차 기본값(표시 단위) — 정규화 0.18 에 해당한다. */
export const QUICK_SELECTION_TOLERANCE_DEFAULT = 18;
/** 프록시 스캔 해상도 상한(긴 변 px) — 매직 완드 추적(640)보다 크게 잡아 브러시 경계 디테일을 살린다. */
export const QUICK_SELECTION_PROXY_MAX_DIM = 1024;

/** 슬라이더 표시 단위(0..60) → 정규화 색 거리(0..0.6). 범위를 벗어나면 clamp. */
export function quickSelectionToleranceFromSlider(sliderValue: number): number {
  const clamped = Math.min(
    QUICK_SELECTION_TOLERANCE_RANGE.max,
    Math.max(QUICK_SELECTION_TOLERANCE_RANGE.min, sliderValue),
  );
  return clamped / 100;
}

export interface QuickSelectionRaster {
  readonly width: number;
  readonly height: number;
  /** RGBA, 길이 = width * height * 4. */
  readonly data: Uint8ClampedArray | readonly number[];
}

export interface QuickSelectionSeed {
  readonly x: number;
  readonly y: number;
  /** 브러시 반경(px). */
  readonly radius: number;
}

export interface QuickSelectionOptions {
  /** 색 거리 허용치 0..1. 클수록 넓게 자란다. 기본 0.18. */
  readonly tolerance?: number;
  /** 처리 픽셀 수 상한(프록시 예산). 초과하면 throw. 기본 16M. */
  readonly maxPixels?: number;
}

export interface QuickSelectionResult {
  /** 0(미선택) | 255(선택) 마스크, 길이 = width * height. */
  readonly mask: Uint8Array;
  readonly selectedCount: number;
  readonly bounds: { x: number; y: number; width: number; height: number } | null;
}

const DEFAULT_TOLERANCE = 0.18;
const DEFAULT_MAX_PIXELS = 16_000_000;

interface SeedColorStats {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 채널 합 분산 기반 허용 폭 보정(시드 내부가 이미 다채로우면 조금 넓힌다). */
  readonly spread: number;
}

function colorDistance(
  data: QuickSelectionRaster["data"],
  offset: number,
  stats: SeedColorStats,
): number {
  const dr = ((data[offset] ?? 0) - stats.r) / 255;
  const dg = ((data[offset + 1] ?? 0) - stats.g) / 255;
  const db = ((data[offset + 2] ?? 0) - stats.b) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
}

function collectSeedStats(
  raster: QuickSelectionRaster,
  seeds: readonly QuickSelectionSeed[],
  mask: Uint8Array,
): SeedColorStats {
  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const { width, height, data } = raster;
  for (const seed of seeds) {
    const radius = Math.max(0, Math.floor(seed.radius));
    const x0 = Math.max(0, Math.floor(seed.x) - radius);
    const x1 = Math.min(width - 1, Math.floor(seed.x) + radius);
    const y0 = Math.max(0, Math.floor(seed.y) - radius);
    const y1 = Math.min(height - 1, Math.floor(seed.y) + radius);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - seed.x;
        const dy = y - seed.y;
        if (dx * dx + dy * dy > radius * radius) continue;
        const index = y * width + x;
        mask[index] = 255;
        const offset = index * 4;
        sumR += data[offset] ?? 0;
        sumG += data[offset + 1] ?? 0;
        sumB += data[offset + 2] ?? 0;
        count += 1;
      }
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0, spread: 0 };
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  // 시드 내부 분산(평균 색과의 평균 거리)을 구해 허용 폭 하한으로 쓴다.
  let distanceSum = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 255) continue;
    const offset = index * 4;
    const dr = ((data[offset] ?? 0) - meanR) / 255;
    const dg = ((data[offset + 1] ?? 0) - meanG) / 255;
    const db = ((data[offset + 2] ?? 0) - meanB) / 255;
    distanceSum += Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
  }
  return { r: meanR, g: meanG, b: meanB, spread: distanceSum / count };
}

/**
 * 시드 브러시 자국에서 선택 마스크를 성장시킨다.
 * 반환 마스크에는 시드 디스크 + tolerance 이내로 연결된 영역이 들어간다.
 */
export function growQuickSelection(
  raster: QuickSelectionRaster,
  seeds: readonly QuickSelectionSeed[],
  options: QuickSelectionOptions = {},
): QuickSelectionResult {
  const { width, height, data } = raster;
  const pixelCount = width * height;
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("quick selection raster dimensions are invalid.");
  }
  if (pixelCount > maxPixels) {
    throw new RangeError(`quick selection raster exceeds the ${maxPixels} pixel budget.`);
  }
  if (data.length < pixelCount * 4) {
    throw new RangeError("quick selection raster data is shorter than width*height*4.");
  }
  const tolerance = Math.min(1, Math.max(0, options.tolerance ?? DEFAULT_TOLERANCE));

  const mask = new Uint8Array(pixelCount);
  const stats = collectSeedStats(raster, seeds, mask);
  // 시드 내부가 이미 다채로우면(spread 큼) 그만큼은 허용 — 단 tolerance를 상한으로.
  const threshold = Math.min(tolerance, Math.max(tolerance * 0.6, stats.spread));

  // 성장: 시드 경계에서 시작하는 스택 기반 플러드.
  const stack: number[] = [];
  for (let index = 0; index < pixelCount; index += 1) {
    if (mask[index] === 255) stack.push(index);
  }
  const tryGrow = (index: number): void => {
    if (mask[index] === 255) return;
    const offset = index * 4;
    if ((data[offset + 3] ?? 0) === 0) return;
    if (colorDistance(data, offset, stats) > threshold) return;
    mask[index] = 255;
    stack.push(index);
  };
  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined) break;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) tryGrow(index - 1);
    if (x < width - 1) tryGrow(index + 1);
    if (y > 0) tryGrow(index - width);
    if (y < height - 1) tryGrow(index + width);
  }

  let selectedCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < pixelCount; index += 1) {
    if (mask[index] !== 255) continue;
    selectedCount += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    mask,
    selectedCount,
    bounds:
      selectedCount === 0
        ? null
        : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

// ---------------------------------------------------------------------------
// 마스크 → MagicWandRegion 어댑터 (매직 완드와 동일한 벡터 선택 파이프라인 합류)
// ---------------------------------------------------------------------------

/**
 * 래스터 + 시드에서 성장한 마스크를 매직 완드의 윤곽 추적으로 폴리곤 선택 영역으로
 * 변환한다. 반환 좌표는 스캔 래스터 기준 0..1 정규화 — `applyMagicWandRegionToSelection`
 * 에 그대로 넣을 수 있다. 성장한 픽셀이 없으면 outer 가 빈 배열이다.
 */
export function quickSelectionRegionFromRaster(
  raster: QuickSelectionRaster,
  seeds: readonly QuickSelectionSeed[],
  options: QuickSelectionOptions = {},
): { region: MagicWandRegion; selectedCount: number; bounds: QuickSelectionResult["bounds"] } {
  const result = growQuickSelection(raster, seeds, options);
  if (result.selectedCount === 0 || seeds.length === 0) {
    return { region: { outer: [], holes: [] }, selectedCount: 0, bounds: null };
  }
  const mask = new Uint8Array(raster.width * raster.height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = result.mask[index] === 255 ? 1 : 0;
  }
  const first = seeds[0]!;
  const startX = Math.min(raster.width - 1, Math.max(0, Math.floor(first.x)));
  const startY = Math.min(raster.height - 1, Math.max(0, Math.floor(first.y)));
  const region = traceMaskContours(mask, raster.width, raster.height, startX, startY);
  return { region, selectedCount: result.selectedCount, bounds: result.bounds };
}
