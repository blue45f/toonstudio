/**
 * 원스톱 통합 프리플라이트 계약 (AC-012 · 8개 출고 타깃 + 3개 게시 프로필 + Rights BOM/375px/스마트컷 실검사).
 *
 * `StudioPublishPreflightPanel`(3개 게시 프로필)과 `StudioExportPanel`(8개 출고 타깃)이
 * 동일한 단일 출고 검증 엔진을 공유하도록 통합한다.
 * - 375px 모바일 말풍선 가독성 실검사
 * - 스마트 컷 분할(대사/말풍선 중간 절단 금지)
 * - Rights BOM 상업 라이선스(`NC`/`GPL`/`AGPL`/비상업 전용) 자동 차단 + 영수증/PNG `tEXt` 청크 실연결
 */

import type { WorkflowPackExportReceiptAttachment } from "../assistant/studio-workflow-pack-export-bundle";
import {
  STUDIO_EXPORT_TARGET_PROFILES,
  STUDIO_EXPORT_TARGETS,
  type StudioExportTargetId,
  type StudioExportTargetProfile,
} from "../studio-export-preflight";
import type { StudioPublishProfile } from "../studio-publish-preflight";
import {
  computeSafeSliceYs,
  isLicenseBlockedForCommercial,
  runCommercialPreflightGate,
  type CommercialPreflightReport,
  type ExportCommercialMode,
  type PreflightAssetLicense,
  type PreflightBubbleBox,
  type PreflightIssue,
} from "./studio-commercial-preflight-gate";
import {
  resolveExportRightsReceiptPayload,
  type ExportArchiveRightsPayload,
} from "./studio-export-rights-receipt-adapter";
import {
  extractPngRightsTextChunk,
  injectPngRightsTextChunk,
  isValidPngBytes,
} from "./studio-png-rights-chunk-codec";

export {
  STUDIO_EXPORT_TARGETS,
  STUDIO_EXPORT_TARGET_PROFILES,
  computeSafeSliceYs,
  isLicenseBlockedForCommercial,
};

export type {
  CommercialPreflightReport,
  ExportArchiveRightsPayload,
  ExportCommercialMode,
  PreflightAssetLicense,
  PreflightBubbleBox,
  PreflightIssue,
  StudioExportTargetId,
  StudioExportTargetProfile,
};

export interface UnifiedPublishProfileMeta {
  readonly id: StudioPublishProfile;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly defaultExportTarget: StudioExportTargetId;
}

export const STUDIO_UNIFIED_PUBLISH_PROFILES: readonly UnifiedPublishProfileMeta[] = Object.freeze([
  {
    id: "generic",
    labelKo: "일반 / ToonStudio",
    labelEn: "General / ToonStudio",
    defaultExportTarget: "webtoon-platform",
  },
  {
    id: "webtoon",
    labelKo: "WEBTOON CANVAS",
    labelEn: "WEBTOON CANVAS",
    defaultExportTarget: "webtoon-platform",
  },
  {
    id: "tapas",
    labelKo: "Tapas",
    labelEn: "Tapas",
    defaultExportTarget: "webtoon-platform",
  },
]);

export function defaultExportTargetForPublishProfile(
  profile: StudioPublishProfile,
): StudioExportTargetId {
  return (
    STUDIO_UNIFIED_PUBLISH_PROFILES.find((entry) => entry.id === profile)?.defaultExportTarget ??
    "webtoon-platform"
  );
}

const RESTRICTED_NOTE_TOKEN_RE =
  /\b(CC-BY-NC-ND|CC-BY-NC-SA|CC-BY-NC|NON-COMMERCIAL|PERSONAL-ONLY|AGPL|GPL|NC)\b|비상업|비영리/gi;

