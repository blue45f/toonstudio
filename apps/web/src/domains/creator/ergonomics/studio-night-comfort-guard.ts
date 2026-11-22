/**
 * 야간 색온도 아이-컴포트 가드 (색 왜곡 방지 자동 중립 복귀 엔진).
 *
 * - 장시간 야간 작업 시 UI 크롬(상단 바·도구 레일·패널)에만 은은한 난색 필터를 적용한다.
 * - 캔버스 아트웍 픽셀은 어떤 모드에서도 색온도 필터를 받지 않으며(`canvasNeutralGuaranteed: true`),
 *   작가가 채색·스포이드·컬러 휠·색보정·내보내기(color-critical) 상태에 진입하면
 *   주변 크롬의 색온도 보정까지 즉시 중립(6500K)으로 되돌려 동시 대비 착시를 방지한다.
 */
import type {
  StudioErgonomicsAttributeTarget,
  StudioErgonomicsPreferences,
  StudioNightComfortPreset,
} from "./studio-ergonomics-preferences";

export type StudioColorCriticalReason =
  | "eyedropper"
  | "color-work-mode"
  | "color-picker"
  | "color-grading"
  | "color-paint-tool"
  | "export";

export type StudioNightComfortMode = "off" | "active" | "paused-color-critical";

export interface StudioNightComfortContext {
  readonly workMode?: string | null;
  readonly tool?: string | null;
  readonly drawMode?: string | null;
  readonly eyedropperActive?: boolean;
  readonly colorWheelOpen?: boolean;
  readonly colorRangePickActive?: boolean;
  readonly pageGradePanelOpen?: boolean;
  readonly advancedFillActive?: boolean;
  readonly wetMixActive?: boolean;
  readonly dodgeBurnActive?: boolean;
  readonly isExporting?: boolean;
  readonly exportMenuOpen?: boolean;
  readonly colorBlindPreview?: string | null;
  readonly activeMenu?: string | null;
  readonly manualColorAccuracyHold?: boolean;
}

export interface StudioNightComfortEvaluation {
  readonly mode: StudioNightComfortMode;
  readonly preset: StudioNightComfortPreset;
  /** UI 크롬에 난색 눈 보호 필터가 실제로 적용되는지 여부. */
  readonly chromeFilterActive: boolean;
  /** 캔버스 영역 색온도 중립 보장 불변식 (항상 true). */
  readonly canvasNeutralGuaranteed: true;
  /** 0(중립) ~ 0.34(깊은 호박색) 강도 토큰. */
  readonly warmthStrength: number;
  /** UI 크롬 기준 근사 색온도(K). 중립·해제 시 6500K. */
  readonly approxKelvin: number;
  readonly activeReasons: readonly StudioColorCriticalReason[];
  readonly primaryReason: StudioColorCriticalReason | null;
  readonly statusLabelKo: string;
  readonly statusDetailKo: string;
  readonly domAttributes: Readonly<{
    "data-studio-night-comfort": StudioNightComfortMode;
    "data-studio-night-comfort-reason": StudioColorCriticalReason | "none";
  }>;
}

const COLOR_CRITICAL_MENUS = new Set<string>(["palette", "bgFill", "brandKit"]);

const PRESET_PROFILES: Readonly<
  Record<StudioNightComfortPreset, Readonly<{ warmthStrength: number; approxKelvin: number; labelKo: string }>>
> = Object.freeze({
  off: { warmthStrength: 0, approxKelvin: 6500, labelKo: "꺼짐" },
  gentle: { warmthStrength: 0.18, approxKelvin: 4800, labelKo: "은은한 난색" },
  amber: { warmthStrength: 0.34, approxKelvin: 3900, labelKo: "깊은 호박색" },
});

const REASON_LABEL_KO: Readonly<Record<StudioColorCriticalReason, string>> = Object.freeze({
  eyedropper: "스포이드",
  "color-work-mode": "채색 작업 모드",
  "color-picker": "색상 선택 패널",
  "color-grading": "색상 교정",
  "color-paint-tool": "채색 도구",
  export: "내보내기",
});

export function studioNightComfortPresetLabel(preset: StudioNightComfortPreset): string {
  return PRESET_PROFILES[preset].labelKo;
}

export function studioColorCriticalReasonLabel(reason: StudioColorCriticalReason): string {
  return REASON_LABEL_KO[reason];
}

