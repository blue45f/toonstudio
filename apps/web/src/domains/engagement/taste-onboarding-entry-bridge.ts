/**
 * 취향 테스트 5문항 온보딩 첫 진입 연결 브리지 (AC-011 / DIFFERENTIATION.md F02).
 *
 * 기존 `TasteOnboardingPage.tsx`와 `recommend.ts` 사이에서 첫 방문/콜드스타트 판정,
 * 5문항 응답 정규화, 추천 피드 딥링크 생성을 결정적으로 처리한다.
 */

export interface TasteOnboardingAnswers {
  readonly favoriteGenres: readonly string[];
  readonly preferredTags: readonly string[];
  readonly pacing: "fast" | "balanced" | "slow-burn";
  readonly mood: "bright" | "serious" | "dark" | "emotional";
  readonly format: "all" | "webtoon" | "webnovel";
}

export interface TasteOnboardingDecision {
  readonly shouldPrompt: boolean;
  readonly reason: "cold-start" | "already-completed" | "dismissed-recently" | "has-history";
}

const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface TasteOnboardingEntryInput {
  readonly completedAtMs?: number | null;
  readonly dismissedAtMs?: number | null;
  readonly ratedTitleCount: number;
  readonly nowMs: number;
}

export function shouldPromptTasteOnboarding(input: TasteOnboardingEntryInput): TasteOnboardingDecision {
  if (input.completedAtMs) {
    return { shouldPrompt: false, reason: "already-completed" };
  }
  if (input.ratedTitleCount >= 3) {
    return { shouldPrompt: false, reason: "has-history" };
  }
  if (input.dismissedAtMs && input.nowMs - input.dismissedAtMs < DISMISS_COOLDOWN_MS) {
    return { shouldPrompt: false, reason: "dismissed-recently" };
  }
  return { shouldPrompt: true, reason: "cold-start" };
}

export function buildTasteFeedRedirectHref(answers: TasteOnboardingAnswers): string {
  const params = new URLSearchParams({ tasteReady: "1" });
  const genres = Array.from(new Set(answers.favoriteGenres.map((g) => g.trim()).filter(Boolean))).slice(0, 3);
  const tags = Array.from(new Set(answers.preferredTags.map((t) => t.trim()).filter(Boolean))).slice(0, 5);
  if (genres.length > 0) params.set("genres", genres.join(","));
  if (tags.length > 0) params.set("tags", tags.join(","));
  params.set("pacing", answers.pacing);
  params.set("mood", answers.mood);
  if (answers.format !== "all") params.set("type", answers.format);
  return `/discover?${params.toString()}`;
}
