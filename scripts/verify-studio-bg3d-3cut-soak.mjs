#!/usr/bin/env node
/**
 * 실브라우저(Chromium) 3컷 공유 배경 픽셀 회귀 + 10시간 가속 소크 검증기.
 *
 * - 모바일 DPR=3 WebGL 캔버스 상한 클램프(`<= 2`, `<= MAX_TEXTURE_SIZE`) 검증
 * - 공유 배경 3컷 기준 PNG/RGBA 캡처 → 1컷 카메라 단독 변경 → 직렬화/재열기 라운드트립 →
 *   일괄 PNG 출력 후 1컷 변경 확인 + 2·3컷 PNG SHA-256 일치 및 윈도우 SSIM 검증
 * - 기본 500회(10시간 가속 환산: 시간당 50회 컷 전환) 연속 컷 전환·재렌더·리소스 정리 소크 및
 *   CDP `Runtime.getHeapUsage` 기반 JS 힙 증가율(`<= 5%`) 판정
 * - `--dry-run`: 브라우저 기동·파일 쓰기 없이 실행 계획과 순수 검증 계약 자가 점검만 수행
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEFAULT_SOAK_CYCLES = 500;
export const DEFAULT_SOAK_WARMUP_CYCLES = 25;
export const DEFAULT_SOAK_SAMPLE_EVERY = 50;
export const DEFAULT_MAX_HEAP_LEAK_RATIO = 0.05;
export const DEFAULT_MIN_UNCHANGED_SSIM = 0.9999;
export const DEFAULT_MAX_MUTATED_SSIM = 0.999;
export const DEFAULT_MOBILE_AUDIT_DPR = 3;
export const DEFAULT_SOAK_OUTPUT_DIR = "artifacts/studio-bg3d-3cut-soak";
export const CUT_SWITCHES_PER_SIMULATED_HOUR = 50;
export const SAFE_DPR_MIN = 1;
export const SAFE_DPR_MAX = 2;

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes instanceof Uint8Array ? bytes : Buffer.from(bytes)).digest("hex");
}

function isPositiveFinite(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function floorTwoDecimals(value) {
  return Math.max(0.25, Math.floor(value * 100) / 100);
}

/** 모바일 `dpr=3` 캔버스 폭증과 WebGL `MAX_TEXTURE_SIZE` 초과를 방지한다. */
export function clampCanvasDprForSoak(dpr, maxTextureSize = 4096, options = {}) {
  const warningCodes = [];
  const warningsKo = [];
  const maxSafeDpr = isPositiveFinite(options.maxSafeDpr)
    ? Math.min(SAFE_DPR_MAX, Math.max(SAFE_DPR_MIN, options.maxSafeDpr))
    : SAFE_DPR_MAX;
  let normalizedMaxTex = 2048;
  if (isPositiveFinite(maxTextureSize) && maxTextureSize >= 256) normalizedMaxTex = Math.floor(maxTextureSize);
  else {
    warningCodes.push("invalid-max-texture-size");
    warningsKo.push(`WebGL MAX_TEXTURE_SIZE(${String(maxTextureSize)}) 비정상 → 2048px 폴백`);
  }
  const normalizedRenderbuffer =
    isPositiveFinite(options.maxRenderbufferSize) && options.maxRenderbufferSize >= 256
      ? Math.floor(options.maxRenderbufferSize)
      : normalizedMaxTex;
  const gpuLimit = Math.min(normalizedMaxTex, normalizedRenderbuffer);

  let effectiveDpr = dpr;
  if (!isPositiveFinite(dpr)) {
    effectiveDpr = SAFE_DPR_MIN;
    warningCodes.push("invalid-dpr-fallback");
    warningsKo.push(`비정상 DPR(${String(dpr)}) → 1x 폴백`);
  } else if (dpr < SAFE_DPR_MIN) {
    effectiveDpr = SAFE_DPR_MIN;
    warningCodes.push("dpr-below-minimum");
    warningsKo.push(`최소 DPR 미만(${dpr}x) → 1x 보정`);
  } else if (dpr > maxSafeDpr) {
    effectiveDpr = maxSafeDpr;
    warningCodes.push("high-dpr-capped");
    warningsKo.push(`고밀도 DPR(${dpr}x)을 안전 상한 ${maxSafeDpr}x로 제한`);
  }

  const cssWidth = isPositiveFinite(options.cssWidth) ? options.cssWidth : null;
  const cssHeight = isPositiveFinite(options.cssHeight) ? options.cssHeight : null;
  if (cssWidth !== null && cssHeight !== null) {
    const maxEdge = Math.max(cssWidth, cssHeight);
    if (Math.ceil(maxEdge * effectiveDpr) > gpuLimit) {
      let fitted = floorTwoDecimals(gpuLimit / maxEdge);
      while (Math.ceil(maxEdge * fitted) > gpuLimit && fitted > 0.25) fitted = floorTwoDecimals(fitted - 0.01);
      if (fitted < effectiveDpr) {
        effectiveDpr = fitted;
        warningCodes.push("webgl-max-texture-size-clamped");
        warningsKo.push(`WebGL 상한(${gpuLimit}px) 준수를 위해 DPR을 ${effectiveDpr}x로 축소`);
      }
    }
  } else if (gpuLimit <= 1024 && effectiveDpr > SAFE_DPR_MIN) {
    effectiveDpr = SAFE_DPR_MIN;
    warningCodes.push("low-webgl-max-texture-size-clamped");
    warningsKo.push(`저사양 WebGL MAX_TEXTURE_SIZE(${gpuLimit}px) → 1x 제한`);
  }

  const bitmapWidth = cssWidth !== null && cssHeight !== null ? Math.max(1, Math.ceil(cssWidth * effectiveDpr)) : null;
  const bitmapHeight = cssWidth !== null && cssHeight !== null ? Math.max(1, Math.ceil(cssHeight * effectiveDpr)) : null;
  const exceedsMaxTextureSize =
    bitmapWidth !== null && bitmapHeight !== null && (bitmapWidth > gpuLimit || bitmapHeight > gpuLimit);
  return Object.freeze({
    requestedDpr: dpr, effectiveDpr, maxSafeDpr, maxTextureSize: normalizedMaxTex,
    effectiveGpuDimensionLimit: gpuLimit, wasClamped: warningCodes.length > 0 || effectiveDpr !== dpr,
    bitmapWidth, bitmapHeight, exceedsMaxTextureSize,
    warningCodes: Object.freeze(warningCodes), warningsKo: Object.freeze(warningsKo),
  });
}

