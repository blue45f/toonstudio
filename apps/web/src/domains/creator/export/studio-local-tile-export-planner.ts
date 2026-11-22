/**
 * 로컬 ₩0 다중 청크 타일 익스포트 플래너 + 무손실/적응형 포맷·대역폭 추천기.
 *
 * 유료 클라우드 렌더 팜이나 외부 API 없이 브라우저 로컬(Web Worker + OffscreenCanvas)만으로
 * 1600×20000px 같은 고해상도 세로 웹툰 원고를 메모리 한도 내에서 안전하게 분할·병렬 인코딩하기
 * 위한 타일 계획, 동시성 상한, PNG/WebP/JPG 대역폭 비교 및 유한 동시성 실행기를 제공한다.
 */

import type {
  StudioResourceLeakGuard,
  StudioResourceLeakReport,
} from "../render/studio-resource-leak-guard";
import type { ExportFormat } from "./studio-export-slice-helpers";

/** 주요 브라우저(Safari/Chrome) 공통 단일 캔버스 안전 한 변 상한(px). */
export const STUDIO_LOCAL_TILE_MAX_CANVAS_DIM = 16_384;
export const STUDIO_LOCAL_TILE_DEFAULT_MAX_EDGE = 4_096;
export const STUDIO_LOCAL_TILE_DEFAULT_SLICE_HEIGHT = 2_560;

const MIB = 1024 * 1024;
const WORKING_BUFFER_MULTIPLIER = 3; // 원본 크롭 RGBA + OffscreenCanvas 백킹 + 인코딩 출력 버퍼
const UPLOAD_BANDWIDTH_BYTES_PER_SEC_10MBPS = (10 * 1_000_000) / 8;

export type StudioExportContentProfile =
  | "lineart-screentone"
  | "flat-cel-webtoon"
  | "painterly-gradient"
  | "mixed";

export type StudioExportEncodingMode = "lossless" | "lossy-high";

export type StudioTileMemoryGuardStatus =
  | "safe"
  | "tight"
  | "clamped-to-single-worker";

export interface StudioRgbaComplexitySample {
  /** 고유 색상 버킷 비율(0..1). 높을수록 무손실 PNG 압축률이 낮아진다. */
  readonly uniqueColorBucketRatio01: number;
  /** 경계선/고주파 밀도(0..1). 높을수록 인코딩 바이트가 증가한다. */
  readonly edgeDensity01: number;
  readonly hasAlpha?: boolean;
}

export interface StudioLocalTileExportPlanInput {
  readonly width: number;
  readonly height: number;
  readonly scale?: number;
  readonly transparent?: boolean;
  readonly requestedFormat?: ExportFormat;
  readonly contentProfile?: StudioExportContentProfile;
  readonly hardwareConcurrency?: number;
  readonly deviceMemoryGb?: number;
  readonly memoryBudgetBytes?: number;
  readonly maxTileDimensionPx?: number;
  readonly targetSliceHeightPx?: number;
  readonly overlapHaloPx?: number;
  readonly platformMaxFileBytes?: number;
  readonly platformAllowedFormats?: readonly ExportFormat[];
  readonly rgbaComplexitySample?: StudioRgbaComplexitySample;
}

export interface StudioLocalExportTile {
  readonly index: number;
  readonly id: string;
  readonly row: number;
  readonly column: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly haloTop: number;
  readonly haloBottom: number;
  readonly haloLeft: number;
  readonly haloRight: number;
  readonly rawRgbaBytes: number;
  readonly estimatedWorkingBytes: number;
  readonly workerSlot: number;
  readonly estimatedRequestedBytes: number;
  readonly estimatedRecommendedBytes: number;
}

export interface StudioFormatBandwidthEstimate {
  readonly format: ExportFormat;
  readonly mode: StudioExportEncodingMode;
  readonly estimatedBytes: number;
  readonly estimatedPerTileBytes: number;
  readonly savingsVsPngPercent: number;
  readonly estimatedUploadSecondsAt10Mbps: number;
  readonly supportsTransparency: boolean;
  readonly eligible: boolean;
  readonly ineligibleReasonKo?: string;
}

