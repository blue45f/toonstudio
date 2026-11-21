/**
 * T-054 · T-057: 초보자용 60초 '첫 1컷 완성' 인터랙티브 스포트라이트 온보딩 상태 머신과
 * 모바일(320~430px) 엄지 영역 5대 핵심 액션 플로팅 독 레이아웃 계약.
 */

export type BeginnerOnboardingStepId =
  | "select-cut"
  | "place-background"
  | "lineart-bubble"
  | "oneclick-tone"
  | "save-cuts";

export interface BeginnerOnboardingStep {
  readonly id: BeginnerOnboardingStepId;
  readonly order: number;
  readonly durationSec: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly actionHintKo: string;
  readonly actionHintEn: string;
  readonly spotlightTargetId: string;
  readonly badgeKo: string;
}

export const BEGINNER_ONBOARDING_STORAGE_KEY = "toonstudio:nextgen:first-cut-onboarding:v1";

export const BEGINNER_ONBOARDING_STEPS: readonly BeginnerOnboardingStep[] = Object.freeze([
  {
    id: "select-cut",
    order: 1,
    durationSec: 10,
    titleKo: "① 컷 선택",
    titleEn: "1. Pick a panel",
    actionHintKo: "세로 웹툰 또는 1컷 숏툰 틀 중 마음에 드는 비율을 한 번에 골라요.",
    actionHintEn: "Choose a vertical webtoon or single-panel layout in one tap.",
    spotlightTargetId: "first-cut-step-select",
    badgeKo: "10초",
  },
  {
    id: "place-background",
    order: 2,
    durationSec: 15,
    titleKo: "② 3D·배경 얹기",
    titleEn: "2. Place 3D backdrop",
    actionHintKo: "학교·카페·거리 배경을 컷에 얹으면 구도와 원근이 자동으로 맞아요.",
    actionHintEn: "Drop a classroom, cafe, or street backdrop with auto perspective.",
    spotlightTargetId: "first-cut-step-background",
    badgeKo: "15초",
  },
  {
    id: "lineart-bubble",
    order: 3,
    durationSec: 15,
    titleKo: "③ 선화·말풍선",
    titleEn: "3. Ink & speech bubble",
    actionHintKo: "초보자 먹선 펜으로 선을 긋고, 말풍선을 탭해 대사를 바로 채워요.",
    actionHintEn: "Sketch with the beginner ink pen and drop a speech bubble.",
    spotlightTargetId: "first-cut-step-bubble",
    badgeKo: "15초",
  },
  {
    id: "oneclick-tone",
    order: 4,
    durationSec: 10,
    titleKo: "④ 원클릭 색감",
    titleEn: "4. One-tap color mood",
    actionHintKo: "노을·청량·밤거리 분위기 필터를 누르면 컷 전체 톤이 한 번에 살아나요.",
    actionHintEn: "Apply a sunset, bright, or night mood filter in a single tap.",
    spotlightTargetId: "first-cut-step-tone",
    badgeKo: "10초",
  },
  {
    id: "save-cuts",
    order: 5,
    durationSec: 10,
    titleKo: "⑤ PNG·컷츠 저장",
    titleEn: "5. Save PNG or Cuts",
    actionHintKo: "완성된 1컷을 이미지(PNG)나 30초 컷츠 영상으로 내 기기에 바로 저장해요.",
    actionHintEn: "Save your finished panel as a PNG image or 30s Cuts video.",
    spotlightTargetId: "first-cut-step-save",
    badgeKo: "10초",
  },
]);

export interface BeginnerOnboardingState {
  readonly status: "active" | "completed" | "skipped";
  readonly currentIndex: number;
  readonly completedStepIds: readonly BeginnerOnboardingStepId[];
  readonly updatedAtIso: string;
}

export interface BeginnerOnboardingProgressSummary {
  readonly completedCount: number;
  readonly totalSteps: number;
  readonly percent: number;
  readonly remainingSeconds: number;
  readonly totalSeconds: number;
  readonly currentStep: BeginnerOnboardingStep;
  readonly isCompleted: boolean;
  readonly isSkipped: boolean;
}

export function createInitialOnboardingState(nowIso?: string): BeginnerOnboardingState {
  return {
    status: "active",
    currentIndex: 0,
    completedStepIds: [],
    updatedAtIso: nowIso ?? new Date().toISOString(),
  };
}

export function isValidStepId(value: unknown): value is BeginnerOnboardingStepId {
  return (
    typeof value === "string" &&
    BEGINNER_ONBOARDING_STEPS.some((step) => step.id === value)
  );
}

