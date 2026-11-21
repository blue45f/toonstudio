/**
 * AD 5종 자동 레귤레이션 검수 엔진 + 비동기 레드라인 스트로크 · 음성 핀 · v1↔v2 블링크/와이프 비교 모델 (T-004, T-005).
 */

import type { LayerFolderId } from "./layer-authority-rbac";

export interface OklchColor {
  /** 명도 0..1 */
  readonly l: number;
  /** 채도 0..0.4 */
  readonly c: number;
  /** 색상각 0..360 deg */
  readonly h: number;
}

export type QaCheckId =
  | "oklch_color_chip"
  | "line_weight_cv"
  | "color_script_mood"
  | "mobile_375_readability"
  | "rights_bom_license";

export type QaSeverity = "pass" | "warn" | "fail";

export interface ArtBibleColorChipSample {
  readonly chipId: string;
  readonly characterNameKo: string;
  readonly characterNameEn: string;
  readonly partLabelKo: string;
  readonly partLabelEn: string;
  readonly targetOklch: OklchColor;
  readonly sampledOklch: OklchColor;
}

export interface ColorScriptMoodSample {
  readonly sceneId: string;
  readonly targetMood: OklchColor;
  readonly actualMood: OklchColor;
}

export interface MobileCutReadabilitySample {
  readonly cutIndex: number;
  readonly manuscriptWidthPx: number;
  readonly cutHeightPx: number;
  readonly smallestFontPx: number;
}

export interface RightsBomAssetEntry {
  readonly assetId: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly kind: "bg3d" | "brush" | "font" | "texture" | "vrm";
  readonly licenseCode: string;
}

export interface AdRegulationQaInput {
  readonly episodeId: string;
  readonly colorChips: readonly ArtBibleColorChipSample[];
  readonly strokeWidthsPx: readonly number[];
  readonly colorScriptMood: ColorScriptMoodSample;
  readonly mobileCuts: readonly MobileCutReadabilitySample[];
  readonly rightsBomAssets: readonly RightsBomAssetEntry[];
}

