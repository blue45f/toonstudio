/**
 * studio-ai-rhythm.ts — 마감·연재 리듬 보조 계산 (순수 모듈, fetch 없음).
 *
 * 기존 연재 캘린더·일정·회차 진행 데이터를 모아 진행률·마감 임박·
 * 다음 할 일을 클라이언트에서 계산한다. 서버 AI 호출은 없다.
 */

export type StudioAiEpisodeStatus = "draft" | "review" | "done";

export interface StudioAiEpisodeProgress {
  readonly episodeId: string;
  readonly title: string;
  readonly status: StudioAiEpisodeStatus;
  readonly dueAt: number | null;
  readonly donePanels: number;
  readonly totalPanels: number;
}

export type StudioAiRhythmActionKind = "overdue" | "due-soon" | "review";

export interface StudioAiRhythmAction {
  readonly episodeId: string;
  readonly kind: StudioAiRhythmActionKind;
}

export interface StudioAiRhythmSummary {
  readonly total: number;
  readonly done: number;
  readonly inReview: number;
  readonly draft: number;
  readonly overallProgress: number;
  readonly overdue: readonly StudioAiEpisodeProgress[];
  readonly dueSoon: readonly StudioAiEpisodeProgress[];
  readonly nextActions: readonly StudioAiRhythmAction[];
}

const DUE_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function episodePanelProgress(
  episode: StudioAiEpisodeProgress,
): number {
  if (episode.totalPanels > 0) {
    return Math.min(1, Math.max(0, episode.donePanels / episode.totalPanels));
  }
  return episode.status === "done" ? 1 : 0;
}

export function summarizeEpisodeRhythm(
  episodes: readonly StudioAiEpisodeProgress[],
  now: number = Date.now(),
): StudioAiRhythmSummary {
  const done = episodes.filter((episode) => episode.status === "done");
  const inReview = episodes.filter((episode) => episode.status === "review");
  const draft = episodes.filter((episode) => episode.status === "draft");
  const open = episodes.filter((episode) => episode.status !== "done");
  const overdue = open.filter(
    (episode) => episode.dueAt !== null && episode.dueAt < now,
  );
  const dueSoon = open.filter(
    (episode) =>
      episode.dueAt !== null &&
      episode.dueAt >= now &&
      episode.dueAt - now <= DUE_SOON_WINDOW_MS,
  );
  const nextActions: StudioAiRhythmAction[] = [
    ...overdue.map((episode) => ({
      episodeId: episode.episodeId,
      kind: "overdue" as const,
    })),
    ...dueSoon.map((episode) => ({
      episodeId: episode.episodeId,
      kind: "due-soon" as const,
    })),
    ...inReview.map((episode) => ({
      episodeId: episode.episodeId,
      kind: "review" as const,
    })),
  ];
  const overallProgress =
    episodes.length === 0 ? 0 : done.length / episodes.length;
  return {
    total: episodes.length,
    done: done.length,
    inReview: inReview.length,
    draft: draft.length,
    overallProgress,
    overdue: Object.freeze(overdue),
    dueSoon: Object.freeze(dueSoon),
    nextActions: Object.freeze(nextActions),
  };
}
