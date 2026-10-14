/**
 * 시즌 비트 보드 (P-2) — 행=회차, 열=캐릭터 매트릭스의 순수 도출 모델.
 *
 * 근거: creative-features REPORT P-2. 작가실 시즌 아크 표(캐릭터별 열로 비트를
 * 벽에 붙이는 방식)와 Scrivener 코르크보드의 라벨 개념을 회차 단위로 번역한다.
 *
 * 원칙:
 * - 새 저장 데이터는 만들지 않는다. 셀은 이미 있는 정본에서만 도출한다:
 *   ① 작가가 직접 적은 비트 배정(SeasonBeatAssignment, 선택 입력)
 *   ② 콘티 비트(StudioStoryBeat.characterIds) — 회차 줄거리 표면이 이미 받는 입력
 *   ③ 회차 계획의 characterRefs — "이 회차에 나온다"는 등장 표시로만 쓴다
 * - 공백·과밀은 저장하지 않고 매번 계산한다 (복선 장부 초안과 같은 도출 원칙).
 * - 열 순서는 SeasonPlan.characterArcRefs(시즌 아크에 걸린 캐릭터)를 앞에 두고,
 *   나머지는 바이블 순서를 따른다. 행 순서는 seasonArcView 와 같은 규칙
 *   (episodeOrder 우선, 나머지는 회차 번호순)이라 줄거리 표면과 어긋나지 않는다.
 */
import type { SeasonPlan } from "@toonstudio/core/production";
import type { StudioStoryCharacter } from "../studio-story-bible";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import { seasonArcView, type EpisodePlanWithSynopsis } from "./studio-episode-synopsis";

/** 작가가 보드에서 직접 적은 비트 한 줄. 저장은 호출자(표면·스토어) 몫이며 이 모델은 읽기만 한다. */
export interface SeasonBeatAssignment {
  readonly episodeId: string;
  readonly characterId: string;
  readonly beat: string;
}

export type SeasonBeatCellSource = "assignment" | "storyboard" | "plan" | "empty";

export interface SeasonBeatCell {
  readonly episodeId: string;
  readonly characterId: string;
  /** 이 회차에 이 캐릭터의 비트·등장이 있으면 true. */
  readonly present: boolean;
  /** 셀에 보여 줄 비트 텍스트. plan 출처(등장만 확정)면 "등장", 빈 셀이면 "". */
  readonly text: string;
  /** 비트 개수 — 배정+콘티 비트 합, plan 출처면 1. 과밀 판정의 재료. */
  readonly beatCount: number;
  readonly source: SeasonBeatCellSource;
  /** gapThreshold 이상 이어지는 공백 구간에 속하면 true — 표면이 색으로 표시한다. */
  readonly inLongGap: boolean;
}

/** 공백 구간 하나 — 회차 번호 구간으로 표현한다. */
export interface SeasonBeatGapRun {
  readonly fromEpisodeNumber: number;
  readonly toEpisodeNumber: number;
  readonly length: number;
}

export interface SeasonBeatColumn {
  readonly characterId: string;
  readonly name: string;
  readonly presentCount: number;
  /** 가장 긴 연속 공백 (회차 수). 임계값과 무관한 사실값. */
  readonly longestGap: number;
  /** 마지막 회차까지 이어지는 공백 길이. 0이면 마지막 회차에 등장한다. */
  readonly trailingGap: number;
  /** 임계값 이상인 공백 구간만. 표면의 "공백 구간 표시"가 이걸 그린다. */
  readonly gapRuns: readonly SeasonBeatGapRun[];
}

export interface SeasonBeatRow {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly cells: readonly SeasonBeatCell[];
  readonly totalBeats: number;
  readonly presentCharacterCount: number;
  /** 비트가 몰린 회차 — totalBeats >= crowdedBeatThreshold. */
  readonly crowded: boolean;
  /** 비트·등장이 전혀 없는 회차. */
  readonly bare: boolean;
}

export interface SeasonBeatBoard {
  readonly seasonId: string;
  readonly title: string;
  readonly columns: readonly SeasonBeatColumn[];
  readonly rows: readonly SeasonBeatRow[];
  readonly crowdedEpisodeNumbers: readonly number[];
  readonly longGapCharacterIds: readonly string[];
  /** 줄거리가 한 칸이라도 있으면 true. 없으면 표면은 보드 대신 쓰기 안내를 앞세운다. */
  readonly hasStory: boolean;
}

