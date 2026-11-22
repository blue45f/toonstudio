/**
 * 3D 배경 WebGL 캔버스 DPR 안전 클램프 가드 & 3컷 공유 배경 픽셀 해시·SSIM 비교 순수 모듈.
 *
 * - 모바일 `dpr=3` 캔버스 폭증과 WebGL `MAX_TEXTURE_SIZE` 초과를 막기 위해 `<= 2` 안전 캡과
 *   GPU 차원 상한을 강제하고 구조화된 경고 코드·안내를 반환한다.
 * - 3컷 공유 배경 PNG/RGBA SHA-256·윈도우 SSIM 비교 및 소크 JS 힙 누수율(`<= 5%`)을 ₩0 로컬로 판정한다.
 * - 브라우저 키-값 저장소를 일절 호출하지 않는다.
 */

import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";

export const BG3D_CANVAS_SAFE_DPR_MIN = 1;
export const BG3D_CANVAS_SAFE_DPR_MAX = 2;
export const BG3D_DEFAULT_MAX_TEXTURE_SIZE = 4096;
export const BG3D_CONSERVATIVE_FALLBACK_MAX_TEXTURE_SIZE = 2048;
export const BG3D_MIN_VALID_MAX_TEXTURE_SIZE = 256;
export const BG3D_DEFAULT_UNTOUCHED_CUT_MIN_SSIM = 0.9999;
export const BG3D_DEFAULT_MUTATED_CUT_MAX_SSIM = 0.999;
export const BG3D_DEFAULT_MAX_HEAP_LEAK_RATIO = 0.05;

export type Bg3dDprGuardWarningCode =
  | "invalid-dpr-fallback"
  | "dpr-below-minimum"
  | "high-dpr-capped"
  | "invalid-max-texture-size"
  | "low-webgl-max-texture-size-clamped"
  | "webgl-max-texture-size-clamped";

export interface ClampBg3dCanvasDprOptions {
  readonly cssWidth?: number | null;
  readonly cssHeight?: number | null;
  readonly maxSafeDpr?: number;
  readonly maxRenderbufferSize?: number | null;
}

export interface Bg3dCanvasDprClampResult {
  readonly requestedDpr: number;
  readonly effectiveDpr: number;
  readonly maxSafeDpr: number;
  readonly maxTextureSize: number;
  readonly effectiveGpuDimensionLimit: number;
  readonly wasClamped: boolean;
  readonly bitmapWidth: number | null;
  readonly bitmapHeight: number | null;
  readonly exceedsMaxTextureSize: boolean;
  readonly warningCodes: readonly Bg3dDprGuardWarningCode[];
  readonly warningsKo: readonly string[];
}

export interface Bg3dRgbaImageInput {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array | Uint8ClampedArray;
}

export interface Bg3dSsimOptions { readonly windowSize?: number; }

export interface Bg3dRgbaSsimResult {
  readonly width: number; readonly height: number; readonly pixelCount: number;
  readonly baselineSha256: string; readonly candidateSha256: string;
  readonly sha256Match: boolean; readonly exactPixelMatch: boolean;
  readonly changedPixelCount: number; readonly changedPixelRatio: number;
  readonly maxChannelDelta: number; readonly lumaSsim: number;
  readonly alphaSsim: number; readonly ssim: number; readonly psnrDb: number;
}

export type Bg3dThreeCutRole = "mutated" | "unchanged";

export interface Bg3dThreeCutSnapshotPair {
  readonly cutId: string; readonly role: Bg3dThreeCutRole;
  readonly baselinePngBytes?: Uint8Array; readonly candidatePngBytes?: Uint8Array;
  readonly baselineRgba?: Bg3dRgbaImageInput; readonly candidateRgba?: Bg3dRgbaImageInput;
}

export interface Bg3dThreeCutComparisonInput {
  readonly cuts: readonly Bg3dThreeCutSnapshotPair[];
  readonly minUnchangedSsim?: number; readonly maxMutatedSsim?: number;
  readonly requireExactByteMatchForUnchanged?: boolean; readonly requireDistinctBaselines?: boolean;
}

export interface Bg3dCutComparisonResult {
  readonly cutId: string; readonly role: Bg3dThreeCutRole;
  readonly baselinePngSha256: string | null; readonly candidatePngSha256: string | null;
  readonly pngBytesMatch: boolean | null; readonly rgbaSsim: Bg3dRgbaSsimResult | null;
  readonly passed: boolean; readonly reasonKo: string;
}

