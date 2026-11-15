import {
  formatStudioExportPageSelection,
  resolveStudioExportPageSelection,
} from "./export/studio-export-page-selection";
import {
  STUDIO_EXPORT_TARGET_PROFILES,
  type StudioExportDocumentSnapshot,
  type StudioExportFindingLocation,
  type StudioExportTargetId,
} from "./studio-export-preflight";
import type { StudioProjectWorkspaceState } from "./studio-project-workspace-store";

export interface StudioExportDraftInput {
  readonly documentId: string;
  readonly target: StudioExportTargetId;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly estimatedFileSizeBytes: number;
  readonly dpi: number | null;
  readonly colorSpace: string;
  readonly minimumTextPx: number | null;
  readonly missingFontIds: readonly string[];
  readonly missingAssetIds: readonly string[];
  readonly aiGeneratedObjectIds: readonly string[];
  readonly aiDisclosurePrepared: boolean;
  readonly readingOrderComplete: boolean;
  readonly altTextCoverage: number;
  readonly captionsComplete: boolean;
  readonly editableStructurePreserved: boolean;
  readonly findingLocations?: Readonly<Record<string, readonly StudioExportFindingLocation[]>>;
}

export interface StudioExportPageElementIssueFact {
  readonly kind: "missing-asset" | "missing-font" | "text-size";
  readonly id: string;
  readonly label: string;
  readonly pageNumber: number;
  readonly pageId: string;
  readonly pageLabel: string;
  readonly cutNumber: number | null;
  readonly cutId: string | null;
  readonly elementId: string;
  readonly fontSizePx?: number;
}

export interface StudioExportPageFact {
  readonly pageNumber: number;
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly issues?: readonly StudioExportPageElementIssueFact[];
}

export interface StudioManuscriptExportFacts {
  readonly sourceAuthority: "manuscript-snapshot" | "document-metadata";
  readonly documentId: string;
  readonly documentTitle: string;
  readonly localEditorHref: string;
  readonly pages: readonly StudioExportPageFact[];
}

