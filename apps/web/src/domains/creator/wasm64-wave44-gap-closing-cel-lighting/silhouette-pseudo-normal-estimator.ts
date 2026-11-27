/**
 * Wave 44: 실루엣 거리장 + 스무스 베벨 구배(Gradient) 기반 2.5D 의사 법선 맵 생성기.
 *
 * - 별도 3D 메쉬 없이도 채워진 캐릭터·사물 실루엣 알파 마스크로부터 유클리드 내부 거리장을 계산하고,
 *   구면(`hemisphere`)·코사인(`cosine`)·스무스스텝(`smoothstep`) 베벨 프로파일과 분리형 스무딩 필터를 적용해
 *   유기적인 2.5D 높이장(`heightField`)을 복원한다.
 * - Sobel 3x3 미분 구배로부터 모든 픽셀에서 단위벡터(`||N|| = 1`, `nz > 0`)로 정규화된
 *   의사 법선(`nx, ny, nz`)과 표준 탄젠트 노멀맵(`Uint8ClampedArray`)을 생성한다.
 */

import { computeMeijsterEdt2d } from "./sdf-gap-closing-flood-fill";

export type SilhouetteBevelProfile = "hemisphere" | "cosine" | "smoothstep";
export type NormalYAxisConvention = "up" | "down";

export interface PseudoNormalEstimatorInput {
  readonly width: number;
  readonly height: number;
  /** 단일 채널 알파 마스크(`W*H`, `0..255`) 또는 RGBA 버퍼(`W*H*4`). */
  readonly silhouetteAlpha: Uint8Array | Uint8ClampedArray;
  /** 실루엣 내부 판정 알파 임계값(`1..255`, 기본값 `16`). */
  readonly alphaThreshold?: number;
  /** 외곽에서 중심부까지 입체 곡률이 차오르는 베벨 폭(`px`, 미지정 시 실루엣 두께 기반 자동 산출). */
  readonly bevelWidthPx?: number;
  /** 단면 곡률 프로파일(기본값 `"hemisphere"`). */
  readonly profileCurve?: SilhouetteBevelProfile;
  /** 높이장 계단 현상 제거용 분리형 `[1, 2, 1]/4` 스무딩 횟수(기본값 `2`). */
  readonly smoothingPasses?: number;
  /** 법선 기울기 강조 배율(기본값 `1.0`). */
  readonly normalStrength?: number;
  /** `ny` 부호 기준(`"up"`: 화면 위쪽이 `+Y`, `"down"`: 화면 아래쪽이 `+Y`, 기본값 `"up"`). */
  readonly yAxisConvention?: NormalYAxisConvention;
}