export interface Bg3dThreeCutComparisonReport {
  readonly passed: boolean; readonly totalCuts: number;
  readonly mutatedCutsVerified: number; readonly unchangedCutsVerified: number;
  readonly distinctBaselineHashes: number;
  readonly cutResults: readonly Bg3dCutComparisonResult[];
  readonly failures: readonly string[];
}

export interface Bg3dHeapSample { readonly cycle: number; readonly usedBytes: number; readonly totalBytes?: number; }

export interface Bg3dHeapLeakEvaluation {
  readonly sampleCount: number; readonly baselineUsedBytes: number;
  readonly finalUsedBytes: number; readonly peakUsedBytes: number;
  readonly deltaBytes: number; readonly signedGrowthRatio: number;
  readonly leakRatio: number; readonly maxAllowedLeakRatio: number;
  readonly withinThreshold: boolean;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function floorTwoDecimals(value: number): number {
  return Math.max(0.25, Math.floor(value * 100) / 100);
}

/** 모바일 `dpr=3` 캔버스 폭증과 WebGL `MAX_TEXTURE_SIZE` 초과를 차단한다. */
export function clampBg3dCanvasDpr(
  dpr: number,
  maxTextureSize: number = BG3D_DEFAULT_MAX_TEXTURE_SIZE,
  options: ClampBg3dCanvasDprOptions = {},
): Bg3dCanvasDprClampResult {
  const warningCodes: Bg3dDprGuardWarningCode[] = [];
  const warningsKo: string[] = [];
  const maxSafeDpr = isPositiveFinite(options.maxSafeDpr)
    ? Math.min(BG3D_CANVAS_SAFE_DPR_MAX, Math.max(BG3D_CANVAS_SAFE_DPR_MIN, options.maxSafeDpr))
    : BG3D_CANVAS_SAFE_DPR_MAX;
  let normalizedMaxTex = BG3D_CONSERVATIVE_FALLBACK_MAX_TEXTURE_SIZE;
  if (isPositiveFinite(maxTextureSize) && maxTextureSize >= BG3D_MIN_VALID_MAX_TEXTURE_SIZE) {
    normalizedMaxTex = Math.floor(maxTextureSize);
  } else {
    warningCodes.push("invalid-max-texture-size");
    warningsKo.push(`WebGL MAX_TEXTURE_SIZE(${String(maxTextureSize)})가 비정상이어서 보수적 상한 ${BG3D_CONSERVATIVE_FALLBACK_MAX_TEXTURE_SIZE}px를 적용했습니다.`);
  }
  const normalizedRenderbuffer =
    isPositiveFinite(options.maxRenderbufferSize) && options.maxRenderbufferSize >= BG3D_MIN_VALID_MAX_TEXTURE_SIZE
      ? Math.floor(options.maxRenderbufferSize)
      : normalizedMaxTex;
  const effectiveGpuDimensionLimit = Math.min(normalizedMaxTex, normalizedRenderbuffer);

  let effectiveDpr = dpr;
  if (!isPositiveFinite(dpr)) {
    effectiveDpr = BG3D_CANVAS_SAFE_DPR_MIN;
    warningCodes.push("invalid-dpr-fallback");
    warningsKo.push(`비정상 DPR(${String(dpr)}) 입력을 안전 기본값 1x로 복구했습니다.`);
  } else if (dpr < BG3D_CANVAS_SAFE_DPR_MIN) {
    effectiveDpr = BG3D_CANVAS_SAFE_DPR_MIN;
    warningCodes.push("dpr-below-minimum");
    warningsKo.push(`최소 DPR 미만(${dpr}x) 입력을 1x로 보정했습니다.`);
  } else if (dpr > maxSafeDpr) {
    effectiveDpr = maxSafeDpr;
    warningCodes.push("high-dpr-capped");
    warningsKo.push(`고밀도 DPR(${dpr}x)을 모바일·WebGL 안전 상한 ${maxSafeDpr}x로 제한했습니다.`);
  }

  const cssWidth = isPositiveFinite(options.cssWidth) ? options.cssWidth : null;
  const cssHeight = isPositiveFinite(options.cssHeight) ? options.cssHeight : null;
  if (cssWidth !== null && cssHeight !== null) {
    const maxCssEdge = Math.max(cssWidth, cssHeight);
    if (Math.ceil(maxCssEdge * effectiveDpr) > effectiveGpuDimensionLimit) {
      let fitted = floorTwoDecimals(effectiveGpuDimensionLimit / maxCssEdge);
      while (Math.ceil(maxCssEdge * fitted) > effectiveGpuDimensionLimit && fitted > 0.25) fitted = floorTwoDecimals(fitted - 0.01);
      if (fitted < effectiveDpr) {
        effectiveDpr = fitted;
        warningCodes.push("webgl-max-texture-size-clamped");
        warningsKo.push(`캔버스 변 길이(${Math.ceil(maxCssEdge)}px)가 WebGL 상한(${effectiveGpuDimensionLimit}px)을 넘어 DPR을 ${effectiveDpr}x로 축소했습니다.`);
      }
    }
  } else if (effectiveGpuDimensionLimit <= 1024 && effectiveDpr > BG3D_CANVAS_SAFE_DPR_MIN) {
    effectiveDpr = BG3D_CANVAS_SAFE_DPR_MIN;
    warningCodes.push("low-webgl-max-texture-size-clamped");
    warningsKo.push(`저사양 WebGL MAX_TEXTURE_SIZE(${effectiveGpuDimensionLimit}px) 환경에서 DPR을 1x로 제한했습니다.`);
  }

  const bitmapWidth = cssWidth !== null && cssHeight !== null ? Math.max(1, Math.ceil(cssWidth * effectiveDpr)) : null;
  const bitmapHeight = cssWidth !== null && cssHeight !== null ? Math.max(1, Math.ceil(cssHeight * effectiveDpr)) : null;
  const exceedsMaxTextureSize =
    bitmapWidth !== null && bitmapHeight !== null && (bitmapWidth > effectiveGpuDimensionLimit || bitmapHeight > effectiveGpuDimensionLimit);
  return Object.freeze({
    requestedDpr: dpr, effectiveDpr, maxSafeDpr, maxTextureSize: normalizedMaxTex, effectiveGpuDimensionLimit,
    wasClamped: warningCodes.length > 0 || effectiveDpr !== dpr, bitmapWidth, bitmapHeight, exceedsMaxTextureSize,
    warningCodes: Object.freeze(warningCodes), warningsKo: Object.freeze(warningsKo),
  });
}

/** 바이트 버퍼의 결정론 SHA-256 16진 문자열(64자 소문자)을 계산한다. */
export function computeBg3dBytesSha256(bytes: Uint8Array | Uint8ClampedArray): string {
  return sha256HexPortable(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

function validateRgbaImage(image: Bg3dRgbaImageInput, label: string): void {
  if (!Number.isSafeInteger(image.width) || image.width < 1 || !Number.isSafeInteger(image.height) || image.height < 1) {
    throw new RangeError(`${label} 해상도는 1 이상의 정수여야 합니다.`);
  }
  const expected = image.width * image.height * 4;
  if (image.pixels.length !== expected) {
    throw new RangeError(`${label} RGBA 버퍼 길이가 일치하지 않습니다 (기대: ${expected}, 실제: ${image.pixels.length}).`);
  }
}

function computePlaneWindowedSsim(planeA: Float64Array, planeB: Float64Array, width: number, height: number, windowSize: number): number {
  const c1 = 6.5025;
  const c2 = 58.5225;
  const winW = Math.min(windowSize, width);
  const winH = Math.min(windowSize, height);
  let ssimSum = 0;
  let windowCount = 0;
  for (let y0 = 0; y0 < height; y0 += winH) {
    const yEnd = Math.min(height, y0 + winH);
    for (let x0 = 0; x0 < width; x0 += winW) {
      const xEnd = Math.min(width, x0 + winW);
      const count = (xEnd - x0) * (yEnd - y0);
      if (count <= 0) continue;
      let sumA = 0;
      let sumB = 0;
      for (let y = y0; y < yEnd; y += 1) {
        const row = y * width;
        for (let x = x0; x < xEnd; x += 1) { sumA += planeA[row + x] ?? 0; sumB += planeB[row + x] ?? 0; }
      }
      const meanA = sumA / count;
      const meanB = sumB / count;
      let varA = 0;
      let varB = 0;
      let covAB = 0;
      for (let y = y0; y < yEnd; y += 1) {
        const row = y * width;
        for (let x = x0; x < xEnd; x += 1) {
          const da = (planeA[row + x] ?? 0) - meanA;
          const db = (planeB[row + x] ?? 0) - meanB;
          varA += da * da; varB += db * db; covAB += da * db;
        }
      }
      const denom = count > 1 ? count - 1 : 1;
      const num = (2 * meanA * meanB + c1) * (2 * (covAB / denom) + c2);
      const den = (meanA * meanA + meanB * meanB + c1) * (varA / denom + varB / denom + c2);
      ssimSum += Math.min(1, Math.max(-1, den > 0 ? num / den : 1));
      windowCount += 1;
    }
  }
  return windowCount > 0 ? ssimSum / windowCount : 1;
}

/** 두 RGBA8 버퍼의 SHA-256, 변경 픽셀 수, 휘도·알파 윈도우 SSIM, PSNR을 계산한다. */
export function computeBg3dRgbaSsim(
  baseline: Bg3dRgbaImageInput,
  candidate: Bg3dRgbaImageInput,
  options: Bg3dSsimOptions = {},
): Bg3dRgbaSsimResult {
  validateRgbaImage(baseline, "기준 이미지");
  validateRgbaImage(candidate, "비교 이미지");
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    throw new RangeError(`비교 이미지 해상도가 다릅니다 (${baseline.width}×${baseline.height} vs ${candidate.width}×${candidate.height}).`);
  }
  const { width, height } = baseline;
  const pixelCount = width * height;
  const windowSize = typeof options.windowSize === "number" && Number.isSafeInteger(options.windowSize) && options.windowSize >= 1 ? options.windowSize : 8;
  const lumaA = new Float64Array(pixelCount);
  const lumaB = new Float64Array(pixelCount);
  const alphaA = new Float64Array(pixelCount);
  const alphaB = new Float64Array(pixelCount);
  let changedPixelCount = 0;
  let maxChannelDelta = 0;
  let squaredErrorSum = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    const rA = baseline.pixels[idx] ?? 0; const gA = baseline.pixels[idx + 1] ?? 0;
    const bA = baseline.pixels[idx + 2] ?? 0; const aA = baseline.pixels[idx + 3] ?? 0;
    const rB = candidate.pixels[idx] ?? 0; const gB = candidate.pixels[idx + 1] ?? 0;
    const bB = candidate.pixels[idx + 2] ?? 0; const aB = candidate.pixels[idx + 3] ?? 0;
    const dr = Math.abs(rA - rB); const dg = Math.abs(gA - gB);
    const db = Math.abs(bA - bB); const da = Math.abs(aA - aB);
    if (dr !== 0 || dg !== 0 || db !== 0 || da !== 0) {
      changedPixelCount += 1;
      maxChannelDelta = Math.max(maxChannelDelta, dr, dg, db, da);
      squaredErrorSum += dr * dr + dg * dg + db * db + da * da;
    }
    lumaA[i] = 0.2126 * rA + 0.7152 * gA + 0.0722 * bA;
    lumaB[i] = 0.2126 * rB + 0.7152 * gB + 0.0722 * bB;
    alphaA[i] = aA; alphaB[i] = aB;
  }
  const baselineSha256 = computeBg3dBytesSha256(baseline.pixels);
  const candidateSha256 = computeBg3dBytesSha256(candidate.pixels);
  const lumaSsim = computePlaneWindowedSsim(lumaA, lumaB, width, height, windowSize);
  const alphaSsim = computePlaneWindowedSsim(alphaA, alphaB, width, height, windowSize);
  const mse = squaredErrorSum / (pixelCount * 4);
  return Object.freeze({
    width, height, pixelCount, baselineSha256, candidateSha256,
    sha256Match: baselineSha256 === candidateSha256, exactPixelMatch: changedPixelCount === 0,
    changedPixelCount, changedPixelRatio: changedPixelCount / pixelCount, maxChannelDelta,
    lumaSsim, alphaSsim, ssim: Math.min(lumaSsim, alphaSsim),
    psnrDb: mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse),
  });
}

