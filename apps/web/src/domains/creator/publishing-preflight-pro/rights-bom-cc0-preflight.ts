/**
 * 5대 통합 출판 프리플라이트 프리셋 & Rights BOM 비상업/미확인 에셋 차단 + CC0 대체 추천 엔진 (#091–#094).
 *
 * - 5대 통합 프리셋: 네이버 · 카카오 · 글로벌 Webtoon · 인쇄 PDF(CMYK) · SNS 9:16 숏폼
 * - Rights BOM 감사: 비상업(`CC-BY-NC`/`EDITORIAL-ONLY`)·미확인(`UNKNOWN`/`verified: false`) 에셋을
 *   출판 차단(BLOCKED)으로 분류하고, 카테고리·태그 기반 검증 완료 CC0 대체 에셋을 결정론적으로 추천·일괄 치환한다.
 * - DOM·브라우저 스토리지 의존 없음(순수·결정적).
 */

import type {
  EpisodeCutInput,
  PreflightRightsBomAsset,
  PublishingPlatformId,
  RightsBomAssetCategory,
} from "./platform-publishing-specs";
import {
  planSmartCutSafeSlices,
  SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
  type SmartCutSafeSlicerPlan,
} from "./smart-cut-safe-slicer";

export type UnifiedPreflightPresetId =
  | "naver"
  | "kakao"
  | "global-webtoon"
  | "print-pdf-cmyk"
  | "sns-shortform-9-16";

export interface UnifiedPlatformPreflightPreset {
  readonly id: UnifiedPreflightPresetId;
  readonly labelKo: string;
  readonly category: "webtoon" | "print" | "shortform";
  readonly targetWidthPx: number;
  readonly targetHeightPx: number | null;
  readonly maxSliceHeightPx: number | null;
  readonly aspectRatio: string;
  readonly requiredColorSpace: "sRGB" | "CMYK";
  readonly iccProfile: string;
  readonly requiredDpi: number;
  readonly allowedFormats: readonly string[];
  readonly maxFileSizeMb: number;
  readonly maxTotalSizeMb: number;
  readonly bleedMm: number | null;
  readonly trimSpecKo: string | null;
  readonly maxInkCoveragePct: number | null;
  readonly safeHudBottomPx: number | null;
  readonly smartSliceTargetPx: number | null;
  readonly mappedLegacyPlatformId: PublishingPlatformId | null;
  readonly summaryKo: string;
}

