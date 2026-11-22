/**
 * @file format-compatibility-preflight.ts
 * @description 가져오기 전 1초 사전 호환성 리포트 스캐너:
 * - 완전 호환 레이어 / 래스터화 대체 / 미지원 스마트필터·효과 목록 분류
 * - 누락 폰트 로컬 대체 매핑 미리보기
 * - 내보내기 폴더·클리핑 마스크 보존 검증
 * - UTF-8 → CP949(EUC-KR) → Shift-JIS 구버전 PSD/CLIP 레이어명 자동 복구
 */

import {
  createCompatibilityReport,
  type CompatibilityGrade,
  type CompatibilityItem,
  type CompatibilityReport,
  type CreateCompatibilityReportInput,
  type SourceCreativeFormat,
} from "./compatibility-report";
import {
  buildMissingFontSubstitutionPreviews,
  evaluateExportPreservationReadiness,
  type ExportPreservationReport,
  type MissingFontSubstitutionPreview,
  type PreflightDocumentInput,
  type PreflightLayerDescriptor,
  type PreflightLayerKind,
} from "./format-preflight-font-and-export";
import {
  decodeLegacyLayerNameBytes,
  recoverGarbledLayerName,
  type DecodeLegacyLayerNameOptions,
  type DecodedLegacyLayerName,
  type LegacyLayerEncoding,
} from "./legacy-layer-name-decoder";
import { parsePsdStructureForPreflight } from "./psd-preflight-parser";

export {
  buildMissingFontSubstitutionPreviews,
  buildPreflightInputFromClipLayers,
  evaluateExportPreservationReadiness,
  verifyExportFolderAndClippingPreservation,
  type ExportPreservationIssue,
  type ExportPreservationIssueCode,
  type ExportPreservationReport,
  type FontMetricDeltaRisk,
  type FontSubstitutionCategory,
  type FontSubstitutionMatchStrategy,
  type MissingFontSubstitutionPreview,
  type PreflightDocumentInput,
  type PreflightLayerDescriptor,
  type PreflightLayerEffect,
  type PreflightLayerKind,
} from "./format-preflight-font-and-export";
export {
  decodeLegacyLayerNameBytes,
  decodePsdPascalLayerName,
  recoverGarbledLayerName,
  type DecodedLegacyLayerName,
  type DecodeLegacyLayerNameOptions,
  type LegacyEncodingCandidateScores,
  type LegacyLayerEncoding,
} from "./legacy-layer-name-decoder";

export const DEFAULT_PREFLIGHT_BUDGET_MS = 1_000;
export const DEFAULT_PREFLIGHT_MAX_LAYERS = 10_000;

export type PreflightLayerClassification =
  | "fully-compatible"
  | "rasterized-fallback"
  | "unsupported-feature";

export interface PreflightLayerFinding {
  readonly layerId: string;
  readonly layerName: string;
  readonly kind: PreflightLayerKind;
  readonly classification: PreflightLayerClassification;
  readonly reasons: readonly string[];
  readonly fallbackStrategy: string | null;
  readonly recoveredEncoding: LegacyLayerEncoding | null;
}

export interface UnsupportedEffectFinding {
  readonly layerId: string;
  readonly layerName: string;
  readonly effectType: string;
  readonly effectName: string;
  readonly isSmartFilter: boolean;
  readonly reason: string;
  readonly suggestedFallback: string;
}

export interface RecoveredLayerNameEntry {
  readonly layerId: string;
  readonly originalPreview: string;
  readonly recoveredName: string;
  readonly detectedEncoding: LegacyLayerEncoding;
  readonly confidence: number;
}

export interface FormatPreflightOptions extends DecodeLegacyLayerNameOptions {
  /** 로컬에 설치되거나 로드된 폰트 목록. */
  readonly availableLocalFonts?: readonly string[];
  /** 내보내기 보존 검증 기준 포맷. 기본값은 `psd`. */
  readonly targetExportFormat?: SourceCreativeFormat;
  /** 사전 스캔 시간 예산(ms). 기본값 1000ms. */
  readonly budgetMs?: number;
  /** 대용량 적대적 파일 방어용 레이어 상한. 기본값 10,000. */
  readonly maxLayers?: number;
  /** 결정론 테스트용 시계 함수(ms). */
  readonly nowMs?: () => number;
}