/** 3컷 공유 배경 PNG 바이트 해시·SSIM 회귀 판정 계약을 평가한다. */
export function compareBg3dThreeCutSnapshots(input: Bg3dThreeCutComparisonInput): Bg3dThreeCutComparisonReport {
  const minUnchangedSsim = input.minUnchangedSsim ?? BG3D_DEFAULT_UNTOUCHED_CUT_MIN_SSIM;
  const maxMutatedSsim = input.maxMutatedSsim ?? BG3D_DEFAULT_MUTATED_CUT_MAX_SSIM;
  const requireExactByteMatch = input.requireExactByteMatchForUnchanged ?? true;
  const requireDistinctBaselines = input.requireDistinctBaselines ?? true;
  const failures: string[] = [];
  const cutResults: Bg3dCutComparisonResult[] = [];
  const baselineHashes = new Set<string>();
  let mutatedCutsVerified = 0;
  let unchangedCutsVerified = 0;
  if (input.cuts.length < 3) failures.push(`3컷 공유 배경 검증에는 최소 3개 컷이 필요합니다 (현재 ${input.cuts.length}컷).`);

  for (const cut of input.cuts) {
    const baselinePngSha256 = cut.baselinePngBytes ? computeBg3dBytesSha256(cut.baselinePngBytes) : null;
    const candidatePngSha256 = cut.candidatePngBytes ? computeBg3dBytesSha256(cut.candidatePngBytes) : null;
    const pngBytesMatch = baselinePngSha256 !== null && candidatePngSha256 !== null ? baselinePngSha256 === candidatePngSha256 : null;
    const rgbaSsim = cut.baselineRgba && cut.candidateRgba ? computeBg3dRgbaSsim(cut.baselineRgba, cut.candidateRgba) : null;
    const fingerprint = baselinePngSha256 ?? rgbaSsim?.baselineSha256 ?? null;
    if (fingerprint) baselineHashes.add(fingerprint);
    let passed = true;
    let reasonKo: string;
    if (pngBytesMatch === null && rgbaSsim === null) {
      passed = false; reasonKo = `${cut.cutId}: PNG 바이트 또는 RGBA 픽셀 입력이 모두 비어 있습니다.`;
    } else if (cut.role === "unchanged") {
      if (requireExactByteMatch && pngBytesMatch === false) {
        passed = false; reasonKo = `${cut.cutId}: 비변경 컷 PNG SHA-256 불일치 (${baselinePngSha256?.slice(0, 12)} ≠ ${candidatePngSha256?.slice(0, 12)}).`;
      } else if (rgbaSsim && rgbaSsim.ssim < minUnchangedSsim) {
        passed = false; reasonKo = `${cut.cutId}: 비변경 컷 SSIM 미달 (${rgbaSsim.ssim.toFixed(6)} < ${minUnchangedSsim}).`;
      } else { unchangedCutsVerified += 1; reasonKo = "비변경 컷 원본 기준선과 일치"; }
    } else if (pngBytesMatch !== false && !(rgbaSsim !== null && !rgbaSsim.exactPixelMatch && rgbaSsim.ssim <= maxMutatedSsim)) {
      passed = false; reasonKo = `${cut.cutId}: 변경 컷의 픽셀·PNG가 기준선과 동일합니다(카메라 갱신 누락 의심).`;
    } else { mutatedCutsVerified += 1; reasonKo = "변경 컷 카메라 반영 확인"; }
    if (!passed) failures.push(reasonKo);
    cutResults.push(Object.freeze({ cutId: cut.cutId, role: cut.role, baselinePngSha256, candidatePngSha256, pngBytesMatch, rgbaSsim, passed, reasonKo }));
  }
  if (requireDistinctBaselines && input.cuts.length >= 3 && baselineHashes.size < input.cuts.length) {
    failures.push(`기준선 3컷의 고유 해시 수(${baselineHashes.size})가 컷 수(${input.cuts.length})보다 적습니다(중복 프레임 출력 의심).`);
  }
  return Object.freeze({
    passed: failures.length === 0, totalCuts: input.cuts.length, mutatedCutsVerified, unchangedCutsVerified,
    distinctBaselineHashes: baselineHashes.size, cutResults: Object.freeze(cutResults), failures: Object.freeze(failures),
  });
}

