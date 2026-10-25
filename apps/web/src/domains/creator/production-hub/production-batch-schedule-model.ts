/**
 * 에피소드 단일(일반/특별 회차)·복수 추가·회차 당기기 삭제·트리트먼트 검색 및 데드라인 일괄 관리 모델.
 *
 * - 단일 추가: 일반 회차(`normal`, 마지막 번호 +1 자동 부여) vs 특별 회차(`special`, 기준 에피소드 앞/뒤 배치, 번호 미부여)
 * - 복수 추가(`batch`): 시작~종료 번호 범위 생성 및 이미 존재하는 회차 번호 자동 건너뜀
 * - 에피소드 삭제: 단순 삭제 vs `삭제하고 기존 회차 당기기`(뒤이은 일반 회차 번호 -1 감소)
 * - 트리트먼트(`treatment` 시놉시스) 검색 필터
 * - 데드라인 일괄 생성·반복 주기 수정·일괄 삭제:
 *   - 주말 포함 여부(`includeWeekends`), 특별 회차 무시 여부(`ignoreSpecialEpisodes`), 기존 덮어쓰기 여부(`overwriteExisting`)
 *   - 드래그 이동 시 후속 회차 연쇄 이동(`cascade` 일괄 수정 vs `single` 해당 일정만 수정)
 */

export type EpisodeCreationKind = "normal" | "special";
export type SpecialEpisodePlacement = "before" | "after";
export type TimelineSlotQuickAddKind = "schedule" | "milestone" | "deadline";
export type DeadlineShiftCascadeMode = "cascade" | "single";

export interface ManagedEpisodeEntry {
  readonly episodeId: string;
  /** 일반 회차는 양의 정수, 특별 회차는 `null` */
  readonly episodeNumber: number | null;
  readonly title: string;
  readonly treatment: string;
  readonly isSpecial: boolean;
  readonly referenceEpisodeId: string | null;
  readonly placement: SpecialEpisodePlacement | null;
}

export interface BatchDeadlineItem {
  readonly id: string;
  readonly episodeId: string;
  readonly episodeLabel: string;
  readonly isSpecialEpisode: boolean;
  readonly processKey: string;
  readonly processLabel: string;
  readonly dueDateIso: string;
}

export interface BatchDeadlineGenerationInput {
  readonly episodes: readonly ManagedEpisodeEntry[];
  readonly processKeys: readonly { readonly key: string; readonly label: string }[];
  readonly startDateIso: string;
  readonly intervalDays: number;
  readonly includeWeekends: boolean;
  readonly ignoreSpecialEpisodes: boolean;
  readonly overwriteExisting: boolean;
  readonly existingDeadlines: readonly BatchDeadlineItem[];
}

export interface BatchDeadlineGenerationResult {
  readonly mergedDeadlines: readonly BatchDeadlineItem[];
  readonly createdOrUpdated: readonly BatchDeadlineItem[];
  readonly skippedConflictCount: number;
}

/**
 * 시작 번호~종료 번호 범위에서 이미 존재하는 일반 회차 번호를 건너뛰고 생성할 번호 목록을 계산한다.
 */
export function computeBatchEpisodeNumbers(input: {
  readonly startNumber: number;
  readonly endNumber: number;
  readonly existingNumbers: readonly number[];
  readonly skipEpisodeCount?: number;
}): {
  readonly createdNumbers: readonly number[];
  readonly skippedNumbers: readonly number[];
} {
  const start = Math.max(1, Math.trunc(Math.min(input.startNumber, input.endNumber)));
  const end = Math.max(start, Math.trunc(Math.max(input.startNumber, input.endNumber)));
  const skipFloor = Math.max(0, Math.trunc(input.skipEpisodeCount ?? 0));
  const existingSet = new Set(input.existingNumbers.map((num) => Math.trunc(num)));
  const createdNumbers: number[] = [];
  const skippedNumbers: number[] = [];

  for (let num = start; num <= end; num += 1) {
    if (num <= skipFloor || existingSet.has(num)) {
      skippedNumbers.push(num);
    } else {
      createdNumbers.push(num);
    }
  }
  return { createdNumbers, skippedNumbers };
}

/**
 * 에피소드 삭제 시 `pullSubsequentNumbers === true`(`삭제하고 기존 회차 당기기`)이면
 * 삭제된 일반 회차보다 뒤의 모든 일반 회차 번호를 `-1`씩 앞당긴다. 특별 회차는 번호가 없으므로 유지된다.
 */
export function deleteEpisodeWithOptionalPull(
  episodes: readonly ManagedEpisodeEntry[],
  targetEpisodeId: string,
  pullSubsequentNumbers: boolean,
): readonly ManagedEpisodeEntry[] {
  const target = episodes.find((episode) => episode.episodeId === targetEpisodeId);
  if (!target) return episodes;
  const remaining = episodes.filter((episode) => episode.episodeId !== targetEpisodeId);
  if (!pullSubsequentNumbers || target.episodeNumber === null) {
    return remaining;
  }
  const deletedNumber = target.episodeNumber;
  return remaining.map((episode) => {
    if (episode.episodeNumber !== null && episode.episodeNumber > deletedNumber) {
      const nextNum = episode.episodeNumber - 1;
      return {
        ...episode,
        episodeNumber: nextNum,
      };
    }
    return episode;
  });
}