export const FIVE_PLATFORM_PREFLIGHT_PRESETS: readonly UnifiedPlatformPreflightPreset[] =
  Object.freeze([
    Object.freeze({
      id: "naver",
      labelKo: "네이버 웹툰",
      category: "webtoon",
      targetWidthPx: 800,
      targetHeightPx: null,
      maxSliceHeightPx: 2000,
      aspectRatio: "800×가변 (스마트 1280px 분할)",
      requiredColorSpace: "sRGB",
      iccProfile: "sRGB IEC61966-2.1",
      requiredDpi: 72,
      allowedFormats: Object.freeze(["jpg", "png"]),
      maxFileSizeMb: 2,
      maxTotalSizeMb: 20,
      bleedMm: null,
      trimSpecKo: null,
      maxInkCoveragePct: null,
      safeHudBottomPx: null,
      smartSliceTargetPx: SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
      mappedLegacyPlatformId: "naver-webtoon",
      summaryKo: "폭 800px(690 허용) · sRGB 72DPI · 파일당 2MB / 총 20MB · 1,280px 컷-세이프 분할",
    }),
    Object.freeze({
      id: "kakao",
      labelKo: "카카오페이지",
      category: "webtoon",
      targetWidthPx: 720,
      targetHeightPx: null,
      maxSliceHeightPx: 2000,
      aspectRatio: "720×가변 (스마트 1280px 분할)",
      requiredColorSpace: "sRGB",
      iccProfile: "sRGB IEC61966-2.1",
      requiredDpi: 72,
      allowedFormats: Object.freeze(["jpg", "png"]),
      maxFileSizeMb: 3,
      maxTotalSizeMb: 30,
      bleedMm: null,
      trimSpecKo: null,
      maxInkCoveragePct: null,
      safeHudBottomPx: null,
      smartSliceTargetPx: SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
      mappedLegacyPlatformId: "kakaopage",
      summaryKo: "폭 720px 고정 · sRGB 72DPI · 파일당 3MB / 총 30MB · 1,280px 컷-세이프 분할",
    }),
    Object.freeze({
      id: "global-webtoon",
      labelKo: "글로벌 Webtoon",
      category: "webtoon",
      targetWidthPx: 800,
      targetHeightPx: null,
      maxSliceHeightPx: 1280,
      aspectRatio: "800×1280 슬라이스",
      requiredColorSpace: "sRGB",
      iccProfile: "sRGB IEC61966-2.1",
      requiredDpi: 72,
      allowedFormats: Object.freeze(["jpg", "png"]),
      maxFileSizeMb: 2,
      maxTotalSizeMb: 20,
      bleedMm: null,
      trimSpecKo: null,
      maxInkCoveragePct: null,
      safeHudBottomPx: null,
      smartSliceTargetPx: SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
      mappedLegacyPlatformId: "webtoon-global",
      summaryKo: "폭 800px · 1,280px 엄격 슬라이스 · sRGB 72DPI · 파일당 2MB / 총 20MB",
    }),
    Object.freeze({
      id: "print-pdf-cmyk",
      labelKo: "인쇄 PDF (CMYK)",
      category: "print",
      targetWidthPx: 1583,
      targetHeightPx: 2220,
      maxSliceHeightPx: null,
      aspectRatio: "B6 128×182mm + 재단 3mm",
      requiredColorSpace: "CMYK",
      iccProfile: "Japan Color 2001 Coated",
      requiredDpi: 300,
      allowedFormats: Object.freeze(["pdf", "psd"]),
      maxFileSizeMb: 120,
      maxTotalSizeMb: 500,
      bleedMm: 3,
      trimSpecKo: "B6 128×182mm · 재단 여백 3mm · 제본 여백 18mm",
      maxInkCoveragePct: 300,
      safeHudBottomPx: null,
      smartSliceTargetPx: null,
      mappedLegacyPlatformId: null,
      summaryKo: "CMYK(Japan Color 2001) · 300DPI 필수 · 총 잉크량 ≤300% · 재단 3mm 검증",
    }),
    Object.freeze({
      id: "sns-shortform-9-16",
      labelKo: "SNS 9:16 숏폼",
      category: "shortform",
      targetWidthPx: 1080,
      targetHeightPx: 1920,
      maxSliceHeightPx: 1920,
      aspectRatio: "9:16 (1080×1920)",
      requiredColorSpace: "sRGB",
      iccProfile: "Rec.709 / sRGB",
      requiredDpi: 72,
      allowedFormats: Object.freeze(["mp4", "jpg", "png"]),
      maxFileSizeMb: 50,
      maxTotalSizeMb: 150,
      bleedMm: null,
      trimSpecKo: null,
      maxInkCoveragePct: null,
      safeHudBottomPx: 280,
      smartSliceTargetPx: null,
      mappedLegacyPlatformId: null,
      summaryKo: "1080×1920 (9:16) · sRGB · 하단 280px UI 가림 안전 구역 · 30fps 60초 이내",
    }),
  ]);

export function getUnifiedPlatformPreflightPreset(
  presetId: UnifiedPreflightPresetId,
): UnifiedPlatformPreflightPreset {
  return (
    FIVE_PLATFORM_PREFLIGHT_PRESETS.find((p) => p.id === presetId) ??
    FIVE_PLATFORM_PREFLIGHT_PRESETS[0]!
  );
}

// ── Rights BOM 비상업/미확인 에셋 차단 & 대체 CC0 추천 매핑 ─────────────────

export interface Cc0ReplacementCatalogItem {
  readonly cc0AssetId: string;
  readonly nameKo: string;
  readonly category: RightsBomAssetCategory;
  readonly licenseCode: "CC0";
  readonly tags: readonly string[];
  readonly sourcePack: string;
  readonly commercialVerified: true;
  readonly attributionRequired: false;
}