/** 가속 소크 중 기록된 JS 힙 샘플에서 워밍업 기준선 대비 증가율(`<= 5%`)을 판정한다. */
export function evaluateBg3dHeapLeakGrowth(
  samples: readonly Bg3dHeapSample[],
  maxAllowedLeakRatio: number = BG3D_DEFAULT_MAX_HEAP_LEAK_RATIO,
): Bg3dHeapLeakEvaluation {
  const valid = samples.filter((sample) => Number.isFinite(sample.usedBytes) && sample.usedBytes > 0);
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (!first || !last) throw new RangeError("JS 힙 누수 판정에는 양수 usedBytes 샘플이 최소 1건 필요합니다.");
  let peakUsedBytes = first.usedBytes;
  for (const sample of valid) if (sample.usedBytes > peakUsedBytes) peakUsedBytes = sample.usedBytes;
  const deltaBytes = last.usedBytes - first.usedBytes;
  const signedGrowthRatio = deltaBytes / first.usedBytes;
  const leakRatio = Math.max(0, signedGrowthRatio);
  return Object.freeze({
    sampleCount: valid.length, baselineUsedBytes: first.usedBytes, finalUsedBytes: last.usedBytes,
    peakUsedBytes, deltaBytes, signedGrowthRatio, leakRatio, maxAllowedLeakRatio, withinThreshold: leakRatio <= maxAllowedLeakRatio,
  });
}