export interface StudioPngVsWebpComparison {
  readonly pngBytes: number;
  readonly webpLossyBytes: number;
  readonly webpLosslessBytes: number;
  readonly webpLossySavingsPercent: number;
  readonly webpLosslessSavingsPercent: number;
  readonly summaryKo: string;
}

export interface StudioExportFormatRecommendation {
  readonly requestedFormat: ExportFormat;
  readonly recommendedFormat: ExportFormat;
  readonly recommendedMode: StudioExportEncodingMode;
  readonly requestedEstimatedBytes: number;
  readonly recommendedEstimatedBytes: number;
  readonly bandwidthSavingsBytes: number;
  readonly bandwidthSavingsPercent: number;
  readonly reasonKo: string;
}

export interface StudioLocalTileExportPlan {
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly totalPixels: number;
  readonly rawFullCanvasBytes: number;
  readonly requiresChunkedExport: boolean;
  readonly tileColumns: number;
  readonly tileRows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly workerConcurrency: number;
  readonly maxHardwareWorkers: number;
  readonly memoryBudgetBytes: number;
  readonly maxTileWorkingBytes: number;
  readonly peakConcurrentWorkingBytes: number;
  readonly memoryUtilizationRatio: number;
  readonly memoryGuardStatus: StudioTileMemoryGuardStatus;
  readonly guardSummaryKo: string;
  readonly tiles: readonly StudioLocalExportTile[];
  readonly estimates: readonly StudioFormatBandwidthEstimate[];
  readonly pngVsWebp: StudioPngVsWebpComparison;
  readonly recommendation: StudioExportFormatRecommendation;
}

export interface StudioLocalEncodedTileOutput<TPayload = Uint8Array> {
  readonly tileId: string;
  readonly index: number;
  readonly byteLength: number;
  readonly payload: TPayload;
}

export interface StudioLocalTiledExportExecutionResult<TPayload = Uint8Array> {
  readonly tiles: readonly StudioLocalEncodedTileOutput<TPayload>[];
  readonly totalEncodedBytes: number;
  readonly maxObservedConcurrency: number;
  readonly leakReport: StudioResourceLeakReport | null;
}

const BASE_BITS_PER_PIXEL: Readonly<
  Record<
    StudioExportContentProfile,
    Readonly<{
      png: number;
      webpLossless: number;
      webpLossy: number;
      jpgLossy: number;
    }>
  >
