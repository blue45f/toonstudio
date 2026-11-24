/**
 * 동적 리소스 예산 관리자(Dynamic Resource Budgeter) 및 60fps 비침범 스트리밍 출고 엔진.
 *
 * - 작업 중에도 웹툰(800/1600px sRGB·Display P3), 단행본 인쇄(300/600DPI B5·신국판 CMYK 블리드),
 *   방송/4K(3840×2160 Rec.709·Rec.2020) 3대 매체의 해상도·색역·예상 VRAM/RAM·타일 청크 수를 실시간 계산한다.
 * - 60fps 편집 프레임 예산(<= 16.67ms)을 침범하지 않는 백그라운드 스트리밍 타일 파이프라인 스케줄러
 *   (청크별 소요 시간 상한·VRAM/RAM 워터마크 상한 백프레셔 플러시·진행률/일시정지/재개/취소)와
 *   매체별 색역 이탈(Out-of-Gamut) 경고를 통합 제공한다.
 */

import {
  DEFAULT_WORK_COLOR_SAMPLES,
  evaluateGamutForMedium,
  type ColorGamutId,
  type ColorSampleInput,
  type MediumGamutReport,
} from "./gamut-color-evaluator";

export {
  DEFAULT_WORK_COLOR_SAMPLES,
  NEON_STRESS_COLOR_SAMPLES,
  PRINT_SAFE_COLOR_SAMPLES,
  evaluateGamutForMedium,
  type ColorGamutId,
  type ColorSampleInput,
  type GamutSampleEvaluation,
  type GamutWarningSeverity,
  type MediumGamutReport,
} from "./gamut-color-evaluator";

export type ExportMediumCategory = "webtoon" | "print" | "broadcast";

export type ExportPresetId =
  | "webtoon-scroll-800-srgb"
  | "webtoon-scroll-1600-p3"
  | "print-b5-300dpi-cmyk"
  | "print-shingukpan-300dpi-cmyk"
  | "print-b5-600dpi-cmyk"
  | "print-shingukpan-600dpi-cmyk"
  | "broadcast-4k-rec709"
  | "broadcast-4k-rec2020";

export type ResourcePressureStatus = "safe" | "tight" | "exceeded";
export type StreamingPipelineStatus = "idle" | "running" | "paused" | "throttled" | "cancelled" | "completed";
export type FrameYieldReason = "none" | "editor-frame-full" | "slice-budget-reached" | "memory-watermark" | "chunk-cap";

export interface ExportMediumPreset {
  readonly id: ExportPresetId;
  readonly category: ExportMediumCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortLabelKo: string;
  readonly shortLabelEn: string;
  readonly gamut: ColorGamutId;
  readonly colorModel: "RGBA" | "CMYK";
  readonly defaultBitDepth: 8 | 16;
  readonly channels: 4;
  readonly targetWidthPx: number;
  readonly targetHeightPx: number | null;
  readonly stripHeightPx: number | null;
  readonly dpi: number | null;
  readonly trimWidthMm: number | null;
  readonly trimHeightMm: number | null;
  readonly bleedMm: number;
  readonly maxTacPercent: number | null;
  readonly gamutTransformCostFactor: number;
  readonly defaultTileSizePx: number;
}

export interface SourceDocumentSpec {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly layerCount: number;
  readonly bitDepth: 8 | 16;
  readonly sourceGamut: "srgb" | "display-p3";
  readonly pageCount: number;
  readonly tileSizePx?: number;
  readonly bleedMmOverride?: number;
  readonly colorSamples?: readonly ColorSampleInput[];
}

export interface ResourceBudgetPolicy {
  readonly frameBudgetMs: number;
  readonly editorFrameReserveMs: number;
  readonly maxChunkDurationMs: number;
  readonly maxVramWatermarkMb: number;
  readonly maxRamWatermarkMb: number;
  readonly chunkBatchLimitPerFrame: number;
}

export interface MediumResourceBudget {
  readonly preset: ExportMediumPreset;
  readonly outputWidthPx: number;
  readonly outputHeightPx: number;
  readonly trimWidthPx: number | null;
  readonly trimHeightPx: number | null;
  readonly bleedMm: number;
  readonly unitCount: number;
  readonly stripSliceCount: number | null;
  readonly totalMegapixels: number;
  readonly effectiveBitDepth: 8 | 16;
  readonly bytesPerPixel: number;
  readonly tileSizePx: number;
  readonly tileCols: number;
  readonly tileRows: number;
  readonly tilesPerUnit: number;
  readonly totalTileChunks: number;
  readonly fullFrameRawMb: number;
  readonly nonStreamingPeakRamMb: number;
  readonly streamingPeakRamMb: number;
  readonly streamingPeakVramMb: number;
  readonly memorySavingPct: number;
  readonly ramUtilizationPct: number;
  readonly vramUtilizationPct: number;
  readonly ramStatus: ResourcePressureStatus;
  readonly vramStatus: ResourcePressureStatus;
  readonly recommendedTileSizePx: number;
  readonly backgroundSliceBudgetMs: number;
  readonly estimatedMsPerTile: number;
  readonly tilesPerFrameSafeCap: number;
  readonly estimatedTotalFrames: number;
  readonly estimatedTotalSeconds: number;
  readonly gamutReport: MediumGamutReport;
}