export function loadBeginnerOnboardingState(
  storage: Pick<Storage, "getItem"> | null | undefined,
): BeginnerOnboardingState {
  if (!storage) return createInitialOnboardingState();
  try {
    const raw = storage.getItem(BEGINNER_ONBOARDING_STORAGE_KEY);
    if (!raw) return createInitialOnboardingState();
    const parsed = JSON.parse(raw) as Partial<BeginnerOnboardingState>;
    const status =
      parsed.status === "completed" || parsed.status === "skipped" || parsed.status === "active"
        ? parsed.status
        : "active";
    const completedStepIds = Array.isArray(parsed.completedStepIds)
      ? [...new Set(parsed.completedStepIds.filter(isValidStepId))]
      : [];
    const maxIndex = BEGINNER_ONBOARDING_STEPS.length - 1;
    const currentIndex =
      typeof parsed.currentIndex === "number" && Number.isInteger(parsed.currentIndex)
        ? Math.min(maxIndex, Math.max(0, parsed.currentIndex))
        : 0;
    return {
      status,
      currentIndex,
      completedStepIds,
      updatedAtIso: typeof parsed.updatedAtIso === "string" ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return createInitialOnboardingState();
  }
}

export function saveBeginnerOnboardingState(
  storage: Pick<Storage, "setItem"> | null | undefined,
  state: BeginnerOnboardingState,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(BEGINNER_ONBOARDING_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function completeCurrentOnboardingStep(
  state: BeginnerOnboardingState,
  nowIso?: string,
): BeginnerOnboardingState {
  const step = BEGINNER_ONBOARDING_STEPS[state.currentIndex];
  const nextCompleted = state.completedStepIds.includes(step.id)
    ? state.completedStepIds
    : [...state.completedStepIds, step.id];
  const allDone = nextCompleted.length >= BEGINNER_ONBOARDING_STEPS.length;
  const nextIndex = Math.min(BEGINNER_ONBOARDING_STEPS.length - 1, state.currentIndex + 1);
  return {
    status: allDone ? "completed" : "active",
    currentIndex: allDone ? BEGINNER_ONBOARDING_STEPS.length - 1 : nextIndex,
    completedStepIds: nextCompleted,
    updatedAtIso: nowIso ?? new Date().toISOString(),
  };
}

export function advanceOnboardingStep(
  state: BeginnerOnboardingState,
  nowIso?: string,
): BeginnerOnboardingState {
  const nextIndex = Math.min(BEGINNER_ONBOARDING_STEPS.length - 1, state.currentIndex + 1);
  return {
    ...state,
    status: state.status === "skipped" ? "active" : state.status,
    currentIndex: nextIndex,
    updatedAtIso: nowIso ?? new Date().toISOString(),
  };
}

export function retreatOnboardingStep(
  state: BeginnerOnboardingState,
  nowIso?: string,
): BeginnerOnboardingState {
  const prevIndex = Math.max(0, state.currentIndex - 1);
  return {
    ...state,
    status: state.status === "skipped" ? "active" : state.status,
    currentIndex: prevIndex,
    updatedAtIso: nowIso ?? new Date().toISOString(),
  };
}

export function jumpToOnboardingStep(
  state: BeginnerOnboardingState,
  stepId: BeginnerOnboardingStepId,
  nowIso?: string,
): BeginnerOnboardingState {
  const targetIndex = BEGINNER_ONBOARDING_STEPS.findIndex((step) => step.id === stepId);
  if (targetIndex < 0) return state;
  return {
    ...state,
    status: state.status === "completed" ? "completed" : "active",
    currentIndex: targetIndex,
    updatedAtIso: nowIso ?? new Date().toISOString(),
  };
}

export function skipBeginnerOnboarding(
  state: BeginnerOnboardingState,
  nowIso?: string,
): BeginnerOnboardingState {
  return {
    ...state,
    status: "skipped",
    updatedAtIso: nowIso ?? new Date().toISOString(),
  };
}

export function restartBeginnerOnboarding(nowIso?: string): BeginnerOnboardingState {
  return createInitialOnboardingState(nowIso);
}

export function getOnboardingProgressSummary(
  state: BeginnerOnboardingState,
): BeginnerOnboardingProgressSummary {
  const totalSteps = BEGINNER_ONBOARDING_STEPS.length;
  const completedSet = new Set(state.completedStepIds);
  const completedCount = completedSet.size;
  const totalSeconds = BEGINNER_ONBOARDING_STEPS.reduce((acc, item) => acc + item.durationSec, 0);
  const remainingSeconds = BEGINNER_ONBOARDING_STEPS.filter((item) => !completedSet.has(item.id)).reduce(
    (acc, item) => acc + item.durationSec,
    0,
  );
  const currentStep = BEGINNER_ONBOARDING_STEPS[state.currentIndex] ?? BEGINNER_ONBOARDING_STEPS[0];
  return {
    completedCount,
    totalSteps,
    percent: Math.round((completedCount / totalSteps) * 100),
    remainingSeconds,
    totalSeconds,
    currentStep,
    isCompleted: state.status === "completed" || completedCount === totalSteps,
    isSkipped: state.status === "skipped",
  };
}

/* -------------------------------------------------------------------------- */
/* T-057: 모바일(320~430px) 엄지 영역 5대 핵심 액션 플로팅 독 계약                 */
/* -------------------------------------------------------------------------- */

export type MobileDockActionId = "draw" | "background" | "bubble" | "palette" | "export";

export type MobileDockHandedness = "right" | "left" | "center";

export interface MobileThumbDockAction {
  readonly id: MobileDockActionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortcutHint: string;
  readonly stepId: BeginnerOnboardingStepId;
  readonly accentRole: "primary" | "cool" | "good" | "warn" | "accent-2";
}

export const MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX = 44;

export const MOBILE_THUMB_DOCK_VIEWPORT_RANGE = Object.freeze({
  minWidthPx: 320,
  maxWidthPx: 430,
});

export const MOBILE_THUMB_DOCK_ACTIONS: readonly MobileThumbDockAction[] = Object.freeze([
  {
    id: "draw",
    labelKo: "그리기",
    labelEn: "Draw",
    shortcutHint: "B",
    stepId: "lineart-bubble",
    accentRole: "primary",
  },
  {
    id: "background",
    labelKo: "배경",
    labelEn: "Backdrop",
    shortcutHint: "3",
    stepId: "place-background",
    accentRole: "cool",
  },
  {
    id: "bubble",
    labelKo: "말풍선",
    labelEn: "Bubble",
    shortcutHint: "T",
    stepId: "lineart-bubble",
    accentRole: "accent-2",
  },
  {
    id: "palette",
    labelKo: "색감",
    labelEn: "Mood",
    shortcutHint: "C",
    stepId: "oneclick-tone",
    accentRole: "warn",
  },
  {
    id: "export",
    labelKo: "저장",
    labelEn: "Save",
    shortcutHint: "S",
    stepId: "save-cuts",
    accentRole: "good",
  },
]);

export interface MobileThumbDockLayout {
  readonly viewportWidthPx: number;
  readonly clampedMobileRange: boolean;
  readonly actionCount: number;
  readonly horizontalPaddingPx: number;
  readonly gapPx: number;
  readonly hitWidthPx: number;
  readonly hitHeightPx: number;
  readonly totalDockWidthPx: number;
  readonly overflowsViewport: boolean;
  readonly meetsMinimumTouchTarget: boolean;
  readonly handedness: MobileDockHandedness;
  readonly safeAreaInsetCss: string;
  readonly effectiveBottomPaddingPx: number;
}

export function resolveMobileThumbDockLayout(options: {
  readonly viewportWidthPx: number;
  readonly safeAreaBottomPx?: number;
  readonly handedness?: MobileDockHandedness;
}): MobileThumbDockLayout {
  const viewportWidthPx = Math.max(280, Math.round(options.viewportWidthPx));
  const clampedMobileRange =
    viewportWidthPx >= MOBILE_THUMB_DOCK_VIEWPORT_RANGE.minWidthPx &&
    viewportWidthPx <= MOBILE_THUMB_DOCK_VIEWPORT_RANGE.maxWidthPx;
  const actionCount = MOBILE_THUMB_DOCK_ACTIONS.length;
  const outerMarginPx = viewportWidthPx <= 340 ? 8 : 12;
  const horizontalPaddingPx = viewportWidthPx <= 340 ? 8 : 12;
  const gapPx = viewportWidthPx <= 340 ? 4 : 8;
  const availableDockWidth = Math.min(viewportWidthPx - outerMarginPx * 2, 412);
  const innerWidth = availableDockWidth - horizontalPaddingPx * 2 - gapPx * (actionCount - 1);
  const rawHitWidth = Math.floor(innerWidth / actionCount);
  const hitWidthPx = Math.max(MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX, rawHitWidth);
  const hitHeightPx = Math.max(MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX, 52);
  const totalDockWidthPx =
    hitWidthPx * actionCount + gapPx * (actionCount - 1) + horizontalPaddingPx * 2;
  const safeAreaBottomPx = Math.max(0, Math.round(options.safeAreaBottomPx ?? 0));

  return {
    viewportWidthPx,
    clampedMobileRange,
    actionCount,
    horizontalPaddingPx,
    gapPx,
    hitWidthPx,
    hitHeightPx,
    totalDockWidthPx,
    overflowsViewport: totalDockWidthPx > viewportWidthPx,
    meetsMinimumTouchTarget:
      hitWidthPx >= MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX &&
      hitHeightPx >= MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX,
    handedness: options.handedness ?? "right",
    safeAreaInsetCss: "max(12px, env(safe-area-inset-bottom))",
    effectiveBottomPaddingPx: Math.max(12, safeAreaBottomPx),
  };
}