export const CC0_REPLACEMENT_CATALOG: readonly Cc0ReplacementCatalogItem[] = Object.freeze([
  Object.freeze({
    cc0AssetId: "cc0-bg-night-alley",
    nameKo: "도심 밤 골목 3D 배경 (CC0 검증)",
    category: "3d-bg",
    licenseCode: "CC0",
    tags: Object.freeze(["alley", "night", "street", "urban", "city", "골목", "야경", "도심"]),
    sourcePack: "ToonStudio Core CC0 Backgrounds",
    commercialVerified: true,
    attributionRequired: false,
  }),
  Object.freeze({
    cc0AssetId: "cc0-bg-cafe-interior",
    nameKo: "실내 카페·서재 3D 배경 (CC0 검증)",
    category: "3d-bg",
    licenseCode: "CC0",
    tags: Object.freeze(["interior", "cafe", "room", "school", "indoor", "실내", "카페", "교실"]),
    sourcePack: "ToonStudio Core CC0 Backgrounds",
    commercialVerified: true,
    attributionRequired: false,
  }),
  Object.freeze({
    cc0AssetId: "cc0-brush-gpen-ink",
    nameKo: "클린룸 G펜·잉크 선화 브러시 세트 (CC0)",
    category: "brush",
    licenseCode: "CC0",
    tags: Object.freeze(["ink", "gpen", "lineart", "pen", "선화", "펜", "잉크"]),
    sourcePack: "ToonStudio Open Brush Kit",
    commercialVerified: true,
    attributionRequired: false,
  }),
  Object.freeze({
    cc0AssetId: "cc0-font-webtoon-gothic",
    nameKo: "오픈 웹툰 대사 고딕·명조 패키지 (CC0/OFL 호환)",
    category: "font",
    licenseCode: "CC0",
    tags: Object.freeze(["dialogue", "gothic", "handwriting", "korean", "대사", "고딕", "손글씨"]),
    sourcePack: "ToonStudio Safe Lettering Fonts",
    commercialVerified: true,
    attributionRequired: false,
  }),
  Object.freeze({
    cc0AssetId: "cc0-tex-halftone-paper",
    nameKo: "스크린톤·종이 질감 오버레이 팩 (CC0)",
    category: "texture",
    licenseCode: "CC0",
    tags: Object.freeze(["screentone", "halftone", "paper", "grain", "톤", "종이", "질감"]),
    sourcePack: "ToonStudio Print & Web Textures",
    commercialVerified: true,
    attributionRequired: false,
  }),
  Object.freeze({
    cc0AssetId: "cc0-sfx-impact-pack",
    nameKo: "웹툰 효과음 벡터·브러시 팩 (CC0)",
    category: "sfx",
    licenseCode: "CC0",
    tags: Object.freeze(["impact", "action", "sfx", "sound", "효과음", "타격"]),
    sourcePack: "ToonStudio Action SFX CC0",
    commercialVerified: true,
    attributionRequired: false,
  }),
  Object.freeze({
    cc0AssetId: "cc0-prop-everyday-kit",
    nameKo: "일상 소품·우편물 3D 프롭 팩 (CC0)",
    category: "prop",
    licenseCode: "CC0",
    tags: Object.freeze(["letter", "clock", "desk", "prop", "소품", "편지", "시계"]),
    sourcePack: "ToonStudio Everyday Props CC0",
    commercialVerified: true,
    attributionRequired: false,
  }),
]);

export interface RightsBomAssetAuditItem {
  readonly asset: PreflightRightsBomAsset;
  readonly status: "ALLOWED" | "BLOCKED";
  readonly blockReasonsKo: readonly string[];
  readonly recommendedCc0: Cc0ReplacementCatalogItem | null;
  readonly matchScore: number;
  readonly matchReasonKo: string | null;
}

export interface RightsBomPreflightAuditReport {
  readonly status: "READY" | "BLOCKED";
  readonly exportBlocked: boolean;
  readonly totalAssets: number;
  readonly allowedCount: number;
  readonly blockedCount: number;
  readonly blockingAssetIds: readonly string[];
  readonly items: readonly RightsBomAssetAuditItem[];
  readonly summaryKo: string;
}

export interface RightsBomSubstitutionRecord {
  readonly originalAssetId: string;
  readonly originalName: string;
  readonly originalLicense: PreflightRightsBomAsset["licenseCode"];
  readonly replacedByCc0Id: string;
  readonly replacedByNameKo: string;
  readonly category: RightsBomAssetCategory;
  readonly affectedCutIds: readonly string[];
}

export interface UnifiedFivePlatformPreflightResult {
  readonly preset: UnifiedPlatformPreflightPreset;
  readonly status: "READY" | "NEEDS_FIX" | "BLOCKED";
  readonly exportBlocked: boolean;
  readonly checkMessagesKo: readonly string[];
  readonly blockingReasonsKo: readonly string[];
  readonly rightsBomAudit: RightsBomPreflightAuditReport;
  readonly smartSlicePlan: SmartCutSafeSlicerPlan | null;
}