export interface ThreeMediaComparison {
  readonly webtoon: MediumResourceBudget;
  readonly print: MediumResourceBudget;
  readonly broadcast: MediumResourceBudget;
  readonly totalOutOfGamutWarnings: number;
  readonly highestMemoryMedium: ExportMediumCategory;
}

export interface ExportTileChunk {
  readonly index: number;
  readonly unitIndex: number;
  readonly col: number;
  readonly row: number;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly estimatedMs: number;
  readonly remainingMs: number;
  readonly ramDeltaMb: number;
  readonly vramDeltaMb: number;
  readonly status: "pending" | "in-progress" | "encoded" | "flushed" | "cancelled";
}

export interface FrameSliceRecord {
  readonly frameIndex: number;
  readonly editorWorkMs: number;
  readonly backgroundWorkMs: number;
  readonly maxChunkSliceMs: number;
  readonly totalFrameMs: number;
  readonly within60FpsBudget: boolean;
  readonly chunksCompletedInFrame: number;
  readonly subSlicesProcessed: number;
  readonly flushedInFrame: number;
  readonly activeRamMb: number;
  readonly activeVramMb: number;
  readonly yieldedReason: FrameYieldReason;
}

export interface StreamingPipelineState {
  readonly presetId: ExportPresetId;
  readonly status: StreamingPipelineStatus;
  readonly policy: ResourceBudgetPolicy;
  readonly totalChunks: number;
  readonly completedChunks: number;
  readonly flushedChunks: number;
  readonly cancelledChunks: number;
  readonly activeCursor: number;
  readonly progressPct: number;
  readonly activeRamMb: number;
  readonly activeVramMb: number;
  readonly peakObservedRamMb: number;
  readonly peakObservedVramMb: number;
  readonly totalFramesRun: number;
  readonly totalBackgroundWorkMs: number;
  readonly maxObservedTotalFrameMs: number;
  readonly frameBudgetViolationCount: number;
  readonly watermarkViolationCount: number;
  readonly cancelReason: string | null;
  readonly throttleReason: string | null;
  readonly chunks: readonly ExportTileChunk[];
  readonly recentFrames: readonly FrameSliceRecord[];
}

export interface StepStreamingFrameInput {
  readonly editorWorkMs: number;
  readonly externalRamPressureMb?: number;
  readonly externalVramPressureMb?: number;
  readonly chunkCostScale?: number;
}

export const FRAME_BUDGET_60FPS_MS = 16.67;
export const DEFAULT_BLEED_MM = 3;
export const MM_PER_INCH = 25.4;
const MAX_RECENT_FRAMES = 24;
const BASE_PIPELINE_VRAM_OVERHEAD_MB = 24;
const BASE_PIPELINE_RAM_OVERHEAD_MB = 18;
const EPSILON = 1e-6;

export const DEFAULT_RESOURCE_BUDGET_POLICY: ResourceBudgetPolicy = {
  frameBudgetMs: FRAME_BUDGET_60FPS_MS,
  editorFrameReserveMs: 10.5,
  maxChunkDurationMs: 4.5,
  maxVramWatermarkMb: 512,
  maxRamWatermarkMb: 1024,
  chunkBatchLimitPerFrame: 4,
};

export const DEFAULT_SOURCE_DOCUMENT: SourceDocumentSpec = {
  widthPx: 1600,
  heightPx: 12800,
  layerCount: 24,
  bitDepth: 8,
  sourceGamut: "display-p3",
  pageCount: 4,
  tileSizePx: 512,
};

