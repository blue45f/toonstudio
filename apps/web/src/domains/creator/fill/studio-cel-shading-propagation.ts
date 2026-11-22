/**
 * 이전 컷 캐릭터 팔레트 영역 시드 자동 전파 + 단일 광원 방향 핀(예: 좌상단 45°) 기반
 * 셀 셰이딩 1차 그림자 마스크 생성 순수 엔진.
 */

import {
  DEFAULT_MICRO_DETAIL_PROTECTION_AREA_PX,
  closeLineartGapsWithDetailGuard,
  computeExactSquaredDistanceField,
  type PixelImageLike,
} from "./studio-lineart-gap-closing";

export type CharacterPaletteSeedLabel = "A" | "B" | "C" | "D" | "E" | "F";

export interface CutPaletteRegionDescriptor {
  readonly label: CharacterPaletteSeedLabel;
  readonly centroidX01: number;
  readonly centroidY01: number;
  readonly areaRatio: number;
  readonly aspectRatio: number;
}

export interface PropagatedCutSeed {
  readonly cutId: string;
  readonly label: CharacterPaletteSeedLabel;
  readonly normalizedXY: readonly [number, number];
  readonly confidence01: number;
  readonly regionAreaPx: number;
}

export type CelLightPinPreset =
  | "top-left-45"
  | "top-right-45"
  | "top-down"
  | "left-side"
  | "right-side"
  | "bottom-up"
  | "custom";

export interface CelLightDirectionPin {
  readonly preset?: CelLightPinPreset;
  /** 사용자 지정 광원 각도(도, 0°=우측, 90°=상단, 135°=좌상단 45°, 180°=좌측, 270°=하단). */
  readonly angleDeg?: number;
  /** 1차 셀 그림자 면적 비율(0.15..0.65). 기본 0.34. */
  readonly shadowCoverage?: number;
  /** 하드 셀 엣지(0 | 255) 생성 여부. 기본 true. */
  readonly hardEdge?: boolean;
}

export interface ResolvedCelLightPin {
  readonly preset: CelLightPinPreset;
  readonly angleDeg: number;
  /** 표면에서 광원을 향하는 정규화 벡터(캔버스 좌표: +X 우, +Y 하). 좌상단 45° = [-0.7071, -0.7071]. */
  readonly lightSourceVector: readonly [number, number];
  /** 그림자가 떨어지는 방향 정규화 벡터. 좌상단 45° = [+0.7071, +0.7071]. */
  readonly shadowCastVector: readonly [number, number];
  readonly shadowCoverage: number;
  readonly hardEdge: boolean;
}

export interface CelShadowMaskResult {
  readonly width: number;
  readonly height: number;
  /** 1차 셀 셰이딩 그림자 마스크(0=밝음, 255=1차 그림자). */
  readonly shadowMask: Uint8Array;
  readonly resolvedPin: ResolvedCelLightPin;
  readonly shadowPixelCount: number;
  readonly litPixelCount: number;
  readonly actualShadowRatio: number;
}