export interface PseudoNormal3d {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

export interface PseudoNormalMapResult {
  readonly width: number;
  readonly height: number;
  /** 추출된 단일 채널 실루엣 알파(`0..255`, 길이 `W*H`). */
  readonly alphaMask: Uint8ClampedArray;
  /** 이진 실루엣 내부 마스크(`1` = 내부, `0` = 외부, 길이 `W*H`). */
  readonly interiorMask: Uint8Array;
  /** 스무딩된 2.5D 베벨 높이장(`px` 스케일, 길이 `W*H`). */
  readonly heightField: Float32Array;
  /** 픽셀당 `[nx, ny, nz]` 인터리브 단위 법선 버퍼(길이 `W*H*3`). */
  readonly normalsFloat32: Float32Array;
  /** 탄젠트 공간 RGBA 노멀맵(`R=(nx+1)*127.5`, `G=(ny+1)*127.5`, `B=(nz+1)*127.5`, `A=alpha`). */
  readonly normalMapRgba: Uint8ClampedArray;
  readonly effectiveBevelWidthPx: number;
  readonly maxInteriorDistancePx: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function extractSingleChannelAlpha(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const total = width * height;
  const out = new Uint8ClampedArray(total);
  if (source.length >= total * 4) {
    for (let i = 0; i < total; i += 1) {
      out[i] = source[i * 4 + 3] ?? 0;
    }
    return out;
  }
  const copyLen = Math.min(total, source.length);
  for (let i = 0; i < copyLen; i += 1) {
    out[i] = source[i] ?? 0;
  }
  return out;
}

function evaluateBevelProfile(tNorm: number, profile: SilhouetteBevelProfile): number {
  const t = clamp(tNorm, 0, 1);
  if (profile === "cosine") {
    return 0.5 * (1 - Math.cos(Math.PI * t));
  }
  if (profile === "smoothstep") {
    return t * t * (3 - 2 * t);
  }
  // hemisphere: 원기둥·구체 단면 곡률 `sqrt(1 - (1 - t)^2)`
  const inv = 1 - t;
  return Math.sqrt(Math.max(0, 1 - inv * inv));
}

function smoothHeightFieldSeparable(
  field: Float32Array,
  width: number,
  height: number,
  passes: number,
): Float32Array {
  const current = new Float32Array(field);
  const scratch = new Float32Array(field.length);
  const safePasses = Math.max(0, Math.min(12, Math.floor(passes)));

  for (let p = 0; p < safePasses; p += 1) {
    // 가로 패스 `[1, 2, 1] / 4`
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const left = current[row + Math.max(0, x - 1)] ?? 0;
        const center = current[row + x] ?? 0;
        const right = current[row + Math.min(width - 1, x + 1)] ?? 0;
        scratch[row + x] = 0.25 * (left + 2 * center + right);
      }
    }
    // 세로 패스 `[1, 2, 1] / 4`
    for (let y = 0; y < height; y += 1) {
      const yPrev = Math.max(0, y - 1) * width;
      const yCurr = y * width;
      const yNext = Math.min(height - 1, y + 1) * width;
      for (let x = 0; x < width; x += 1) {
        const up = scratch[yPrev + x] ?? 0;
        const center = scratch[yCurr + x] ?? 0;
        const down = scratch[yNext + x] ?? 0;
        current[yCurr + x] = 0.25 * (up + 2 * center + down);
      }
    }
  }
  return current;
}

/**
 * 실루엣 알파 마스크로부터 2.5D 높이장과 단위 정규화된 의사 법선 맵(`nx, ny, nz`)을 생성한다.
 */
