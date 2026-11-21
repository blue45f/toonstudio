import type { MarketEcosystemPresetId } from "@/shared/navigation/webtoon-platform-router-ux-model";

export type MarketBeginnerGoalId = "bg-3d" | "brush-line" | "safe-free" | "fit-test";

export type MarketBeginnerQuickFilterId =
  | "all"
  | "free-cc0"
  | "commercial"
  | "no-ai"
  | "team-ready"
  | "brush"
  | "space-3d";

export interface MarketBeginnerGoal {
  readonly id: MarketBeginnerGoalId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortKo: string;
  readonly shortEn: string;
  readonly guideKo: string;
  readonly guideEn: string;
  readonly ctaLabelKo: string;
  readonly ctaLabelEn: string;
  readonly ctaHref: string;
  readonly presetId: MarketEcosystemPresetId;
  readonly quickFilterId: MarketBeginnerQuickFilterId;
  readonly tone: "accent" | "accent-2" | "good" | "cool";
}

export const MARKET_BEGINNER_GOAL_STORAGE_KEY = "toonstudio.market-beginner-goal.v1";

export const MARKET_BEGINNER_GOALS: readonly MarketBeginnerGoal[] = [
  {
    id: "bg-3d",
    labelKo: "배경 3D 빨리 채우기",
    labelEn: "Fill 3D backgrounds fast",
    shortKo: "3D 배경",
    shortEn: "3D spaces",
    guideKo: "건물·실내 3D를 불러와 카메라 각도만 맞추면 배경 마감 시간이 크게 줄어요.",
    guideEn: "Drop in 3D buildings or rooms and match your camera angle to save hours.",
    ctaLabelKo: "3D 배경 전체 보기",
    ctaLabelEn: "Browse 3D backgrounds",
    ctaHref: "/market/browse?kind=3d-asset",
    presetId: "bg-3d",
    quickFilterId: "space-3d",
    tone: "cool",
  },
  {
    id: "brush-line",
    labelKo: "선화·채색 브러시 찾기",
    labelEn: "Find line & color brushes",
    shortKo: "펜·브러시",
    shortEn: "Brushes",
    guideKo: "자주 쓰는 펜·수채·효과 브러시를 골라 스튜디오 브러시 관리자에 바로 추가해요.",
    guideEn: "Pick inking, watercolor, or effect brushes and add them straight to Studio.",
    ctaLabelKo: "브러시 전체 보기",
    ctaLabelEn: "Browse all brushes",
    ctaHref: "/market/browse?kind=brush",
    presetId: "brush-2d",
    quickFilterId: "brush",
    tone: "accent",
  },
  {
    id: "safe-free",
    labelKo: "무료·상업용 안심 소재",
    labelEn: "Free commercial-safe picks",
    shortKo: "무료 안심",
    shortEn: "Free safe",
    guideKo: "연재·공모전에도 안심하고 쓸 수 있는 무료·CC0 검증 소재만 먼저 모았어요.",
    guideEn: "Start with verified free and CC0 materials safe for serialized releases.",
    ctaLabelKo: "기본 무료 소재 열기",
    ctaLabelEn: "Open built-in free assets",
    ctaHref: "/studio/assets?view=essentials",
    presetId: "all",
    quickFilterId: "free-cc0",
    tone: "good",
  },
  {
    id: "fit-test",
    labelKo: "원고 위에서 먼저 시험",
    labelEn: "Test on my panel first",
    shortKo: "미리 시험",
    shortEn: "Try on panel",
    guideKo: "다운로드하기 전에 내 웹툰 컷 비율과 분위기에 맞는지 바로 맞춰볼 수 있어요.",
    guideEn: "Preview how assets match your webtoon panel ratio before downloading.",
    ctaLabelKo: "원고 위 시험실 열기",
    ctaLabelEn: "Open Fit Lab",
    ctaHref: "/market/fit-lab",
    presetId: "char-pose-3d",
    quickFilterId: "all",
    tone: "accent-2",
  },
] as const;

export function resolveMarketBeginnerGoal(
  id: string | null | undefined,
): MarketBeginnerGoal | null {
  if (!id) return null;
  return MARKET_BEGINNER_GOALS.find((goal) => goal.id === id) ?? null;
}

export function loadSavedMarketBeginnerGoal(): MarketBeginnerGoalId | null {
  try {
    const raw = window.localStorage.getItem(MARKET_BEGINNER_GOAL_STORAGE_KEY);
    return resolveMarketBeginnerGoal(raw)?.id ?? null;
  } catch {
    return null;
  }
}

export function saveMarketBeginnerGoal(id: MarketBeginnerGoalId | null): void {
  try {
    if (id === null) {
      window.localStorage.removeItem(MARKET_BEGINNER_GOAL_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(MARKET_BEGINNER_GOAL_STORAGE_KEY, id);
  } catch {
    // 저장소가 제한된 환경에서도 필터 동작은 그대로 유지된다.
  }
}
