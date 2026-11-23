/**
 * 마스터 36종 RGBA 픽셀 필터 엔진 (순수 TypeScript · 무의존 · 결정론적 · 불변 보장).
 *
 * - 0×0, 1×1, 음수/NaN/Infinity intensity 방어
 * - 입력 Uint8ClampedArray 불변성 보장(항상 새 버퍼 반환)
 * - intensity=0 시 원본과 바이트 단위 동일
 * - 36종 전 필터(webtoon-mood 8 + cinema-lut 6 + print-manga 6 + optical-light 6 + retro-glitch 5 + paper-extract 5) 실행
 */

import {
  applyColorLutMasterFilter,
  clamp01,
  clampByte,
  isColorLutFilterId,
  lerp,
  smoothstep,
} from "./master-filter-color-kernels";
import { applyFxMasterFilter } from "./master-filter-fx-kernels";
import type { MasterFilterId } from "./master-filter-lut-catalog";

export interface MasterFilterApplyOptions {
  readonly intensity?: number;
  readonly seed?: number;
}

export interface RgbaFilterDiffMetrics {
  readonly totalPixelCount: number;
  readonly changedPixelCount: number;
  readonly changedPixelRatio: number;
  readonly meanChannelDelta: number;
  readonly maxChannelDelta: number;
}

const DEFAULT_FILTER_SEED = 1337;

function resolveSafeIntensity(rawIntensity: number | undefined): number {
  if (rawIntensity === undefined) return 1;
  if (Number.isNaN(rawIntensity)) return 0;
  if (!Number.isFinite(rawIntensity)) return rawIntensity > 0 ? 1 : 0;
  return clamp01(rawIntensity);
}

function resolveSafeSeed(rawSeed: number | undefined): number {
  if (rawSeed === undefined || !Number.isFinite(rawSeed)) return DEFAULT_FILTER_SEED;
  return Math.trunc(rawSeed);
}

/**
 * 실제 RGBA `Uint8ClampedArray` 버퍼에 36종 마스터 필터 중 하나를 결정론적으로 적용한다.
 */
export function applyMasterFilterToRgba(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  filterId: MasterFilterId,
  options?: MasterFilterApplyOptions,
): Uint8ClampedArray {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return new Uint8ClampedArray(0);
  }
  const safeW = Math.floor(width);
  const safeH = Math.floor(height);
  if (safeW <= 0 || safeH <= 0 || input.length === 0) {
    return new Uint8ClampedArray(0);
  }

  const intensity = resolveSafeIntensity(options?.intensity);
  const expectedLength = safeW * safeH * 4;

  // 입력 길이 불일치 방어: 정상 크기면 직접 읽고, 불일치면 안전 정규화 버퍼 생성
  let workingInput: Uint8ClampedArray;
  if (input.length === expectedLength) {
    workingInput = input;
  } else {
    workingInput = new Uint8ClampedArray(expectedLength);
    const copyLen = Math.min(input.length, expectedLength);
    workingInput.set(input.subarray(0, copyLen));
    for (let i = Math.floor(copyLen / 4) * 4 + 3; i < expectedLength; i += 4) {
      workingInput[i] = 255;
    }
  }

  if (intensity <= 0) {
    return new Uint8ClampedArray(workingInput);
  }

  const seed = resolveSafeSeed(options?.seed);
  const fullEffect = isColorLutFilterId(filterId)
    ? applyColorLutMasterFilter(workingInput, safeW, safeH, filterId, seed)
    : applyFxMasterFilter(workingInput, safeW, safeH, filterId, seed);

  if (intensity >= 1) {
    return fullEffect;
  }

  const blended = new Uint8ClampedArray(expectedLength);
  const invT = 1 - intensity;
  for (let i = 0; i < expectedLength; i += 1) {
    blended[i] = clampByte((workingInput[i] ?? 0) * invT + (fullEffect[i] ?? 0) * intensity);
  }
  return blended;
}

/**
 * 원본 버퍼와 필터 적용 버퍼 사이의 실제 픽셀 변화량을 계산한다.
 */
export function measureRgbaFilterDiff(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
): RgbaFilterDiffMetrics {
  const len = Math.min(before.length, after.length);
  const totalPixelCount = Math.floor(len / 4);
  if (totalPixelCount <= 0) {
    return {
      totalPixelCount: 0,
      changedPixelCount: 0,
      changedPixelRatio: 0,
      meanChannelDelta: 0,
      maxChannelDelta: 0,
    };
  }

  let changedPixelCount = 0;
  let channelDeltaSum = 0;
  let maxChannelDelta = 0;

  for (let p = 0; p < totalPixelCount; p += 1) {
    const idx = p * 4;
    const dr = Math.abs((before[idx] ?? 0) - (after[idx] ?? 0));
    const dg = Math.abs((before[idx + 1] ?? 0) - (after[idx + 1] ?? 0));
    const db = Math.abs((before[idx + 2] ?? 0) - (after[idx + 2] ?? 0));
    const da = Math.abs((before[idx + 3] ?? 0) - (after[idx + 3] ?? 0));

    const pixelMax = Math.max(dr, dg, db, da);
    if (pixelMax > 0) changedPixelCount += 1;
    if (pixelMax > maxChannelDelta) maxChannelDelta = pixelMax;
    channelDeltaSum += dr + dg + db + da;
  }

  return {
    totalPixelCount,
    changedPixelCount,
    changedPixelRatio: changedPixelCount / totalPixelCount,
    meanChannelDelta: channelDeltaSum / (totalPixelCount * 4),
    maxChannelDelta,
  };
}