export interface AdQaCheckResult {
  readonly id: QaCheckId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly severity: QaSeverity;
  readonly metricLabel: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface AdRegulationQaReport {
  readonly episodeId: string;
  readonly overallSeverity: QaSeverity;
  readonly passCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly checks: readonly AdQaCheckResult[];
  readonly maxDeltaE: number;
  readonly lineWeightCv: number;
  readonly blockedRightsAssetIds: readonly string[];
}

export interface RedlineStrokePoint {
  readonly x: number;
  readonly y: number;
}

export interface RedlineStroke {
  readonly id: string;
  readonly cutIndex: number;
  readonly authorId: string;
  readonly layerFolder: LayerFolderId;
  readonly colorToken: "bad" | "warn" | "accent" | "cool";
  readonly widthPx: number;
  readonly points: readonly RedlineStrokePoint[];
  readonly createdAtIso: string;
}

export interface AdVoicePin {
  readonly id: string;
  readonly cutIndex: number;
  readonly xPercent: number;
  readonly yPercent: number;
  readonly authorId: string;
  readonly authorName: string;
  readonly durationSec: number;
  readonly transcriptKo: string;
  readonly transcriptEn: string;
  readonly severity: "blocker" | "polish";
  readonly status: "open" | "resolved";
  readonly createdAtIso: string;
}

export type CompareViewMode = "wipe" | "blink";

export interface VersionCompareState {
  readonly mode: CompareViewMode;
  readonly wipePercent: number;
  readonly activeBlinkVersion: "v1" | "v2";
  readonly blinkIntervalMs: number;
  readonly leftVersionLabel: string;
  readonly rightVersionLabel: string;
}

export interface AdRedlineReviewSession {
  readonly episodeId: string;
  readonly activeCutIndex: number;
  readonly strokes: readonly RedlineStroke[];
  readonly voicePins: readonly AdVoicePin[];
  readonly compare: VersionCompareState;
}

const BLOCKED_LICENSE_PATTERNS: readonly RegExp[] = [
  /(?:^|[-_\s])NC(?:$|[-_\s])/iu,
  /NON[-_\s]?COMMERCIAL/iu,
  /(?:^|[-_\s])A?GPL(?:[-_\s0-9.]|$)/iu,
  /UNVERIFIED/iu,
];

/** OKLCH → OKLab 유클리드 색차 ΔE (100배 JND 스케일) */
export function computeOklchDeltaE(left: OklchColor, right: OklchColor): number {
  const radL = (left.h * Math.PI) / 180;
  const radR = (right.h * Math.PI) / 180;
  const a1 = left.c * Math.cos(radL);
  const b1 = left.c * Math.sin(radL);
  const a2 = right.c * Math.cos(radR);
  const b2 = right.c * Math.sin(radR);
  const dl = left.l - right.l;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.round(Math.sqrt(dl * dl + da * da + db * db) * 10000) / 100;
}

export function formatOklchCss(color: OklchColor): string {
  const lPct = Math.round(Math.max(0, Math.min(1, color.l)) * 1000) / 10;
  const cVal = Math.round(Math.max(0, Math.min(0.4, color.c)) * 1000) / 1000;
  const hVal = Math.round(((color.h % 360) + 360) % 360);
  return `oklch(${lPct}% ${cVal} ${hVal})`;
}

function circularHueDistance(h1: number, h2: number): number {
  const diff = Math.abs((((h1 - h2) % 360) + 360) % 360);
  return Math.min(diff, 360 - diff);
}

function isCommercialBlockedLicense(licenseCode: string): boolean {
  const normalized = licenseCode.trim();
  if (!normalized) return true;
  return BLOCKED_LICENSE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** AD 5종 자동 레귤레이션 검수 실행 (T-004) */
export function runAdRegulationQaSuite(input: AdRegulationQaInput): AdRegulationQaReport {
  // 1) 아트바이블 OKLCH ΔE 컬러 칩 일탈 감지
  let maxDeltaE = 0;
  let worstChip: ArtBibleColorChipSample | null = null;
  for (const chip of input.colorChips) {
    const deltaE = computeOklchDeltaE(chip.targetOklch, chip.sampledOklch);
    if (deltaE >= maxDeltaE) {
      maxDeltaE = deltaE;
      worstChip = chip;
    }
  }
  const colorChipSeverity: QaSeverity = maxDeltaE > 7.5 ? "fail" : maxDeltaE > 4.0 ? "warn" : "pass";
  const colorChipCheck: AdQaCheckResult = {
    id: "oklch_color_chip",
    titleKo: "아트바이블 OKLCH ΔE 컬러 칩",
    titleEn: "Art Bible OKLCH ΔE Color Chips",
    severity: colorChipSeverity,
    metricLabel: `max ΔE ${maxDeltaE.toFixed(2)}`,
    detailKo: worstChip
      ? `${worstChip.characterNameKo} ${worstChip.partLabelKo} 최대 편차 ΔE ${maxDeltaE.toFixed(2)} (기준 ≤ 4.0 PASS, > 7.5 차단)`
      : "검사할 컬러 칩이 없습니다.",
    detailEn: worstChip
      ? `${worstChip.characterNameEn} ${worstChip.partLabelEn} max ΔE ${maxDeltaE.toFixed(2)} (PASS ≤ 4.0, FAIL > 7.5).`
      : "No color chips provided.",
  };

  // 2) 선폭 변동계수 (CV = σ / μ)
  const validWidths = input.strokeWidthsPx.filter((width) => width > 0);
  const meanWidth =
    validWidths.length > 0
      ? validWidths.reduce((sum, value) => sum + value, 0) / validWidths.length
      : 0;
  const variance =
    validWidths.length > 0
      ? validWidths.reduce((sum, value) => sum + (value - meanWidth) ** 2, 0) / validWidths.length
      : 0;
  const lineWeightCv =
    meanWidth > 0 ? Math.round((Math.sqrt(variance) / meanWidth) * 1000) / 1000 : 0;
  const lineCvSeverity: QaSeverity =
    lineWeightCv > 0.28 ? "fail" : lineWeightCv > 0.18 ? "warn" : "pass";
  const lineWeightCheck: AdQaCheckResult = {
    id: "line_weight_cv",
    titleKo: "선폭 일관성 (변동계수 CV)",
    titleEn: "Line Weight Consistency (CV)",
    severity: lineCvSeverity,
    metricLabel: `CV ${lineWeightCv.toFixed(3)} · μ ${meanWidth.toFixed(2)}px`,
    detailKo: `평균 선폭 ${meanWidth.toFixed(2)}px, 변동계수 ${lineWeightCv.toFixed(3)} (기준 ≤ 0.18 PASS, > 0.28 리테이크)`,
    detailEn: `Mean ${meanWidth.toFixed(2)}px, CV ${lineWeightCv.toFixed(3)} (PASS ≤ 0.18, FAIL > 0.28).`,
  };

  // 3) 컬러스크립트 무드 편차
  const moodDeltaL = Math.abs(
    input.colorScriptMood.targetMood.l - input.colorScriptMood.actualMood.l,
  );
  const moodDeltaH = circularHueDistance(
    input.colorScriptMood.targetMood.h,
    input.colorScriptMood.actualMood.h,
  );
  const moodSeverity: QaSeverity =
    moodDeltaL > 0.14 || moodDeltaH > 26
      ? "fail"
      : moodDeltaL > 0.08 || moodDeltaH > 14
        ? "warn"
        : "pass";
  const colorScriptCheck: AdQaCheckResult = {
    id: "color_script_mood",
    titleKo: "컬러스크립트 씬 무드 편차",
    titleEn: "Color Script Scene Mood Drift",
    severity: moodSeverity,
    metricLabel: `ΔL ${(moodDeltaL * 100).toFixed(1)}% · ΔH ${moodDeltaH.toFixed(0)}°`,
    detailKo: `${input.colorScriptMood.sceneId} 명도 편차 ${(moodDeltaL * 100).toFixed(1)}%, 색상각 편차 ${moodDeltaH.toFixed(0)}°`,
    detailEn: `${input.colorScriptMood.sceneId} lightness drift ${(moodDeltaL * 100).toFixed(1)}%, hue drift ${moodDeltaH.toFixed(0)}°.`,
  };

  // 4) 모바일 375px 가독성 & 컷 세로 길이
  let minEffectiveFontPx = Number.POSITIVE_INFINITY;
  let maxCutHeightPx = 0;
  let readabilityFailCuts = 0;
  let readabilityWarnCuts = 0;
  for (const cut of input.mobileCuts) {
    const scale = cut.manuscriptWidthPx > 0 ? 375 / cut.manuscriptWidthPx : 1;
    const effectiveFont = cut.smallestFontPx * scale;
    if (effectiveFont < minEffectiveFontPx) minEffectiveFontPx = effectiveFont;
    if (cut.cutHeightPx > maxCutHeightPx) maxCutHeightPx = cut.cutHeightPx;
    if (effectiveFont < 11.5 || cut.cutHeightPx > 2800) {
      readabilityFailCuts += 1;
    } else if (effectiveFont < 13 || cut.cutHeightPx > 2200 || cut.cutHeightPx < 480) {
      readabilityWarnCuts += 1;
    }
  }
  const safeMinFont = Number.isFinite(minEffectiveFontPx) ? minEffectiveFontPx : 0;
  const mobileSeverity: QaSeverity =
    readabilityFailCuts > 0 ? "fail" : readabilityWarnCuts > 0 ? "warn" : "pass";
  const mobileCheck: AdQaCheckResult = {
    id: "mobile_375_readability",
    titleKo: "모바일 375px 식자 가독성·컷 길이",
    titleEn: "Mobile 375px Readability & Cut Height",
    severity: mobileSeverity,
    metricLabel: `min ${safeMinFont.toFixed(1)}px · max ${maxCutHeightPx}px`,
    detailKo:
      readabilityFailCuts > 0
        ? `375px 축소 기준 11.5px 미만 대사 또는 2,800px 초과 컷 ${readabilityFailCuts}건 감지`
        : `375px 축소 최소 폰트 ${safeMinFont.toFixed(1)}px, 최대 컷 높이 ${maxCutHeightPx}px 적정`,
    detailEn:
      readabilityFailCuts > 0
        ? `${readabilityFailCuts} cut(s) below 11.5px effective mobile type or exceeding 2,800px height.`
        : `Minimum 375px effective type ${safeMinFont.toFixed(1)}px, max cut height ${maxCutHeightPx}px.`,
  };

  // 5) Rights BOM NC/GPL 상업 차단
  const blockedAssets = input.rightsBomAssets.filter((asset) =>
    isCommercialBlockedLicense(asset.licenseCode),
  );
  const rightsSeverity: QaSeverity = blockedAssets.length > 0 ? "fail" : "pass";
  const rightsCheck: AdQaCheckResult = {
    id: "rights_bom_license",
    titleKo: "Rights BOM 상업 라이선스 게이트",
    titleEn: "Rights BOM Commercial License Gate",
    severity: rightsSeverity,
    metricLabel:
      blockedAssets.length > 0
        ? `${blockedAssets.length} blocked`
        : `${input.rightsBomAssets.length}/${input.rightsBomAssets.length} OK`,
    detailKo:
      blockedAssets.length > 0
        ? `상업 연재 불가 라이선스 감지: ${blockedAssets.map((a) => `${a.nameKo}(${a.licenseCode})`).join(", ")}`
        : `등록된 에셋 ${input.rightsBomAssets.length}종 모두 상업 연재 허용 라이선스 확인`,
    detailEn:
      blockedAssets.length > 0
        ? `Blocked non-commercial/copyleft asset(s): ${blockedAssets.map((a) => `${a.nameEn} (${a.licenseCode})`).join(", ")}`
        : `All ${input.rightsBomAssets.length} BOM assets cleared for commercial serialization.`,
  };

  const checks: readonly AdQaCheckResult[] = [
    colorChipCheck,
    lineWeightCheck,
    colorScriptCheck,
    mobileCheck,
    rightsCheck,
  ];

  const passCount = checks.filter((item) => item.severity === "pass").length;
  const warnCount = checks.filter((item) => item.severity === "warn").length;
  const failCount = checks.filter((item) => item.severity === "fail").length;
  const overallSeverity: QaSeverity =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  return {
    episodeId: input.episodeId,
    overallSeverity,
    passCount,
    warnCount,
    failCount,
    checks,
    maxDeltaE,
    lineWeightCv,
    blockedRightsAssetIds: blockedAssets.map((asset) => asset.assetId),
  };
}

export function createSampleAdQaInput(episodeId: string): AdRegulationQaInput {
  return {
    episodeId,
    colorChips: [
      {
        chipId: "chip-hero-coat",
        characterNameKo: "주인공 해원",
        characterNameEn: "Haewon (Lead)",
        partLabelKo: "네이비 코트",
        partLabelEn: "Navy Coat",
        targetOklch: { l: 0.34, c: 0.085, h: 258 },
        sampledOklch: { l: 0.355, c: 0.09, h: 261 },
      },
      {
        chipId: "chip-hero-skin",
        characterNameKo: "주인공 해원",
        characterNameEn: "Haewon (Lead)",
        partLabelKo: "피부 기본톤",
        partLabelEn: "Skin Base",
        targetOklch: { l: 0.84, c: 0.055, h: 56 },
        sampledOklch: { l: 0.825, c: 0.062, h: 52 },
      },
      {
        chipId: "chip-rival-hair",
        characterNameKo: "감찰관 서진",
        characterNameEn: "Inspector Seojin",
        partLabelKo: "버건디 헤어",
        partLabelEn: "Burgundy Hair",
        targetOklch: { l: 0.42, c: 0.14, h: 18 },
        sampledOklch: { l: 0.48, c: 0.165, h: 32 },
      },
    ],
    strokeWidthsPx: [2.4, 2.5, 2.3, 2.6, 2.4, 2.5, 2.7, 2.4],
    colorScriptMood: {
      sceneId: "S03 · 지붕 추격전",
      targetMood: { l: 0.38, c: 0.11, h: 252 },
      actualMood: { l: 0.41, c: 0.12, h: 261 },
    },
    mobileCuts: [
      { cutIndex: 14, manuscriptWidthPx: 800, cutHeightPx: 1420, smallestFontPx: 30 },
      { cutIndex: 28, manuscriptWidthPx: 800, cutHeightPx: 1680, smallestFontPx: 29 },
      { cutIndex: 52, manuscriptWidthPx: 800, cutHeightPx: 1940, smallestFontPx: 28 },
    ],
    rightsBomAssets: [
      {
        assetId: "bom-bg-postoffice",
        nameKo: "우편국 3D 외관 세트",
        nameEn: "Post Office 3D Exterior",
        kind: "bg3d",
        licenseCode: "CC0-1.0",
      },
      {
        assetId: "bom-font-dialog",
        nameKo: "상업 연재 전용 명조 식자",
        nameEn: "Commercial Webtoon Serif",
        kind: "font",
        licenseCode: "OFL-1.1",
      },
      {
        assetId: "bom-brush-rain",
        nameKo: "외부 빗줄기 이펙트 브러시",
        nameEn: "External Rain FX Brush",
        kind: "brush",
        licenseCode: "CC-BY-NC-4.0",
      },
    ],
  };
}

export function createRedlineReviewSession(episodeId: string): AdRedlineReviewSession {
  return {
    episodeId,
    activeCutIndex: 52,
    strokes: [
      {
        id: "rl-stroke-1",
        cutIndex: 52,
        authorId: "m-ad-1",
        layerFolder: "99_AD_REDLINE",
        colorToken: "bad",
        widthPx: 3,
        points: [
          { x: 0.24, y: 0.31 },
          { x: 0.36, y: 0.35 },
          { x: 0.41, y: 0.46 },
        ],
        createdAtIso: "2026-11-21T10:15:00.000Z",
      },
    ],
    voicePins: [
      {
        id: "vp-1",
        cutIndex: 52,
        xPercent: 38,
        yPercent: 42,
        authorId: "m-ad-1",
        authorName: "김도영 AD",
        durationSec: 18,
        transcriptKo: "서진 헤어 채도를 아트바이블 칩 기준으로 12% 낮추고 림라이트만 살려주세요.",
        transcriptEn: "Lower Seojin's hair chroma by 12% to match the Art Bible chip and preserve rim light.",
        severity: "blocker",
        status: "open",
        createdAtIso: "2026-11-21T10:16:00.000Z",
      },
    ],
    compare: {
      mode: "wipe",
      wipePercent: 52,
      activeBlinkVersion: "v2",
      blinkIntervalMs: 700,
      leftVersionLabel: "v1 · 초안 제출",
      rightVersionLabel: "v2 · 리테이크 반영",
    },
  };
}

export function addRedlineStroke(
  session: AdRedlineReviewSession,
  stroke: Omit<RedlineStroke, "layerFolder">,
): AdRedlineReviewSession {
  return {
    ...session,
    strokes: [
      ...session.strokes,
      {
        ...stroke,
        layerFolder: "99_AD_REDLINE",
      },
    ],
  };
}

export function addVoicePin(
  session: AdRedlineReviewSession,
  pin: AdVoicePin,
): AdRedlineReviewSession {
  return {
    ...session,
    voicePins: [...session.voicePins, pin],
  };
}

export function resolveVoicePin(
  session: AdRedlineReviewSession,
  pinId: string,
): AdRedlineReviewSession {
  return {
    ...session,
    voicePins: session.voicePins.map((pin) =>
      pin.id === pinId ? { ...pin, status: "resolved" } : pin,
    ),
  };
}

export function toggleCompareMode(
  session: AdRedlineReviewSession,
  mode: CompareViewMode,
): AdRedlineReviewSession {
  return {
    ...session,
    compare: {
      ...session.compare,
      mode,
    },
  };
}

export function stepBlinkVersion(session: AdRedlineReviewSession): AdRedlineReviewSession {
  return {
    ...session,
    compare: {
      ...session.compare,
      activeBlinkVersion: session.compare.activeBlinkVersion === "v1" ? "v2" : "v1",
    },
  };
}

export function setWipePercent(
  session: AdRedlineReviewSession,
  wipePercent: number,
): AdRedlineReviewSession {
  return {
    ...session,
    compare: {
      ...session.compare,
      wipePercent: Math.max(0, Math.min(100, Math.round(wipePercent))),
    },
  };
}

export function canApproveAfterAdReview(
  qaReport: AdRegulationQaReport,
  session: AdRedlineReviewSession,
): { readonly allowed: boolean; readonly openBlockerPins: number; readonly qaFailCount: number } {
  const openBlockerPins = session.voicePins.filter(
    (pin) => pin.severity === "blocker" && pin.status === "open",
  ).length;
  return {
    allowed: qaReport.failCount === 0 && openBlockerPins === 0,
    openBlockerPins,
    qaFailCount: qaReport.failCount,
  };
}