> = Object.freeze({
  "lineart-screentone": Object.freeze({
    png: 2.4,
    webpLossless: 1.65,
    webpLossy: 1.35,
    jpgLossy: 1.6,
  }),
  "flat-cel-webtoon": Object.freeze({
    png: 5.2,
    webpLossless: 3.4,
    webpLossy: 1.75,
    jpgLossy: 2.15,
  }),
  "painterly-gradient": Object.freeze({
    png: 11.4,
    webpLossless: 7.8,
    webpLossy: 2.35,
    jpgLossy: 2.9,
  }),
  mixed: Object.freeze({
    png: 6.8,
    webpLossless: 4.5,
    webpLossy: 1.95,
    jpgLossy: 2.4,
  }),
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / MIB;
  if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`;
}

function detectHardwareConcurrency(explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 1) {
    return Math.trunc(explicit);
  }
  const navCores =
    typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(1, Math.trunc(navCores));
}

function detectDeviceMemoryGb(explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const navWithMemory =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { readonly deviceMemory?: number })
      : undefined;
  const reported = navWithMemory?.deviceMemory;
  return typeof reported === "number" && Number.isFinite(reported) && reported > 0 ? reported : 4;
}

function resolveMemoryBudgetBytes(input: StudioLocalTileExportPlanInput): number {
  if (
    typeof input.memoryBudgetBytes === "number"
    && Number.isFinite(input.memoryBudgetBytes)
    && input.memoryBudgetBytes >= 4 * MIB
  ) {
    return Math.trunc(input.memoryBudgetBytes);
  }
  const deviceGb = detectDeviceMemoryGb(input.deviceMemoryGb);
  // 기기 RAM의 보수적 비율(약 4~6%)만 로컬 타일 인코딩 버퍼에 할당한다.
  const derived = Math.round(deviceGb * 48 * MIB);
  return Math.trunc(clamp(derived, 48 * MIB, 384 * MIB));
}

function estimateBytesForFormat(
  totalPixels: number,
  bitsPerPixel: number,
  transparent: boolean,
  format: ExportFormat,
  sample: StudioRgbaComplexitySample | undefined,
): number {
  const alphaFactor = transparent && format !== "jpg" ? 1.12 : 1;
  const complexityFactor = sample
    ? 0.72
      + clamp(sample.uniqueColorBucketRatio01, 0, 1) * 0.42
      + clamp(sample.edgeDensity01, 0, 1) * 0.28
    : 1;
  const containerOverhead = format === "png" ? 2_048 : 1_024;
  return Math.max(
    containerOverhead,
    Math.round(((totalPixels * bitsPerPixel) / 8) * alphaFactor * complexityFactor) + containerOverhead,
  );
}

function percentSavings(baselineBytes: number, candidateBytes: number): number {
  if (baselineBytes <= 0) return 0;
  return roundTo(((baselineBytes - candidateBytes) / baselineBytes) * 100, 1);
}

function chooseInitialTileGeometry(
  outputWidth: number,
  outputHeight: number,
  maxTileEdge: number,
  targetSliceHeight: number,
): { readonly tileWidth: number; readonly tileHeight: number } {
  const tileWidth = Math.min(outputWidth, maxTileEdge);
  const needsVerticalChunking = outputHeight > targetSliceHeight || outputHeight > maxTileEdge;
  const tileHeight = needsVerticalChunking
    ? Math.min(outputHeight, Math.min(targetSliceHeight, maxTileEdge))
    : outputHeight;
  return { tileWidth: Math.max(1, tileWidth), tileHeight: Math.max(1, tileHeight) };
}

function shrinkTileToFitMemoryBudget(
  initialWidth: number,
  initialHeight: number,
  memoryBudgetBytes: number,
): { readonly tileWidth: number; readonly tileHeight: number } {
  let tileWidth = Math.max(1, initialWidth);
  let tileHeight = Math.max(1, initialHeight);
  const perWorkerCeiling = Math.max(4 * MIB, memoryBudgetBytes);

  // 단일 타일 작업 버퍼가 예산 안에 들어올 때까지 긴 축을 우선 축소한다.
  for (let guard = 0; guard < 16; guard += 1) {
    const workingBytes = tileWidth * tileHeight * 4 * WORKING_BUFFER_MULTIPLIER;
    if (workingBytes <= perWorkerCeiling) break;
    if (tileHeight >= tileWidth && tileHeight > 256) {
      tileHeight = Math.max(256, Math.floor(tileHeight / 2));
    } else if (tileWidth > 256) {
      tileWidth = Math.max(256, Math.floor(tileWidth / 2));
    } else {
      break;
    }
  }
  return { tileWidth, tileHeight };
}

/**
 * 고해상도 원고를 브라우저 로컬 메모리·Web Worker 동시성 예산 내에서 안전하게 분할·인코딩할
 * 타일 계획과 PNG/WebP/JPG 대역폭 추천 결과를 계산한다.
 */
export function planStudioLocalTileExport(
  input: StudioLocalTileExportPlanInput,
): StudioLocalTileExportPlan {
  const scale = clamp(input.scale ?? 1, 0.1, 8);
  const outputWidth = Math.max(1, Math.round(clamp(input.width, 1, 65_536) * scale));
  const outputHeight = Math.max(1, Math.round(clamp(input.height, 1, 200_000) * scale));
  const totalPixels = outputWidth * outputHeight;
  const rawFullCanvasBytes = totalPixels * 4;

  const transparent = Boolean(input.transparent || input.rgbaComplexitySample?.hasAlpha);
  const requestedFormat: ExportFormat = input.requestedFormat ?? "png";
  const contentProfile: StudioExportContentProfile = input.contentProfile ?? "flat-cel-webtoon";
  const memoryBudgetBytes = resolveMemoryBudgetBytes(input);
  const hardwareCores = detectHardwareConcurrency(input.hardwareConcurrency);
  const maxHardwareWorkers = Math.max(1, Math.min(8, hardwareCores > 1 ? hardwareCores - 1 : 1));
  const maxTileEdge = Math.trunc(
    clamp(
      input.maxTileDimensionPx ?? STUDIO_LOCAL_TILE_DEFAULT_MAX_EDGE,
      256,
      STUDIO_LOCAL_TILE_MAX_CANVAS_DIM,
    ),
  );
  const targetSliceHeight = Math.trunc(
    clamp(
      input.targetSliceHeightPx ?? STUDIO_LOCAL_TILE_DEFAULT_SLICE_HEIGHT,
      256,
      STUDIO_LOCAL_TILE_MAX_CANVAS_DIM,
    ),
  );
  const overlapHaloPx = Math.trunc(clamp(input.overlapHaloPx ?? 0, 0, 128));

  const initial = chooseInitialTileGeometry(outputWidth, outputHeight, maxTileEdge, targetSliceHeight);
  const { tileWidth, tileHeight } = shrinkTileToFitMemoryBudget(
    initial.tileWidth,
    initial.tileHeight,
    memoryBudgetBytes,
  );

  const tileColumns = Math.max(1, Math.ceil(outputWidth / tileWidth));
  const tileRows = Math.max(1, Math.ceil(outputHeight / tileHeight));
  const totalTiles = tileColumns * tileRows;

  const maxTileWorkingBytes = tileWidth * tileHeight * 4 * WORKING_BUFFER_MULTIPLIER;
  const memoryConstrainedWorkers = Math.max(1, Math.floor(memoryBudgetBytes / Math.max(1, maxTileWorkingBytes)));
  const workerConcurrency = Math.max(1, Math.min(maxHardwareWorkers, memoryConstrainedWorkers, totalTiles));
  const peakConcurrentWorkingBytes = maxTileWorkingBytes * workerConcurrency;
  const memoryUtilizationRatio = roundTo(
    peakConcurrentWorkingBytes / Math.max(1, memoryBudgetBytes),
    3,
  );

  const requiresChunkedExport =
    totalTiles > 1
    || outputWidth > STUDIO_LOCAL_TILE_DEFAULT_MAX_EDGE
    || outputHeight > STUDIO_LOCAL_TILE_DEFAULT_MAX_EDGE
    || rawFullCanvasBytes > memoryBudgetBytes * 0.45;

  const memoryGuardStatus: StudioTileMemoryGuardStatus =
    workerConcurrency === 1 && maxHardwareWorkers > 1 && totalTiles > 1
      ? "clamped-to-single-worker"
      : memoryUtilizationRatio >= 0.8
        ? "tight"
        : "safe";

  const guardSummaryKo = !requiresChunkedExport
    ? `단일 캔버스로 바로 저장 가능(예상 작업 메모리 ${formatMegabytes(peakConcurrentWorkingBytes)} / 예산 ${formatMegabytes(memoryBudgetBytes)}).`
    : memoryGuardStatus === "clamped-to-single-worker"
      ? `메모리 보호를 위해 ${totalTiles}개 타일을 워커 1개로 순차 인코딩합니다(피크 ${formatMegabytes(peakConcurrentWorkingBytes)} / 예산 ${formatMegabytes(memoryBudgetBytes)}).`
      : `${totalTiles}개 타일(${tileWidth}×${tileHeight}px 기준)을 로컬 워커 ${workerConcurrency}개로 병렬 인코딩합니다(피크 ${formatMegabytes(peakConcurrentWorkingBytes)} / 예산 ${formatMegabytes(memoryBudgetBytes)}).`;

  // 2. 포맷별 대역폭·용량 추정치 계산
  const bpp = BASE_BITS_PER_PIXEL[contentProfile];
  const pngBytes = estimateBytesForFormat(
    totalPixels,
    bpp.png,
    transparent,
    "png",
    input.rgbaComplexitySample,
  );
  const webpLossyBytes = estimateBytesForFormat(
    totalPixels,
    bpp.webpLossy,
    transparent,
    "webp",
    input.rgbaComplexitySample,
  );
  const webpLosslessBytes = estimateBytesForFormat(
    totalPixels,
    bpp.webpLossless,
    transparent,
    "webp",
    input.rgbaComplexitySample,
  );
  const jpgLossyBytes = estimateBytesForFormat(
    totalPixels,
    bpp.jpgLossy,
    false,
    "jpg",
    input.rgbaComplexitySample,
  );

  const allowedSet = input.platformAllowedFormats
    ? new Set<ExportFormat>(input.platformAllowedFormats)
    : null;

  const buildEstimate = (
    format: ExportFormat,
    mode: StudioExportEncodingMode,
    estimatedBytes: number,
  ): StudioFormatBandwidthEstimate => {
    const supportsTransparency = format !== "jpg";
    let eligible = true;
    let ineligibleReasonKo: string | undefined;

    if (allowedSet && !allowedSet.has(format)) {
      eligible = false;
      ineligibleReasonKo = "제출처 플랫폼 규격에서 허용하지 않는 포맷입니다.";
    } else if (transparent && !supportsTransparency) {
      eligible = false;
      ineligibleReasonKo = "투명 배경(알파 채널)을 유지할 수 없습니다.";
    }

    return Object.freeze({
      format,
      mode,
      estimatedBytes,
      estimatedPerTileBytes: Math.ceil(estimatedBytes / totalTiles),
      savingsVsPngPercent: percentSavings(pngBytes, estimatedBytes),
      estimatedUploadSecondsAt10Mbps: roundTo(
        estimatedBytes / UPLOAD_BANDWIDTH_BYTES_PER_SEC_10MBPS,
        2,
      ),
      supportsTransparency,
      eligible,
      ...(ineligibleReasonKo ? { ineligibleReasonKo } : {}),
    });
  };

  const pngEstimate = buildEstimate("png", "lossless", pngBytes);
  const webpLossyEstimate = buildEstimate("webp", "lossy-high", webpLossyBytes);
  const webpLosslessEstimate = buildEstimate("webp", "lossless", webpLosslessBytes);
  const jpgEstimate = buildEstimate("jpg", "lossy-high", jpgLossyBytes);

  const estimates: readonly StudioFormatBandwidthEstimate[] = Object.freeze([
    pngEstimate,
    webpLossyEstimate,
    webpLosslessEstimate,
    jpgEstimate,
  ]);

  const webpLossySavingsPercent = percentSavings(pngBytes, webpLossyBytes);
  const webpLosslessSavingsPercent = percentSavings(pngBytes, webpLosslessBytes);
  const pngVsWebp: StudioPngVsWebpComparison = Object.freeze({
    pngBytes,
    webpLossyBytes,
    webpLosslessBytes,
    webpLossySavingsPercent,
    webpLosslessSavingsPercent,
    summaryKo: `PNG 약 ${formatMegabytes(pngBytes)} vs WebP 약 ${formatMegabytes(webpLossyBytes)}(약 ${Math.max(0, Math.round(webpLossySavingsPercent))}% 절감 · 무손실 WebP 약 ${formatMegabytes(webpLosslessBytes)})`,
  });

  // 3. 무손실/적응형 포맷 추천 판정
  const eligibleEstimates = estimates.filter((entry) => entry.eligible);
  const capBytes =
    typeof input.platformMaxFileBytes === "number"
    && Number.isFinite(input.platformMaxFileBytes)
    && input.platformMaxFileBytes > 0
      ? input.platformMaxFileBytes
      : null;

  const findEligible = (format: ExportFormat, mode?: StudioExportEncodingMode) =>
    eligibleEstimates.find(
      (entry) => entry.format === format && (mode === undefined || entry.mode === mode),
    );

  let chosen: StudioFormatBandwidthEstimate;
  let reasonKo: string;

  const pngOption = findEligible("png", "lossless");
  const webpLosslessOption = findEligible("webp", "lossless");
  const webpLossyOption = findEligible("webp", "lossy-high");
  const jpgOption = findEligible("jpg", "lossy-high");

  if (eligibleEstimates.length === 1) {
    chosen = eligibleEstimates[0] ?? pngEstimate;
    reasonKo = `제출처 허용 포맷이 ${chosen.format.toUpperCase()} 한 가지라 해당 포맷을 유지합니다.`;
  } else if (contentProfile === "lineart-screentone") {
    const losslessCandidate =
      webpLosslessOption && (!capBytes || webpLosslessOption.estimatedPerTileBytes <= capBytes)
        ? webpLosslessOption
        : pngOption;
    if (losslessCandidate && (!capBytes || losslessCandidate.estimatedPerTileBytes <= capBytes)) {
      chosen = losslessCandidate;
      reasonKo =
        chosen.format === "webp"
          ? `선화·스크린톤 원고는 무손실 WebP가 PNG 대비 약 ${Math.max(0, Math.round(chosen.savingsVsPngPercent))}% 가벼우면서도 링잉 없이 경계를 보존해요.`
          : "선화·스크린톤 원고는 무손실 PNG로 저장해야 톤 패턴과 잉크 외곽선이 깨지지 않아요.";
    } else if (webpLossyOption) {
      chosen = webpLossyOption;
      reasonKo = `무손실 포맷이 장당 용량 상한(${formatMegabytes(capBytes ?? 0)})을 넘어 고화질 WebP로 대역폭을 줄이는 편이 안전해요.`;
    } else {
      chosen = eligibleEstimates[0] ?? pngEstimate;
      reasonKo = "허용된 포맷 중 용량 상한에 가장 가까운 형식을 선택했어요.";
    }
  } else if (webpLossyOption && webpLossyOption.savingsVsPngPercent >= 30) {
    chosen = webpLossyOption;
    reasonKo = transparent
      ? `투명 배경을 유지하면서도 WebP가 PNG 대비 약 ${Math.round(webpLossyOption.savingsVsPngPercent)}% 용량을 절감해요(${formatMegabytes(pngBytes)} → ${formatMegabytes(webpLossyBytes)}).`
      : `고화질 WebP로 저장하면 PNG 대비 약 ${Math.round(webpLossyOption.savingsVsPngPercent)}% 대역폭을 줄일 수 있어요(${formatMegabytes(pngBytes)} → ${formatMegabytes(webpLossyBytes)}).`;
  } else if (!transparent && jpgOption && (!webpLossyOption || jpgOption.estimatedBytes < webpLossyOption.estimatedBytes)) {
    chosen = jpgOption;
    reasonKo = `불투명 웹툰 연재본은 JPG가 PNG 대비 약 ${Math.max(0, Math.round(jpgOption.savingsVsPngPercent))}% 가벼워 업로드 호환성이 높아요.`;
  } else {
    chosen = pngOption ?? eligibleEstimates[0] ?? pngEstimate;
    reasonKo = "무손실 원본 보존이 가장 적합해 PNG를 권장해요.";
  }

  const requestedEstimate =
    estimates.find((entry) => entry.format === requestedFormat && entry.mode === "lossy-high")
    ?? estimates.find((entry) => entry.format === requestedFormat)
    ?? pngEstimate;
  const bandwidthSavingsBytes = Math.max(0, requestedEstimate.estimatedBytes - chosen.estimatedBytes);
  const bandwidthSavingsPercent =
    requestedEstimate.estimatedBytes > 0
      ? Math.max(0, percentSavings(requestedEstimate.estimatedBytes, chosen.estimatedBytes))
      : 0;

  const recommendation: StudioExportFormatRecommendation = Object.freeze({
    requestedFormat,
    recommendedFormat: chosen.format,
    recommendedMode: chosen.mode,
    requestedEstimatedBytes: requestedEstimate.estimatedBytes,
    recommendedEstimatedBytes: chosen.estimatedBytes,
    bandwidthSavingsBytes,
    bandwidthSavingsPercent,
    reasonKo,
  });

  // 4. 무간극·무중복 타일 청크 배열 생성
  const tiles: StudioLocalExportTile[] = [];
  let index = 0;
  for (let row = 0; row < tileRows; row += 1) {
    const y = row * tileHeight;
    const height = Math.min(tileHeight, outputHeight - y);
    for (let column = 0; column < tileColumns; column += 1) {
      const x = column * tileWidth;
      const width = Math.min(tileWidth, outputWidth - x);
      const rawRgbaBytes = width * height * 4;
      const pixelShare = (width * height) / Math.max(1, totalPixels);

      tiles.push(
        Object.freeze({
          index,
          id: `tile-r${row}-c${column}`,
          row,
          column,
          x,
          y,
          width,
          height,
          haloTop: Math.min(overlapHaloPx, y),
          haloBottom: Math.min(overlapHaloPx, outputHeight - (y + height)),
          haloLeft: Math.min(overlapHaloPx, x),
          haloRight: Math.min(overlapHaloPx, outputWidth - (x + width)),
          rawRgbaBytes,
          estimatedWorkingBytes: rawRgbaBytes * WORKING_BUFFER_MULTIPLIER,
          workerSlot: index % workerConcurrency,
          estimatedRequestedBytes: Math.max(512, Math.round(requestedEstimate.estimatedBytes * pixelShare)),
          estimatedRecommendedBytes: Math.max(512, Math.round(chosen.estimatedBytes * pixelShare)),
        }),
      );
      index += 1;
    }
  }

  return Object.freeze({
    outputWidth,
    outputHeight,
    totalPixels,
    rawFullCanvasBytes,
    requiresChunkedExport,
    tileColumns,
    tileRows,
    tileWidth,
    tileHeight,
    workerConcurrency,
    maxHardwareWorkers,
    memoryBudgetBytes,
    maxTileWorkingBytes,
    peakConcurrentWorkingBytes,
    memoryUtilizationRatio,
    memoryGuardStatus,
    guardSummaryKo,
    tiles: Object.freeze(tiles),
    estimates,
    pngVsWebp,
    recommendation,
  });
}

/**
 * 계획된 `workerConcurrency` 상한을 엄격히 지키며 로컬 타일 인코딩을 병렬 실행한다.
 * 선택적으로 `resourceGuard`를 넘기면 작업 종료/중단 시 누수된 임시 리소스를 자동 정리하고 리포트를 반환한다.
 */
export async function executeLocalTiledExportPlan<TPayload = Uint8Array>(
  plan: StudioLocalTileExportPlan,
  encodeTile: (
    tile: StudioLocalExportTile,
    context: { readonly workerSlot: number; readonly signal?: AbortSignal },
  ) => Promise<{ readonly byteLength: number; readonly payload: TPayload }>,
  options: {
    readonly signal?: AbortSignal;
    readonly resourceGuard?: StudioResourceLeakGuard;
    readonly onProgress?: (progress: {
      readonly completedTiles: number;
      readonly totalTiles: number;
      readonly lastTileId: string;
    }) => void;
  } = {},
): Promise<StudioLocalTiledExportExecutionResult<TPayload>> {
  const totalTiles = plan.tiles.length;
  const results = new Array<StudioLocalEncodedTileOutput<TPayload>>(totalTiles);
  let cursor = 0;
  let completedTiles = 0;
  let inFlight = 0;
  let maxObservedConcurrency = 0;
  let firstError: unknown = null;

  const workerCount = Math.max(1, Math.min(plan.workerConcurrency, totalTiles));

  const runWorker = async (workerSlot: number): Promise<void> => {
    while (firstError === null) {
      if (options.signal?.aborted) {
        firstError = new Error("로컬 타일 익스포트가 사용자 요청으로 중단되었어요.");
        return;
      }
      const nextIndex = cursor;
      if (nextIndex >= totalTiles) return;
      cursor += 1;

      const tile = plan.tiles[nextIndex];
      if (!tile) return;

      inFlight += 1;
      if (inFlight > maxObservedConcurrency) {
        maxObservedConcurrency = inFlight;
      }
      try {
        const encoded = await encodeTile(tile, { workerSlot, signal: options.signal });
        results[nextIndex] = Object.freeze({
          tileId: tile.id,
          index: tile.index,
          byteLength: Math.max(0, Math.trunc(encoded.byteLength)),
          payload: encoded.payload,
        });
        completedTiles += 1;
        options.onProgress?.({
          completedTiles,
          totalTiles,
          lastTileId: tile.id,
        });
      } catch (error) {
        if (firstError === null) firstError = error;
        return;
      } finally {
        inFlight -= 1;
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: workerCount }, (_, slot) => runWorker(slot)),
    );
    if (firstError !== null) {
      throw firstError;
    }
  } finally {
    options.resourceGuard?.sweep({ reclaimOverflow: true });
  }

  const totalEncodedBytes = results.reduce((sum, item) => sum + (item?.byteLength ?? 0), 0);
  const leakReport = options.resourceGuard ? options.resourceGuard.inspect() : null;

  return Object.freeze({
    tiles: Object.freeze(results),
    totalEncodedBytes,
    maxObservedConcurrency,
    leakReport,
  });
}