/** 회차 제목 또는 트리트먼트(시놉시스) 본문으로 에피소드를 검색한다. */
export function filterEpisodesByTreatment(
  episodes: readonly ManagedEpisodeEntry[],
  query: string,
): readonly ManagedEpisodeEntry[] {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return episodes;
  return episodes.filter(
    (episode) =>
      episode.title.toLocaleLowerCase("ko-KR").includes(normalized)
      || episode.treatment.toLocaleLowerCase("ko-KR").includes(normalized),
  );
}

function advanceDateSkippingWeekendsIfNeeded(
  baseDate: Date,
  daysToAdd: number,
  includeWeekends: boolean,
): Date {
  const current = new Date(baseDate.getTime());
  if (includeWeekends) {
    current.setUTCDate(current.getUTCDate() + daysToAdd);
    return current;
  }
  let remaining = Math.max(0, Math.trunc(daysToAdd));
  while (current.getUTCDay() === 0 || current.getUTCDay() === 6) {
    current.setUTCDate(current.getUTCDate() + 1);
  }
  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return current;
}

function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 데드라인 일괄 생성 및 반복 주기 계산:
 * - `ignoreSpecialEpisodes`가 `true`이면 특별 회차(`isSpecial === true`)를 건너뛴다.
 * - `includeWeekends`가 `false`이면 토요일·일요일을 건너뛰어 영업일 기준으로 배치한다.
 * - `overwriteExisting`이 `false`이면 이미 데드라인이 있는 `(episodeId, processKey)` 슬롯은 덮어쓰지 않고 유지한다.
 */
export function generateBatchDeadlines(
  input: BatchDeadlineGenerationInput,
): BatchDeadlineGenerationResult {
  const startDate = new Date(`${input.startDateIso.slice(0, 10)}T00:00:00.000Z`);
  const validStart = Number.isFinite(startDate.getTime()) ? startDate : new Date();
  const interval = Math.max(1, Math.trunc(input.intervalDays));
  const targetEpisodes = input.ignoreSpecialEpisodes
    ? input.episodes.filter((episode) => !episode.isSpecial)
    : input.episodes;

  const byKey = new Map<string, BatchDeadlineItem>(
    input.existingDeadlines.map((item) => [`${item.episodeId}:${item.processKey}`, item]),
  );
  const createdOrUpdated: BatchDeadlineItem[] = [];
  let skippedConflictCount = 0;

  targetEpisodes.forEach((episode, episodeIndex) => {
    const episodeOffsetDays = episodeIndex * interval;
    const dueDate = advanceDateSkippingWeekendsIfNeeded(
      validStart,
      episodeOffsetDays,
      input.includeWeekends,
    );
    const dueDateIso = toIsoDateOnly(dueDate);
    const episodeLabel = episode.episodeNumber !== null
      ? `${episode.episodeNumber}화 · ${episode.title}`
      : `특별편 · ${episode.title}`;

    for (const process of input.processKeys) {
      const slotKey = `${episode.episodeId}:${process.key}`;
      const existing = byKey.get(slotKey);
      if (existing && !input.overwriteExisting) {
        skippedConflictCount += 1;
        continue;
      }
      const nextItem: BatchDeadlineItem = {
        id: existing?.id ?? `deadline-${episode.episodeId}-${process.key}`,
        episodeId: episode.episodeId,
        episodeLabel,
        isSpecialEpisode: episode.isSpecial,
        processKey: process.key,
        processLabel: process.label,
        dueDateIso,
      };
      byKey.set(slotKey, nextItem);
      createdOrUpdated.push(nextItem);
    }
  });

  return {
    mergedDeadlines: [...byKey.values()],
    createdOrUpdated,
    skippedConflictCount,
  };
}

/**
 * 데드라인 드래그 이동 시 `cascade`(`일괄 수정`)이면 같은 공정의 후속 데드라인도 모두 `deltaDays`만큼 이동하고,
 * `single`(`해당 일정만 수정`)이면 선택한 데드라인 하나만 이동한다.
 */
export function shiftDeadlinesCascade(input: {
  readonly deadlines: readonly BatchDeadlineItem[];
  readonly anchorId: string;
  readonly deltaDays: number;
  readonly mode: DeadlineShiftCascadeMode;
}): readonly BatchDeadlineItem[] {
  const anchor = input.deadlines.find((item) => item.id === input.anchorId);
  if (!anchor || input.deltaDays === 0) return input.deadlines;

  const shiftIso = (iso: string, delta: number): string => {
    const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return iso;
    date.setUTCDate(date.getUTCDate() + delta);
    return toIsoDateOnly(date);
  };

  return input.deadlines.map((item) => {
    if (item.id === anchor.id) {
      return { ...item, dueDateIso: shiftIso(item.dueDateIso, input.deltaDays) };
    }
    if (
      input.mode === "cascade"
      && item.processKey === anchor.processKey
      && item.dueDateIso >= anchor.dueDateIso
    ) {
      return { ...item, dueDateIso: shiftIso(item.dueDateIso, input.deltaDays) };
    }
    return item;
  });
}

/** 선택한 회차·공정 범위의 데드라인을 일괄 삭제한다. */
export function batchDeleteDeadlines(input: {
  readonly deadlines: readonly BatchDeadlineItem[];
  readonly episodeIds: ReadonlySet<string>;
  readonly processKeys: ReadonlySet<string>;
}): { readonly remaining: readonly BatchDeadlineItem[]; readonly deletedCount: number } {
  const remaining = input.deadlines.filter(
    (item) => !(input.episodeIds.has(item.episodeId) && input.processKeys.has(item.processKey)),
  );
  return {
    remaining,
    deletedCount: input.deadlines.length - remaining.length,
  };
}