export interface FormatCompatibilityPreflightReport {
  readonly sourceFileName: string;
  readonly sourceFormat: SourceCreativeFormat;
  readonly grade: CompatibilityGrade;
  readonly requiresApproval: boolean;
  readonly elapsedMs: number;
  readonly budgetMs: number;
  readonly withinOneSecondBudget: boolean;
  readonly totalLayers: number;
  readonly truncatedByLimit: boolean;
  /** 완전 호환 레이어 목록 (원본 편집 구조 유지). */
  readonly fullyCompatibleLayers: readonly PreflightLayerFinding[];
  /** 래스터화 대체 레이어 목록 (시각 결과 보존, 편집 구조 베이크). */
  readonly rasterizedFallbackLayers: readonly PreflightLayerFinding[];
  /** 미지원 스마트필터 및 특수 효과 목록. */
  readonly unsupportedSmartFiltersAndEffects: readonly UnsupportedEffectFinding[];
  /** 누락 폰트 로컬 대체 매핑 미리보기 목록. */
  readonly missingFontSubstitutions: readonly MissingFontSubstitutionPreview[];
  /** CP949/Shift-JIS 등 레거시 인코딩에서 자동 복구된 레이어명 목록. */
  readonly recoveredLayerNames: readonly RecoveredLayerNameEntry[];
  /** 내보내기 폴더 및 클리핑 마스크 보존 검증 결과. */
  readonly exportPreservation: ExportPreservationReport;
  /** 정식 `CompatibilityReport`와 호환되는 표준 항목 목록. */
  readonly compatibilityItems: readonly CompatibilityItem[];
}

const SUPPORTED_BLEND_MODES = new Set([
  "normal", "pass-through", "darken", "multiply", "color-burn", "linear-burn",
  "lighten", "screen", "color-dodge", "glow-dodge", "add", "glow-add",
  "overlay", "soft-light", "hard-light", "linear-light", "difference",
  "exclusion", "subtract", "divide", "hue", "saturation", "color", "luminosity",
]);

const SUPPORTED_ADJUSTMENTS = new Set([
  "levels", "curves", "hue-saturation", "brightness-contrast", "color-balance",
  "gradient-map", "invert", "posterize", "threshold", "black-and-white", "exposure",
]);

const RASTERIZABLE_ADJUSTMENTS = new Set([
  "selective-color", "channel-mixer", "color-lookup-3dlut", "vibrance",
  "photo-filter", "shadow-highlight",
]);

const SUPPORTED_EFFECTS = new Set([
  "drop-shadow", "outer-glow", "inner-glow", "stroke", "color-overlay",
  "gradient-overlay", "gaussian-blur", "border-effect",
]);

const RASTERIZABLE_EFFECTS = new Set([
  "bevel-emboss", "satin", "pattern-overlay", "tone-effect",
  "inner-shadow", "layer-effects-bundle",
]);

const UNSUPPORTED_SMART_FILTER_PATTERNS = new Set([
  "smart-filter-liquify",
  "smart-filter-camera-raw",
  "smart-filter-oil-paint",
  "smart-filter-lens-blur",
  "smart-filter-displace",
  "smart-filter-custom",
  "3d-extrusion",
  "psd-filter-gallery",
  "motion-blur-smart",
]);

function sanitizeEntityId(prefix: string, raw: string, index: number): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48);
  return cleaned.length > 0 ? `${prefix}-${cleaned}-${index}` : `${prefix}-${index}`;
}