export interface SeasonBeatBoardInput {
  readonly season: SeasonPlan;
  readonly plans: readonly EpisodePlanWithSynopsis[];
  readonly characters: readonly StudioStoryCharacter[];
  readonly assignments?: readonly SeasonBeatAssignment[];
  readonly beatsByEpisodeId?: Readonly<Record<string, readonly StudioStoryBeat[]>>;
  /** 이 회차 수 이상 연속으로 비면 "긴 공백"으로 본다. 기본 3. */
  readonly gapThreshold?: number;
  /** 한 회차 비트가 이 개수 이상이면 "몰린 회차"로 본다. 기본 6. */
  readonly crowdedBeatThreshold?: number;
}

export const DEFAULT_BEAT_GAP_THRESHOLD = 3;
export const DEFAULT_CROWDED_BEAT_THRESHOLD = 6;

function orderedCharacters(
  season: SeasonPlan,
  characters: readonly StudioStoryCharacter[],
): readonly StudioStoryCharacter[] {
  const byId = new Map(characters.map((character) => [character.id, character]));
  const arcFirst = season.characterArcRefs
    .map((id) => byId.get(id))
    .filter((character): character is StudioStoryCharacter => character !== undefined);
  const seen = new Set(arcFirst.map((character) => character.id));
  const rest = characters.filter((character) => !seen.has(character.id));
  return Object.freeze([...arcFirst, ...rest]);
}

function rawCell(
  plan: EpisodePlanWithSynopsis,
  characterId: string,
  assignments: readonly SeasonBeatAssignment[],
  beatsByEpisodeId: Readonly<Record<string, readonly StudioStoryBeat[]>> | undefined,
): { present: boolean; text: string; beatCount: number; source: SeasonBeatCellSource } {
  const assigned = assignments
    .filter((entry) => entry.episodeId === plan.episodeId && entry.characterId === characterId)
    .map((entry) => entry.beat.trim())
    .filter(Boolean);
  const fromBeats = (beatsByEpisodeId?.[plan.episodeId] ?? [])
    .filter((beat) => beat.characterIds.includes(characterId))
    .map((beat) => beat.summary.trim())
    .filter(Boolean);
  const texts = [...assigned, ...fromBeats];
  if (texts.length > 0) {
    return {
      present: true,
      text: texts.join(" · "),
      beatCount: texts.length,
      source: assigned.length > 0 ? "assignment" : "storyboard",
    };
  }
  if (plan.characterRefs.includes(characterId)) {
    return { present: true, text: "등장", beatCount: 1, source: "plan" };
  }
  return { present: false, text: "", beatCount: 0, source: "empty" };
}

