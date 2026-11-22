/**
 * @file format-preflight-font-and-export.ts
 * @description 사전 호환성 프리플라이트용 공통 레이어 타입, 누락 폰트 로컬 대체 매핑 미리보기,
 * 내보내기 폴더 계층·클리핑 마스크 보존 검증, CLIP 레이어 변환 어댑터.
 */

import type { ClipLayer } from "./chunked-sqlite-document-types";
import type { SourceCreativeFormat } from "./compatibility-report";

export type PreflightLayerKind =
  | "raster"
  | "folder"
  | "frame-folder"
  | "vector"
  | "text"
  | "shape"
  | "adjustment"
  | "smart-object"
  | "model3d"
  | "fill"
  | "paper"
  | "image-material"
  | "story-info"
  | "unknown";

export interface PreflightLayerEffect {
  readonly type: string;
  readonly name?: string;
  readonly isSmartFilter?: boolean;
  readonly enabled?: boolean;
}

export interface PreflightLayerDescriptor {
  readonly id: string;
  readonly name?: string;
  readonly rawNameBytes?: Uint8Array;
  readonly parentId?: string | null;
  readonly depth?: number;
  readonly kind: PreflightLayerKind;
  readonly blendMode?: string;
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly clipToBelow?: boolean;
  readonly hasLayerMask?: boolean;
  readonly hasVectorMask?: boolean;
  readonly fontFamily?: string;
  readonly fontPostScriptName?: string;
  readonly fontFamilies?: readonly string[];
  readonly adjustmentType?: string;
  readonly effects?: readonly PreflightLayerEffect[];
}

export interface PreflightDocumentInput {
  readonly sourceFileName: string;
  readonly sourceFormat: SourceCreativeFormat;
  readonly sourceBytesLength?: number;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly bitDepth?: 8 | 16 | 32;
  readonly colorMode?: "rgb" | "cmyk" | "grayscale" | "lab" | "indexed";
  /** 시각적 레이어 패널 순서(위쪽 레이어가 먼저). */
  readonly layers: readonly PreflightLayerDescriptor[];
}

export type FontSubstitutionMatchStrategy =
  | "alias-table"
  | "category-match"
  | "default-fallback";

export type FontMetricDeltaRisk = "low" | "medium" | "high";

export type FontSubstitutionCategory =
  | "korean-sans"
  | "korean-serif"
  | "japanese-sans"
  | "japanese-serif"
  | "comic-handwriting"
  | "monospace"
  | "latin-sans";

export interface MissingFontSubstitutionPreview {
  readonly requestedFont: string;
  readonly normalizedKey: string;
  readonly suggestedFallbackFont: string;
  readonly category: FontSubstitutionCategory;
  readonly matchStrategy: FontSubstitutionMatchStrategy;
  readonly availableInLocalFonts: boolean;
  readonly estimatedMetricDelta: FontMetricDeltaRisk;
  readonly affectedLayerIds: readonly string[];
  readonly previewNotice: string;
}

export type ExportPreservationIssueCode =
  | "flat-format-drops-folders"
  | "flat-format-flattens-clipping"
  | "orphan-clipping-mask"
  | "clipping-base-is-folder"
  | "folder-lost-in-export"
  | "folder-parent-changed"
  | "clipping-flag-lost"
  | "clipping-base-changed"
  | "passthrough-group-converted";

export interface ExportPreservationIssue {
  readonly code: ExportPreservationIssueCode;
  readonly layerId: string;
  readonly layerName: string;
  readonly severity: "warning" | "error";
  readonly message: string;
}

export interface ExportPreservationReport {
  readonly targetFormat: SourceCreativeFormat;
  readonly passed: boolean;
  readonly foldersTotal: number;
  readonly foldersPreserved: number;
  readonly foldersLost: number;
  readonly clippingMasksTotal: number;
  readonly clippingMasksPreserved: number;
  readonly clippingMasksBroken: number;
  readonly orphanClippingLayerIds: readonly string[];
  readonly issues: readonly ExportPreservationIssue[];
}

const LAYERED_EXPORT_FORMATS = new Set<SourceCreativeFormat>([
  "psd", "psb", "clip", "ora", "svg",
]);

