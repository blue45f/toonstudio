/**
 * Wave 162: 600DPI 1비트 흑백 만화 펜선 이진화 & 머리카락 선 끊김 방지 커널 진입점.
 *
 * 모듈 배럴 내보내기, 결정론적 안티앨리어싱 만화 원고 테스트 플레이트 생성기,
 * 그리고 전체 파이프라인 오케스트레이터(run600DpiInkHairlinePreservation)를 제공한다.
 */

import {
  binarizeGlobalThreshold,
  binarizeWithHairlinePreservation,
  validateGrayscaleBuffer,
} from './adaptive-binarize-and-hairline-guard';
import {
  compareInkBinarizationResults,
  computeInkManifestFingerprint,
} from './ink-topology-and-print-auditor';
import {
  buildMonochromeInkPreviewWgsl,
  validateMonochromeInkPreviewWgsl,
} from './monochrome-ink-preview-wgsl';
import {
  renderMonochromeInkAuditSvg,
  summarizeMonochromeInkAuditKo,
} from './monochrome-ink-report';
import {
  resolvePrintMonochromeProfile,
  type MonochromeInkPipelineInput,
  type MonochromeInkPipelineOutput,
  type PrintMonochromeProfileId,
} from './monochrome-ink-types';

export type {
  BinaryInkBuffer,
  BinaryInkComponent,
  BinaryInkComponentAnalysis,
  BinaryInkQualityAuditOptions,
  BinaryInkTopologyAudit,
  CollinearGapBridgeOptions,
  CollinearGapBridgeResult,
  DirectionalDarkRidgeMap,
  DirectionalDarkRidgeOptions,
  GlobalThresholdMode,
  GlobalThresholdOptions,
  GlobalThresholdResult,
  GrayscaleInkBuffer,
  HairlinePreservationConfig,
  HairlinePreservationResult,
  InkBinarizationComparison,
  InkBoundingBox,
  MonochromeInkAuditStatus,
  MonochromeInkPipelineInput,
  MonochromeInkPipelineOutput,
  MonochromeInkPreviewWgslBundle,
  MonochromeInkPreviewWgslOptions,
  MonochromeInkWgslValidationResult,
  PrintMonochromeProfileId,
  PrintMonochromeProfileSpec,
  RidgeOrientationCode,
  SpeckleCleanupOptions,
  SpeckleCleanupResult,
} from './monochrome-ink-types';

export {
  OFFSET_PRINT_MIN_STROKE_MM,
  PRINT_MONOCHROME_PROFILES,
  resolvePrintMonochromeProfile,
} from './monochrome-ink-types';

export {
  binarizeGlobalThreshold,
  binarizeWithHairlinePreservation,
  bridgeCollinearHairlineGaps,
  computeDirectionalDarkRidgeMap,
  computeOtsuThreshold,
  removeIsolatedInkSpeckles,
  validateBinaryBuffer,
  validateGrayscaleBuffer,
} from './adaptive-binarize-and-hairline-guard';

export {
  analyzeBinaryInkComponents,
  auditBinaryInkQuality,
  compareInkBinarizationResults,
  computeInkManifestFingerprint,
  estimateLocalStrokeWidthPx,
  pixelsToMillimeters,
  sha256InkHex,
} from './ink-topology-and-print-auditor';

export {
  buildMonochromeInkPreviewWgsl,
  validateMonochromeInkPreviewWgsl,
} from './monochrome-ink-preview-wgsl';

export type { MonochromeInkAuditSvgOptions } from './monochrome-ink-report';
export {
  escapeSvgXml,
  renderMonochromeInkAuditSvg,
  summarizeMonochromeInkAuditKo,
} from './monochrome-ink-report';

export interface SampleHairlineScenarioOptions {
  readonly width?: number;
  readonly height?: number;
  readonly dpi?: number;
  readonly profileId?: PrintMonochromeProfileId;
  readonly hairlinePeakGray?: number;
  readonly parallelGapPx?: number;
  readonly title?: string;
}

function blendDarkPixel(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  grayValue: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const idx = y * width + x;
  const clamped = Math.max(0, Math.min(255, Math.round(grayValue)));
  if (clamped < (pixels[idx] ?? 255)) pixels[idx] = clamped;
}

/**
 * 결정론적 600DPI 안티앨리어싱 만화 펜선 테스트 플레이트 생성기.
 *
 * 구성 요소:
 * 1) 굵고 선명한 먹 외곽선 (3px 두께, 옵셋 제판 안전선폭 확보)
 * 2) 연한 안티앨리어싱 대각·곡선 머리카락 세선 (피크 밝기 ~166, 단순 128 이진화 시 전량 소실)
 * 3) 2px 백색 간격을 둔 근접 평행 머리카락 2가닥 (유착 방지 검증)
 * 4) 여백에 고립된 1px 먼지 노이즈 3개 (노이즈 정리 검증)
 */