function previewOriginalRawBytes(bytes: Uint8Array): string {
  let out = "";
  const limit = Math.min(bytes.byteLength, 32);
  for (let i = 0; i < limit; i += 1) {
    const b = bytes[i]!;
    out += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, "0")}`;
  }
  return bytes.byteLength > limit ? `${out}...` : out;
}

function resolveLayerName(
  layer: PreflightLayerDescriptor,
  options: DecodeLegacyLayerNameOptions,
): { readonly name: string; readonly decoded: DecodedLegacyLayerName | null; readonly originalPreview: string } {
  if (layer.rawNameBytes !== undefined && layer.rawNameBytes.byteLength > 0) {
    const decoded = decodeLegacyLayerNameBytes(layer.rawNameBytes, options);
    return {
      name: decoded.text || layer.name || layer.id,
      decoded,
      originalPreview: previewOriginalRawBytes(layer.rawNameBytes),
    };
  }
  if (layer.name !== undefined && layer.name.length > 0) {
    const recovered = recoverGarbledLayerName(layer.name, options);
    return { name: recovered.text || layer.id, decoded: recovered, originalPreview: layer.name };
  }
  return { name: layer.id, decoded: null, originalPreview: layer.id };
}

/**
 * 가져오기 전 1초 사전 호환성 리포트 스캐너.
 * - 완전 호환 레이어 / 래스터화 대체 / 미지원 스마트필터·효과를 분류한다.
 * - UTF-8 → CP949(EUC-KR) → Shift-JIS 순차 판별로 깨진 한글·일본어 레이어명을 자동 복구한다.
 * - 누락 폰트 로컬 대체 매핑 미리보기와 폴더·클리핑 마스크 보존 검증 결과를 함께 산출한다.
 */
export function scanFormatCompatibilityPreflight(
  input: PreflightDocumentInput,
  options: FormatPreflightOptions = {},
): FormatCompatibilityPreflightReport {
  const nowMs = options.nowMs ?? (() => performance.now());
  const startedMs = nowMs();
  const budgetMs = options.budgetMs ?? DEFAULT_PREFLIGHT_BUDGET_MS;
  const maxLayers = options.maxLayers ?? DEFAULT_PREFLIGHT_MAX_LAYERS;

  const truncatedByLimit = input.layers.length > maxLayers;
  const boundedLayers = truncatedByLimit ? input.layers.slice(0, maxLayers) : input.layers;

  const normalizedLayers: PreflightLayerDescriptor[] = [];
  const recoveredLayerNames: RecoveredLayerNameEntry[] = [];
  const fullyCompatibleLayers: PreflightLayerFinding[] = [];
  const rasterizedFallbackLayers: PreflightLayerFinding[] = [];
  const unsupportedSmartFiltersAndEffects: UnsupportedEffectFinding[] = [];
  const compatibilityItems: CompatibilityItem[] = [];

  if (input.colorMode !== undefined && input.colorMode !== "rgb" && input.colorMode !== "grayscale") {
    compatibilityItems.push({
      id: sanitizeEntityId("color", input.colorMode, 0),
      path: "document/color-mode",
      feature: `color-mode:${input.colorMode}`,
      outcome: "converted",
      impact: "minor",
      message: `${input.colorMode.toUpperCase()} 색상 모드는 sRGB 작업 공간으로 변환해 가져옵니다.`,
      fallback: "sRGB 8-bit 프로파일 변환",
    });
  }

  if (input.bitDepth !== undefined && input.bitDepth > 8) {
    compatibilityItems.push({
      id: sanitizeEntityId("depth", String(input.bitDepth), 1),
      path: "document/bit-depth",
      feature: `bit-depth:${input.bitDepth}`,
      outcome: "converted",
      impact: "minor",
      message: `${input.bitDepth}비트 채널 정밀도를 8비트 편집 채널로 양자화해 가져옵니다.`,
      fallback: "8-bit RGBA 변환",
    });
  }

  let itemSequence = 10;

  for (const layer of boundedLayers) {
    const resolved = resolveLayerName(layer, options);
    const layerName = resolved.name;
    let recoveredEncoding: LegacyLayerEncoding | null = null;

    if (resolved.decoded !== null && resolved.decoded.wasRecovered) {
      recoveredEncoding = resolved.decoded.detectedEncoding;
      recoveredLayerNames.push({
        layerId: layer.id,
        originalPreview: resolved.originalPreview,
        recoveredName: layerName,
        detectedEncoding: resolved.decoded.detectedEncoding,
        confidence: resolved.decoded.confidence,
      });
    }

    normalizedLayers.push({ ...layer, name: layerName });

    const rasterReasons: string[] = [];
    const unsupportedReasons: string[] = [];

    if (layer.kind === "smart-object") {
      rasterReasons.push("스마트 오브젝트는 내장 프리뷰 기준 래스터 레이어로 대체됩니다.");
    } else if (layer.kind === "model3d") {
      rasterReasons.push("외부 3D 레이어는 2D 래스터 스냅샷으로 대체됩니다.");
    } else if (layer.kind === "image-material") {
      rasterReasons.push("이미지 소재 레이어는 현재 변형 상태로 래스터화됩니다.");
    } else if (layer.kind === "unknown") {
      unsupportedReasons.push("알 수 없는 레이어 형식으로 원본 편집 속성을 해석할 수 없습니다.");
    }

    if (layer.kind === "adjustment") {
      const adj = (layer.adjustmentType ?? "unknown").toLowerCase();
      if (RASTERIZABLE_ADJUSTMENTS.has(adj)) {
        rasterReasons.push(`보정 레이어(${adj})는 베이크된 래스터 결과로 대체됩니다.`);
      } else if (!SUPPORTED_ADJUSTMENTS.has(adj)) {
        unsupportedReasons.push(`미지원 보정 레이어(${adj})가 포함되어 있습니다.`);
      }
    }

    if (layer.blendMode !== undefined && layer.blendMode.trim().length > 0) {
      const mode = layer.blendMode.trim().toLowerCase();
      if (!SUPPORTED_BLEND_MODES.has(mode)) {
        rasterReasons.push(`비표준 합성 모드(${mode})는 시각 결과를 유지하도록 래스터화 또는 근사 합성됩니다.`);
      }
    }

    if (layer.hasVectorMask) {
      rasterReasons.push("벡터 마스크는 픽셀 알파 마스크로 래스터화 변환됩니다.");
    }

    for (const effect of layer.effects ?? []) {
      if (effect.enabled === false) continue;
      const effectType = effect.type.trim().toLowerCase();
      const effectName = effect.name?.trim() || effectType;
      if (effect.isSmartFilter || UNSUPPORTED_SMART_FILTER_PATTERNS.has(effectType)) {
        const finding: UnsupportedEffectFinding = {
          layerId: layer.id,
          layerName,
          effectType,
          effectName,
          isSmartFilter: effect.isSmartFilter ?? true,
          reason: `미지원 스마트필터/특수 효과('${effectName}')는 비파괴 파라미터로 가져올 수 없습니다.`,
          suggestedFallback: "가져오기 전 원본 앱에서 효과 적용 사본을 병합하거나 래스터 결과만 유지하세요.",
        };
        unsupportedSmartFiltersAndEffects.push(finding);
        unsupportedReasons.push(finding.reason);
        itemSequence += 1;
        compatibilityItems.push({
          id: sanitizeEntityId("effect", `${layer.id}-${effectType}`, itemSequence),
          path: `layers/${layer.id}/effects/${effectType}`,
          feature: effect.isSmartFilter ? `smart-filter:${effectType}` : `effect:${effectType}`,
          outcome: "unsupported",
          impact: "major",
          message: finding.reason,
          fallback: finding.suggestedFallback,
        });
      } else if (RASTERIZABLE_EFFECTS.has(effectType)) {
        rasterReasons.push(`레이어 효과('${effectName}')는 픽셀 레이어에 래스터화되어 유지됩니다.`);
      } else if (!SUPPORTED_EFFECTS.has(effectType)) {
        const finding: UnsupportedEffectFinding = {
          layerId: layer.id,
          layerName,
          effectType,
          effectName,
          isSmartFilter: false,
          reason: `미지원 레이어 효과('${effectName}')가 제외됩니다.`,
          suggestedFallback: "원본 앱에서 해당 효과를 래스터화한 뒤 가져오세요.",
        };
        unsupportedSmartFiltersAndEffects.push(finding);
        unsupportedReasons.push(finding.reason);
        itemSequence += 1;
        compatibilityItems.push({
          id: sanitizeEntityId("effect", `${layer.id}-${effectType}`, itemSequence),
          path: `layers/${layer.id}/effects/${effectType}`,
          feature: `effect:${effectType}`,
          outcome: "unsupported",
          impact: "major",
          message: finding.reason,
          fallback: finding.suggestedFallback,
        });
      }
    }

    itemSequence += 1;
    if (unsupportedReasons.length > 0 && rasterReasons.length === 0 && layer.kind === "unknown") {
      compatibilityItems.push({
        id: sanitizeEntityId("layer", layer.id, itemSequence),
        path: `layers/${layer.id}`,
        feature: `layer:${layer.kind}`,
        outcome: "unsupported",
        impact: "blocking",
        message: unsupportedReasons.join(" "),
      });
    } else if (rasterReasons.length > 0) {
      const finding: PreflightLayerFinding = {
        layerId: layer.id,
        layerName,
        kind: layer.kind,
        classification: "rasterized-fallback",
        reasons: rasterReasons,
        fallbackStrategy: "원본 픽셀 스냅샷으로 래스터화 대체",
        recoveredEncoding,
      };
      rasterizedFallbackLayers.push(finding);
      compatibilityItems.push({
        id: sanitizeEntityId("layer", layer.id, itemSequence),
        path: `layers/${layer.id}`,
        feature: `layer:${layer.kind}`,
        outcome: "rasterized",
        impact: "major",
        message: rasterReasons.join(" "),
        fallback: finding.fallbackStrategy ?? undefined,
      });
    } else if (unsupportedReasons.length === 0) {
      fullyCompatibleLayers.push({
        layerId: layer.id,
        layerName,
        kind: layer.kind,
        classification: "fully-compatible",
        reasons: ["원본 레이어 구조와 합성 속성을 손실 없이 유지합니다."],
        fallbackStrategy: null,
        recoveredEncoding,
      });
      compatibilityItems.push({
        id: sanitizeEntityId("layer", layer.id, itemSequence),
        path: `layers/${layer.id}`,
        feature: `layer:${layer.kind}`,
        outcome: "preserved",
        impact: "none",
        message: `'${layerName}' 레이어를 완전 호환 상태로 가져옵니다.`,
      });
    }
  }

  const missingFontSubstitutions = buildMissingFontSubstitutionPreviews(
    normalizedLayers,
    options.availableLocalFonts,
  );
  for (const substitution of missingFontSubstitutions) {
    itemSequence += 1;
    compatibilityItems.push({
      id: sanitizeEntityId("font", substitution.normalizedKey, itemSequence),
      path: `fonts/${substitution.normalizedKey}`,
      feature: `font:${substitution.requestedFont}`,
      outcome: "converted",
      impact: substitution.estimatedMetricDelta === "high" ? "major" : "minor",
      message: substitution.previewNotice,
      fallback: substitution.suggestedFallbackFont,
    });
  }

  const targetExportFormat = options.targetExportFormat ?? "psd";
  const exportPreservation = evaluateExportPreservationReadiness(normalizedLayers, targetExportFormat);
  for (const issue of exportPreservation.issues) {
    itemSequence += 1;
    compatibilityItems.push({
      id: sanitizeEntityId("export", `${issue.code}-${issue.layerId}`, itemSequence),
      path: `export/${targetExportFormat}/${issue.layerId}`,
      feature: `export:${issue.code}`,
      outcome: issue.severity === "error" ? "unsupported" : "converted",
      impact: issue.severity === "error" ? "major" : "minor",
      message: issue.message,
    });
  }

  const grade: CompatibilityGrade = compatibilityItems.some(
    (item) => item.impact === "blocking" || item.outcome === "unsupported" || item.outcome === "excluded",
  )
    ? "D"
    : compatibilityItems.some((item) => item.impact === "major" || item.outcome === "rasterized")
      ? "C"
      : compatibilityItems.some((item) => item.impact === "minor" || item.outcome === "converted")
        ? "B"
        : "A";

  const elapsedMs = Math.max(0, Number((nowMs() - startedMs).toFixed(3)));

  return {
    sourceFileName: input.sourceFileName,
    sourceFormat: input.sourceFormat,
    grade,
    requiresApproval: grade !== "A",
    elapsedMs,
    budgetMs,
    withinOneSecondBudget: elapsedMs <= budgetMs,
    totalLayers: input.layers.length,
    truncatedByLimit,
    fullyCompatibleLayers,
    rasterizedFallbackLayers,
    unsupportedSmartFiltersAndEffects,
    missingFontSubstitutions,
    recoveredLayerNames,
    exportPreservation,
    compatibilityItems,
  };
}

export interface PsdPreflightScanOptions extends FormatPreflightOptions {
  readonly sourceFileName?: string;
}

/**
 * PSD/PSB 바이너리를 픽셀 디코드 없이 고속 파싱해 1초 사전 호환성 리포트를 생성한다.
 */
export function scanPsdPreflight(
  bytes: Uint8Array,
  options: PsdPreflightScanOptions = {},
): FormatCompatibilityPreflightReport {
  const parsed = parsePsdStructureForPreflight(bytes, options.sourceFileName ?? "document.psd", options);
  return scanFormatCompatibilityPreflight(
    {
      sourceFileName: parsed.sourceFileName,
      sourceFormat: parsed.sourceFormat,
      sourceBytesLength: parsed.sourceBytesLength,
      canvasWidth: parsed.canvasWidth,
      canvasHeight: parsed.canvasHeight,
      bitDepth: parsed.bitDepth,
      colorMode: parsed.colorMode,
      layers: parsed.layers,
    },
    options,
  );
}

/**
 * 사전 호환성 프리플라이트 스캔 결과를 저장소 표준 `CompatibilityReport` 계약으로 변환한다.
 */
export function createCompatibilityReportFromPreflight(
  preflight: FormatCompatibilityPreflightReport,
  input: Omit<CreateCompatibilityReportInput, "items">,
): CompatibilityReport {
  return createCompatibilityReport({
    ...input,
    items: [...preflight.compatibilityItems],
  });
}
