/**
 * studio-ai-rhythm-mapping.ts — 일정 행 → 연재 리듬 입력 매핑 (순수 모듈, fetch 없음).
 *
 * 리듬 계산(studio-ai-rhythm.ts)은 StudioAiEpisodeProgress 입력을 받지만,
 * 그 입력이 기존 연재 캘린더·일정 데이터에서 어떻게 오는지 코드가 없었다.
 * 이 모듈은 느슨한 일정 행을 검증·정규화해 리듬 입력으로 바꾼다. 상태가
 * draft·review·done이 아닌 행, 식별자가 없는 행은 버리고 버린 개수를
 * 함께 돌려준다. 서버 호출은 없다.
 */

import type { StudioAiEpisodeProgress } from "./studio-ai-rhythm";

export interface StudioAiScheduleRow {
  readonly episodeId: unknown;
  readonly title: unknown;
  readonly status: unknown;
  readonly dueAt: unknown;
  readonly donePanels: unknown;
  readonly totalPanels: unknown;
}

export interface StudioAiRhythmMappingResult {
  readonly episodes: readonly StudioAiEpisodeProgress[];
  readonly dropped: number;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeStatus(
  value: unknown,
): StudioAiEpisodeProgress["status"] | null {
  if (value === "draft" || value === "review" || value === "done") {
    return value;
  }
  return null;
}

/** 일정 행을 리듬 입력으로 바꾼다. 유효하지 않은 행은 버린다. */
export function mapScheduleRowsToEpisodeProgress(
  rows: readonly StudioAiScheduleRow[],
): StudioAiRhythmMappingResult {
  const episodes: StudioAiEpisodeProgress[] = [];
  let dropped = 0;
  for (const row of rows) {
    const status = normalizeStatus(row.status);
    if (typeof row.episodeId !== "string" || !row.episodeId) {
      dropped += 1;
      continue;
    }
    if (!status) {
      dropped += 1;
      continue;
    }
    episodes.push({
      episodeId: row.episodeId,
      title: typeof row.title === "string" ? row.title : row.episodeId,
      status,
      dueAt:
        typeof row.dueAt === "number" && Number.isFinite(row.dueAt)
          ? row.dueAt
          : null,
      donePanels: toNonNegativeInt(row.donePanels),
      totalPanels: toNonNegativeInt(row.totalPanels),
    });
  }
  return { episodes: Object.freeze(episodes), dropped };
}