export function detectStudioColorCriticalReasons(
  context: StudioNightComfortContext | null | undefined,
): readonly StudioColorCriticalReason[] {
  if (!context) return [];
  const reasons: StudioColorCriticalReason[] = [];

  if (context.isExporting || context.exportMenuOpen) {
    reasons.push("export");
  }
  if (context.eyedropperActive) {
    reasons.push("eyedropper");
  }
  if (
    context.colorWheelOpen
    || (typeof context.activeMenu === "string" && COLOR_CRITICAL_MENUS.has(context.activeMenu))
  ) {
    reasons.push("color-picker");
  }
  if (
    context.colorRangePickActive
    || context.pageGradePanelOpen
    || (typeof context.colorBlindPreview === "string" && context.colorBlindPreview !== "none")
    || context.manualColorAccuracyHold
  ) {
    reasons.push("color-grading");
  }
  if (context.workMode === "color") {
    reasons.push("color-work-mode");
  }
  if (
    context.advancedFillActive
    || context.wetMixActive
    || context.dodgeBurnActive
    || context.drawMode === "lasso-fill"
  ) {
    reasons.push("color-paint-tool");
  }

  return reasons;
}

export function evaluateStudioNightComfortGuard(
  preferences: Pick<
    StudioErgonomicsPreferences,
    "nightComfortPreset" | "autoPauseNightComfortForColorCritical"
  >,
  context?: StudioNightComfortContext | null,
): StudioNightComfortEvaluation {
  const preset = preferences.nightComfortPreset;
  const activeReasons = detectStudioColorCriticalReasons(context);
  const primaryReason = activeReasons[0] ?? null;

  if (preset === "off") {
    return {
      mode: "off",
      preset,
      chromeFilterActive: false,
      canvasNeutralGuaranteed: true,
      warmthStrength: 0,
      approxKelvin: 6500,
      activeReasons,
      primaryReason,
      statusLabelKo: "야간 색온도 꺼짐",
      statusDetailKo: "UI 크롬과 캔버스 모두 표준 중립 색온도(6500K)로 표시됩니다.",
      domAttributes: {
        "data-studio-night-comfort": "off",
        "data-studio-night-comfort-reason": "none",
      },
    };
  }

  if (preferences.autoPauseNightComfortForColorCritical && primaryReason !== null) {
    const reasonText = studioColorCriticalReasonLabel(primaryReason);
    return {
      mode: "paused-color-critical",
      preset,
      chromeFilterActive: false,
      canvasNeutralGuaranteed: true,
      warmthStrength: 0,
      approxKelvin: 6500,
      activeReasons,
      primaryReason,
      statusLabelKo: `색 정확도 보호 중 (${reasonText})`,
      statusDetailKo: `${reasonText} 작업 중 색 왜곡을 막기 위해 야간 색온도를 잠시 중립(6500K)으로 되돌렸어요.`,
      domAttributes: {
        "data-studio-night-comfort": "paused-color-critical",
        "data-studio-night-comfort-reason": primaryReason,
      },
    };
  }

  const profile = PRESET_PROFILES[preset];
  return {
    mode: "active",
    preset,
    chromeFilterActive: true,
    canvasNeutralGuaranteed: true,
    warmthStrength: profile.warmthStrength,
    approxKelvin: profile.approxKelvin,
    activeReasons,
    primaryReason,
    statusLabelKo: `${profile.labelKo} 적용 중 (~${profile.approxKelvin}K)`,
    statusDetailKo: "UI 크롬에만 난색 눈 보호를 적용하고 캔버스 색상은 원본 그대로 유지합니다.",
    domAttributes: {
      "data-studio-night-comfort": "active",
      "data-studio-night-comfort-reason": "none",
    },
  };
}

export function applyStudioNightComfortToElement(
  element: StudioErgonomicsAttributeTarget | null | undefined,
  evaluation: StudioNightComfortEvaluation,
): void {
  if (!element) return;
  element.setAttribute("data-studio-night-comfort", evaluation.domAttributes["data-studio-night-comfort"]);
  element.setAttribute(
    "data-studio-night-comfort-reason",
    evaluation.domAttributes["data-studio-night-comfort-reason"],
  );
  if (element.style) {
    if (evaluation.chromeFilterActive) {
      element.style.setProperty("--studio-ergonomics-warmth", String(evaluation.warmthStrength));
    } else {
      element.style.removeProperty("--studio-ergonomics-warmth");
    }
  }
}

export function clearStudioNightComfortFromElement(
  element: StudioErgonomicsAttributeTarget | null | undefined,
): void {
  if (!element) return;
  element.removeAttribute("data-studio-night-comfort");
  element.removeAttribute("data-studio-night-comfort-reason");
  if (element.style) {
    element.style.removeProperty("--studio-ergonomics-warmth");
  }
}