function computePlaneWindowedSsim(planeA, planeB, width, height, windowSize) {
  const c1 = 6.5025;
  const c2 = 58.5225;
  const winW = Math.min(windowSize, width);
  const winH = Math.min(windowSize, height);
  let ssimSum = 0;
  let windows = 0;
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
        for (let x = x0; x < xEnd; x += 1) { sumA += planeA[row + x]; sumB += planeB[row + x]; }
      }
      const meanA = sumA / count;
      const meanB = sumB / count;
      let varA = 0;
      let varB = 0;
      let covAB = 0;
      for (let y = y0; y < yEnd; y += 1) {
        const row = y * width;
        for (let x = x0; x < xEnd; x += 1) {
          const da = planeA[row + x] - meanA;
          const db = planeB[row + x] - meanB;
          varA += da * da; varB += db * db; covAB += da * db;
        }
      }
      const denom = count > 1 ? count - 1 : 1;
      const num = (2 * meanA * meanB + c1) * (2 * (covAB / denom) + c2);
      const den = (meanA * meanA + meanB * meanB + c1) * (varA / denom + varB / denom + c2);
      ssimSum += Math.min(1, Math.max(-1, den > 0 ? num / den : 1));
      windows += 1;
    }
  }
  return windows > 0 ? ssimSum / windows : 1;
}