export function createSampleHairlineInkScenario(
  options: SampleHairlineScenarioOptions = {},
): MonochromeInkPipelineInput {
  const width = Math.max(48, Math.floor(options.width ?? 64));
  const height = Math.max(40, Math.floor(options.height ?? 48));
  const profile = resolvePrintMonochromeProfile(options.profileId, options.dpi ?? 600);
  const dpi = options.dpi ?? profile.dpi;
  const hairlinePeakGray = Math.max(135, Math.min(205, Math.round(options.hairlinePeakGray ?? 166)));
  const parallelGapPx = Math.max(2, Math.min(4, Math.floor(options.parallelGapPx ?? 2)));

  const pixels = new Uint8Array(width * height);
  pixels.fill(255);

  // 1) 굵은 먹 외곽선 (3px 두께 ㄴ자 프레임, 0.127mm @ 600DPI)
  for (let y = 8; y <= Math.min(height - 10, 38); y += 1) {
    blendDarkPixel(pixels, width, height, 6, y, 14);
    blendDarkPixel(pixels, width, height, 7, y, 10);
    blendDarkPixel(pixels, width, height, 8, y, 14);
    blendDarkPixel(pixels, width, height, 5, y, 118);
    blendDarkPixel(pixels, width, height, 9, y, 118);
  }
  for (let x = 6; x <= 20; x += 1) {
    blendDarkPixel(pixels, width, height, x, 8, 14);
    blendDarkPixel(pixels, width, height, x, 9, 10);
    blendDarkPixel(pixels, width, height, x, 10, 14);
  }

  // 2) 연한 안티앨리어싱 곡선 머리카락 세선
  const darkAmp = 255 - hairlinePeakGray;
  for (let x = 24; x <= Math.min(width - 10, 54); x += 1) {
    const t = (x - 24) / 30;
    const yf = 10 + 11 * t + 2.4 * Math.sin(t * Math.PI);
    const y0 = Math.floor(yf);
    const frac = yf - y0;
    if (frac <= 0.5) {
      blendDarkPixel(pixels, width, height, x, y0, 255 - darkAmp * (1 - frac * 0.45));
      blendDarkPixel(pixels, width, height, x, y0 + 1, Math.max(222, 255 - darkAmp * (0.28 + frac * 0.45)));
    } else {
      blendDarkPixel(pixels, width, height, x, y0 + 1, 255 - darkAmp * (0.55 + frac * 0.45));
      blendDarkPixel(pixels, width, height, x, y0, Math.max(222, 255 - darkAmp * (1 - frac) * 0.6));
    }
  }

  // 3) 2~3px 백색 간격을 둔 근접 평행 머리카락 2가닥
  const strandAY = Math.min(height - 14, 32);
  const strandBY = strandAY + parallelGapPx + 1;
  for (let x = 22; x <= Math.min(width - 10, 52); x += 1) {
    blendDarkPixel(pixels, width, height, x, strandAY, hairlinePeakGray);
    blendDarkPixel(pixels, width, height, x, strandBY, hairlinePeakGray);
  }

  // 4) 고립된 1px 먼지 노이즈 3개
  blendDarkPixel(pixels, width, height, width - 6, 6, 18);
  blendDarkPixel(pixels, width, height, 4, height - 5, 22);
  blendDarkPixel(pixels, width, height, width - 6, height - 6, 15);

  return {
    title: options.title ?? '단행본 600DPI 펜선 머리카락 보존 검수 시편',
    profileId: profile.id,
    grayscale: { width, height, dpi, pixels },
  };
}

/** 600DPI 1비트 흑백 펜선 무손실 변환 및 머리카락 선 끊김 방지 전체 오케스트레이터. */
export function run600DpiInkHairlinePreservation(
  input: MonochromeInkPipelineInput,
): MonochromeInkPipelineOutput {
  validateGrayscaleBuffer(input.grayscale);
  const profile = resolvePrintMonochromeProfile(input.profileId, input.grayscale.dpi);
  const title = input.title ?? '600DPI 1비트 흑백 펜선 검수 리포트';

  const baseline = binarizeGlobalThreshold(input.grayscale, input.baselineOptions);
  const preserved = binarizeWithHairlinePreservation(input.grayscale, {
    maxSpeckleAreaPx: profile.maxSpeckleAreaPx,
    ...input.preservationConfig,
  });

  const comparison = compareInkBinarizationResults(baseline.binary, preserved.binary, {
    profileId: profile.id,
    minSafeStrokeWidthMm: profile.minSafeStrokeWidthMm,
    maxSpeckleAreaPx: input.preservationConfig?.maxSpeckleAreaPx ?? profile.maxSpeckleAreaPx,
    sourceGrayscale: input.grayscale,
    ridgeMap: preserved.ridgeMap,
  });

  const wgslBundle = buildMonochromeInkPreviewWgsl({
    width: input.grayscale.width,
    height: input.grayscale.height,
    dpi: input.grayscale.dpi,
    minSafeStrokeWidthMm: profile.minSafeStrokeWidthMm,
    globalThreshold: baseline.thresholdUsed,
    ridgeBoostStrength: input.preservationConfig?.ridgeBoostStrength ?? 520,
    sauvolaK: input.preservationConfig?.sauvolaK ?? 0.22,
    paperWhiteCeiling: input.preservationConfig?.paperWhiteCeiling ?? 232,
    ...input.previewOptions,
  });
  const wgslValidation = validateMonochromeInkPreviewWgsl(wgslBundle);

  const sourceFingerprintSha256 = computeInkManifestFingerprint(
    input.grayscale,
    profile.id,
    'wave162-source',
  );
  const binaryFingerprintSha256 = computeInkManifestFingerprint(
    preserved.binary,
    profile.id,
    'wave162-1bit',
  );

  const auditSvg = renderMonochromeInkAuditSvg({
    title,
    profile,
    baseline: baseline.binary,
    preserved: preserved.binary,
    comparison,
    binaryFingerprintSha256,
  });
  const summaryKo = summarizeMonochromeInkAuditKo(profile, comparison, binaryFingerprintSha256);

  return {
    title,
    profile,
    baseline,
    preserved,
    comparison,
    wgslBundle,
    wgslValidation,
    sourceFingerprintSha256,
    binaryFingerprintSha256,
    auditSvg,
    summaryKo,
  };
}
