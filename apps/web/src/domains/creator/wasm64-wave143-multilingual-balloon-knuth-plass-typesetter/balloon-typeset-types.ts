/**
 * Wave 143 — 5개국어(한/일/영/불/스) 말풍선 마름모꼴 Knuth-Plass 줄바꿈·금칙문자 피팅 계약 타입.
 */

export type SupportedTypesetLocale = "ko-KR" | "ja-JP" | "en-US" | "fr-FR" | "es-ES";

export const ALL_SUPPORTED_TYPESET_LOCALES: readonly SupportedTypesetLocale[] = [
  "ko-KR",
  "ja-JP",
  "en-US",
  "fr-FR",
  "es-ES",
];

export const LOCALE_LABELS_KO: Readonly<Record<SupportedTypesetLocale, string>> = {
  "ko-KR": "한국어",
  "ja-JP": "일본어",
  "en-US": "영어",
  "fr-FR": "프랑스어",
  "es-ES": "스페인어",
};

export const LOCALE_SHORT_CODES: Readonly<Record<SupportedTypesetLocale, string>> = {
  "ko-KR": "KO",
  "ja-JP": "JA",
  "en-US": "EN",
  "fr-FR": "FR",
  "es-ES": "ES",
};

export type BalloonGeometryKind =
  | "ellipse-classic"
  | "rounded-rect-narration"
  | "shout-jagged-ellipse"
  | "cloud-thought";

export const BALLOON_GEOMETRY_LABELS_KO: Readonly<Record<BalloonGeometryKind, string>> = {
  "ellipse-classic": "기본 타원 말풍선",
  "rounded-rect-narration": "둥근 사각 내레이션 박스",
  "shout-jagged-ellipse": "톱니 외침 말풍선",
  "cloud-thought": "구름 속마음 말풍선",
};

export interface BalloonGeometrySpec {
  readonly kind: BalloonGeometryKind;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safePaddingPx?: number;
  readonly cornerRadiusPx?: number;
  readonly spikeDepthRatio?: number;
  readonly cloudLobeDepthRatio?: number;
}

export interface ResolvedBalloonGeometrySpec {
  readonly kind: BalloonGeometryKind;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safePaddingPx: number;
  readonly cornerRadiusPx: number;
  readonly spikeDepthRatio: number;
  readonly cloudLobeDepthRatio: number;
  readonly effectiveRx: number;
  readonly effectiveRy: number;
  readonly availableTextHeightPx: number;
}

export interface KinsokuRuleSet {
  readonly locale: SupportedTypesetLocale;
  readonly gyotoForbiddenChars: readonly string[];
  readonly gyomatsuForbiddenChars: readonly string[];
  readonly requiresPreHighPunctuationNbsp: boolean;
  readonly protectsInvertedSpanishOpeners: boolean;
  readonly defaultLineHeightRatio: number;
  readonly descriptionKo: string;
}

export interface TypesetToken {
  readonly text: string;
  readonly joinBefore: string;
  readonly locale: SupportedTypesetLocale;
  readonly isHardBreakAfter: boolean;
  readonly speakableCharCount: number;
  readonly isPunctuationOnly: boolean;
  readonly hyphenatedPiece: boolean;
}

export type TypesetViolationKind =
  | "line-start-kinsoku"
  | "line-end-kinsoku"
  | "horizontal-overflow"
  | "vertical-overflow"
  | "widow-last-line"
  | "french-nbsp-split"
  | "spanish-opener-split";

export interface TypesetViolation {
  readonly kind: TypesetViolationKind;
  readonly lineIndex: number;
  readonly textExcerpt: string;
  readonly detailKo: string;
  readonly excessPx: number;
}

export interface TypesetAuditLineInput {
  readonly lineIndex: number;
  readonly text: string;
  readonly widthPx: number;
  readonly availableChordWidthPx: number;
  readonly speakableCharCount?: number;
}

export interface TypesetAuditResult {
  readonly violations: readonly TypesetViolation[];
  readonly lineStartKinsokuCount: number;
  readonly lineEndKinsokuCount: number;
  readonly overflowLineCount: number;
  readonly horizontalOverflowCount: number;
  readonly verticalOverflowCount: number;
  readonly widowCount: number;
  readonly totalViolationCount: number;
  readonly maxOverflowPx: number;
  readonly isClean: boolean;
}

export interface TypesetLineLayout {
  readonly lineIndex: number;
  readonly text: string;
  readonly widthPx: number;
  readonly availableChordWidthPx: number;
  readonly targetDiamondWidthPx: number;
  readonly yOffsetPx: number;
  readonly fillRatio: number;
  readonly overflowPx: number;
  readonly tokenCount: number;
  readonly speakableCharCount: number;
}

export interface BalloonTypesetOptions {
  readonly fontSizePx?: number;
  readonly lineHeightRatio?: number;
  readonly letterSpacingEm?: number;
  readonly targetDiamondFillRatio?: number;
  readonly allowWordHyphenation?: boolean;
  readonly allowKoreanSyllableSplit?: boolean;
}

export interface ResolvedBalloonTypesetOptions {
  readonly fontSizePx: number;
  readonly lineHeightRatio: number;
  readonly letterSpacingEm: number;
  readonly targetDiamondFillRatio: number;
  readonly allowWordHyphenation: boolean;
  readonly allowKoreanSyllableSplit: boolean;
}