function isAssetBlocked(asset: PreflightRightsBomAsset): readonly string[] {
  const reasons: string[] = [];
  if (asset.licenseCode === "CC-BY-NC") {
    reasons.push("비상업 라이선스(CC-BY-NC) — 유료 연재·출판 사용 불가");
  } else if (asset.licenseCode === "EDITORIAL-ONLY") {
    reasons.push("보도/편집 전용(EDITORIAL-ONLY) — 상업 웹툰 납품 차단");
  } else if (asset.licenseCode === "UNKNOWN") {
    reasons.push("라이선스 출처 미확인(UNKNOWN) — 권리 증명 전 출고 차단");
  }
  if (!asset.commercialAllowed && reasons.length === 0) {
    reasons.push("상업적 이용 권한 미승인 에셋");
  }
  if (!asset.verified) {
    reasons.push("Rights BOM 라이선스 영수증 미검증 상태");
  }
  return Object.freeze(reasons);
}

/**
 * 차단된 Rights BOM 에셋에 가장 적합한 검증 완료 CC0 대체 에셋을 결정론적으로 추천한다.
 */
export function recommendCc0Replacement(asset: PreflightRightsBomAsset): {
  readonly item: Cc0ReplacementCatalogItem;
  readonly matchScore: number;
  readonly reasonKo: string;
} {
  const searchTokens = new Set(
    [
      asset.name.toLowerCase(),
      ...(asset.tags ?? []).map((t) => t.toLowerCase()),
    ]
      .join(" ")
      .split(/[\s,._\-/()]+/u)
      .filter((tok) => tok.length >= 2),
  );

  const sameCategory = CC0_REPLACEMENT_CATALOG.filter((item) => item.category === asset.category);
  const candidates = sameCategory.length > 0 ? sameCategory : CC0_REPLACEMENT_CATALOG;

  let bestItem = candidates[0]!;
  let bestScore = -1;
  let bestMatchedTags: string[] = [];

  for (const candidate of candidates) {
    const matchedTags = candidate.tags.filter((tag) => {
      const lower = tag.toLowerCase();
      if (searchTokens.has(lower)) return true;
      for (const token of searchTokens) {
        if (token.includes(lower) || lower.includes(token)) return true;
      }
      return false;
    });
    const score = (candidate.category === asset.category ? 60 : 20) + Math.min(40, matchedTags.length * 15);
    if (score > bestScore || (score === bestScore && candidate.cc0AssetId < bestItem.cc0AssetId)) {
      bestItem = candidate;
      bestScore = score;
      bestMatchedTags = [...matchedTags];
    }
  }

  const reasonKo =
    bestMatchedTags.length > 0
      ? `동일 카테고리(${asset.category}) + 키워드 일치(${bestMatchedTags.slice(0, 3).join(", ")}) 검증 CC0 대체`
      : `동일 카테고리(${asset.category}) 상업 검증 완료 CC0 표준 대체 에셋`;

  return { item: bestItem, matchScore: bestScore, reasonKo };
}

/**
 * 에피소드 Rights BOM 목록을 감사해 비상업/미확인 에셋 차단 및 대체 CC0 매핑 리포트를 반환한다.
 */
export function evaluateRightsBomForPreflight(
  assets: readonly PreflightRightsBomAsset[],
): RightsBomPreflightAuditReport {
  const items: RightsBomAssetAuditItem[] = assets.map((asset) => {
    const blockReasonsKo = isAssetBlocked(asset);
    if (blockReasonsKo.length === 0) {
      return Object.freeze({
        asset,
        status: "ALLOWED" as const,
        blockReasonsKo: Object.freeze([]),
        recommendedCc0: null,
        matchScore: 100,
        matchReasonKo: null,
      });
    }
    const rec = recommendCc0Replacement(asset);
    return Object.freeze({
      asset,
      status: "BLOCKED" as const,
      blockReasonsKo,
      recommendedCc0: rec.item,
      matchScore: rec.matchScore,
      matchReasonKo: rec.reasonKo,
    });
  });

  const blocked = items.filter((i) => i.status === "BLOCKED");
  const blockingAssetIds = blocked.map((i) => i.asset.assetId);
  const exportBlocked = blocked.length > 0;
  const summaryKo = exportBlocked
    ? `Rights BOM 출고 차단 · 비상업/미확인 에셋 ${blocked.length}건 감지 — 검증된 CC0 대체 에셋으로 교체하세요.`
    : `Rights BOM 통과 · 에셋 ${items.length}건 모두 상업 출판 라이선스 확인 완료`;

  return Object.freeze({
    status: exportBlocked ? "BLOCKED" : "READY",
    exportBlocked,
    totalAssets: items.length,
    allowedCount: items.length - blocked.length,
    blockedCount: blocked.length,
    blockingAssetIds: Object.freeze(blockingAssetIds),
    items: Object.freeze(items),
    summaryKo,
  });
}