const PRESET_ANGLES_DEG: Readonly<Record<Exclude<CelLightPinPreset, "custom">, number>> = Object.freeze({
  "top-left-45": 135,
  "top-right-45": 45,
  "top-down": 90,
  "left-side": 180,
  "right-side": 0,
  "bottom-up": 270,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/**
 * 이전 컷의 칠해진 영역 정보(정규화 중심·면적비·종횡비·A~F 라벨)를 후속 컷 시드 전파용 기술자로 추출한다.
 */
export function extractCutRegionPaletteDescriptors(params: {
  readonly width: number;
  readonly height: number;
  readonly regionMap: Int32Array;
  readonly regionLabels: readonly (CharacterPaletteSeedLabel | null)[];
  readonly minRegionAreaPx?: number;
}): readonly CutPaletteRegionDescriptor[] {
  const { width, height, regionMap, regionLabels } = params;
  const minArea = Math.max(1, params.minRegionAreaPx ?? DEFAULT_MICRO_DETAIL_PROTECTION_AREA_PX);
  const totalPixels = Math.max(1, width * height);
  const regionCount = regionLabels.length;
  const count = new Int32Array(regionCount);
  const sumX = new Float64Array(regionCount);
  const sumY = new Float64Array(regionCount);
  const minX = new Int32Array(regionCount).fill(width);
  const maxX = new Int32Array(regionCount).fill(-1);
  const minY = new Int32Array(regionCount).fill(height);
  const maxY = new Int32Array(regionCount).fill(-1);

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const rid = regionMap[rowOff + x] ?? -1;
      if (rid < 0 || rid >= regionCount || !regionLabels[rid]) continue;
      count[rid] = (count[rid] ?? 0) + 1;
      sumX[rid] = (sumX[rid] ?? 0) + x;
      sumY[rid] = (sumY[rid] ?? 0) + y;
      if (x < minX[rid]!) minX[rid] = x;
      if (x > maxX[rid]!) maxX[rid] = x;
      if (y < minY[rid]!) minY[rid] = y;
      if (y > maxY[rid]!) maxY[rid] = y;
    }
  }

  const descriptors: CutPaletteRegionDescriptor[] = [];
  for (let rid = 0; rid < regionCount; rid += 1) {
    const label = regionLabels[rid];
    const area = count[rid] ?? 0;
    if (!label || area < minArea) continue;
    const spanW = Math.max(1, maxX[rid]! - minX[rid]! + 1);
    const spanH = Math.max(1, maxY[rid]! - minY[rid]! + 1);
    descriptors.push(
      Object.freeze({
        label,
        centroidX01: Math.round(((sumX[rid]! / area) / Math.max(1, width - 1)) * 1000) / 1000,
        centroidY01: Math.round(((sumY[rid]! / area) / Math.max(1, height - 1)) * 1000) / 1000,
        areaRatio: Math.round((area / totalPixels) * 10_000) / 10_000,
        aspectRatio: Math.round((spanW / spanH) * 1000) / 1000,
      }),
    );
  }
  return Object.freeze(descriptors);
}

/**
 * 이전 컷의 캐릭터 팔레트 영역 기술자를 현재 컷의 닫힌 영역들에 자동 매칭해 안전 내부 시드를 전파한다.
 */
export function propagatePreviousCutRegionSeeds(params: {
  readonly cutId: string;
  readonly width: number;
  readonly height: number;
  readonly closedBarrier: Uint8Array;
  readonly microDetailProtectionMask?: Uint8Array;
  readonly previousRegions: readonly CutPaletteRegionDescriptor[];
  readonly maxMatchCost?: number;
}): readonly PropagatedCutSeed[] {
  const { cutId, width, height, closedBarrier, microDetailProtectionMask, previousRegions } = params;
  if (previousRegions.length === 0 || width <= 2 || height <= 2) return Object.freeze([]);

  const maxCost = params.maxMatchCost ?? 1.85;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const seeds: PropagatedCutSeed[] = [];

  for (let start = 0; start < total; start += 1) {
    if (
      closedBarrier[start]! > 0 ||
      visited[start]! > 0 ||
      (microDetailProtectionMask && microDetailProtectionMask[start]! > 0)
    ) {
      continue;
    }

    let head = 0;
    let tail = 0;
    visited[start] = 1;
    queue[tail++] = start;

    let touchesEdge = false;
    let sumX = 0;
    let sumY = 0;
    let minX = start % width;
    let maxX = minX;
    let minY = (start - minX) / width;
    let maxY = minY;

    while (head < tail) {
      const idx = queue[head++]!;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) touchesEdge = true;
      sumX += x;
      sumY += y;
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
        if (n >= 0 && closedBarrier[n] === 0 && visited[n] === 0) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    if (touchesEdge || tail < DEFAULT_MICRO_DETAIL_PROTECTION_AREA_PX) continue;

    const cx = sumX / tail;
    const cy = sumY / tail;
    const cx01 = cx / Math.max(1, width - 1);
    const cy01 = cy / Math.max(1, height - 1);
    const areaRatio = tail / total;
    const aspectRatio = Math.max(1, maxX - minX + 1) / Math.max(1, maxY - minY + 1);

    let bestPrev: CutPaletteRegionDescriptor | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const prev of previousRegions) {
      const posDist = Math.hypot(cx01 - prev.centroidX01, cy01 - prev.centroidY01);
      const areaLogDiff = Math.abs(Math.log((areaRatio + 1e-5) / (prev.areaRatio + 1e-5)));
      const aspectLogDiff = Math.abs(Math.log((aspectRatio + 1e-4) / (prev.aspectRatio + 1e-4)));
      const cost = posDist * 1.65 + areaLogDiff * 0.4 + aspectLogDiff * 0.3;
      if (cost < bestCost) {
        bestCost = cost;
        bestPrev = prev;
      }
    }

    if (!bestPrev || bestCost > maxCost) continue;

    let bestPixelIdx = queue[0]!;
    let bestPixelDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < tail; i += 1) {
      const pIdx = queue[i]!;
      const px = pIdx % width;
      const py = (pIdx - px) / width;
      const dSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (dSq < bestPixelDistSq) {
        bestPixelDistSq = dSq;
        bestPixelIdx = pIdx;
      }
    }
    const seedX = bestPixelIdx % width;
    const seedY = (bestPixelIdx - seedX) / width;

    seeds.push(
      Object.freeze({
        cutId,
        label: bestPrev.label,
        normalizedXY: Object.freeze([
          Math.round((seedX / Math.max(1, width - 1)) * 10_000) / 10_000,
          Math.round((seedY / Math.max(1, height - 1)) * 10_000) / 10_000,
        ] as const),
        confidence01: Math.round(clamp(1 - bestCost / maxCost, 0.05, 1) * 1000) / 1000,
        regionAreaPx: tail,
      }),
    );
  }

  return Object.freeze(seeds);
}