export function estimateSilhouettePseudoNormals(
  input: PseudoNormalEstimatorInput,
): PseudoNormalMapResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const total = width * height;
  const alphaThreshold = clamp(Math.round(input.alphaThreshold ?? 16), 1, 255);
  const profileCurve = input.profileCurve ?? "hemisphere";
  const smoothingPasses = input.smoothingPasses ?? 2;
  const normalStrength = Math.max(0, input.normalStrength ?? 1.0);
  const yAxisConvention = input.yAxisConvention ?? "up";

  const alphaMask = extractSingleChannelAlpha(input.silhouetteAlpha, width, height);
  const interiorMask = new Uint8Array(total);
  const exteriorMask = new Uint8Array(total);
  let exteriorCount = 0;

  for (let i = 0; i < total; i += 1) {
    if ((alphaMask[i] ?? 0) >= alphaThreshold) {
      interiorMask[i] = 1;
    } else {
      exteriorMask[i] = 1;
      exteriorCount += 1;
    }
  }

  let rawDist: Float32Array;
  if (exteriorCount > 0) {
    rawDist = computeMeijsterEdt2d(exteriorMask, width, height);
  } else {
    // 캔버스 전체가 불투명 실루엣인 경우 캔버스 테두리로부터의 내부 거리 사용
    rawDist = new Float32Array(total);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const borderDist = Math.min(x + 1, width - x, y + 1, height - y);
        rawDist[y * width + x] = borderDist;
      }
    }
  }

  let maxInteriorDistancePx = 0;
  const subpixelDist = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    if ((interiorMask[i] ?? 0) === 0) continue;
    const baseDist = rawDist[i] ?? 0;
    const alphaCoverage = (alphaMask[i] ?? 0) / 255;
    const refined = Math.max(0, baseDist - 0.5 + 0.5 * alphaCoverage);
    subpixelDist[i] = refined;
    if (refined > maxInteriorDistancePx) {
      maxInteriorDistancePx = refined;
    }
  }

  const autoBevelWidth = clamp(maxInteriorDistancePx * 0.72, 4, 96);
  const effectiveBevelWidthPx =
    input.bevelWidthPx !== undefined && input.bevelWidthPx > 0
      ? input.bevelWidthPx
      : autoBevelWidth;

  const rawHeightField = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    if ((interiorMask[i] ?? 0) === 0) continue;
    const tNorm = (subpixelDist[i] ?? 0) / Math.max(1e-4, effectiveBevelWidthPx);
    rawHeightField[i] = evaluateBevelProfile(tNorm, profileCurve) * effectiveBevelWidthPx;
  }

  const heightField = smoothHeightFieldSeparable(rawHeightField, width, height, smoothingPasses);
  const normalsFloat32 = new Float32Array(total * 3);
  const normalMapRgba = new Uint8ClampedArray(total * 4);

  const sampleH = (x: number, y: number): number => {
    const cx = Math.min(width - 1, Math.max(0, x));
    const cy = Math.min(height - 1, Math.max(0, y));
    return heightField[cy * width + cx] ?? 0;
  };

  const ySign = yAxisConvention === "down" ? -1 : 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const nOffset = idx * 3;
      const rgbaOffset = idx * 4;
      const alphaByte = alphaMask[idx] ?? 0;

      if ((interiorMask[idx] ?? 0) === 0) {
        normalsFloat32[nOffset] = 0;
        normalsFloat32[nOffset + 1] = 0;
        normalsFloat32[nOffset + 2] = 1;
        normalMapRgba[rgbaOffset] = 128;
        normalMapRgba[rgbaOffset + 1] = 128;
        normalMapRgba[rgbaOffset + 2] = 255;
        normalMapRgba[rgbaOffset + 3] = alphaByte;
        continue;
      }

      // Sobel 3x3 구배: `z = H(x, y)` 곡면의 외향 법선 `(-dH/dx, +dH/dy_screen, 1)`
      const dHdx =
        (sampleH(x + 1, y - 1) +
          2 * sampleH(x + 1, y) +
          sampleH(x + 1, y + 1) -
          (sampleH(x - 1, y - 1) + 2 * sampleH(x - 1, y) + sampleH(x - 1, y + 1))) /
        8;
      const dHdyScreen =
        (sampleH(x - 1, y + 1) +
          2 * sampleH(x, y + 1) +
          sampleH(x + 1, y + 1) -
          (sampleH(x - 1, y - 1) + 2 * sampleH(x, y - 1) + sampleH(x + 1, y - 1))) /
        8;

      const rawNx = -dHdx * normalStrength;
      const rawNy = dHdyScreen * ySign * normalStrength;
      const rawNz = 1;
      const invLen = 1 / Math.hypot(rawNx, rawNy, rawNz);

      const nx = rawNx * invLen;
      const ny = rawNy * invLen;
      const nz = rawNz * invLen;

      normalsFloat32[nOffset] = nx;
      normalsFloat32[nOffset + 1] = ny;
      normalsFloat32[nOffset + 2] = nz;

      normalMapRgba[rgbaOffset] = Math.round((nx * 0.5 + 0.5) * 255);
      normalMapRgba[rgbaOffset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalMapRgba[rgbaOffset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalMapRgba[rgbaOffset + 3] = alphaByte;
    }
  }

  return {
    width,
    height,
    alphaMask,
    interiorMask,
    heightField,
    normalsFloat32,
    normalMapRgba,
    effectiveBevelWidthPx,
    maxInteriorDistancePx,
  };
}

/** 지정 픽셀 좌표 `(x, y)`의 단위 의사 법선 벡터 `(nx, ny, nz)`를 조회한다. */
export function samplePseudoNormalAt(
  normalMap: PseudoNormalMapResult,
  x: number,
  y: number,
): PseudoNormal3d {
  const cx = Math.min(normalMap.width - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(normalMap.height - 1, Math.max(0, Math.floor(y)));
  const offset = (cy * normalMap.width + cx) * 3;
  return {
    nx: normalMap.normalsFloat32[offset] ?? 0,
    ny: normalMap.normalsFloat32[offset + 1] ?? 0,
    nz: normalMap.normalsFloat32[offset + 2] ?? 1,
  };
}