/** 제3자 출처 메모에 명시된 비상업/GPL 라이선스 단서를 Rights BOM 점검 항목으로 추출한다. */
export function extractRestrictedAssetsFromNotes(
  notes: string | undefined,
): PreflightAssetLicense[] {
  const trimmed = notes?.trim();
  if (!trimmed) return [];
  const matches = trimmed.match(RESTRICTED_NOTE_TOKEN_RE);
  if (!matches || matches.length === 0) return [];
  const normalizedCodes = [...new Set(matches.map((token) => {
    const upper = token.toUpperCase();
    if (token === "비상업" || token === "비영리") return "NON-COMMERCIAL";
    return upper;
  }))];
  return normalizedCodes.map((code, index) => ({
    assetId: `third-party-note-${index + 1}`,
    name: `제3자 출처 메모(${code})`,
    licenseCode: code,
  }));
}

export interface UnifiedCommercialExportPreflightInput {
  readonly exportTarget: StudioExportTargetId;
  readonly publishProfile?: StudioPublishProfile;
  readonly documentWidthPx: number;
  readonly documentHeightPx: number;
  readonly bubbles?: readonly PreflightBubbleBox[];
  readonly assets?: readonly PreflightAssetLicense[];
  readonly thirdPartyAttributionNotes?: string;
  readonly explicitRightsReceipt?: WorkflowPackExportReceiptAttachment | null;
}

export interface UnifiedMobileLegibilitySummary {
  readonly status: "pass" | "warning" | "unverified";
  readonly checkedBubbleCount: number;
  readonly warningCount: number;
  readonly summaryKo: string;
}

export interface UnifiedSmartSliceSummary {
  readonly status: "single" | "safe" | "adjusted";
  readonly sliceCount: number;
  readonly adjustedCount: number;
  readonly safeSliceYs: readonly number[];
  readonly summaryKo: string;
}

export interface UnifiedRightsBomSummary {
  readonly status: "pass" | "blocked" | "personal-only";
  readonly blockerCount: number;
  readonly checkedAssetCount: number;
  readonly receiptAttached: boolean;
  readonly receiptFilename: string | null;
  readonly pngChunkKeyword: string | null;
  readonly summaryKo: string;
}

export interface UnifiedCommercialExportPreflightResult {
  readonly exportTarget: StudioExportTargetId;
  readonly targetProfile: StudioExportTargetProfile;
  readonly publishProfile: StudioPublishProfile;
  readonly exportMode: ExportCommercialMode;
  readonly passed: boolean;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly gateReport: CommercialPreflightReport;
  readonly rightsReceipt: ExportArchiveRightsPayload;
  readonly mobileLegibility: UnifiedMobileLegibilitySummary;
  readonly smartSlice: UnifiedSmartSliceSummary;
  readonly rightsBom: UnifiedRightsBomSummary;
  readonly issues: readonly PreflightIssue[];
}

/**
 * 8개 출고 타깃 × 3개 게시 프로필 통합 상용 출고 실검사 계약.
 * 크기만 확인하는 가짜 통과 대신 375px 말풍선 가독성, 스마트 컷 분할, Rights BOM 차단을 실평가한다.
 */