/**
 * 단일 광원 방향 핀(예: 좌상단 45°)을 정규화 광원 벡터 및 그림자 투사 벡터로 해석한다.
 */
export function resolveCelLightPinVector(pin?: CelLightDirectionPin): ResolvedCelLightPin {
  const preset: CelLightPinPreset = pin?.preset ?? (pin?.angleDeg !== undefined ? "custom" : "top-left-45");
  const rawAngle =
    pin?.angleDeg !== undefined && Number.isFinite(pin.angleDeg)
      ? pin.angleDeg
      : preset === "custom"
        ? 135
        : PRESET_ANGLES_DEG[preset];
  const angleDeg = ((rawAngle % 360) + 360) % 360;
  const rad = (angleDeg * Math.PI) / 180;
  const lx = Math.round(Math.cos(rad) * 10_000) / 10_000;
  const ly = Math.round(-Math.sin(rad) * 10_000) / 10_000;
  const len = Math.hypot(lx, ly) || 1;
  const nlx = Math.round((lx / len) * 10_000) / 10_000;
  const nly = Math.round((ly / len) * 10_000) / 10_000;

  return Object.freeze({
    preset,
    angleDeg,
    lightSourceVector: Object.freeze([nlx, nly] as const),
    shadowCastVector: Object.freeze([-nlx, -nly] as const),
    shadowCoverage: clamp(pin?.shadowCoverage ?? 0.34, 0.15, 0.65),
    hardEdge: pin?.hardEdge !== false,
  });
}

/**
 * 단일 광원 방향 핀(예: 좌상단 45°) 기반으로 윤곽 거리장 법선 + 영역 투영을 조합해
 * 1차 셀 셰이딩 그림자 마스크(0 | 255)를 결정적으로 생성한다.
 */