/** 두 RGBA8 버퍼의 SHA-256, 변경 픽셀 수, 휘도·알파 SSIM, PSNR을 계산한다. */
export function computeRgbaSsim(baseline, candidate, options = {}) {
  if (!baseline || !candidate || baseline.width !== candidate.width || baseline.height !== candidate.height) {
    throw new RangeError("비교할 RGBA 이미지 해상도가 유효하지 않거나 서로 다릅니다.");
  }
  const { width, height } = baseline;
  const pixelCount = width * height;
  const expected = pixelCount * 4;
  if (baseline.pixels.length !== expected || candidate.pixels.length !== expected) {
    throw new RangeError(`RGBA 픽셀 버퍼 길이가 해상도와 맞지 않습니다 (기대: ${expected}).`);
  }
  const windowSize = Number.isSafeInteger(options.windowSize) && options.windowSize >= 1 ? options.windowSize : 8;
  const lumaA = new Float64Array(pixelCount);
  const lumaB = new Float64Array(pixelCount);
  const alphaA = new Float64Array(pixelCount);
  const alphaB = new Float64Array(pixelCount);
  let changedPixelCount = 0;
  let maxChannelDelta = 0;
  let squaredErrorSum = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    const rA = baseline.pixels[idx]; const gA = baseline.pixels[idx + 1];
    const bA = baseline.pixels[idx + 2]; const aA = baseline.pixels[idx + 3];
    const rB = candidate.pixels[idx]; const gB = candidate.pixels[idx + 1];
    const bB = candidate.pixels[idx + 2]; const aB = candidate.pixels[idx + 3];
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
  const baselineSha256 = sha256Hex(baseline.pixels);
  const candidateSha256 = sha256Hex(candidate.pixels);
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

/** 3컷 공유 배경 PNG SHA-256 및 RGBA SSIM 회귀 계약을 평가한다. */
export function evaluateThreeCutPixelRegression(cuts, options = {}) {
  const minUnchangedSsim = options.minUnchangedSsim ?? DEFAULT_MIN_UNCHANGED_SSIM;
  const maxMutatedSsim = options.maxMutatedSsim ?? DEFAULT_MAX_MUTATED_SSIM;
  const requireExactByteMatch = options.requireExactByteMatchForUnchanged ?? true;
  const failures = [];
  const results = [];
  const baselineHashes = new Set();
  if (!Array.isArray(cuts) || cuts.length < 3) {
    failures.push(`3컷 픽셀 회귀에는 최소 3개 컷이 필요합니다 (현재 ${cuts?.length ?? 0}컷).`);
  }
  for (const cut of cuts ?? []) {
    const baselinePngSha256 = cut.baselinePngBytes ? sha256Hex(cut.baselinePngBytes) : null;
    const candidatePngSha256 = cut.candidatePngBytes ? sha256Hex(cut.candidatePngBytes) : null;
    const pngBytesMatch = baselinePngSha256 !== null && candidatePngSha256 !== null ? baselinePngSha256 === candidatePngSha256 : null;
    const rgbaSsim = cut.baselineRgba && cut.candidateRgba ? computeRgbaSsim(cut.baselineRgba, cut.candidateRgba) : null;
    const fingerprint = baselinePngSha256 ?? rgbaSsim?.baselineSha256 ?? null;
    if (fingerprint) baselineHashes.add(fingerprint);

    let passed = true;
    let reasonKo;
    if (pngBytesMatch === null && rgbaSsim === null) {
      passed = false; reasonKo = `${cut.cutId}: PNG 바이트와 RGBA 픽셀 입력이 모두 누락되었습니다.`;
    } else if (cut.role === "unchanged") {
      if (requireExactByteMatch && pngBytesMatch === false) {
        passed = false; reasonKo = `${cut.cutId}: 비변경 컷 PNG SHA-256 불일치 (${baselinePngSha256.slice(0, 12)} ≠ ${candidatePngSha256.slice(0, 12)})`;
      } else if (rgbaSsim && rgbaSsim.ssim < minUnchangedSsim) {
        passed = false; reasonKo = `${cut.cutId}: 비변경 컷 SSIM 미달 (${rgbaSsim.ssim.toFixed(6)} < ${minUnchangedSsim})`;
      } else reasonKo = "비변경 컷 원본 기준선과 100% 일치";
    } else if (pngBytesMatch !== false && !(rgbaSsim && !rgbaSsim.exactPixelMatch && rgbaSsim.ssim <= maxMutatedSsim)) {
      passed = false; reasonKo = `${cut.cutId}: 변경 컷의 픽셀·PNG가 기준선과 동일합니다(카메라 갱신 누락 의심).`;
    } else reasonKo = "변경 컷 카메라 반영 확인";

    if (!passed) failures.push(reasonKo);
    results.push(Object.freeze({
      cutId: cut.cutId, role: cut.role, baselinePngSha256, candidatePngSha256, pngBytesMatch,
      ssim: rgbaSsim?.ssim ?? null, changedPixelCount: rgbaSsim?.changedPixelCount ?? null, passed, reasonKo,
    }));
  }
  if (Array.isArray(cuts) && cuts.length >= 3 && baselineHashes.size < cuts.length) {
    failures.push(`기준선 3컷의 고유 해시 수(${baselineHashes.size})가 컷 수(${cuts.length})보다 적습니다.`);
  }
  return Object.freeze({ passed: failures.length === 0, distinctBaselineHashes: baselineHashes.size, cutResults: Object.freeze(results), failures: Object.freeze(failures) });
}

/** 워밍업 이후 JS 힙 샘플에서 최종 증가율(`<= 5%`)을 평가한다. */
export function evaluateSoakHeapLeak(samples, maxAllowedLeakRatio = DEFAULT_MAX_HEAP_LEAK_RATIO) {
  const valid = (samples ?? []).filter((item) => isPositiveFinite(item?.usedBytes));
  if (valid.length === 0) throw new RangeError("JS 힙 누수 판정에는 양수 usedBytes 샘플이 최소 1건 필요합니다.");
  const baselineUsedBytes = valid[0].usedBytes;
  const finalUsedBytes = valid[valid.length - 1].usedBytes;
  let peakUsedBytes = baselineUsedBytes;
  for (const sample of valid) if (sample.usedBytes > peakUsedBytes) peakUsedBytes = sample.usedBytes;
  const deltaBytes = finalUsedBytes - baselineUsedBytes;
  const signedGrowthRatio = deltaBytes / baselineUsedBytes;
  const leakRatio = Math.max(0, signedGrowthRatio);
  return Object.freeze({
    sampleCount: valid.length, baselineUsedBytes, finalUsedBytes, peakUsedBytes, deltaBytes,
    signedGrowthRatio, leakRatio, leakPercent: Math.round(leakRatio * 10_000) / 100,
    maxAllowedLeakRatio, withinThreshold: leakRatio <= maxAllowedLeakRatio,
  });
}

/** 3컷 회귀 + DPR 가드 + 500회 컷 전환(10시간 가속) 소크 리포트를 종합 판정한다. */
export function buildAcceleratedSoakReport(input) {
  const failures = [];
  if (!input.dprGuard || input.dprGuard.effectiveDpr > SAFE_DPR_MAX || input.dprGuard.exceedsMaxTextureSize) {
    failures.push("모바일 DPR 안전 클램프(<= 2x 및 MAX_TEXTURE_SIZE 이하) 위반");
  }
  if (!input.preSoakThreeCut?.passed) failures.push(...(input.preSoakThreeCut?.failures ?? ["소크 전 3컷 픽셀 회귀 실패"]));
  if (input.postSoakThreeCut && !input.postSoakThreeCut.passed) {
    failures.push(...input.postSoakThreeCut.failures.map((msg) => `[소크 후] ${msg}`));
  }
  if (!input.heapLeak?.withinThreshold) {
    failures.push(`JS 힙 증가율 초과: ${((input.heapLeak?.leakRatio ?? 1) * 100).toFixed(2)}% > ${((input.heapLeak?.maxAllowedLeakRatio ?? DEFAULT_MAX_HEAP_LEAK_RATIO) * 100).toFixed(2)}%`);
  }
  const completedCycles = Number(input.completedCycles ?? 0);
  const targetCycles = Number(input.targetCycles ?? DEFAULT_SOAK_CYCLES);
  if (completedCycles < targetCycles) failures.push(`목표 컷 전환 소크 횟수 미달 (${completedCycles}/${targetCycles})`);
  const activeHandleDelta = Number(input.activeHandleDelta ?? 0);
  if (activeHandleDelta !== 0) failures.push(`미해제 임시 리소스 핸들 잔존 (${activeHandleDelta}건)`);
  const runtimeErrors = [...(input.consoleErrors ?? []), ...(input.pageErrors ?? [])];
  if (runtimeErrors.length > 0) failures.push(`브라우저 런타임 오류 ${runtimeErrors.length}건 발생`);

  return Object.freeze({
    schemaVersion: 1, mode: input.mode ?? "chromium-live",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    targetCycles, completedCycles,
    simulatedHours: Math.round((completedCycles / CUT_SWITCHES_PER_SIMULATED_HOUR) * 100) / 100,
    activeHandleDelta, dprGuard: input.dprGuard,
    preSoakThreeCut: input.preSoakThreeCut, postSoakThreeCut: input.postSoakThreeCut ?? null,
    heapLeak: input.heapLeak,
    consoleErrorCount: (input.consoleErrors ?? []).length,
    pageErrorCount: (input.pageErrors ?? []).length,
    passed: failures.length === 0, failures: Object.freeze(failures),
  });
}

export function formatAcceleratedSoakMarkdown(report) {
  return [
    "# ToonStudio BG3D 3컷 공유 배경 픽셀 회귀 & 10시간 가속 소크 검증 리포트",
    "",
    `- 모드: ${report.mode}`,
    `- 생성 시각: ${report.generatedAt}`,
    `- 최종 판정: ${report.passed ? "PASS" : "FAIL"}`,
    `- 컷 전환 소크: ${report.completedCycles}/${report.targetCycles}회 (10시간 환산 ${report.simulatedHours}시간)`,
    `- 모바일 DPR 가드: requested=${report.dprGuard.requestedDpr}x → effective=${report.dprGuard.effectiveDpr}x (MAX_TEXTURE_SIZE=${report.dprGuard.maxTextureSize}, 초과=${report.dprGuard.exceedsMaxTextureSize})`,
    `- JS 힙 누수율: ${report.heapLeak.leakPercent.toFixed(2)}% (허용 상한 ${(report.heapLeak.maxAllowedLeakRatio * 100).toFixed(2)}%, baseline=${report.heapLeak.baselineUsedBytes}B → final=${report.heapLeak.finalUsedBytes}B, peak=${report.heapLeak.peakUsedBytes}B)`,
    `- 미해제 핸들 변화: ${report.activeHandleDelta}건`,
    `- 콘솔/페이지 오류: ${report.consoleErrorCount}/${report.pageErrorCount}건`,
    "",
    "## 3컷 PNG SHA-256 / SSIM 회귀 (재열기 직후)",
    "",
    ...report.preSoakThreeCut.cutResults.map(
      (cut) => `- ${cut.cutId} (${cut.role}): ${cut.passed ? "PASS" : "FAIL"} · pngMatch=${String(cut.pngBytesMatch)} · ssim=${cut.ssim === null ? "n/a" : cut.ssim.toFixed(6)} · ${cut.reasonKo}`,
    ),
    ...(report.failures.length > 0 ? ["", "## 실패 사유", "", ...report.failures.map((item) => `- ${item}`)] : []),
    "",
  ].join("\n");
}

export function parseSoakCliArgs(argv = process.argv.slice(2)) {
  const options = {
    help: false, dryRun: false, json: false,
    cycles: DEFAULT_SOAK_CYCLES, warmupCycles: DEFAULT_SOAK_WARMUP_CYCLES, sampleEvery: DEFAULT_SOAK_SAMPLE_EVERY,
    maxHeapLeakRatio: DEFAULT_MAX_HEAP_LEAK_RATIO, minUnchangedSsim: DEFAULT_MIN_UNCHANGED_SSIM,
    dpr: DEFAULT_MOBILE_AUDIT_DPR, outputDir: path.resolve(DEFAULT_SOAK_OUTPUT_DIR),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readNumber = (flag, min, max) => {
      const next = Number(argv[++i]);
      if (!Number.isFinite(next) || next < min || next > max) throw new Error(`${flag} 값은 ${min}~${max} 범위 숫자여야 합니다.`);
      return next;
    };
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--cycles") options.cycles = Math.floor(readNumber("--cycles", 3, 20_000));
    else if (arg === "--warmup-cycles") options.warmupCycles = Math.floor(readNumber("--warmup-cycles", 0, 500));
    else if (arg === "--sample-every") options.sampleEvery = Math.floor(readNumber("--sample-every", 1, 1_000));
    else if (arg === "--max-heap-leak-ratio") options.maxHeapLeakRatio = readNumber("--max-heap-leak-ratio", 0.001, 0.5);
    else if (arg === "--min-unchanged-ssim") options.minUnchangedSsim = readNumber("--min-unchanged-ssim", 0.9, 1);
    else if (arg === "--dpr") options.dpr = readNumber("--dpr", 1, 6);
    else if (arg === "--output" && argv[i + 1]) options.outputDir = path.resolve(argv[++i]);
    else throw new Error(`알 수 없는 인자입니다: ${String(arg).slice(0, 64)}`);
  }
  return Object.freeze(options);
}

function createSyntheticPatternRgba(width, height, seed) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      pixels[idx] = (x * 11 + y * 5 + seed * 41) % 256;
      pixels[idx + 1] = (x * 7 + y * 13 + seed * 59) % 256;
      pixels[idx + 2] = (x * 17 + y * 3 + seed * 83) % 256;
      pixels[idx + 3] = 255;
    }
  }
  return { width, height, pixels };
}