const FLAT_EXPORT_FORMATS = new Set<SourceCreativeFormat>([
  "png", "jpeg", "webp", "tiff",
]);

interface FontCategoryRule {
  readonly category: FontSubstitutionCategory;
  readonly keywords: readonly string[];
  readonly preferredFallbacks: readonly string[];
  readonly metricDelta: FontMetricDeltaRisk;
}

const FONT_ALIAS_MAP: Readonly<
  Record<
    string,
    {
      readonly fallback: string;
      readonly category: FontSubstitutionCategory;
      readonly metricDelta: FontMetricDeltaRisk;
    }
  >
> = Object.freeze({
  applesdgothicneo: { fallback: "Pretendard", category: "korean-sans", metricDelta: "low" },
  malgungothic: { fallback: "Pretendard", category: "korean-sans", metricDelta: "low" },
  맑은고딕: { fallback: "Pretendard", category: "korean-sans", metricDelta: "low" },
  yoongothic: { fallback: "Pretendard", category: "korean-sans", metricDelta: "low" },
  윤고딕: { fallback: "Pretendard", category: "korean-sans", metricDelta: "low" },
  sandollgothic: { fallback: "Pretendard", category: "korean-sans", metricDelta: "low" },
  kopubdotum: { fallback: "Noto Sans KR", category: "korean-sans", metricDelta: "low" },
  kopubbatang: { fallback: "Noto Serif KR", category: "korean-serif", metricDelta: "low" },
  batang: { fallback: "Noto Serif KR", category: "korean-serif", metricDelta: "medium" },
  바탕: { fallback: "Noto Serif KR", category: "korean-serif", metricDelta: "medium" },
  gungsuh: { fallback: "Noto Serif KR", category: "korean-serif", metricDelta: "medium" },
  궁서: { fallback: "Noto Serif KR", category: "korean-serif", metricDelta: "medium" },
  ccwildwords: { fallback: "Nanum Pen Script", category: "comic-handwriting", metricDelta: "high" },
  wildwords: { fallback: "Nanum Pen Script", category: "comic-handwriting", metricDelta: "high" },
  animeace: { fallback: "Nanum Pen Script", category: "comic-handwriting", metricDelta: "high" },
  hiraginokakugothicpron: { fallback: "Noto Sans JP", category: "japanese-sans", metricDelta: "low" },
  meiryo: { fallback: "Noto Sans JP", category: "japanese-sans", metricDelta: "low" },
  yugothic: { fallback: "Noto Sans JP", category: "japanese-sans", metricDelta: "low" },
  msmincho: { fallback: "Noto Serif JP", category: "japanese-serif", metricDelta: "medium" },
  consolas: { fallback: "D2Coding", category: "monospace", metricDelta: "low" },
  jetbrainsmono: { fallback: "D2Coding", category: "monospace", metricDelta: "low" },
});