export function buildSeasonBeatBoard(input: SeasonBeatBoardInput): SeasonBeatBoard {
  const gapThreshold = Math.max(1, input.gapThreshold ?? DEFAULT_BEAT_GAP_THRESHOLD);
  const crowdedThreshold = Math.max(1, input.crowdedBeatThreshold ?? DEFAULT_CROWDED_BEAT_THRESHOLD);
  const assignments = input.assignments ?? [];
  const characters = orderedCharacters(input.season, input.characters);
  const arc = seasonArcView(input.season, input.plans);
  const planById = new Map(input.plans.map((plan) => [plan.episodeId, plan]));
  const orderedPlans = arc.episodes
    .map((card) => planById.get(card.episodeId))
    .filter((plan): plan is EpisodePlanWithSynopsis => plan !== undefined);

  // 1차: present/text만으로 셀을 만들고, 열 단위 공백 구간을 계산해 inLongGap을 채운다.
  const draftCells: SeasonBeatCell[][] = orderedPlans.map((plan) =>
    characters.map((character) => {
      const raw = rawCell(plan, character.id, assignments, input.beatsByEpisodeId);
      return Object.freeze({
        episodeId: plan.episodeId,
        characterId: character.id,
        present: raw.present,
        text: raw.text,
        beatCount: raw.beatCount,
        source: raw.source,
        inLongGap: false,
      });
    }),
  );

  const columns: SeasonBeatColumn[] = characters.map((character, columnIndex) => {
    let presentCount = 0;
    let longestGap = 0;
    let runStart = -1;
    const gapRuns: SeasonBeatGapRun[] = [];
    const closeRun = (endIndexExclusive: number) => {
      if (runStart < 0) return;
      const length = endIndexExclusive - runStart;
      longestGap = Math.max(longestGap, length);
      if (length >= gapThreshold) {
        const from = orderedPlans[runStart];
        const to = orderedPlans[endIndexExclusive - 1];
        if (from && to) {
          gapRuns.push(Object.freeze({
            fromEpisodeNumber: from.episodeNumber,
            toEpisodeNumber: to.episodeNumber,
            length,
          }));
        }
        for (let rowIndex = runStart; rowIndex < endIndexExclusive; rowIndex += 1) {
          const row = draftCells[rowIndex];
          const cell = row?.[columnIndex];
          if (row && cell) {
            row[columnIndex] = Object.freeze({ ...cell, inLongGap: true });
          }
        }
      }
      runStart = -1;
    };
    draftCells.forEach((row, rowIndex) => {
      const cell = row[columnIndex];
      if (cell?.present) {
        presentCount += 1;
        closeRun(rowIndex);
      } else if (runStart < 0) {
        runStart = rowIndex;
      }
    });
    closeRun(draftCells.length);
    const lastRow = draftCells[draftCells.length - 1];
    const trailingGap = lastRow?.[columnIndex]?.present
      ? 0
      : (() => {
          let length = 0;
          for (let rowIndex = draftCells.length - 1; rowIndex >= 0; rowIndex -= 1) {
            if (draftCells[rowIndex]?.[columnIndex]?.present) break;
            length += 1;
          }
          return length;
        })();
    return Object.freeze({
      characterId: character.id,
      name: character.name,
      presentCount,
      longestGap,
      trailingGap,
      gapRuns: Object.freeze(gapRuns),
    });
  });

  const rows: SeasonBeatRow[] = orderedPlans.map((plan, rowIndex) => {
    const cells = Object.freeze(draftCells[rowIndex] ?? []);
    const totalBeats = cells.reduce((sum, cell) => sum + cell.beatCount, 0);
    const presentCharacterCount = cells.filter((cell) => cell.present).length;
    return Object.freeze({
      episodeId: plan.episodeId,
      episodeNumber: plan.episodeNumber,
      title: plan.title,
      cells,
      totalBeats,
      presentCharacterCount,
      crowded: totalBeats >= crowdedThreshold,
      bare: totalBeats === 0,
    });
  });

  return Object.freeze({
    seasonId: input.season.seasonId,
    title: input.season.title,
    columns: Object.freeze(columns),
    rows: Object.freeze(rows),
    crowdedEpisodeNumbers: Object.freeze(rows.filter((row) => row.crowded).map((row) => row.episodeNumber)),
    longGapCharacterIds: Object.freeze(
      columns.filter((column) => column.gapRuns.length > 0).map((column) => column.characterId),
    ),
    hasStory: orderedPlans.some(
      (plan) => Boolean(plan.synopsis?.trim() || plan.goal?.trim() || plan.logline.trim())
        || plan.turningPoints.length > 0,
    ),
  });
}

/** 보드 아래 "배분 점검" 목록 — 지적이 아니라 구간 표시로만 말한다 (REPORT P-2 취지). */
export function seasonBeatBoardHints(board: SeasonBeatBoard): readonly string[] {
  const hints: string[] = [];
  for (const column of board.columns) {
    for (const run of column.gapRuns) {
      hints.push(
        run.fromEpisodeNumber === run.toEpisodeNumber
          ? `${column.name}: ${run.fromEpisodeNumber}화가 비어 있어요.`
          : `${column.name}: ${run.fromEpisodeNumber}화부터 ${run.toEpisodeNumber}화까지 ${run.length}회 연속 나오지 않아요.`,
      );
    }
  }
  for (const row of board.rows) {
    if (row.crowded) {
      hints.push(`${row.episodeNumber}화: 비트 ${row.totalBeats}개가 몰려 있어요. 옆 회차로 나눌 수 있는지 봐 주세요.`);
    } else if (row.bare) {
      hints.push(`${row.episodeNumber}화: 아직 배정된 비트가 없어요.`);
    }
  }
  return Object.freeze(hints);
}