export function generateSingleLightCelShadowMask(params: {
  readonly fillMask: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly pin?: CelLightDirectionPin;
  readonly microDetailProtectionMask?: Uint8Array;
}): CelShadowMaskResult {
  const { fillMask, width, height, microDetailProtectionMask } = params;
  const total = width * height;
  const resolvedPin = resolveCelLightPinVector(params.pin);
  const shadowMask = new Uint8Array(total);
  if (width <= 0 || height <= 0 || fillMask.length < total) {
    return { width, height, shadowMask, resolvedPin, shadowPixelCount: 0, litPixelCount: 0, actualShadowRatio: 0 };
  }

  const exteriorFeature = new Uint8Array(total);
  let filledTotal = 0;
  for (let i = 0; i < total; i += 1) {
    if (fillMask[i]! > 0) filledTotal += 1;
    else exteriorFeature[i] = 1;
  }
  if (filledTotal === 0) {
    return { width, height, shadowMask, resolvedPin, shadowPixelCount: 0, litPixelCount: 0, actualShadowRatio: 0 };
  }

  const distSqToEdge = computeExactSquaredDistanceField(exteriorFeature, width, height);
  const distToEdge = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    distToEdge[i] = fillMask[i]! > 0 ? Math.sqrt(Math.min(distSqToEdge[i]!, 1e6)) : 0;
  }

  const regionMap = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  const minXs: number[] = [];
  const maxXs: number[] = [];
  const minYs: number[] = [];
  const maxYs: number[] = [];
  let nextRegionId = 0;

  for (let start = 0; start < total; start += 1) {
    if (fillMask[start] === 0 || regionMap[start] !== -1) continue;
    const rid = nextRegionId++;
    let head = 0;
    let tail = 0;
    regionMap[start] = rid;
    queue[tail++] = start;
    let minX = start % width;
    let maxX = minX;
    let minY = (start - minX) / width;
    let maxY = minY;

    while (head < tail) {
      const idx = queue[head++]!;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && fillMask[idx - 1]! > 0 && regionMap[idx - 1] === -1) {
        regionMap[idx - 1] = rid;
        queue[tail++] = idx - 1;
      }
      if (x + 1 < width && fillMask[idx + 1]! > 0 && regionMap[idx + 1] === -1) {
        regionMap[idx + 1] = rid;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && fillMask[idx - width]! > 0 && regionMap[idx - width] === -1) {
        regionMap[idx - width] = rid;
        queue[tail++] = idx - width;
      }
      if (y + 1 < height && fillMask[idx + width]! > 0 && regionMap[idx + width] === -1) {
        regionMap[idx + width] = rid;
        queue[tail++] = idx + width;
      }
    }
    minXs.push(minX);
    maxXs.push(maxX);
    minYs.push(minY);
    maxYs.push(maxY);
  }

  const [lx, ly] = resolvedPin.lightSourceVector;
  const terminator = (resolvedPin.shadowCoverage - 0.5) * 1.45;
  let shadowPixelCount = 0;
  let litPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      const rid = regionMap[idx] ?? -1;
      if (rid < 0) continue;
      if (microDetailProtectionMask && microDetailProtectionMask[idx]! > 0) {
        litPixelCount += 1;
        continue;
      }

      const spanX = Math.max(1, maxXs[rid]! - minXs[rid]!);
      const spanY = Math.max(1, maxYs[rid]! - minYs[rid]!);
      const nx = ((x - minXs[rid]!) / spanX) * 2 - 1;
      const ny = ((y - minYs[rid]!) / spanY) * 2 - 1;

      const dLeft = x > 0 ? distToEdge[idx - 1]! : 0;
      const dRight = x + 1 < width ? distToEdge[idx + 1]! : 0;
      const dUp = y > 0 ? distToEdge[idx - width]! : 0;
      const dDown = y + 1 < height ? distToEdge[idx + width]! : 0;
      const gx = -(dRight - dLeft);
      const gy = -(dDown - dUp);
      const gLen = Math.hypot(gx, gy);
      const normGx = gLen > 1e-4 ? gx / gLen : nx;
      const normGy = gLen > 1e-4 ? gy / gLen : ny;

      const surfX = nx * 0.62 + normGx * 0.38;
      const surfY = ny * 0.62 + normGy * 0.38;
      const surfLen = Math.hypot(surfX, surfY) || 1;
      const nDotL = (surfX / surfLen) * lx + (surfY / surfLen) * ly;

      if (nDotL < terminator) {
        shadowMask[idx] = resolvedPin.hardEdge
          ? 255
          : Math.round(clamp((terminator - nDotL) / Math.max(0.15, 1 + terminator), 0.35, 1) * 255);
        shadowPixelCount += 1;
      } else {
        litPixelCount += 1;
      }
    }
  }

  return {
    width,
    height,
    shadowMask,
    resolvedPin,
    shadowPixelCount,
    litPixelCount,
    actualShadowRatio:
      shadowPixelCount + litPixelCount > 0
        ? Math.round((shadowPixelCount / (shadowPixelCount + litPixelCount)) * 1000) / 1000
        : 0,
  };
}

/**
 * 언더페인팅 타일용 선화 틈새 닫힘 + 미세 디테일 보호(< 24px²) + 이전 컷 시드 전파를 통합 준비한다.
 */