const FONT_CATEGORY_RULES: readonly FontCategoryRule[] = Object.freeze([
  {
    category: "monospace",
    keywords: ["mono", "code", "coding", "consolas", "courier", "menlo", "고정폭"],
    preferredFallbacks: ["D2Coding", "JetBrains Mono", "SF Mono", "monospace"],
    metricDelta: "low",
  },
  {
    category: "comic-handwriting",
    keywords: ["comic", "manga", "anime", "wild", "pen", "hand", "brush", "script", "손글씨", "만화", "말풍선", "필기", "펜", "手書き"],
    preferredFallbacks: ["Nanum Pen Script", "Gowun Dodum", "Pretendard", "Noto Sans KR"],
    metricDelta: "high",
  },
  {
    category: "japanese-serif",
    keywords: ["mincho", "明朝", "ryumin", "kozuka mincho", "yu mincho"],
    preferredFallbacks: ["Noto Serif JP", "Hiragino Mincho ProN", "Noto Serif KR"],
    metricDelta: "medium",
  },
  {
    category: "japanese-sans",
    keywords: ["hiragino", "meiryo", "yugothic", "msgothic", "ゴシック", "メイリオ", "ヒラギノ", "jp"],
    preferredFallbacks: ["Noto Sans JP", "Yu Gothic", "Pretendard"],
    metricDelta: "low",
  },
  {
    category: "korean-serif",
    keywords: ["batang", "myeongjo", "serif", "명조", "바탕", "궁서", "해수", "조선"],
    preferredFallbacks: ["Noto Serif KR", "NanumMyeongjo", "Gowun Batang"],
    metricDelta: "medium",
  },
  {
    category: "korean-sans",
    keywords: ["gothic", "dotum", "gulim", "nanum", "pretendard", "sandoll", "yoon", "고딕", "돋움", "굴림", "산돌", "윤", "kr"],
    preferredFallbacks: ["Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "NanumGothic"],
    metricDelta: "low",
  },
  {
    category: "latin-sans",
    keywords: ["arial", "helvetica", "inter", "roboto", "sf pro", "sans", "segoe"],
    preferredFallbacks: ["Pretendard", "Inter", "Noto Sans KR", "sans-serif"],
    metricDelta: "low",
  },
]);

function normalizeFontKey(fontName: string): string {
  return fontName
    .toLowerCase()
    .replace(/[\s_-]+/gu, "")
    .replace(/(?:regular|roman|bold|medium|light|semibold|italic|oblique|std|pro|mt|ps)$/gu, "")
    .trim();
}

function collectLayerFonts(layer: PreflightLayerDescriptor): readonly string[] {
  const fonts: string[] = [];
  if (layer.fontFamily && layer.fontFamily.trim().length > 0) fonts.push(layer.fontFamily.trim());
  if (
    layer.fontPostScriptName
    && layer.fontPostScriptName.trim().length > 0
    && !fonts.includes(layer.fontPostScriptName.trim())
  ) {
    fonts.push(layer.fontPostScriptName.trim());
  }
  for (const extra of layer.fontFamilies ?? []) {
    const trimmed = extra.trim();
    if (trimmed.length > 0 && !fonts.includes(trimmed)) {
      fonts.push(trimmed);
    }
  }
  return fonts;
}

/**
 * 누락된 폰트를 감지하고 로컬 설치 폰트 우선순위 및 카테고리 매칭 기반으로
 * 대체 폰트 매핑 미리보기와 말풍선 줄바꿈 변동 위험도를 계산한다.
 */
export function buildMissingFontSubstitutionPreviews(
  layers: readonly PreflightLayerDescriptor[],
  availableLocalFonts: readonly string[] = [],
): readonly MissingFontSubstitutionPreview[] {
  const localByNormalized = new Map<string, string>();
  for (const font of availableLocalFonts) {
    const trimmed = font.trim();
    if (!trimmed) continue;
    localByNormalized.set(normalizeFontKey(trimmed), trimmed);
    localByNormalized.set(trimmed.toLowerCase().replace(/[\s_-]+/gu, ""), trimmed);
  }

  const missingMap = new Map<string, { readonly requestedFont: string; readonly layerIds: string[] }>();

  for (const layer of layers) {
    for (const font of collectLayerFonts(layer)) {
      const normalized = normalizeFontKey(font);
      const compact = font.toLowerCase().replace(/[\s_-]+/gu, "");
      if (localByNormalized.has(normalized) || localByNormalized.has(compact)) continue;
      const existing = missingMap.get(normalized);
      if (existing) {
        if (!existing.layerIds.includes(layer.id)) existing.layerIds.push(layer.id);
      } else {
        missingMap.set(normalized, { requestedFont: font, layerIds: [layer.id] });
      }
    }
  }

  const pickLocalMatch = (candidates: readonly string[]): { readonly font: string; readonly inLocal: boolean } => {
    for (const candidate of candidates) {
      const local = localByNormalized.get(normalizeFontKey(candidate));
      if (local !== undefined) return { font: local, inLocal: true };
    }
    return { font: candidates[0] ?? "Pretendard", inLocal: false };
  };

  const previews: MissingFontSubstitutionPreview[] = [];
  for (const [normalizedKey, entry] of missingMap.entries()) {
    const alias = FONT_ALIAS_MAP[normalizedKey];
    let category: FontSubstitutionCategory = "korean-sans";
    let matchStrategy: FontSubstitutionMatchStrategy = "default-fallback";
    let estimatedMetricDelta: FontMetricDeltaRisk = "medium";
    let candidates: readonly string[] = ["Pretendard", "Noto Sans KR"];

    if (alias !== undefined) {
      category = alias.category;
      matchStrategy = "alias-table";
      estimatedMetricDelta = alias.metricDelta;
      const rule = FONT_CATEGORY_RULES.find((item) => item.category === alias.category);
      candidates = [alias.fallback, ...(rule?.preferredFallbacks ?? [])];
    } else {
      const lowerOriginal = entry.requestedFont.toLowerCase();
      const matchedRule = FONT_CATEGORY_RULES.find((rule) =>
        rule.keywords.some((keyword) => lowerOriginal.includes(keyword) || normalizedKey.includes(keyword)),
      );
      if (matchedRule !== undefined) {
        category = matchedRule.category;
        matchStrategy = "category-match";
        estimatedMetricDelta = matchedRule.metricDelta;
        candidates = matchedRule.preferredFallbacks;
      }
    }

    const picked = pickLocalMatch(candidates);
    const deltaLabel =
      estimatedMetricDelta === "high"
        ? "자폭 차이가 커 말풍선 줄바꿈 재조정이 필요합니다."
        : estimatedMetricDelta === "medium"
          ? "줄바꿈 위치가 소폭 달라질 수 있어 미리보기 확인을 권장합니다."
          : "자폭과 자간이 유사해 레이아웃 변동이 적습니다.";

    previews.push({
      requestedFont: entry.requestedFont,
      normalizedKey,
      suggestedFallbackFont: picked.font,
      category,
      matchStrategy,
      availableInLocalFonts: picked.inLocal,
      estimatedMetricDelta,
      affectedLayerIds: entry.layerIds,
      previewNotice: `'${entry.requestedFont}' 누락 → '${picked.font}'${picked.inLocal ? "(로컬 보유)" : "(기본 번들)"} 대체 미리보기: ${deltaLabel}`,
    });
  }

  return previews;
}

function isFolderKind(kind: PreflightLayerKind): boolean {
  return kind === "folder" || kind === "frame-folder";
}

function resolveClippingBaseLayer(
  siblingsTopToBottom: readonly PreflightLayerDescriptor[],
  index: number,
): PreflightLayerDescriptor | null {
  for (let below = index + 1; below < siblingsTopToBottom.length; below += 1) {
    const candidate = siblingsTopToBottom[below]!;
    if (!candidate.clipToBelow) return candidate;
  }
  return null;
}

/**
 * 문서의 폴더 계층과 클리핑 마스크 체인이 대상 내보내기 포맷에서 보존 가능한지 사전 검증한다.
 */
export function evaluateExportPreservationReadiness(
  layers: readonly PreflightLayerDescriptor[],
  targetFormat: SourceCreativeFormat = "psd",
): ExportPreservationReport {
  const issues: ExportPreservationIssue[] = [];
  const orphanClippingLayerIds: string[] = [];

  const folders = layers.filter((layer) => isFolderKind(layer.kind));
  const clippingLayers = layers.filter((layer) => layer.clipToBelow === true);

  if (FLAT_EXPORT_FORMATS.has(targetFormat)) {
    if (folders.length > 0) {
      issues.push({
        code: "flat-format-drops-folders",
        layerId: folders[0]!.id,
        layerName: folders[0]!.name ?? folders[0]!.id,
        severity: "error",
        message: `${targetFormat.toUpperCase()} 평면 포맷은 폴더 ${folders.length}개의 계층 구조를 보존하지 못합니다.`,
      });
    }
    if (clippingLayers.length > 0) {
      issues.push({
        code: "flat-format-flattens-clipping",
        layerId: clippingLayers[0]!.id,
        layerName: clippingLayers[0]!.name ?? clippingLayers[0]!.id,
        severity: "error",
        message: `${targetFormat.toUpperCase()} 평면 포맷은 클리핑 마스크 ${clippingLayers.length}개를 단일 이미지로 병합합니다.`,
      });
    }
    return {
      targetFormat,
      passed: folders.length === 0 && clippingLayers.length === 0,
      foldersTotal: folders.length,
      foldersPreserved: 0,
      foldersLost: folders.length,
      clippingMasksTotal: clippingLayers.length,
      clippingMasksPreserved: 0,
      clippingMasksBroken: clippingLayers.length,
      orphanClippingLayerIds,
      issues,
    };
  }

  const siblingsByParent = new Map<string, PreflightLayerDescriptor[]>();
  for (const layer of layers) {
    const parentKey = layer.parentId ?? "__root__";
    const list = siblingsByParent.get(parentKey);
    if (list) list.push(layer);
    else siblingsByParent.set(parentKey, [layer]);
  }

  let clippingBroken = 0;
  for (const siblings of siblingsByParent.values()) {
    for (let index = 0; index < siblings.length; index += 1) {
      const layer = siblings[index]!;
      const layerName = layer.name ?? layer.id;

      if (isFolderKind(layer.kind) && layer.blendMode === "pass-through" && targetFormat === "ora") {
        issues.push({
          code: "passthrough-group-converted",
          layerId: layer.id,
          layerName,
          severity: "warning",
          message: "ORA 내보내기에서는 pass-through 폴더 합성 모드가 normal 그룹으로 변환됩니다.",
        });
      }

      if (!layer.clipToBelow) continue;
      const baseLayer = resolveClippingBaseLayer(siblings, index);
      if (baseLayer === null) {
        clippingBroken += 1;
        orphanClippingLayerIds.push(layer.id);
        issues.push({
          code: "orphan-clipping-mask",
          layerId: layer.id,
          layerName,
          severity: "error",
          message: `클리핑 레이어 '${layerName}' 아래에 기준 레이어가 없어 내보내기 시 클리핑 마스크가 깨집니다.`,
        });
      } else if (isFolderKind(baseLayer.kind) && !LAYERED_EXPORT_FORMATS.has(targetFormat)) {
        clippingBroken += 1;
        issues.push({
          code: "clipping-base-is-folder",
          layerId: layer.id,
          layerName,
          severity: "warning",
          message: `클리핑 대상 '${baseLayer.name ?? baseLayer.id}'가 폴더이므로 대상 포맷에서 래스터화될 수 있습니다.`,
        });
      }
    }
  }

  const foldersPreserved = LAYERED_EXPORT_FORMATS.has(targetFormat) ? folders.length : 0;
  const foldersLost = folders.length - foldersPreserved;
  return {
    targetFormat,
    passed: foldersLost === 0 && clippingBroken === 0 && !issues.some((issue) => issue.severity === "error"),
    foldersTotal: folders.length,
    foldersPreserved,
    foldersLost,
    clippingMasksTotal: clippingLayers.length,
    clippingMasksPreserved: Math.max(0, clippingLayers.length - clippingBroken),
    clippingMasksBroken: clippingBroken,
    orphanClippingLayerIds,
    issues,
  };
}

/**
 * 내보내기 전 원본 레이어 트리와 내보내기 후 재파싱된 레이어 트리를 비교해
 * 폴더 계층과 클리핑 마스크 연결이 무손실로 보존되었는지 검증한다.
 */
export function verifyExportFolderAndClippingPreservation(
  sourceLayers: readonly PreflightLayerDescriptor[],
  exportedLayers: readonly PreflightLayerDescriptor[],
  targetFormat: SourceCreativeFormat = "psd",
): ExportPreservationReport {
  const readiness = evaluateExportPreservationReadiness(exportedLayers, targetFormat);
  const issues: ExportPreservationIssue[] = [...readiness.issues];
  const exportedById = new Map<string, PreflightLayerDescriptor>();
  for (const layer of exportedLayers) exportedById.set(layer.id, layer);

  const sourceFolders = sourceLayers.filter((layer) => isFolderKind(layer.kind));
  let foldersPreserved = 0;
  let foldersLost = 0;

  for (const folder of sourceFolders) {
    const exported = exportedById.get(folder.id);
    const folderName = folder.name ?? folder.id;
    if (!exported || !isFolderKind(exported.kind)) {
      foldersLost += 1;
      issues.push({
        code: "folder-lost-in-export",
        layerId: folder.id,
        layerName: folderName,
        severity: "error",
        message: `원본 폴더 '${folderName}'가 내보내기 결과에서 유실되었습니다.`,
      });
      continue;
    }
    if ((folder.parentId ?? null) !== (exported.parentId ?? null)) {
      foldersLost += 1;
      issues.push({
        code: "folder-parent-changed",
        layerId: folder.id,
        layerName: folderName,
        severity: "error",
        message: `폴더 '${folderName}'의 상위 폴더 연결이 내보내기 과정에서 변경되었습니다.`,
      });
      continue;
    }
    foldersPreserved += 1;
  }

  const groupSiblings = (items: readonly PreflightLayerDescriptor[]): Map<string, PreflightLayerDescriptor[]> => {
    const grouped = new Map<string, PreflightLayerDescriptor[]>();
    for (const item of items) {
      const key = item.parentId ?? "__root__";
      const list = grouped.get(key);
      if (list) list.push(item);
      else grouped.set(key, [item]);
    }
    return grouped;
  };

  const sourceSiblings = groupSiblings(sourceLayers);
  const exportedSiblings = groupSiblings(exportedLayers);
  const sourceClipping = sourceLayers.filter((layer) => layer.clipToBelow === true);
  let clippingPreserved = 0;
  let clippingBroken = 0;

  for (const layer of sourceClipping) {
    const layerName = layer.name ?? layer.id;
    const exported = exportedById.get(layer.id);
    if (!exported || exported.clipToBelow !== true) {
      clippingBroken += 1;
      issues.push({
        code: "clipping-flag-lost",
        layerId: layer.id,
        layerName,
        severity: "error",
        message: `레이어 '${layerName}'의 클리핑 마스크 속성이 내보내기 결과에서 사라졌습니다.`,
      });
      continue;
    }
    const srcSibs = sourceSiblings.get(layer.parentId ?? "__root__") ?? [];
    const expSibs = exportedSiblings.get(exported.parentId ?? "__root__") ?? [];
    const srcBase = resolveClippingBaseLayer(srcSibs, srcSibs.indexOf(layer));
    const expBase = resolveClippingBaseLayer(expSibs, expSibs.indexOf(exported));
    if (srcBase !== null && (expBase === null || expBase.id !== srcBase.id)) {
      clippingBroken += 1;
      issues.push({
        code: "clipping-base-changed",
        layerId: layer.id,
        layerName,
        severity: "error",
        message: `레이어 '${layerName}'의 클리핑 기준 레이어가 '${srcBase.name ?? srcBase.id}'에서 변경되었습니다.`,
      });
      continue;
    }
    clippingPreserved += 1;
  }

  return {
    targetFormat,
    passed: foldersLost === 0 && clippingBroken === 0 && !issues.some((issue) => issue.severity === "error"),
    foldersTotal: sourceFolders.length,
    foldersPreserved,
    foldersLost,
    clippingMasksTotal: sourceClipping.length,
    clippingMasksPreserved: clippingPreserved,
    clippingMasksBroken: clippingBroken,
    orphanClippingLayerIds: readiness.orphanClippingLayerIds,
    issues,
  };
}

/**
 * `.clip` 파서(`chunked-sqlite-document`)의 `ClipLayer` 목록을 프리플라이트 입력 구조로 변환한다.
 */
export function buildPreflightInputFromClipLayers(
  layers: readonly ClipLayer[],
  meta: {
    readonly sourceFileName: string;
    readonly canvasWidth?: number;
    readonly canvasHeight?: number;
  },
): PreflightDocumentInput {
  const indexToId = new Map<number, string>();
  for (const layer of layers) indexToId.set(layer.index, `clip-${layer.id}`);
  return {
    sourceFileName: meta.sourceFileName,
    sourceFormat: "clip",
    canvasWidth: meta.canvasWidth,
    canvasHeight: meta.canvasHeight,
    bitDepth: 8,
    colorMode: "rgb",
    layers: layers.map((layer) => ({
      id: `clip-${layer.id}`,
      name: layer.name,
      parentId: layer.parentIndex !== null ? (indexToId.get(layer.parentIndex) ?? null) : null,
      depth: layer.depth,
      kind: layer.kind === "other" ? "unknown" : layer.kind,
      blendMode: layer.compositeMode ?? "normal",
      opacity: layer.opacity,
      visible: layer.visible,
      clipToBelow: layer.clipToBelow,
      hasLayerMask: layer.mask !== null,
    })),
  };
}