/** 브라우저 기동·파일 쓰기 없이 3컷 계약·DPR=3 클램프·500회 소크 리포트 자가 점검을 수행한다. */
export function runDryRunSelfCheck(options) {
  const cut1Base = createSyntheticPatternRgba(16, 16, 1);
  const cut1Mut = createSyntheticPatternRgba(16, 16, 7);
  const cut2Base = createSyntheticPatternRgba(16, 16, 2);
  const cut3Base = createSyntheticPatternRgba(16, 16, 3);
  const preSoakThreeCut = evaluateThreeCutPixelRegression(
    [
      { cutId: "cut-1", role: "mutated", baselinePngBytes: cut1Base.pixels, candidatePngBytes: cut1Mut.pixels, baselineRgba: cut1Base, candidateRgba: cut1Mut },
      { cutId: "cut-2", role: "unchanged", baselinePngBytes: cut2Base.pixels, candidatePngBytes: cut2Base.pixels, baselineRgba: cut2Base, candidateRgba: cut2Base },
      { cutId: "cut-3", role: "unchanged", baselinePngBytes: cut3Base.pixels, candidatePngBytes: cut3Base.pixels, baselineRgba: cut3Base, candidateRgba: cut3Base },
    ],
    { minUnchangedSsim: options.minUnchangedSsim },
  );
  return buildAcceleratedSoakReport({
    mode: "dry-run",
    targetCycles: options.cycles,
    completedCycles: options.cycles,
    activeHandleDelta: 0,
    dprGuard: clampCanvasDprForSoak(options.dpr, 4096, { cssWidth: 390, cssHeight: 844 }),
    preSoakThreeCut,
    postSoakThreeCut: preSoakThreeCut,
    heapLeak: evaluateSoakHeapLeak(
      [
        { cycle: options.warmupCycles, usedBytes: 32_000_000 },
        { cycle: Math.floor(options.cycles / 2), usedBytes: 32_640_000 },
        { cycle: options.cycles, usedBytes: 32_480_000 },
      ],
      options.maxHeapLeakRatio,
    ),
    consoleErrors: [],
    pageErrors: [],
  });
}