export const EXPORT_MEDIUM_PRESETS: readonly ExportMediumPreset[] = [
  {
    id: "webtoon-scroll-800-srgb", category: "webtoon",
    labelKo: "웹툰 세로 스크롤 · 800px · sRGB", labelEn: "Webtoon Vertical Scroll · 800px · sRGB",
    shortLabelKo: "800px sRGB", shortLabelEn: "800px sRGB",
    gamut: "srgb", colorModel: "RGBA", defaultBitDepth: 8, channels: 4,
    targetWidthPx: 800, targetHeightPx: null, stripHeightPx: 1280, dpi: 72,
    trimWidthMm: null, trimHeightMm: null, bleedMm: 0, maxTacPercent: null,
    gamutTransformCostFactor: 1.0, defaultTileSizePx: 512,
  },
  {
    id: "webtoon-scroll-1600-p3", category: "webtoon",
    labelKo: "웹툰 고해상도 2× · 1600px · Display P3", labelEn: "Webtoon Hi-Res 2× · 1600px · Display P3",
    shortLabelKo: "1600px P3", shortLabelEn: "1600px P3",
    gamut: "display-p3", colorModel: "RGBA", defaultBitDepth: 16, channels: 4,
    targetWidthPx: 1600, targetHeightPx: null, stripHeightPx: 1600, dpi: 144,
    trimWidthMm: null, trimHeightMm: null, bleedMm: 0, maxTacPercent: null,
    gamutTransformCostFactor: 1.15, defaultTileSizePx: 512,
  },
  {
    id: "print-b5-300dpi-cmyk", category: "print",
    labelKo: "단행본 B5 · 300DPI · CMYK (3mm 블리드)", labelEn: "Print B5 · 300DPI · CMYK (3mm Bleed)",
    shortLabelKo: "B5 300DPI", shortLabelEn: "B5 300DPI",
    gamut: "cmyk-coated", colorModel: "CMYK", defaultBitDepth: 8, channels: 4,
    targetWidthPx: 2221, targetHeightPx: 3107, stripHeightPx: null, dpi: 300,
    trimWidthMm: 182, trimHeightMm: 257, bleedMm: DEFAULT_BLEED_MM, maxTacPercent: 300,
    gamutTransformCostFactor: 1.55, defaultTileSizePx: 512,
  },
  {
    id: "print-shingukpan-300dpi-cmyk", category: "print",
    labelKo: "단행본 신국판 · 300DPI · CMYK (3mm 블리드)", labelEn: "Print Shingukpan · 300DPI · CMYK (3mm Bleed)",
    shortLabelKo: "신국판 300DPI", shortLabelEn: "Shingukpan 300",
    gamut: "cmyk-coated", colorModel: "CMYK", defaultBitDepth: 8, channels: 4,
    targetWidthPx: 1867, targetHeightPx: 2729, stripHeightPx: null, dpi: 300,
    trimWidthMm: 152, trimHeightMm: 225, bleedMm: DEFAULT_BLEED_MM, maxTacPercent: 300,
    gamutTransformCostFactor: 1.55, defaultTileSizePx: 512,
  },
  {
    id: "print-b5-600dpi-cmyk", category: "print",
    labelKo: "단행본 B5 · 600DPI · CMYK (3mm 블리드)", labelEn: "Print B5 · 600DPI · CMYK (3mm Bleed)",
    shortLabelKo: "B5 600DPI", shortLabelEn: "B5 600DPI",
    gamut: "cmyk-coated", colorModel: "CMYK", defaultBitDepth: 8, channels: 4,
    targetWidthPx: 4441, targetHeightPx: 6213, stripHeightPx: null, dpi: 600,
    trimWidthMm: 182, trimHeightMm: 257, bleedMm: DEFAULT_BLEED_MM, maxTacPercent: 300,
    gamutTransformCostFactor: 1.75, defaultTileSizePx: 512,
  },
  {
    id: "print-shingukpan-600dpi-cmyk", category: "print",
    labelKo: "단행본 신국판 · 600DPI · CMYK (3mm 블리드)", labelEn: "Print Shingukpan · 600DPI · CMYK (3mm Bleed)",
    shortLabelKo: "신국판 600DPI", shortLabelEn: "Shingukpan 600",
    gamut: "cmyk-coated", colorModel: "CMYK", defaultBitDepth: 8, channels: 4,
    targetWidthPx: 3733, targetHeightPx: 5457, stripHeightPx: null, dpi: 600,
    trimWidthMm: 152, trimHeightMm: 225, bleedMm: DEFAULT_BLEED_MM, maxTacPercent: 300,
    gamutTransformCostFactor: 1.75, defaultTileSizePx: 512,
  },
  {
    id: "broadcast-4k-rec709", category: "broadcast",
    labelKo: "방송 / 4K UHD · 3840×2160 · Rec.709", labelEn: "Broadcast / 4K UHD · 3840×2160 · Rec.709",
    shortLabelKo: "4K Rec.709", shortLabelEn: "4K Rec.709",
    gamut: "rec709", colorModel: "RGBA", defaultBitDepth: 8, channels: 4,
    targetWidthPx: 3840, targetHeightPx: 2160, stripHeightPx: null, dpi: 72,
    trimWidthMm: null, trimHeightMm: null, bleedMm: 0, maxTacPercent: null,
    gamutTransformCostFactor: 1.2, defaultTileSizePx: 512,
  },
  {
    id: "broadcast-4k-rec2020", category: "broadcast",
    labelKo: "방송 / 4K HDR · 3840×2160 · Rec.2020", labelEn: "Broadcast / 4K HDR · 3840×2160 · Rec.2020",
    shortLabelKo: "4K Rec.2020", shortLabelEn: "4K Rec.2020",
    gamut: "rec2020", colorModel: "RGBA", defaultBitDepth: 16, channels: 4,
    targetWidthPx: 3840, targetHeightPx: 2160, stripHeightPx: null, dpi: 72,
    trimWidthMm: null, trimHeightMm: null, bleedMm: 0, maxTacPercent: null,
    gamutTransformCostFactor: 1.4, defaultTileSizePx: 512,
  },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sanitizePositiveInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(clamp(value, min, max));
}

function resolvePressureStatus(utilizationPct: number): ResourcePressureStatus {
  if (utilizationPct > 100) return "exceeded";
  if (utilizationPct >= 75) return "tight";
  return "safe";
}

export function getExportMediumPreset(id: ExportPresetId): ExportMediumPreset {
  return EXPORT_MEDIUM_PRESETS.find((preset) => preset.id === id) ?? EXPORT_MEDIUM_PRESETS[0];
}