export function prepareUnderpaintingLineartAndSeeds(params: {
  readonly lineart: PixelImageLike;
  readonly cutId: string;
  readonly inkLuminanceThreshold: number;
  readonly gapCloseRadiusPx?: number | "auto";
  readonly protectMicroDetailAreaPx?: number;
  readonly previousCutRegions?: readonly CutPaletteRegionDescriptor[];
  readonly existingStrokes: readonly {
    readonly cutId: string;
    readonly label: CharacterPaletteSeedLabel;
    readonly normalizedXY: readonly [number, number];
  }[];
}): {
  readonly closedBarrier: Uint8Array | null;
  readonly microDetailMask: Uint8Array | null;
  readonly appliedGapCloseRadiusPx: number;
  readonly protectedMicroDetailPixelCount: number;
  readonly propagatedSeeds: readonly PropagatedCutSeed[];
} {
  const needsGapClose = params.gapCloseRadiusPx !== undefined;
  const needsSeedProp =
    params.existingStrokes.length === 0 && Boolean(params.previousCutRegions?.length);
  if (!needsGapClose && !needsSeedProp) {
    return {
      closedBarrier: null,
      microDetailMask: null,
      appliedGapCloseRadiusPx: 0,
      protectedMicroDetailPixelCount: 0,
      propagatedSeeds: Object.freeze([]),
    };
  }

  const seedPoints = params.existingStrokes.map((s) => ({
    x: Math.round(s.normalizedXY[0] * (params.lineart.width - 1)),
    y: Math.round(s.normalizedXY[1] * (params.lineart.height - 1)),
  }));
  const gapResult = closeLineartGapsWithDetailGuard(params.lineart, {
    gapCloseRadiusPx: params.gapCloseRadiusPx ?? "auto",
    inkLuminanceThreshold: params.inkLuminanceThreshold,
    protectMicroDetailAreaPx:
      params.protectMicroDetailAreaPx ?? DEFAULT_MICRO_DETAIL_PROTECTION_AREA_PX,
    seeds: seedPoints.length > 0 ? seedPoints : undefined,
  });

  const propagatedSeeds = needsSeedProp
    ? propagatePreviousCutRegionSeeds({
        cutId: params.cutId,
        width: params.lineart.width,
        height: params.lineart.height,
        closedBarrier: gapResult.closedBarrier,
        microDetailProtectionMask: gapResult.microDetailProtection.mask,
        previousRegions: params.previousCutRegions ?? [],
      })
    : Object.freeze([]);

  return {
    closedBarrier: gapResult.closedBarrier,
    microDetailMask: gapResult.microDetailProtection.mask,
    appliedGapCloseRadiusPx: gapResult.appliedRadiusPx,
    protectedMicroDetailPixelCount: gapResult.microDetailProtection.protectedPixelCount,
    propagatedSeeds,
  };
}

/**
 * 단일 광원 방향 핀으로 생성된 1차 셀 셰이딩 그림자 마스크를 언더페인팅 음영 RGBA 버퍼에 투영한다.
 */
export function paintCelPinShadowIntoBuffer(params: {
  readonly width: number;
  readonly height: number;
  readonly regionMap: Int32Array;
  readonly regionShadowRgb: readonly (readonly [number, number, number] | null)[];
  readonly pin: CelLightDirectionPin;
  readonly microDetailMask?: Uint8Array | null;
}): Uint8ClampedArray {
  const { width, height, regionMap, regionShadowRgb, pin, microDetailMask } = params;
  const total = width * height;
  const fillMask = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    const rid = regionMap[i] ?? -1;
    if (rid >= 0 && regionShadowRgb[rid]) fillMask[i] = 255;
  }

  const cel = generateSingleLightCelShadowMask({
    fillMask,
    width,
    height,
    pin,
    microDetailProtectionMask: microDetailMask ?? undefined,
  });

  const shadowData = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i += 1) {
    const alpha = cel.shadowMask[i] ?? 0;
    if (alpha === 0) continue;
    const rid = regionMap[i] ?? -1;
    const rgb = rid >= 0 ? regionShadowRgb[rid] : null;
    if (!rgb) continue;
    const off = i * 4;
    shadowData[off] = rgb[0];
    shadowData[off + 1] = rgb[1];
    shadowData[off + 2] = rgb[2];
    shadowData[off + 3] = alpha;
  }
  return shadowData;
}