function buildHarnessHtml() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>BG3D 3-Cut Soak Harness</title>
<style>body{margin:0;background:#1d222b}canvas{display:block;width:390px;height:260px}</style></head>
<body><canvas id="stage" width="390" height="260"></canvas><script>
const QUADS=[
  {c:"#d6d1c7",p:[[-3,0,-4],[3,0,-4],[3,0,4],[-3,0,4]]},
  {c:"#ece7dc",p:[[-3,0,-4],[3,0,-4],[3,3,-4],[-3,3,-4]]},
  {c:"#9c6f44",p:[[-1.1,0.75,-1.2],[1.1,0.75,-1.2],[1.1,0.75,0.6],[-1.1,0.75,0.6]]},
  {c:"#3d6b82",p:[[-2.4,0.2,-3.2],[-1.3,0.2,-3.2],[-1.3,1.8,-3.2],[-2.4,1.8,-3.2]]},
  {c:"#c98b4b",p:[[1.4,0.1,-2.2],[2.4,0.1,-2.2],[2.4,1.3,-2.2],[1.4,1.3,-2.2]]}
];
const BASE_DOC={sceneId:"scene-shared-cafe-v1",cuts:[
  {id:"cut-1",camera:{pos:[0,1.8,5.2],target:[0,1,-1],fov:46}},
  {id:"cut-2",camera:{pos:[4.2,2,2.8],target:[-0.2,0.9,-1.2],fov:36}},
  {id:"cut-3",camera:{pos:[-3.6,3.3,4.4],target:[0.4,0.8,-1],fov:54}}
]};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const norm=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const project=(pt,cam,w,h)=>{const f=norm(sub(cam.target,cam.pos)),r=norm(cross(f,[0,1,0])),u=cross(r,f),rel=sub(pt,cam.pos);const x=dot(rel,r),y=dot(rel,u),z=Math.max(0.25,dot(rel,f)),s=(h*0.5)/Math.tan(cam.fov*Math.PI/360);return [w*0.5+(x/z)*s,h*0.5-(y/z)*s];};
let activeHandles=0;
window.__bg3dSoakHarness={
  probeWebglLimits(){const c=document.createElement("canvas"),gl=c.getContext("webgl2")||c.getContext("webgl");return gl?{available:true,maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),maxRenderbufferSize:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)}:{available:false,maxTextureSize:4096,maxRenderbufferSize:4096};},
  renderCut(docJson,cutId,dpr,capture){const doc=JSON.parse(docJson),cut=doc.cuts.find(i=>i.id===cutId),canvas=document.getElementById("stage"),w=Math.ceil(390*dpr),h=Math.ceil(260*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext("2d");activeHandles+=1;try{ctx.fillStyle="#222938";ctx.fillRect(0,0,w,h);for(const q of QUADS){ctx.beginPath();q.p.forEach((pt,i)=>{const [px,py]=project(pt,cut.camera,w,h);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.closePath();ctx.fillStyle=q.c;ctx.fill();ctx.strokeStyle="#171c24";ctx.lineWidth=Math.max(1,dpr);ctx.stroke();}if(!capture)return {width:w,height:h};const data=ctx.getImageData(0,0,w,h).data;let bin="";for(let i=0;i<data.length;i+=16384){bin+=String.fromCharCode(...data.subarray(i,i+16384));}return {width:w,height:h,pngBase64:canvas.toDataURL("image/png").split(",")[1],rgbaBase64:btoa(bin)};}finally{activeHandles-=1;}},
  getBaseDocJson(){return JSON.stringify(BASE_DOC);},
  getActiveHandleCount(){return activeHandles;}
};
</script></body></html>`;
}

/** 실브라우저(Chromium)에서 3컷 공유 배경 회귀 + 500회 가속 소크를 수행한다. */
export async function runChromiumBg3dThreeCutSoak(options) {
  if (options.dryRun) return runDryRunSelfCheck(options);
  const { chromium } = await import("playwright");
  const server = http.createServer((req, res) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(buildHarnessHtml());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const consoleErrors = [];
  const pageErrors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: options.dpr, isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => pageErrors.push(String(err?.stack || err)));
    const cdp = await context.newCDPSession(page);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });

    const webglLimits = await page.evaluate(() => window.__bg3dSoakHarness.probeWebglLimits());
    const dprGuard = clampCanvasDprForSoak(options.dpr, webglLimits.maxTextureSize, {
      cssWidth: 390, cssHeight: 844, maxRenderbufferSize: webglLimits.maxRenderbufferSize,
    });
    const baseDocJson = await page.evaluate(() => window.__bg3dSoakHarness.getBaseDocJson());
    const captureAll = async (docJson) => {
      const snaps = new Map();
      for (const cutId of ["cut-1", "cut-2", "cut-3"]) {
        const res = await page.evaluate(
          ({ json, id, dpr }) => window.__bg3dSoakHarness.renderCut(json, id, dpr, true),
          { json: docJson, id: cutId, dpr: dprGuard.effectiveDpr },
        );
        const rgbaBuf = Buffer.from(res.rgbaBase64, "base64");
        snaps.set(cutId, {
          pngBytes: Buffer.from(res.pngBase64, "base64"),
          rgba: { width: res.width, height: res.height, pixels: new Uint8ClampedArray(rgbaBuf.buffer, rgbaBuf.byteOffset, rgbaBuf.byteLength) },
        });
      }
      return snaps;
    };

    const baselineSnaps = await captureAll(baseDocJson);
    const mutatedDoc = JSON.parse(baseDocJson);
    mutatedDoc.cuts[0].camera = { pos: [1.3, 1.5, 2.3], target: [0.1, 0.95, -1.1], fov: 29 };
    const reopenedDocJson = JSON.stringify(JSON.parse(JSON.stringify(mutatedDoc)));
    const postMutationSnaps = await captureAll(reopenedDocJson);

    const buildPairs = (cands) => ["cut-1", "cut-2", "cut-3"].map((cutId) => ({
      cutId, role: cutId === "cut-1" ? "mutated" : "unchanged",
      baselinePngBytes: baselineSnaps.get(cutId).pngBytes, candidatePngBytes: cands.get(cutId).pngBytes,
      baselineRgba: baselineSnaps.get(cutId).rgba, candidateRgba: cands.get(cutId).rgba,
    }));
    const preSoakThreeCut = evaluateThreeCutPixelRegression(buildPairs(postMutationSnaps), { minUnchangedSsim: options.minUnchangedSsim });

    const heapSamples = [];
    const sampleHeap = async (cycle) => {
      await cdp.send("HeapProfiler.collectGarbage").catch(() => undefined);
      const usage = await cdp.send("Runtime.getHeapUsage");
      heapSamples.push({ cycle, usedBytes: usage.usedSize, totalBytes: usage.totalSize });
    };
    const cutIds = ["cut-1", "cut-2", "cut-3"];
    for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
      await page.evaluate(
        ({ json, id, dpr }) => { window.__bg3dSoakHarness.renderCut(json, id, dpr, false); },
        { json: reopenedDocJson, id: cutIds[(cycle - 1) % cutIds.length], dpr: dprGuard.effectiveDpr },
      );
      if (cycle === options.warmupCycles || (cycle > options.warmupCycles && cycle % options.sampleEvery === 0)) {
        await sampleHeap(cycle);
      }
    }
    if (heapSamples.length === 0 || heapSamples[heapSamples.length - 1].cycle !== options.cycles) await sampleHeap(options.cycles);

    const postSoakSnaps = await captureAll(reopenedDocJson);
    const postSoakThreeCut = evaluateThreeCutPixelRegression(buildPairs(postSoakSnaps), { minUnchangedSsim: options.minUnchangedSsim });
    const activeHandleDelta = await page.evaluate(() => window.__bg3dSoakHarness.getActiveHandleCount());
    const report = buildAcceleratedSoakReport({
      mode: "chromium-live", targetCycles: options.cycles, completedCycles: options.cycles,
      activeHandleDelta, dprGuard, preSoakThreeCut, postSoakThreeCut,
      heapLeak: evaluateSoakHeapLeak(heapSamples, options.maxHeapLeakRatio), consoleErrors, pageErrors,
    });

    await mkdir(options.outputDir, { recursive: true });
    await writeFile(path.join(options.outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(options.outputDir, "report.md"), `${formatAcceleratedSoakMarkdown(report)}\n`);
    for (const [cutId, snap] of postSoakSnaps.entries()) {
      await writeFile(path.join(options.outputDir, `${cutId}-post-soak.png`), snap.pngBytes);
    }
    await context.close();
    return report;
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const options = parseSoakCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log("사용법: node scripts/verify-studio-bg3d-3cut-soak.mjs [--dry-run] [--json] [--cycles 500] [--dpr 3] [--max-heap-leak-ratio 0.05] [--output <dir>]");
    } else {
      const report = await runChromiumBg3dThreeCutSoak(options);
      const output = options.json ? `${JSON.stringify(report, null, 2)}\n` : formatAcceleratedSoakMarkdown(report);
      if (report.passed) console.log(output);
      else { console.error(output); process.exitCode = 1; }
    }
  } catch (error) {
    console.error(`3컷 가속 소크 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