export function sanitizeBudgetPolicy(partial?: Partial<ResourceBudgetPolicy>): ResourceBudgetPolicy {
  const frameBudgetMs = roundTo(clamp(partial?.frameBudgetMs ?? FRAME_BUDGET_60FPS_MS, 8, FRAME_BUDGET_60FPS_MS), 2);
  const editorFrameReserveMs = roundTo(
    clamp(partial?.editorFrameReserveMs ?? DEFAULT_RESOURCE_BUDGET_POLICY.editorFrameReserveMs, 2, frameBudgetMs - 0.5),
    2,
  );
  const maxChunkDurationMs = roundTo(clamp(partial?.maxChunkDurationMs ?? DEFAULT_RESOURCE_BUDGET_POLICY.maxChunkDurationMs, 0.5, frameBudgetMs), 2);
  const maxVramWatermarkMb = roundTo(clamp(partial?.maxVramWatermarkMb ?? DEFAULT_RESOURCE_BUDGET_POLICY.maxVramWatermarkMb, 64, 16384), 1);
  const maxRamWatermarkMb = roundTo(clamp(partial?.maxRamWatermarkMb ?? DEFAULT_RESOURCE_BUDGET_POLICY.maxRamWatermarkMb, 128, 32768), 1);
  const chunkBatchLimitPerFrame = sanitizePositiveInt(partial?.chunkBatchLimitPerFrame ?? DEFAULT_RESOURCE_BUDGET_POLICY.chunkBatchLimitPerFrame, 4, 1, 16);
  return {
    frameBudgetMs,
    editorFrameReserveMs,
    maxChunkDurationMs,
    maxVramWatermarkMb,
    maxRamWatermarkMb,
    chunkBatchLimitPerFrame,
  };
}