/**
 * 차단된 Rights BOM 에셋을 추천 CC0 에셋으로 일괄 치환하고 치환 이력과 재감사 결과를 반환한다.
 */
export function applyCc0AssetSubstitutions(
  assets: readonly PreflightRightsBomAsset[],
  selectedReplacementByAssetId?: Readonly<Record<string, string>>,
): {
  readonly updatedAssets: readonly PreflightRightsBomAsset[];
  readonly substitutions: readonly RightsBomSubstitutionRecord[];
  readonly postAudit: RightsBomPreflightAuditReport;
} {
  const audit = evaluateRightsBomForPreflight(assets);
  const substitutions: RightsBomSubstitutionRecord[] = [];
  const updatedAssets: PreflightRightsBomAsset[] = audit.items.map((item) => {
    if (item.status === "ALLOWED") return item.asset;
    const overrideId = selectedReplacementByAssetId?.[item.asset.assetId];
    const replacement =
      (overrideId ? CC0_REPLACEMENT_CATALOG.find((c) => c.cc0AssetId === overrideId) : null) ??
      item.recommendedCc0 ??
      CC0_REPLACEMENT_CATALOG[0]!;

    substitutions.push(
      Object.freeze({
        originalAssetId: item.asset.assetId,
        originalName: item.asset.name,
        originalLicense: item.asset.licenseCode,
        replacedByCc0Id: replacement.cc0AssetId,
        replacedByNameKo: replacement.nameKo,
        category: replacement.category,
        affectedCutIds: Object.freeze([...item.asset.usedInCutIds]),
      }),
    );

    return Object.freeze({
      assetId: replacement.cc0AssetId,
      name: replacement.nameKo,
      category: replacement.category,
      licenseCode: "CC0" as const,
      commercialAllowed: true,
      verified: true,
      usedInCutIds: Object.freeze([...item.asset.usedInCutIds]),
      tags: replacement.tags,
      sourceOrigin: replacement.sourcePack,
    });
  });

  const postAudit = evaluateRightsBomForPreflight(updatedAssets);
  return Object.freeze({
    updatedAssets: Object.freeze(updatedAssets),
    substitutions: Object.freeze(substitutions),
    postAudit,
  });
}

/**
 * 5대 통합 플랫폼 프리셋(네이버·카카오·글로벌 Webtoon·인쇄 PDF CMYK·SNS 9:16 숏폼)에 대해
 * 규격 검사 + Rights BOM 차단 + 1,280px 스마트 컷-세이프 슬라이싱을 일괄 실행한다.
 */