export interface StudioRecommendedManuscriptBasis {
  readonly documentId?: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

export interface StudioExportActualScopeSummary {
  readonly hasLocalManuscript: boolean;
  readonly sourceAuthority: "manuscript-snapshot" | "document-metadata" | "none";
  readonly totalPageCount: number;
  readonly selectionMode: "all" | "custom";
  readonly selectionExpression: string;
  readonly selectionValid: boolean;
  readonly selectionError: string | null;
  readonly selectedPageIndices: readonly number[];
  readonly selectedPages: readonly StudioExportPageFact[];
  readonly selectionRangeLabel: string;
  readonly selectionOrderSequenceKo: string;
  readonly selectionOrderSequenceEn: string;
  readonly selectionReorderedToDocumentOrder: boolean;
  readonly sourceCanvasWidth: number | null;
  readonly sourceFirstPageHeight: number | null;
  readonly sourceSelectedTotalHeight: number | null;
  readonly plannedExportScale: number;
  readonly plannedOutputWidth: number;
  readonly plannedFirstPageOutputHeight: number;
  readonly plannedTotalOutputHeight: number;
}

export interface StudioExportPlatformRecommendationSummary {
  readonly target: StudioExportTargetId;
  readonly targetLabelKo: string;
  readonly targetLabelEn: string;
  readonly policyVersion: string;
  readonly exactWidth: number | null;
  readonly maxWidth: number | null;
  readonly maxSegmentHeight: number | null;
  readonly maxFileSizeBytes: number | null;
  readonly minimumDpi: number | null;
  readonly allowedFormats: readonly string[];
  readonly allowedColorSpaces: readonly string[];
}

export interface StudioExportEstimateSummary {
  readonly isEstimate: true;
  readonly isUserOverridden: boolean;
  readonly estimatedFileSizeBytes: number;
  readonly segmentHeights: readonly number[];
  readonly segmentCount: number;
}

export interface StudioExportPreExportScopeSummary {
  readonly actual: StudioExportActualScopeSummary;
  readonly platformRecommendation: StudioExportPlatformRecommendationSummary;
  readonly estimate: StudioExportEstimateSummary;
}

const MIN_ESTIMATE_BYTES = 64 * 1024;
const MAX_ESTIMATE_BYTES = 8 * 1024 * 1024 * 1024;

const FORMAT_BYTES_PER_PIXEL: Readonly<Record<string, number>> = Object.freeze({
  png: 0.85,
  jpg: 0.24,
  jpeg: 0.24,
  webp: 0.18,
  pdf: 0.3,
  psd: 2.8,
  ora: 1.1,
  svg: 0.12,
  epub: 0.32,
  mp4: 0.65,
  webm: 0.55,
  gif: 0.95,
  tif: 3.0,
  tiff: 3.0,
  toonstudio: 1.2,
});

function splitHeight(height: number, maximum: number | undefined): readonly number[] {
  if (!maximum || !Number.isFinite(height) || height <= maximum) return Object.freeze([height]);
  const segments: number[] = [];
  let remaining = height;
  while (remaining > 0) {
    const segment = Math.min(maximum, remaining);
    segments.push(segment);
    remaining -= segment;
  }
  return Object.freeze(segments);
}

export function clampStudioExportScale(rawScale: number): number {
  if (!Number.isFinite(rawScale) || rawScale <= 0) return 1;
  const clamped = Math.min(4, Math.max(0.25, rawScale));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * 해상도(폭×높이)와 파일 형식으로부터 예상 인코딩 바이트 크기를 산출한다.
 * 실제 로컬 인코딩 바이트 확정값이 아닌 사전 추정치임을 명시적으로 구분하기 위해 사용한다.
 */
export function estimateStudioExportBytes(input: {
  readonly width: number;
  readonly height: number;
  readonly format: string;
}): number {
  const safeWidth = Number.isFinite(input.width) && input.width > 0 ? input.width : 1;
  const safeHeight = Number.isFinite(input.height) && input.height > 0 ? input.height : 1;
  const normalizedFormat = input.format.trim().toLowerCase();
  const ratio = FORMAT_BYTES_PER_PIXEL[normalizedFormat] ?? 0.5;
  const rawBytes = Math.round((safeWidth * safeHeight * ratio) / 1024) * 1024;
  return Math.min(MAX_ESTIMATE_BYTES, Math.max(MIN_ESTIMATE_BYTES, rawBytes));
}

function detectInputOrderDiffersFromDocumentOrder(
  expression: string,
  resolvedIndices: readonly number[],
): boolean {
  const rawNumbers: number[] = [];
  for (const token of expression.split(/[,，]/u)) {
    const match = /^\s*(\d+)\s*(?:[-–—~]\s*(\d+)\s*)?$/u.exec(token);
    if (!match) return false;
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (from > to) return true;
    for (let page = from; page <= to && rawNumbers.length <= resolvedIndices.length + 1; page += 1) {
      rawNumbers.push(page - 1);
    }
  }
  if (rawNumbers.length !== resolvedIndices.length) return true;
  return rawNumbers.some((index, pos) => index !== resolvedIndices[pos]);
}

function formatSelectionOrderSequence(
  selectedPages: readonly StudioExportPageFact[],
  locale: "ko" | "en",
): string {
  if (selectedPages.length === 0) {
    return locale === "ko" ? "선택된 페이지 없음" : "No pages selected";
  }
  const formatPageToken = (page: StudioExportPageFact): string => {
    const defaultKo = `${page.pageNumber}페이지`;
    const defaultEn = `Page ${page.pageNumber}`;
    const trimmed = page.label.trim();
    const hasCustomLabel =
      trimmed.length > 0 &&
      trimmed !== defaultKo &&
      trimmed !== defaultEn &&
      trimmed !== String(page.pageNumber);
    if (locale === "ko") {
      return hasCustomLabel ? `${page.pageNumber}페이지(${trimmed})` : defaultKo;
    }
    return hasCustomLabel ? `P${page.pageNumber} (${trimmed})` : `P${page.pageNumber}`;
  };
  if (selectedPages.length <= 6) {
    return selectedPages.map(formatPageToken).join(" → ");
  }
  const head = selectedPages.slice(0, 3).map(formatPageToken).join(" → ");
  const tail = formatPageToken(selectedPages[selectedPages.length - 1]!);
  return locale === "ko"
    ? `${head} → … → ${tail} (총 ${selectedPages.length}장)`
    : `${head} → … → ${tail} (${selectedPages.length} pages)`;
}

/** Produce useful defaults from the selected destination without asking users for technical policy values. */
export function recommendedStudioExportDraft(
  projectId: string,
  target: StudioExportTargetId,
  manuscriptBasis?: StudioRecommendedManuscriptBasis | null,
): StudioExportDraftInput {
  const profile = STUDIO_EXPORT_TARGET_PROFILES[target];
  const defaults: Record<StudioExportTargetId, Omit<StudioExportDraftInput, "target" | "documentId">> = {
    "webtoon-platform": {
      format: "png",
      width: profile.exactWidth ?? 800,
      height: 38_400,
      estimatedFileSizeBytes: 18 * 1024 * 1024,
      dpi: null,
      colorSpace: "srgb",
      minimumTextPx: 20,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: true,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: false,
    },
    social: {
      format: "png",
      width: 1080,
      height: 1350,
      estimatedFileSizeBytes: 4 * 1024 * 1024,
      dpi: null,
      colorSpace: "srgb",
      minimumTextPx: 20,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: true,
      readingOrderComplete: true,
      altTextCoverage: 1,
      captionsComplete: true,
      editableStructurePreserved: false,
    },
    print: {
      format: "pdf",
      width: 2480,
      height: 3508,
      estimatedFileSizeBytes: 80 * 1024 * 1024,
      dpi: 300,
      colorSpace: "cmyk",
      minimumTextPx: 14,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: false,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: false,
    },
    "image-pdf": {
      format: "png",
      width: 1600,
      height: 2400,
      estimatedFileSizeBytes: 12 * 1024 * 1024,
      dpi: 144,
      colorSpace: "srgb",
      minimumTextPx: 16,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: false,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: false,
    },
    editable: {
      format: "psd",
      width: 1600,
      height: 2400,
      estimatedFileSizeBytes: 180 * 1024 * 1024,
      dpi: 144,
      colorSpace: "srgb",
      minimumTextPx: 16,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: false,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: true,
    },
    ebook: {
      format: "epub",
      width: 1600,
      height: 2400,
      estimatedFileSizeBytes: 48 * 1024 * 1024,
      dpi: 144,
      colorSpace: "srgb",
      minimumTextPx: 18,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: true,
      readingOrderComplete: true,
      altTextCoverage: 1,
      captionsComplete: true,
      editableStructurePreserved: false,
    },
    video: {
      format: "mp4",
      width: 1080,
      height: 1920,
      estimatedFileSizeBytes: 120 * 1024 * 1024,
      dpi: null,
      colorSpace: "rec709",
      minimumTextPx: 24,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: true,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: true,
      editableStructurePreserved: false,
    },
    archive: {
      format: "toonstudio",
      width: 1600,
      height: 2400,
      estimatedFileSizeBytes: 400 * 1024 * 1024,
      dpi: 144,
      colorSpace: "srgb",
      minimumTextPx: 16,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: false,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: true,
    },
  };
  const base = defaults[target];
  if (
    !manuscriptBasis ||
    !Number.isFinite(manuscriptBasis.sourceWidth) ||
    manuscriptBasis.sourceWidth <= 0 ||
    !Number.isFinite(manuscriptBasis.sourceHeight) ||
    manuscriptBasis.sourceHeight <= 0
  ) {
    return Object.freeze({
      documentId: manuscriptBasis?.documentId ?? `project:${projectId}`,
      target,
      ...base,
    });
  }

  const recommendedWidth =
    profile.exactWidth ??
    (profile.maxWidth !== undefined
      ? Math.min(manuscriptBasis.sourceWidth, profile.maxWidth)
      : base.width);
  const scale = clampStudioExportScale(recommendedWidth / manuscriptBasis.sourceWidth);
  const recommendedHeight = Math.max(1, Math.round(manuscriptBasis.sourceHeight * scale));
  return Object.freeze({
    documentId: manuscriptBasis.documentId ?? `project:${projectId}`,
    target,
    ...base,
    width: recommendedWidth,
    height: recommendedHeight,
    estimatedFileSizeBytes: estimateStudioExportBytes({
      width: recommendedWidth,
      height: recommendedHeight,
      format: base.format,
    }),
  });
}

/**
 * 내보내기 전 범위 요약 생성기:
 * (1) 실제 원고 해상도·페이지 수·선택 순서 및 로컬 출력 해상도,
 * (2) 플랫폼 규격·추천치,
 * (3) 픽셀·포맷 기반 파일 용량 및 분할 수 추정치를 명시적으로 분리한다.
 */
export function summarizeStudioExportPreExportScope(input: {
  readonly target: StudioExportTargetId;
  readonly draft: StudioExportDraftInput;
  readonly manuscript: StudioManuscriptExportFacts | null;
  readonly selectionMode: "all" | "custom";
  readonly selectionExpression: string;
  readonly customEstimateOverride?: boolean;
}): StudioExportPreExportScopeSummary {
  const profile = STUDIO_EXPORT_TARGET_PROFILES[input.target];
  const pages = input.manuscript?.pages ?? [];
  const totalPageCount = pages.length > 0 ? pages.length : 1;

  let selectionValid = true;
  let selectionError: string | null = null;
  let selectedPageIndices: number[] = Array.from({ length: totalPageCount }, (_, index) => index);
  let selectionReorderedToDocumentOrder = false;

  if (input.selectionMode === "custom") {
    const resolved = resolveStudioExportPageSelection(totalPageCount, input.selectionExpression);
    if (resolved.ok) {
      selectedPageIndices = resolved.indices;
      selectionReorderedToDocumentOrder = detectInputOrderDiffersFromDocumentOrder(
        input.selectionExpression,
        resolved.indices,
      );
    } else {
      selectionValid = false;
      selectionError = resolved.message;
      selectedPageIndices = [];
    }
  }

  const selectedPages: StudioExportPageFact[] =
    pages.length > 0
      ? selectedPageIndices
          .map((index) => pages[index])
          .filter((page): page is StudioExportPageFact => page !== undefined)
      : selectedPageIndices.map((index) => ({
          pageNumber: index + 1,
          id: `page-${index + 1}`,
          label: `${index + 1}페이지`,
          width: input.draft.width,
          height: input.draft.height,
        }));

  const sourceCanvasWidth = pages[0]?.width ?? null;
  const sourceFirstPageHeight = selectedPages[0]?.height ?? pages[0]?.height ?? null;
  const sourceSelectedTotalHeight =
    pages.length > 0
      ? selectedPages.reduce((sum, page) => sum + page.height, 0)
      : null;

  const plannedExportScale =
    sourceCanvasWidth !== null && sourceCanvasWidth > 0
      ? clampStudioExportScale(input.draft.width / sourceCanvasWidth)
      : 1;
  const plannedOutputWidth =
    sourceCanvasWidth !== null && sourceCanvasWidth > 0
      ? Math.max(1, Math.round(sourceCanvasWidth * plannedExportScale))
      : input.draft.width;
  const plannedFirstPageOutputHeight =
    sourceFirstPageHeight !== null && sourceFirstPageHeight > 0
      ? Math.max(1, Math.round(sourceFirstPageHeight * plannedExportScale))
      : input.draft.height;
  const plannedTotalOutputHeight = input.draft.height;
  const segmentHeights = splitHeight(plannedTotalOutputHeight, profile.maxSegmentHeight);

  return Object.freeze({
    actual: Object.freeze({
      hasLocalManuscript: input.manuscript !== null,
      sourceAuthority: input.manuscript?.sourceAuthority ?? "none",
      totalPageCount,
      selectionMode: input.selectionMode,
      selectionExpression: input.selectionExpression,
      selectionValid,
      selectionError,
      selectedPageIndices: Object.freeze([...selectedPageIndices]),
      selectedPages: Object.freeze(selectedPages),
      selectionRangeLabel: formatStudioExportPageSelection(selectedPageIndices),
      selectionOrderSequenceKo: formatSelectionOrderSequence(selectedPages, "ko"),
      selectionOrderSequenceEn: formatSelectionOrderSequence(selectedPages, "en"),
      selectionReorderedToDocumentOrder,
      sourceCanvasWidth,
      sourceFirstPageHeight,
      sourceSelectedTotalHeight,
      plannedExportScale,
      plannedOutputWidth,
      plannedFirstPageOutputHeight,
      plannedTotalOutputHeight,
    }),
    platformRecommendation: Object.freeze({
      target: input.target,
      targetLabelKo: profile.labelKo,
      targetLabelEn: profile.labelEn,
      policyVersion: profile.policyVersion,
      exactWidth: profile.exactWidth ?? null,
      maxWidth: profile.maxWidth ?? null,
      maxSegmentHeight: profile.maxSegmentHeight ?? null,
      maxFileSizeBytes: profile.maxFileSizeBytes ?? null,
      minimumDpi: profile.minimumDpi ?? null,
      allowedFormats: profile.allowedFormats,
      allowedColorSpaces: profile.allowedColorSpaces ?? Object.freeze(["srgb"]),
    }),
    estimate: Object.freeze({
      isEstimate: true as const,
      isUserOverridden: Boolean(input.customEstimateOverride),
      estimatedFileSizeBytes: input.draft.estimatedFileSizeBytes,
      segmentHeights,
      segmentCount: segmentHeights.length,
    }),
  });
}

/** Merge user-entered document facts with project-level review, localization and rights truth. */
export function createStudioProjectExportSnapshot(
  state: StudioProjectWorkspaceState,
  input: StudioExportDraftInput,
): StudioExportDocumentSnapshot {
  const profile = STUDIO_EXPORT_TARGET_PROFILES[input.target];
  const unresolvedComments = state.reviewSession.threads.filter((thread) => thread.status === "open").length;
  const localizationBlockingIssues = state.localization.reduce(
    (total, item) => total + item.blockingIssueCount,
    0,
  );
  return Object.freeze({
    documentId: input.documentId.trim(),
    format: input.format.trim().toLowerCase(),
    width: input.width,
    height: input.height,
    segmentHeights: splitHeight(input.height, profile.maxSegmentHeight),
    estimatedFileSizeBytes: input.estimatedFileSizeBytes,
    dpi: input.dpi,
    colorSpace: input.colorSpace.trim().toLowerCase(),
    minimumTextPx: input.minimumTextPx,
    missingFontIds: Object.freeze([...new Set(input.missingFontIds.map((id) => id.trim()).filter(Boolean))]),
    missingAssetIds: Object.freeze([...new Set(input.missingAssetIds.map((id) => id.trim()).filter(Boolean))]),
    rightsBlockedAssetIds: Object.freeze(state.assets.filter((asset) => asset.status === "blocked").map((asset) => asset.id)),
    rightsWarningAssetIds: Object.freeze(state.assets.filter((asset) => asset.status === "warning").map((asset) => asset.id)),
    aiGeneratedObjectIds: Object.freeze([...new Set(input.aiGeneratedObjectIds.map((id) => id.trim()).filter(Boolean))]),
    aiDisclosurePrepared: input.aiDisclosurePrepared,
    readingOrderComplete: input.readingOrderComplete,
    altTextCoverage: input.altTextCoverage,
    captionsComplete: input.captionsComplete,
    editableStructurePreserved: input.editableStructurePreserved,
    localizationBlockingIssues,
    unresolvedComments,
    ...(input.findingLocations ? { findingLocations: input.findingLocations } : {}),
  });
}