/**
 * 갤러리 실시간 Before/After 미리보기 및 테스트용 절차적 웹툰 일러스트 RGBA 버퍼를 생성한다.
 *
 * - 4개 모서리 단색 배경(배경 투명화 키잉 검증용)
 * - 좌상단 강한 역광 태양/창광(렌즈 플레어·갓레이·블룸·보케 검증용)
 * - 따뜻한 피부톤 + 크림슨 스카프 + 네이비 헤어 + 선명한 먹선 윤곽(LUT·호러느와르·Sobel+DoG·스크린톤 검증용)
 */
export function createMasterFilterPreviewArtwork(width: number, height: number): Uint8ClampedArray {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const buf = new Uint8ClampedArray(safeW * safeH * 4);
  const invW = 1 / Math.max(1, safeW - 1);
  const invH = 1 / Math.max(1, safeH - 1);

  for (let y = 0; y < safeH; y += 1) {
    const v = y * invH;
    for (let x = 0; x < safeW; x += 1) {
      const u = x * invW;
      const idx = (y * safeW + x) * 4;

      // 1. Clean uniform pale-sky backdrop near outer corners (supports smart chroma keying)
      let r = 224;
      let g = 234;
      let b = 246;

      // Subtle inner sky gradient inside frame margins
      const innerMask = smoothstep(0.08, 0.24, Math.min(u, 1 - u, v, 1 - v));
      r = lerp(r, lerp(164, 248, v), innerMask * 0.72);
      g = lerp(g, lerp(196, 224, v), innerMask * 0.72);
      b = lerp(b, lerp(242, 206, v), innerMask * 0.72);

      // 2. Bright upper-left sun / key light for optical flare, god-rays, bloom & bokeh
      const sunDist = Math.hypot((u - 0.24) * 1.45, v - 0.24);
      if (sunDist < 0.22) {
        const sunCore = smoothstep(0.22, 0.03, sunDist);
        r = lerp(r, 255, sunCore);
        g = lerp(g, 250, sunCore);
        b = lerp(b, 226, sunCore);
      }

      // 3. Distant emerald-teal hillside band
      const hillY = 0.68 + 0.05 * Math.sin(u * Math.PI * 2.2);
      if (v > hillY && u > 0.08 && u < 0.92 && v < 0.92) {
        r = 68;
        g = 128;
        b = 114;
      }

      // 4. Stylized webtoon character silhouette (center-right)
      const headCx = 0.58;
      const headCy = 0.44;
      const headDist = Math.hypot((u - headCx) * 1.32, v - headCy);

      // Torso & crimson scarf (pops under Horror Noir selective crimson & Cinema LUTs)
      const shoulderDist = Math.hypot((u - headCx) * 0.85, (v - 0.8) * 1.15);
      if (shoulderDist < 0.23 && v > 0.56 && v < 0.93) {
        const isEdge = shoulderDist > 0.205;
        if (isEdge) {
          r = 26;
          g = 24;
          b = 34;
        } else if (v < 0.69) {
          // Crimson webtoon scarf
          r = 204;
          g = 46;
          b = 64;
        } else {
          // Indigo coat
          r = 46;
          g = 62;
          b = 104;
        }
      }

      // Hair back volume
      const hairDist = Math.hypot((u - headCx) * 1.12, (v - (headCy - 0.02)) * 0.96);
      if (hairDist < 0.215) {
        const isOutline = hairDist > 0.195;
        const hairSheen = smoothstep(0.11, 0.0, Math.abs(v - (headCy - 0.11))) * 0.45;
        r = isOutline ? 22 : lerp(38, 128, hairSheen);
        g = isOutline ? 24 : lerp(48, 166, hairSheen);
        b = isOutline ? 38 : lerp(88, 224, hairSheen);
      }

      // Warm peach face & crisp ink outline
      if (headDist < 0.145) {
        const isFaceOutline = headDist > 0.128;
        if (isFaceOutline) {
          r = 32;
          g = 26;
          b = 32;
        } else {
          // Soft cheek shading
          const shade = smoothstep(0.02, 0.13, u - (headCx - 0.04));
          r = lerp(248, 234, shade * 0.35);
          g = lerp(212, 186, shade * 0.35);
          b = lerp(190, 164, shade * 0.35);
        }

        // Expressive anime eyes + catchlight
        const leftEye = Math.hypot((u - (headCx - 0.045)) * 1.6, (v - (headCy + 0.015)) * 1.2);
        const rightEye = Math.hypot((u - (headCx + 0.042)) * 1.6, (v - (headCy + 0.015)) * 1.2);
        if (leftEye < 0.024 || rightEye < 0.024) {
          r = 30;
          g = 112;
          b = 128;
        }
        if (
          Math.hypot(u - (headCx - 0.05), v - (headCy + 0.008)) < 0.009 ||
          Math.hypot(u - (headCx + 0.037), v - (headCy + 0.008)) < 0.009
        ) {
          r = 255;
          g = 255;
          b = 255;
        }
      }

      // Swept bangs
      if (hairDist < 0.19 && v < headCy - 0.02 && v > headCy - 0.17) {
        const bangWave = headCy - 0.03 + 0.025 * Math.sin((u - headCx) * 34);
        if (v < bangWave) {
          r = 34;
          g = 44;
          b = 82;
        }
      }

      // Floating specular sparkle dots for bokeh/bloom accent
      const sparkleA = Math.hypot((u - 0.34) * 1.4, v - 0.5);
      const sparkleB = Math.hypot((u - 0.78) * 1.4, v - 0.32);
      if (sparkleA < 0.028 || sparkleB < 0.024) {
        r = 255;
        g = 248;
        b = 232;
      }

      buf[idx] = clampByte(r);
      buf[idx + 1] = clampByte(g);
      buf[idx + 2] = clampByte(b);
      buf[idx + 3] = 255;
    }
  }

  return buf;
}