export function calculateMediumResourceBudget(
  source: SourceDocumentSpec,
  presetOrId: ExportMediumPreset | ExportPresetId,
  policyOverride?: Partial<ResourceBudgetPolicy>,
): MediumResourceBudget {
  const preset = typeof presetOrId === "string" ? getExportMediumPreset(presetOrId) : presetOrId;
  const policy = sanitizeBudgetPolicy(policyOverride);

  const srcWidth = sanitizePositiveInt(source.widthPx, DEFAULT_SOURCE_DOCUMENT.widthPx, 64, 32768);
  const srcHeight = sanitizePositiveInt(source.heightPx, DEFAULT_SOURCE_DOCUMENT.heightPx, 64, 200000);
  const layerCount = sanitizePositiveInt(source.layerCount, DEFAULT_SOURCE_DOCUMENT.layerCount, 1, 512);
  const pageCount = sanitizePositiveInt(source.pageCount, DEFAULT_SOURCE_DOCUMENT.pageCount, 1, 500);
  const tileSizePx = sanitizePositiveInt(source.tileSizePx ?? preset.defaultTileSizePx, preset.defaultTileSizePx, 128, 1024);

  let outputWidthPx: number;
  let outputHeightPx: number;
  let trimWidthPx: number | null = null;
  let trimHeightPx: number | null = null;
  let bleedMm = 0;
  let unitCount: number;
  let stripSliceCount: number | null = null;

  if (preset.category === "webtoon") {
    outputWidthPx = preset.targetWidthPx;
    outputHeightPx = Math.max(1, Math.round((srcHeight * preset.targetWidthPx) / srcWidth));
    unitCount = 1;
    stripSliceCount = preset.stripHeightPx ? Math.ceil(outputHeightPx / preset.stripHeightPx) : 1;
  } else if (preset.category === "print") {
    const dpi = preset.dpi ?? 300;
    bleedMm = roundTo(clamp(source.bleedMmOverride ?? preset.bleedMm, 0, 15), 2);
    const trimW = preset.trimWidthMm ?? 182;
    const trimH = preset.trimHeightMm ?? 257;
    trimWidthPx = Math.ceil((trimW / MM_PER_INCH) * dpi);
    trimHeightPx = Math.ceil((trimH / MM_PER_INCH) * dpi);
    outputWidthPx = Math.ceil(((trimW + bleedMm * 2) / MM_PER_INCH) * dpi);
    outputHeightPx = Math.ceil(((trimH + bleedMm * 2) / MM_PER_INCH) * dpi);
    unitCount = pageCount;
  } else {
    outputWidthPx = preset.targetWidthPx;
    outputHeightPx = preset.targetHeightPx ?? 2160;
    unitCount = pageCount;
  }

  const effectiveBitDepth: 8 | 16 = source.bitDepth === 16 || preset.defaultBitDepth === 16 ? 16 : 8;
  const bytesPerPixel = preset.channels * (effectiveBitDepth / 8);
  const tileCols = Math.ceil(outputWidthPx / tileSizePx);
  const tileRows = Math.ceil(outputHeightPx / tileSizePx);
  const tilesPerUnit = tileCols * tileRows;
  const totalTileChunks = tilesPerUnit * unitCount;
  const totalMegapixels = roundTo((outputWidthPx * outputHeightPx * unitCount) / 1_000_000, 2);

  const fullFrameRawMb = roundTo((outputWidthPx * outputHeightPx * bytesPerPixel) / (1024 * 1024), 2);
  const compositeStackMultiplier = 2.0 + Math.min(layerCount, 24) * 0.22;
  const nonStreamingPeakRamMb = roundTo(fullFrameRawMb * compositeStackMultiplier + BASE_PIPELINE_RAM_OVERHEAD_MB, 2);

  const singleTileMb = (tileSizePx * tileSizePx * bytesPerPixel) / (1024 * 1024);
  const activeTileWindow = Math.min(totalTileChunks, policy.chunkBatchLimitPerFrame + 2);
  const activeLayerSlotFactor = 2.0 + Math.min(layerCount, 12) * 0.25;
  const stripFlushBufferMb =
    preset.category === "webtoon"
      ? (outputWidthPx * (preset.stripHeightPx ?? 1280) * bytesPerPixel) / (1024 * 1024)
      : singleTileMb * Math.min(tileCols, 6);

  const streamingPeakRamMb = roundTo(BASE_PIPELINE_RAM_OVERHEAD_MB + singleTileMb * activeTileWindow * 2.4 + stripFlushBufferMb, 2);
  const streamingPeakVramMb = roundTo(
    BASE_PIPELINE_VRAM_OVERHEAD_MB + singleTileMb * activeLayerSlotFactor * Math.min(4, activeTileWindow),
    2,
  );
  const memorySavingPct =
    nonStreamingPeakRamMb > EPSILON
      ? roundTo(clamp(((nonStreamingPeakRamMb - streamingPeakRamMb) / nonStreamingPeakRamMb) * 100, 0, 99.5), 1)
      : 0;

  const ramUtilizationPct = roundTo((streamingPeakRamMb / policy.maxRamWatermarkMb) * 100, 1);
  const vramUtilizationPct = roundTo((streamingPeakVramMb / policy.maxVramWatermarkMb) * 100, 1);
  const ramStatus = resolvePressureStatus(ramUtilizationPct);
  const vramStatus = resolvePressureStatus(vramUtilizationPct);
  const recommendedTileSizePx = ramStatus === "exceeded" || vramStatus === "exceeded" ? Math.max(128, Math.floor(tileSizePx / 2)) : tileSizePx;

  const backgroundSliceBudgetMs = roundTo(Math.max(1.0, policy.frameBudgetMs - policy.editorFrameReserveMs), 2);
  const tileMegapixels = (tileSizePx * tileSizePx) / 1_000_000;
  const layerBlendFactor = 1 + Math.log2(layerCount + 1) * 0.28;
  const bitDepthFactor = effectiveBitDepth === 16 ? 1.35 : 1.0;
  const resampleFactor = Math.max(outputWidthPx / srcWidth, 0.5) > 1.2 ? 1.2 : 1.0;
  const estimatedMsPerTile = roundTo(
    clamp(0.55 + tileMegapixels * 4.2 * layerBlendFactor * bitDepthFactor * preset.gamutTransformCostFactor * resampleFactor, 0.4, 14),
    2,
  );

  const effectiveFrameBgCapMs = Math.min(backgroundSliceBudgetMs, policy.maxChunkDurationMs * policy.chunkBatchLimitPerFrame);
  const tilesPerFrameSafeCap = Math.max(1, Math.min(policy.chunkBatchLimitPerFrame, Math.floor(effectiveFrameBgCapMs / estimatedMsPerTile) || 1));
  const estimatedTotalFrames = Math.max(1, Math.ceil((totalTileChunks * estimatedMsPerTile) / Math.max(0.5, effectiveFrameBgCapMs)));
  const estimatedTotalSeconds = roundTo((estimatedTotalFrames * policy.frameBudgetMs) / 1000, 2);

  const gamutReport = evaluateGamutForMedium(source.colorSamples ?? DEFAULT_WORK_COLOR_SAMPLES, preset.gamut, preset.maxTacPercent);

  return {
    preset, outputWidthPx, outputHeightPx, trimWidthPx, trimHeightPx, bleedMm, unitCount, stripSliceCount,
    totalMegapixels, effectiveBitDepth, bytesPerPixel, tileSizePx, tileCols, tileRows, tilesPerUnit, totalTileChunks,
    fullFrameRawMb, nonStreamingPeakRamMb, streamingPeakRamMb, streamingPeakVramMb, memorySavingPct,
    ramUtilizationPct, vramUtilizationPct, ramStatus, vramStatus, recommendedTileSizePx,
    backgroundSliceBudgetMs, estimatedMsPerTile, tilesPerFrameSafeCap, estimatedTotalFrames, estimatedTotalSeconds,
    gamutReport,
  };
}

