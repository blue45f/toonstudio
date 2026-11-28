/**
 * Wave 142 — 양면 뷰어 시인성 감사 및 비파괴 자동 교정 공유 타입·기본 임계치 정의.
 */

import type { SrgbColor, SrgbaColor, ViewerThemeId, ViewerThemeProfile } from "./viewer-contrast-and-apca-math";

export type EpisodeElementKind =
  | "sfx-ink"
  | "caption-text"
  | "panel-border"
  | "balloon-tail"
  | "balloon-text"
  | "character-contour";

export type ElementBackdropMode =
  | "transparent-margin"
  | "opaque-panel"
  | "balloon-fill";

export type DualThemeDefectCode =
  | "dark-mode-ink-vanish"
  | "light-mode-highlight-vanish"
  | "oled-black-crush-shadow"
  | "luminance-shock-transition"
  | "balloon-text-contrast-fail";

export type RemediationStrategyKind =
  | "stroke-halo"
  | "backing-plate"
  | "rim-light-halo"
  | "plate-with-contrast-glaze";

export interface ElementHaloSpec {
  readonly widthPx: number;
  readonly color: SrgbaColor;
  readonly oklchCss?: string;
}

export interface ElementPlateSpec {
  readonly paddingPx: number;
  readonly color: SrgbaColor;
  readonly oklchCss?: string;
}

export interface ElementContrastGlazeSpec {
  readonly mode: "darken-ink" | "lighten-ink";
  readonly color: SrgbaColor;
  readonly oklchCss: string;
}

export interface NormalizedElementBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AuditedVisualElement {
  readonly id: string;
  readonly labelKo: string;
  readonly kind: EpisodeElementKind;
  readonly backdropMode: ElementBackdropMode;
  readonly foreground: SrgbaColor;
  readonly localBackdrop?: SrgbColor;
  readonly existingHalo?: ElementHaloSpec;
  readonly existingPlate?: ElementPlateSpec;
  readonly existingGlaze?: ElementContrastGlazeSpec;
  readonly strokeWidthPx?: number;
  readonly fontSizePx?: number;
  readonly normalizedBox?: NormalizedElementBox;
}

export interface AppliedGutterRamp {
  readonly heightPx: number;
  readonly steps: number;
  readonly maxStepDeltaLuma: number;
  readonly gradientStopsOklch: readonly string[];
}

export interface AuditedEpisodeCut {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly labelKo: string;
  readonly meanLuma: number;
  readonly peakLuma?: number;
  readonly shadowFloorLuma?: number;
  readonly cutBaseColor?: SrgbColor;
  readonly gutterBeforePx: number;
  readonly gutterTransparent?: boolean;
  readonly appliedGutterRamp?: AppliedGutterRamp;
  readonly elements: readonly AuditedVisualElement[];
}

export interface EpisodeDualThemeInput {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly cuts: readonly AuditedEpisodeCut[];
}

export interface DualThemeAuditConfig {
  readonly transparentMinWcag: number;
  readonly transparentMinApcaAbsLc: number;
  readonly balloonTextMinWcag: number;
  readonly balloonTextMinApcaAbsLc: number;
  readonly oledBlackCrushMaxLuminance: number;
  readonly oledBlackCrushMinWcag: number;
  readonly oledBlackCrushMinApcaAbsLc: number;
  readonly luminanceShockDarkMaxLuma: number;
  readonly luminanceShockBrightMinLuma: number;
  readonly luminanceShockMinDeltaLuma: number;
  readonly safeRampMinHeightPx: number;
  readonly safeRampMinSteps: number;
  readonly safeRampMaxStepDeltaLuma: number;
}

export const DEFAULT_DUAL_THEME_AUDIT_CONFIG: DualThemeAuditConfig = {
  transparentMinWcag: 3.0,
  transparentMinApcaAbsLc: 45,
  balloonTextMinWcag: 4.5,
  balloonTextMinApcaAbsLc: 60,
  oledBlackCrushMaxLuminance: 0.015,
  oledBlackCrushMinWcag: 3.0,
  oledBlackCrushMinApcaAbsLc: 45,
  luminanceShockDarkMaxLuma: 0.08,
  luminanceShockBrightMinLuma: 0.85,
  luminanceShockMinDeltaLuma: 0.72,
  safeRampMinHeightPx: 240,
  safeRampMinSteps: 4,
  safeRampMaxStepDeltaLuma: 0.24,
};

export interface ElementThemeEvaluation {
  readonly themeId: ViewerThemeId;
  readonly wcagRatio: number;
  readonly apcaLc: number;
  readonly apcaAbsLc: number;
  readonly oklabDeltaE: number;
  readonly effectiveForegroundLuminance: number;
  readonly effectiveBackgroundLuminance: number;
  readonly passed: boolean;
  readonly usedHaloAssist: boolean;
  readonly usedPlateAssist: boolean;
}

export interface ElementAuditSummary {
  readonly cutId: string;
  readonly elementId: string;
  readonly labelKo: string;
  readonly kind: EpisodeElementKind;
  readonly backdropMode: ElementBackdropMode;
  readonly perTheme: Readonly<Record<ViewerThemeId, ElementThemeEvaluation>>;
  readonly worstWcagRatio: number;
  readonly worstApcaAbsLc: number;
  readonly passedAllThemes: boolean;
}