export function runUnifiedFivePlatformPreflight(input: {
  readonly presetId: UnifiedPreflightPresetId;
  readonly cuts: readonly EpisodeCutInput[];
  readonly rightsBomAssets: readonly PreflightRightsBomAsset[];
}): UnifiedFivePlatformPreflightResult {
  const preset = getUnifiedPlatformPreflightPreset(input.presetId);
  const rightsBomAudit = evaluateRightsBomForPreflight(input.rightsBomAssets);
  const blockingReasonsKo: string[] = [];
  const checkMessagesKo: string[] = [];

  if (rightsBomAudit.exportBlocked) {
    blockingReasonsKo.push(
      `Rights BOM 비상업/미확인 에셋 ${rightsBomAudit.blockedCount}건 (${rightsBomAudit.blockingAssetIds.join(", ")})`,
    );
  } else {
    checkMessagesKo.push(`Rights BOM 에셋 ${rightsBomAudit.totalAssets}건 상업 라이선스 통과`);
  }

  let smartSlicePlan: SmartCutSafeSlicerPlan | null = null;
  if (preset.smartSliceTargetPx !== null) {
    smartSlicePlan = planSmartCutSafeSlices(input.cuts, {
      targetSliceHeightPx: preset.smartSliceTargetPx,
      maxSliceHeightPx: preset.smartSliceTargetPx,
      targetWidthPx: preset.targetWidthPx,
    });
    checkMessagesKo.push(
      `스마트 컷-세이프 ${preset.smartSliceTargetPx}px 분할 ${smartSlicePlan.totalSlices}장 (말풍선 회피 ${smartSlicePlan.balloonAvoidanceCount} · 눈높이 보호 ${smartSlicePlan.eyeLevelAvoidanceCount} · 거터 스냅 ${smartSlicePlan.gutterSnappedCount})`,
    );
  }

  if (preset.id === "print-pdf-cmyk") {
    const lowDpiCount = input.cuts.filter((c) => c.dpi < 300).length;
    const nonCmykCount = input.cuts.filter((c) => c.colorProfile !== "CMYK").length;
    if (lowDpiCount > 0) {
      checkMessagesKo.push(`300DPI 미만 컷 ${lowDpiCount}건 — 인쇄용 고해상도 업샘플/원본 링크 확인 필요`);
    }
    if (nonCmykCount > 0) {
      checkMessagesKo.push(`비CMYK 컷 ${nonCmykCount}건 — ${preset.iccProfile} 프로파일 자동 분판 변환 예정`);
    }
    checkMessagesKo.push(`재단 여백 ${preset.bleedMm}mm · 총 잉크량 ${preset.maxInkCoveragePct}% 이하 제한 적용`);
  } else if (preset.id === "sns-shortform-9-16") {
    const hudRiskCuts = input.cuts.filter((c) =>
      c.balloons.some((b) => (b.y + b.height) / Math.max(1, c.heightPx) > 0.78),
    ).length;
    checkMessagesKo.push(
      `9:16 (1080×1920) 하단 ${preset.safeHudBottomPx}px UI 안전 구역 점검 — 하단 대사 겹침 위험 ${hudRiskCuts}컷`,
    );
  }

  const needsFix =
    !rightsBomAudit.exportBlocked &&
    (preset.id === "print-pdf-cmyk"
      ? input.cuts.some((c) => c.dpi < 300 || c.colorProfile !== "CMYK")
      : input.cuts.some((c) => c.colorProfile !== preset.requiredColorSpace));

  const status: "READY" | "NEEDS_FIX" | "BLOCKED" =
    blockingReasonsKo.length > 0 ? "BLOCKED" : needsFix ? "NEEDS_FIX" : "READY";

  return Object.freeze({
    preset,
    status,
    exportBlocked: blockingReasonsKo.length > 0,
    checkMessagesKo: Object.freeze(checkMessagesKo),
    blockingReasonsKo: Object.freeze(blockingReasonsKo),
    rightsBomAudit,
    smartSlicePlan,
  });
}

export function createDefaultPreflightRightsBom(): readonly PreflightRightsBomAsset[] {
  return Object.freeze([
    Object.freeze({
      assetId: "asset-bg-01",
      name: "새벽 우편국 골목 3D 스케치업",
      category: "3d-bg",
      licenseCode: "CC-BY-NC",
      commercialAllowed: false,
      verified: true,
      usedInCutIds: Object.freeze(["cut-004", "cut-012", "cut-037"]),
      tags: Object.freeze(["alley", "night", "urban", "골목"]),
      sourceOrigin: "외부 무료 공유(비상업)",
    }),
    Object.freeze({
      assetId: "asset-tex-02",
      name: "미검증 빈티지 종이 스크린톤",
      category: "texture",
      licenseCode: "UNKNOWN",
      commercialAllowed: false,
      verified: false,
      usedInCutIds: Object.freeze(["cut-014", "cut-029"]),
      tags: Object.freeze(["screentone", "paper", "종이", "톤"]),
      sourceOrigin: "로컬 미분류 폴더",
    }),
    Object.freeze({
      assetId: "asset-brush-03",
      name: "클린룸 G펜 기본 세트",
      category: "brush",
      licenseCode: "CC0",
      commercialAllowed: true,
      verified: true,
      usedInCutIds: Object.freeze(["cut-001", "cut-012"]),
      tags: Object.freeze(["gpen", "ink"]),
      sourceOrigin: "ToonStudio Core",
    }),
    Object.freeze({
      assetId: "asset-font-04",
      name: "웹툰 대사체 상업 라이선스",
      category: "font",
      licenseCode: "COMMERCIAL-PERPETUAL",
      commercialAllowed: true,
      verified: true,
      usedInCutIds: Object.freeze(["cut-001", "cut-004", "cut-014"]),
      tags: Object.freeze(["dialogue", "gothic"]),
      sourceOrigin: "영구 상업 라이선스 등록",
    }),
  ]);
}