export function compareThreeMediaBudgets(
  source: SourceDocumentSpec,
  selectedPresets: { readonly webtoon?: ExportPresetId; readonly print?: ExportPresetId; readonly broadcast?: ExportPresetId } = {},
  policyOverride?: Partial<ResourceBudgetPolicy>,
): ThreeMediaComparison {
  const webtoon = calculateMediumResourceBudget(source, selectedPresets.webtoon ?? "webtoon-scroll-1600-p3", policyOverride);
  const print = calculateMediumResourceBudget(source, selectedPresets.print ?? "print-b5-300dpi-cmyk", policyOverride);
  const broadcast = calculateMediumResourceBudget(source, selectedPresets.broadcast ?? "broadcast-4k-rec709", policyOverride);
  const ranked: readonly { readonly cat: ExportMediumCategory; readonly ram: number }[] = [
    { cat: "webtoon", ram: webtoon.streamingPeakRamMb },
    { cat: "print", ram: print.streamingPeakRamMb },
    { cat: "broadcast", ram: broadcast.streamingPeakRamMb },
  ];
  const highestMemoryMedium = ranked.reduce((best, cur) => (cur.ram > best.ram ? cur : best), ranked[0]).cat;
  const totalOutOfGamutWarnings =
    webtoon.gamutReport.outOfGamutCount + print.gamutReport.outOfGamutCount + broadcast.gamutReport.outOfGamutCount;
  return { webtoon, print, broadcast, totalOutOfGamutWarnings, highestMemoryMedium };
}

export function createStreamingPipelineState(
  budget: MediumResourceBudget,
  policyOverride?: Partial<ResourceBudgetPolicy>,
): StreamingPipelineState {
  const policy = sanitizeBudgetPolicy(policyOverride);
  const tileMb = (budget.tileSizePx * budget.tileSizePx * budget.bytesPerPixel) / (1024 * 1024);
  const ramDeltaMb = roundTo(Math.max(0.5, tileMb * 2.2), 2);
  const vramDeltaMb = roundTo(Math.max(0.5, tileMb * 1.8), 2);

  const chunks: ExportTileChunk[] = [];
  const capChunks = Math.min(budget.totalTileChunks, 2400);
  let idx = 0;
  for (let u = 0; u < budget.unitCount && idx < capChunks; u += 1) {
    for (let r = 0; r < budget.tileRows && idx < capChunks; r += 1) {
      for (let c = 0; c < budget.tileCols && idx < capChunks; c += 1) {
        const xPx = c * budget.tileSizePx;
        const yPx = r * budget.tileSizePx;
        const widthPx = Math.min(budget.tileSizePx, budget.outputWidthPx - xPx);
        const heightPx = Math.min(budget.tileSizePx, budget.outputHeightPx - yPx);
        const areaRatio = (widthPx * heightPx) / (budget.tileSizePx * budget.tileSizePx);
        const estimatedMs = roundTo(Math.max(0.35, budget.estimatedMsPerTile * (0.25 + 0.75 * areaRatio)), 2);
        chunks.push({
          index: idx, unitIndex: u, col: c, row: r, xPx, yPx, widthPx, heightPx,
          estimatedMs, remainingMs: estimatedMs,
          ramDeltaMb: roundTo(ramDeltaMb * Math.max(0.25, areaRatio), 2),
          vramDeltaMb: roundTo(vramDeltaMb * Math.max(0.25, areaRatio), 2),
          status: "pending",
        });
        idx += 1;
      }
    }
  }

  return {
    presetId: budget.preset.id, status: "idle", policy,
    totalChunks: chunks.length, completedChunks: 0, flushedChunks: 0, cancelledChunks: 0, activeCursor: 0,
    progressPct: 0, activeRamMb: 0, activeVramMb: 0, peakObservedRamMb: 0, peakObservedVramMb: 0,
    totalFramesRun: 0, totalBackgroundWorkMs: 0, maxObservedTotalFrameMs: 0,
    frameBudgetViolationCount: 0, watermarkViolationCount: 0,
    cancelReason: null, throttleReason: null, chunks, recentFrames: [],
  };
}

export function startStreamingPipeline(state: StreamingPipelineState): StreamingPipelineState {
  if (state.status === "completed" || state.status === "cancelled") return state;
  if (state.totalChunks === 0) return { ...state, status: "completed", progressPct: 100 };
  return { ...state, status: "running", throttleReason: null };
}

export function pauseStreamingPipeline(state: StreamingPipelineState): StreamingPipelineState {
  if (state.status !== "running" && state.status !== "throttled") return state;
  return { ...state, status: "paused" };
}

export function resumeStreamingPipeline(state: StreamingPipelineState): StreamingPipelineState {
  if (state.status !== "paused" && state.status !== "throttled") return state;
  return { ...state, status: "running", throttleReason: null };
}

export function cancelStreamingPipeline(state: StreamingPipelineState, reason = "사용자 취소"): StreamingPipelineState {
  if (state.status === "completed" || state.status === "cancelled") return state;
  let cancelledCount = 0;
  const nextChunks: ExportTileChunk[] = state.chunks.map((chunk) => {
    if (chunk.status === "pending" || chunk.status === "in-progress") {
      cancelledCount += 1;
      return { ...chunk, status: "cancelled" };
    }
    return chunk.status === "encoded" ? { ...chunk, status: "flushed" } : chunk;
  });
  return {
    ...state, status: "cancelled", cancelledChunks: cancelledCount,
    activeRamMb: 0, activeVramMb: 0, cancelReason: reason, throttleReason: null, chunks: nextChunks,
  };
}