export interface CutLuminanceTransition {
  readonly fromCutId: string;
  readonly toCutId: string;
  readonly fromMeanLuma: number;
  readonly toMeanLuma: number;
  readonly deltaLuma: number;
  readonly gutterBeforePx: number;
  readonly shockIndex: number;
  readonly isLuminanceShock: boolean;
  readonly hasSafeRampGutter: boolean;
}

export interface DualThemeDefect {
  readonly id: string;
  readonly code: DualThemeDefectCode;
  readonly severity: "critical" | "warning";
  readonly cutId: string;
  readonly elementId?: string;
  readonly affectedThemes: readonly ViewerThemeId[];
  readonly measuredWcag?: number;
  readonly measuredApcaLc?: number;
  readonly measuredDeltaLuma?: number;
  readonly reasonKo: string;
  readonly recommendationKo: string;
}

export interface ThemeReadinessSummary {
  readonly themeId: ViewerThemeId;
  readonly labelKo: string;
  readonly passedElementCount: number;
  readonly failedElementCount: number;
  readonly shockCount: number;
  readonly readinessScore: number;
}

export interface DualThemeAuditReport {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly config: DualThemeAuditConfig;
  readonly auditedThemes: readonly ViewerThemeProfile[];
  readonly elementAudits: readonly ElementAuditSummary[];
  readonly cutTransitions: readonly CutLuminanceTransition[];
  readonly defects: readonly DualThemeDefect[];
  readonly countsByCode: Readonly<Record<DualThemeDefectCode, number>>;
  readonly themeSummaries: readonly ThemeReadinessSummary[];
  readonly overallReadinessScore: number;
  readonly allFourThemesPassed: boolean;
  readonly dualThemeAuditSha256Hex: string;
}

export interface ElementRemediationPatch {
  readonly cutId: string;
  readonly elementId: string;
  readonly elementLabelKo: string;
  readonly strategy: RemediationStrategyKind;
  readonly triggeredByCodes: readonly DualThemeDefectCode[];
  readonly haloWidthPx?: number;
  readonly haloColorOklch?: string;
  readonly haloColorSrgba?: SrgbaColor;
  readonly platePaddingPx?: number;
  readonly plateColorOklch?: string;
  readonly plateColorSrgba?: SrgbaColor;
  readonly glazeColorOklch?: string;
  readonly nonDestructiveLayerNameKo: string;
  readonly rationaleKo: string;
}

export interface GutterRampPatch {
  readonly fromCutId: string;
  readonly toCutId: string;
  readonly originalGutterPx: number;
  readonly recommendedGutterHeightPx: number;
  readonly stepCount: number;
  readonly maxStepDeltaLuma: number;
  readonly gradientStopsOklch: readonly string[];
  readonly rationaleKo: string;
}

export interface RemediationVerificationSummary {
  readonly beforeDefectCount: number;
  readonly afterDefectCount: number;
  readonly vanishCountBefore: number;
  readonly vanishCountAfter: number;
  readonly blackCrushCountBefore: number;
  readonly blackCrushCountAfter: number;
  readonly luminanceShockCountBefore: number;
  readonly luminanceShockCountAfter: number;
  readonly balloonFailCountBefore: number;
  readonly balloonFailCountAfter: number;
  readonly minWcagAcrossAllThemesAfter: number;
  readonly minApcaAbsLcAcrossAllThemesAfter: number;
  readonly allFourThemesVerifiedPass: boolean;
  readonly remediationManifestSha256Hex: string;
}

export interface DualThemeRemediationResult {
  readonly originalInput: EpisodeDualThemeInput;
  readonly beforeAudit: DualThemeAuditReport;
  readonly afterAudit: DualThemeAuditReport;
  readonly remediatedInput: EpisodeDualThemeInput;
  readonly elementPatches: readonly ElementRemediationPatch[];
  readonly gutterRamps: readonly GutterRampPatch[];
  readonly verification: RemediationVerificationSummary;
}

/** 0..1 단위 구간으로 안전하게 클램프한다. */
export function clampUnitLuma(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 부분 설정을 기본 감사 임계치와 병합한다. */
export function resolveDualThemeAuditConfig(
  partial?: Partial<DualThemeAuditConfig>,
): DualThemeAuditConfig {
  if (!partial) return DEFAULT_DUAL_THEME_AUDIT_CONFIG;
  return { ...DEFAULT_DUAL_THEME_AUDIT_CONFIG, ...partial };
}

/** 요소 종류별 최소 WCAG/APCA 임계치를 반환한다. */
export function requiredThresholdsForElement(
  element: AuditedVisualElement,
  config: DualThemeAuditConfig,
): { readonly minWcag: number; readonly minApcaAbsLc: number } {
  if (element.kind === "balloon-text") {
    return {
      minWcag: config.balloonTextMinWcag,
      minApcaAbsLc: config.balloonTextMinApcaAbsLc,
    };
  }
  return {
    minWcag: config.transparentMinWcag,
    minApcaAbsLc: config.transparentMinApcaAbsLc,
  };
}