export function evaluateCommercialExportPreflight(
  input: UnifiedCommercialExportPreflightInput,
): UnifiedCommercialExportPreflightResult {
  const targetProfile = STUDIO_EXPORT_TARGET_PROFILES[input.exportTarget];
  const publishProfile: StudioPublishProfile = input.publishProfile ?? "generic";
  const exportMode: ExportCommercialMode = targetProfile.requireRightsClearance
    ? "commercial"
    : "personal-preview";

  const bubbles = input.bubbles ?? [];
  const rightsReceipt = resolveExportRightsReceiptPayload(input.explicitRightsReceipt);

  const combinedAssets: PreflightAssetLicense[] = [
    ...(input.assets ?? []),
    ...extractRestrictedAssetsFromNotes(input.thirdPartyAttributionNotes),
  ];
  if (rightsReceipt.attached && !rightsReceipt.clearedForCommercialExport) {
    combinedAssets.push({
      assetId: "workflow-pack-rights-receipt",
      name: rightsReceipt.filename ?? "워크플로 팩 Rights BOM 영수증",
      licenseCode: "NON-COMMERCIAL",
    });
  }

  const targetSliceHeightPx = targetProfile.maxSegmentHeight ?? input.documentHeightPx;
  const gateReport = runCommercialPreflightGate({
    documentWidthPx: input.documentWidthPx,
    documentHeightPx: input.documentHeightPx,
    targetSliceHeightPx,
    exportMode,
    bubbles,
    assets: combinedAssets,
  });

  const extraIssues: PreflightIssue[] = [];
  if (
    targetProfile.exactWidth !== undefined &&
    input.documentWidthPx > 0 &&
    input.documentWidthPx !== targetProfile.exactWidth
  ) {
    extraIssues.push({
      id: `target:width-exact:${input.exportTarget}`,
      severity: "warning",
      category: "slice-safety",
      messageKo: `${targetProfile.labelKo} 권장 가로폭은 ${targetProfile.exactWidth}px입니다(현재 ${input.documentWidthPx}px).`,
    });
  } else if (
    targetProfile.maxWidth !== undefined &&
    input.documentWidthPx > targetProfile.maxWidth
  ) {
    extraIssues.push({
      id: `target:width-max:${input.exportTarget}`,
      severity: "blocker",
      category: "slice-safety",
      messageKo: `${targetProfile.labelKo} 최대 가로폭 ${targetProfile.maxWidth}px를 초과했습니다(현재 ${input.documentWidthPx}px).`,
    });
  }

  const allIssues: PreflightIssue[] = [...gateReport.issues, ...extraIssues];
  const legibilityWarnings = allIssues.filter((item) => item.category === "mobile-legibility").length;
  const rightsBlockers = allIssues.filter(
    (item) => item.category === "rights-bom" && item.severity === "blocker",
  ).length;
  const slicePlan = targetProfile.maxSegmentHeight
    ? computeSafeSliceYs(input.documentHeightPx, targetProfile.maxSegmentHeight, bubbles)
    : { sliceYs: [] as number[], adjustedCount: 0 };

  const mobileLegibility: UnifiedMobileLegibilitySummary =
    bubbles.length === 0
      ? {
          status: "unverified",
          checkedBubbleCount: 0,
          warningCount: 0,
          summaryKo: "말풍선 대사 정보가 연결되지 않아 375px 모바일 글자 크기는 직접 확인이 필요합니다.",
        }
      : legibilityWarnings > 0
        ? {
            status: "warning",
            checkedBubbleCount: bubbles.length,
            warningCount: legibilityWarnings,
            summaryKo: `375px 모바일 환산 시 권장(11px)보다 작은 대사 ${legibilityWarnings}곳이 있습니다.`,
          }
        : {
            status: "pass",
            checkedBubbleCount: bubbles.length,
            warningCount: 0,
            summaryKo: `375px 모바일 말풍선 가독성 기준 충족 (${bubbles.length}개 대사 확인).`,
          };

  const sliceCount = slicePlan.sliceYs.length + 1;
  const smartSlice: UnifiedSmartSliceSummary =
    !targetProfile.maxSegmentHeight || sliceCount <= 1
      ? {
          status: "single",
          sliceCount: 1,
          adjustedCount: 0,
          safeSliceYs: [],
          summaryKo: targetProfile.maxSegmentHeight
            ? `단일 이미지 출력 (분할 상한 ${targetProfile.maxSegmentHeight.toLocaleString("ko-KR")}px 이내).`
            : "단일 출력 규격 (세로 분할 불필요).",
        }
      : slicePlan.adjustedCount > 0
        ? {
            status: "adjusted",
            sliceCount,
            adjustedCount: slicePlan.adjustedCount,
            safeSliceYs: slicePlan.sliceYs,
            summaryKo: `대사 중간 절단 방지를 위해 ${slicePlan.adjustedCount}곳 경계를 여백으로 이동해 ${sliceCount}조각으로 안전 분할합니다.`,
          }
        : {
            status: "safe",
            sliceCount,
            adjustedCount: 0,
            safeSliceYs: slicePlan.sliceYs,
            summaryKo: `대사 침범 없이 ${sliceCount}조각 안전 분할 계획 완료.`,
          };

  const rightsBom: UnifiedRightsBomSummary =
    exportMode === "personal-preview"
      ? {
          status: "personal-only",
          blockerCount: 0,
          checkedAssetCount: combinedAssets.length,
          receiptAttached: rightsReceipt.attached,
          receiptFilename: rightsReceipt.filename,
          pngChunkKeyword: rightsReceipt.pngKeyword,
          summaryKo: "개인 백업 전용 모드입니다. 상업 연재 전에는 Rights BOM 라이선스를 다시 확인하세요.",
        }
      : rightsBlockers > 0
        ? {
            status: "blocked",
            blockerCount: rightsBlockers,
            checkedAssetCount: combinedAssets.length,
            receiptAttached: rightsReceipt.attached,
            receiptFilename: rightsReceipt.filename,
            pngChunkKeyword: rightsReceipt.pngKeyword,
            summaryKo: `상업 출고 불가 라이선스(NC·GPL 등) ${rightsBlockers}건이 감지되어 출고가 차단되었습니다.`,
          }
        : {
            status: "pass",
            blockerCount: 0,
            checkedAssetCount: combinedAssets.length,
            receiptAttached: rightsReceipt.attached,
            receiptFilename: rightsReceipt.filename,
            pngChunkKeyword: rightsReceipt.pngKeyword,
            summaryKo: rightsReceipt.attached
              ? `Rights BOM 영수증(${rightsReceipt.filename}) 포함 · 상업 라이선스 충돌 0건.`
              : combinedAssets.length > 0
                ? `점검 소재 ${combinedAssets.length}건 모두 상업 라이선스 기준을 충족합니다.`
                : "차단 대상 비상업·GPL 라이선스가 감지되지 않았습니다.",
          };

  const blockerCount = allIssues.filter((item) => item.severity === "blocker").length;
  const warningCount = allIssues.filter((item) => item.severity === "warning").length;

  return Object.freeze({
    exportTarget: input.exportTarget,
    targetProfile,
    publishProfile,
    exportMode,
    passed: blockerCount === 0,
    blockerCount,
    warningCount,
    gateReport,
    rightsReceipt,
    mobileLegibility,
    smartSlice,
    rightsBom,
    issues: Object.freeze(allIssues),
  });
}

/**
 * PNG 내보내기 바이트에 활성 Rights BOM 영수증 `tEXt` 청크를 무손실 삽입하고 복원 검증한다.
 */
export function embedRightsBomIntoPngBytes(
  pngBytes: Uint8Array,
  explicitAttachment?: WorkflowPackExportReceiptAttachment | null,
): {
  readonly bytes: Uint8Array;
  readonly embedded: boolean;
  readonly keyword: string | null;
  readonly extractedText: string | null;
} {
  const receipt = resolveExportRightsReceiptPayload(explicitAttachment);
  if (!receipt.attached || !receipt.pngKeyword || !receipt.pngText || !isValidPngBytes(pngBytes)) {
    return {
      bytes: pngBytes,
      embedded: false,
      keyword: receipt.pngKeyword,
      extractedText: null,
    };
  }
  const bytes = injectPngRightsTextChunk(pngBytes, receipt.pngKeyword, receipt.pngText);
  const extractedText = extractPngRightsTextChunk(bytes, receipt.pngKeyword);
  return {
    bytes,
    embedded: extractedText === receipt.pngText,
    keyword: receipt.pngKeyword,
    extractedText,
  };
}