export function stepStreamingFrame(state: StreamingPipelineState, input: StepStreamingFrameInput): StreamingPipelineState {
  if (state.status !== "running" && state.status !== "throttled") return state;
  if (state.activeCursor >= state.totalChunks) {
    return { ...state, status: "completed", progressPct: 100, activeRamMb: 0, activeVramMb: 0 };
  }

  const { policy } = state;
  const editorWorkMs = roundTo(clamp(input.editorWorkMs, 0, 33.3), 2);
  const externalRamMb = Math.max(0, Number.isFinite(input.externalRamPressureMb) ? (input.externalRamPressureMb ?? 0) : 0);
  const externalVramMb = Math.max(0, Number.isFinite(input.externalVramPressureMb) ? (input.externalVramPressureMb ?? 0) : 0);
  const costScale = clamp(input.chunkCostScale ?? 1, 0.25, 4);

  const frameIndex = state.totalFramesRun + 1;
  const availableBgMs = roundTo(Math.max(0, policy.frameBudgetMs - editorWorkMs), 2);

  if (externalRamMb >= policy.maxRamWatermarkMb || externalVramMb >= policy.maxVramWatermarkMb) {
    const record: FrameSliceRecord = {
      frameIndex, editorWorkMs, backgroundWorkMs: 0, maxChunkSliceMs: 0, totalFrameMs: editorWorkMs,
      within60FpsBudget: editorWorkMs <= policy.frameBudgetMs + EPSILON,
      chunksCompletedInFrame: 0, subSlicesProcessed: 0, flushedInFrame: 0,
      activeRamMb: 0, activeVramMb: 0, yieldedReason: "memory-watermark",
    };
    return {
      ...state, status: "throttled", activeRamMb: 0, activeVramMb: 0, totalFramesRun: frameIndex,
      maxObservedTotalFrameMs: Math.max(state.maxObservedTotalFrameMs, record.totalFrameMs),
      throttleReason:
        externalVramMb >= policy.maxVramWatermarkMb
          ? `VRAM 압박(${roundTo(externalVramMb, 1)}MB)이 상한(${policy.maxVramWatermarkMb}MB)에 도달해 백그라운드 스트리밍을 보류했습니다.`
          : `RAM 압박(${roundTo(externalRamMb, 1)}MB)이 상한(${policy.maxRamWatermarkMb}MB)에 도달해 백그라운드 스트리밍을 보류했습니다.`,
      recentFrames: [...state.recentFrames.slice(-(MAX_RECENT_FRAMES - 1)), record],
    };
  }

  if (availableBgMs < 0.25) {
    const record: FrameSliceRecord = {
      frameIndex, editorWorkMs, backgroundWorkMs: 0, maxChunkSliceMs: 0, totalFrameMs: editorWorkMs,
      within60FpsBudget: editorWorkMs <= policy.frameBudgetMs + EPSILON,
      chunksCompletedInFrame: 0, subSlicesProcessed: 0, flushedInFrame: 0,
      activeRamMb: state.activeRamMb, activeVramMb: state.activeVramMb, yieldedReason: "editor-frame-full",
    };
    return {
      ...state, status: "running", throttleReason: null, totalFramesRun: frameIndex,
      maxObservedTotalFrameMs: Math.max(state.maxObservedTotalFrameMs, record.totalFrameMs),
      recentFrames: [...state.recentFrames.slice(-(MAX_RECENT_FRAMES - 1)), record],
    };
  }

  const nextChunks = state.chunks.slice();
  let cursor = state.activeCursor;
  let completedChunks = state.completedChunks;
  let flushedChunks = state.flushedChunks;
  let activeRamMb = state.activeRamMb;
  let activeVramMb = state.activeVramMb;
  let remainingBgMs = availableBgMs;
  let backgroundWorkMs = 0;
  let maxChunkSliceMs = 0;
  let chunksCompletedInFrame = 0;
  let subSlicesProcessed = 0;
  let flushedInFrame = 0;
  let yieldedReason: FrameYieldReason = "none";

  const flushEncodedTiles = (): void => {
    let flushedNow = 0;
    for (let i = 0; i < cursor; i += 1) {
      if (nextChunks[i].status === "encoded") {
        nextChunks[i] = { ...nextChunks[i], status: "flushed" };
        flushedNow += 1;
      }
    }
    if (flushedNow > 0) {
      flushedChunks += flushedNow;
      flushedInFrame += flushedNow;
      activeRamMb = 0;
      activeVramMb = 0;
    }
  };

  while (cursor < state.totalChunks && remainingBgMs >= 0.2) {
    if (chunksCompletedInFrame >= policy.chunkBatchLimitPerFrame) {
      yieldedReason = "chunk-cap";
      break;
    }

    const chunk = nextChunks[cursor];
    if (externalRamMb + activeRamMb + chunk.ramDeltaMb > policy.maxRamWatermarkMb || externalVramMb + activeVramMb + chunk.vramDeltaMb > policy.maxVramWatermarkMb) {
      flushEncodedTiles();
      if (externalRamMb + activeRamMb + chunk.ramDeltaMb > policy.maxRamWatermarkMb || externalVramMb + activeVramMb + chunk.vramDeltaMb > policy.maxVramWatermarkMb) {
        yieldedReason = "memory-watermark";
        break;
      }
    }

    const workLeftMs = roundTo(chunk.remainingMs * costScale, 2);
    const sliceCapMs = roundTo(Math.min(policy.maxChunkDurationMs, remainingBgMs), 2);
    if (sliceCapMs < 0.15) {
      yieldedReason = "slice-budget-reached";
      break;
    }

    if (workLeftMs <= sliceCapMs + EPSILON) {
      backgroundWorkMs = roundTo(backgroundWorkMs + workLeftMs, 2);
      maxChunkSliceMs = Math.max(maxChunkSliceMs, workLeftMs);
      remainingBgMs = roundTo(Math.max(0, availableBgMs - backgroundWorkMs), 2);
      activeRamMb = roundTo(activeRamMb + chunk.ramDeltaMb, 2);
      activeVramMb = roundTo(activeVramMb + chunk.vramDeltaMb, 2);
      nextChunks[cursor] = { ...chunk, remainingMs: 0, status: "encoded" };
      cursor += 1;
      completedChunks += 1;
      chunksCompletedInFrame += 1;
      subSlicesProcessed += 1;
    } else {
      const nextRemainingRaw = roundTo(Math.max(0.05, (workLeftMs - sliceCapMs) / costScale), 2);
      backgroundWorkMs = roundTo(backgroundWorkMs + sliceCapMs, 2);
      maxChunkSliceMs = Math.max(maxChunkSliceMs, sliceCapMs);
      nextChunks[cursor] = { ...chunk, remainingMs: nextRemainingRaw, status: "in-progress" };
      subSlicesProcessed += 1;
      yieldedReason = "slice-budget-reached";
      break;
    }
  }

  const isCompleted = cursor >= state.totalChunks;
  if (isCompleted) {
    flushEncodedTiles();
    activeRamMb = 0;
    activeVramMb = 0;
  }

  const totalFrameMs = roundTo(editorWorkMs + backgroundWorkMs, 2);
  const bgCausedBudgetViolation = backgroundWorkMs > 0 && totalFrameMs > policy.frameBudgetMs + 0.02;
  const totalRamObserved = roundTo(externalRamMb + activeRamMb, 2);
  const totalVramObserved = roundTo(externalVramMb + activeVramMb, 2);
  const watermarkExceeded = totalRamObserved > policy.maxRamWatermarkMb + 0.05 || totalVramObserved > policy.maxVramWatermarkMb + 0.05;
  const progressPct = state.totalChunks > 0 ? roundTo((completedChunks / state.totalChunks) * 100, 1) : 100;
  const nextStatus: StreamingPipelineStatus = isCompleted
    ? "completed"
    : yieldedReason === "memory-watermark" && chunksCompletedInFrame === 0 && subSlicesProcessed === 0
      ? "throttled"
      : "running";

  const record: FrameSliceRecord = {
    frameIndex, editorWorkMs, backgroundWorkMs, maxChunkSliceMs: roundTo(maxChunkSliceMs, 2),
    totalFrameMs, within60FpsBudget: totalFrameMs <= policy.frameBudgetMs + 0.02,
    chunksCompletedInFrame, subSlicesProcessed, flushedInFrame,
    activeRamMb: totalRamObserved, activeVramMb: totalVramObserved, yieldedReason,
  };

  return {
    ...state, status: nextStatus, completedChunks, flushedChunks, activeCursor: cursor, progressPct,
    activeRamMb, activeVramMb,
    peakObservedRamMb: Math.max(state.peakObservedRamMb, totalRamObserved),
    peakObservedVramMb: Math.max(state.peakObservedVramMb, totalVramObserved),
    totalFramesRun: frameIndex, totalBackgroundWorkMs: roundTo(state.totalBackgroundWorkMs + backgroundWorkMs, 2),
    maxObservedTotalFrameMs: Math.max(state.maxObservedTotalFrameMs, totalFrameMs),
    frameBudgetViolationCount: state.frameBudgetViolationCount + (bgCausedBudgetViolation ? 1 : 0),
    watermarkViolationCount: state.watermarkViolationCount + (watermarkExceeded ? 1 : 0),
    throttleReason: nextStatus === "throttled" ? "메모리 워터마크 상한으로 백그라운드 타일 스트리밍을 일시 지연했습니다." : null,
    chunks: nextChunks,
    recentFrames: [...state.recentFrames.slice(-(MAX_RECENT_FRAMES - 1)), record],
  };
}

export function stepStreamingFramesBatch(
  state: StreamingPipelineState,
  frameCount: number,
  input: StepStreamingFrameInput,
): StreamingPipelineState {
  const safeCount = sanitizePositiveInt(frameCount, 1, 1, 600);
  let current = state;
  for (let i = 0; i < safeCount; i += 1) {
    if (current.status !== "running" && current.status !== "throttled") break;
    current = stepStreamingFrame(current, input);
    if (current.status === "completed" || current.status === "cancelled") break;
  }
  return current;
}