export interface BalloonFitOptions {
  readonly minFontSizePx?: number;
  readonly maxFontSizePx?: number;
  readonly preferredFontSizePx?: number;
  readonly fontStepPx?: number;
  readonly minLineHeightRatio?: number;
  readonly maxLineHeightRatio?: number;
  readonly letterSpacingEm?: number;
  readonly targetDiamondFillRatio?: number;
  readonly allowWordHyphenation?: boolean;
  readonly allowKoreanSyllableSplit?: boolean;
}

export interface ResolvedBalloonFitOptions {
  readonly minFontSizePx: number;
  readonly maxFontSizePx: number;
  readonly preferredFontSizePx: number;
  readonly fontStepPx: number;
  readonly minLineHeightRatio: number;
  readonly maxLineHeightRatio: number;
  readonly letterSpacingEm: number;
  readonly targetDiamondFillRatio: number;
  readonly allowWordHyphenation: boolean;
  readonly allowKoreanSyllableSplit: boolean;
}

export type BalloonTypesetAlgorithm = "greedy-baseline" | "diamond-knuth-plass";

export interface BalloonLayoutResult {
  readonly algorithm: BalloonTypesetAlgorithm;
  readonly locale: SupportedTypesetLocale;
  readonly geometry: ResolvedBalloonGeometrySpec;
  readonly fontSizePx: number;
  readonly lineHeightRatio: number;
  readonly lineHeightPx: number;
  readonly totalTextHeightPx: number;
  readonly availableTextHeightPx: number;
  readonly lines: readonly TypesetLineLayout[];
  readonly diamondFitScore: number;
  readonly symmetryScore: number;
  readonly averageFillRatio: number;
  readonly dpTotalCost: number;
  readonly audit: TypesetAuditResult;
}

export type BalloonFitStatus =
  | "optimal-fit"
  | "fitted-with-shrink"
  | "balloon-expansion-required";

export const BALLOON_FIT_STATUS_LABELS_KO: Readonly<Record<BalloonFitStatus, string>> = {
  "optimal-fit": "기준 폰트 최적 피팅",
  "fitted-with-shrink": "폰트 자동 축소 피팅",
  "balloon-expansion-required": "말풍선 확대 필요",
};

export interface BalloonAutoFitResult {
  readonly status: BalloonFitStatus;
  readonly layout: BalloonLayoutResult;
  readonly recommendedBalloonScale: number;
  readonly fontScaleAppliedRatio: number;
  readonly searchedCandidatesCount: number;
  readonly diagnosticsKo: string;
}

export interface GreedyVsDiamondComparison {
  readonly locale: SupportedTypesetLocale;
  readonly geometry: ResolvedBalloonGeometrySpec;
  readonly fontSizePx: number;
  readonly greedy: BalloonLayoutResult;
  readonly diamond: BalloonLayoutResult;
  readonly diamondFitScoreGain: number;
  readonly symmetryScoreGain: number;
  readonly overflowReductionCount: number;
  readonly kinsokuViolationReductionCount: number;
  readonly widowReductionCount: number;
  readonly totalViolationReductionCount: number;
  readonly summaryKo: string;
}

export interface MultilingualDialogueEntry {
  readonly balloonId: string;
  readonly panelId?: string;
  readonly speakerKo?: string;
  readonly geometry: BalloonGeometrySpec;
  readonly textsByLocale: Readonly<Partial<Record<SupportedTypesetLocale, string>>>;
  readonly fitOptions?: BalloonFitOptions;
}

export interface CompiledLocalizedBalloon {
  readonly balloonId: string;
  readonly panelId: string;
  readonly speakerKo: string;
  readonly locale: SupportedTypesetLocale;
  readonly sourceText: string;
  readonly fit: BalloonAutoFitResult;
  readonly comparison: GreedyVsDiamondComparison;
}

export interface LocaleBatchSummary {
  readonly locale: SupportedTypesetLocale;
  readonly balloonCount: number;
  readonly zeroOverflowCount: number;
  readonly zeroViolationCount: number;
  readonly expansionRequiredCount: number;
  readonly averageDiamondFitScore: number;
  readonly averageFontSizePx: number;
  readonly maxRecommendedBalloonScale: number;
}

export interface CompiledMultilingualBalloonBatch {
  readonly episodeTitleKo: string;
  readonly balloons: readonly CompiledLocalizedBalloon[];
  readonly localeSummaries: readonly LocaleBatchSummary[];
  readonly totalBalloonVariants: number;
  readonly totalOverflowCount: number;
  readonly totalKinsokuViolationCount: number;
  readonly totalWidowCount: number;
  readonly expansionRequiredCount: number;
  readonly averageDiamondFitScore: number;
  readonly averageGreedyDiamondFitScore: number;
  readonly averageDiamondScoreGain: number;
  readonly typesetManifestSha256Hex: string;
}

export interface BalloonTypesetAuditSvgOptions {
  readonly titleKo?: string;
  readonly widthPx?: number;
  readonly maxPreviewPairs?: number;
  readonly focusLocale?: SupportedTypesetLocale;
}
