/**
 * 캐릭터 커버리지 맵 (REPORT P-3) — 회차별 등장·의상·표정 집계 코어.
 *
 * 문제: 조연이 수십 화 만에 재등장하면 의상·표정이 바뀌어 있는 사고가 잦다.
 * 바이블(studio-story-bible)은 "현재 정본"만 알려주고 "언제 어떻게 등장했는지"는
 * 알려주지 않는다. 이 모듈은 회차 메타(등장 기록)를 집계해 히트맵 셀과
 * "마지막 등장 요약"을 만든다.
 *
 * 정직성 규칙 (기존 레인들과 동일):
 * - 메타가 아예 없는 회차는 "등장 안 함"이 아니라 "미기록(unknown)"으로 둔다.
 *   등장 기록이 1건이라도 있는 회차에서만 특정 캐릭터의 부재를 absent 로 판정한다.
 * - 의상·표정이 기록에 없으면 null 그대로 둔다. 캐릭터의 기본 의상
 *   (defaultCostumeId)으로 몰래 채우지 않는다 — 요약이 "그때 모습"을 말하려면
 *   기록된 값만 써야 한다.
 * - 모르는 캐릭터·회차 id 를 가리키는 기록은 버리되, 버린 개수를
 *   ignoredRecordCount 로 드러낸다 (조용한 누락 금지).
 *
 * 데이터 소스: 호출부가 주는 회차 등장 기록이 정본이다. 컷 메타가 없는 회차는
 * 수동 태그가 같은 모양의 레코드로 들어오면 된다. 장면 단위 연속성 상태
 * (StudioCharacterContinuityState)만 있는 작품은 아래 어댑터가 회차 기록으로 접는다.
 */
import type {
  StudioCharacterContinuityState,
  StudioStoryCharacter,
} from "../studio-story-bible";

/** 커버리지가 열로 삼는 회차 최소 참조. core EpisodePlan 이 구조적으로 만족한다. */
export interface CoverageEpisodeRef {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
}

/**
 * 회차×캐릭터 등장 기록 1건 — 컷 메타 집계든 수동 태그든 이 모양으로 들어온다.
 * 같은 회차×캐릭터에 기록이 여럿이면 컷 수는 합산하고, 의상·외형·표정은
 * 마지막(입력 순서) 기록의 값을 쓴다.
 */
export interface CharacterAppearanceRecord {
  readonly episodeId: string;
  readonly characterId: string;
  /** 그 회차에서 실제로 입은 의상 id. 기록이 없으면 null (기본 의상으로 채우지 않음). */
  readonly costumeId: string | null;
  /** 그 회차의 외형(헤어 등) id. 기록이 없으면 null. */
  readonly appearanceId: string | null;
  /** 대표 표정 라벨 (자유 문자열, 예: "미소", "분노"). 기록이 없으면 null. */
  readonly expression: string | null;
  /** 그 회차에서 이 캐릭터가 나온 컷 수. 0이면 "등장은 했으나 컷 수 미상"으로 센다. */
  readonly cutCount: number;
}

export type CoverageCellState = "present" | "absent" | "unknown";

export interface CoverageCell {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly state: CoverageCellState;
  /** present 일 때만 의미가 있다. absent/unknown 은 0. */
  readonly cutCount: number;
  readonly costumeId: string | null;
  readonly appearanceId: string | null;
  readonly expression: string | null;
}

export interface CoverageLabelCount {
  readonly label: string;
  readonly count: number;
}

export interface LastAppearanceSummary {
  readonly characterId: string;
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly episodeTitle: string;
  readonly costumeId: string | null;
  readonly appearanceId: string | null;
  readonly expression: string | null;
  readonly cutCount: number;
  /** 기준 회차(기본: 기록이 있는 가장 최근 회차)로부터 몇 회차 전인가. */
  readonly episodesAgo: number;
}

export interface CharacterCoverageRow {
  readonly characterId: string;
  readonly name: string;
  readonly cells: readonly CoverageCell[];
  /** 등장(present)한 회차 수. */
  readonly appearedEpisodeCount: number;
  readonly totalCuts: number;
  readonly firstEpisodeNumber: number | null;
  readonly lastEpisodeNumber: number | null;
  readonly lastAppearance: LastAppearanceSummary | null;
  /** 마지막 등장 뒤, 기록이 있는 회차 중 등장하지 않은 회차 수. 미등장이면 null. */
  readonly currentGap: number | null;
  /** 첫~마지막 등장 사이, 기록이 있는 회차 기준 최장 연속 부재. 미등장이면 0. */
  readonly longestGap: number;
  /** 의상 id 빈도 (많은 순). null(미기록)은 세지 않는다. */
  readonly costumeFrequency: readonly CoverageLabelCount[];
  /** 대표 표정 빈도 (많은 순). null(미기록)은 세지 않는다. */
  readonly expressionFrequency: readonly CoverageLabelCount[];
  readonly neverAppeared: boolean;
}

export interface CharacterCoverage {
  /** episodeNumber 오름차순으로 정렬된 열 목록. */
  readonly episodes: readonly (CoverageEpisodeRef & { readonly hasAnyRecord: boolean })[];
  readonly rows: readonly CharacterCoverageRow[];
  /** 모르는 캐릭터·회차를 가리켜 버려진 기록 수. */
  readonly ignoredRecordCount: number;
  /** 기록이 1건이라도 있는 가장 최근 회차 번호. 기록이 전혀 없으면 null. */
  readonly latestRecordedEpisodeNumber: number | null;
}

function sanitizeCutCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function frequencyTop(values: readonly (string | null)[]): readonly CoverageLabelCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === null || !value.trim()) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.freeze(
    [...counts.entries()]
      .map(([label, count]) => Object.freeze({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  );
}

export function buildCharacterCoverage(
  characters: readonly StudioStoryCharacter[],
  episodes: readonly CoverageEpisodeRef[],
  appearances: readonly CharacterAppearanceRecord[],
): CharacterCoverage {
  const orderedEpisodes = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const knownCharacters = new Set(characters.map((character) => character.id));
  const knownEpisodes = new Set(orderedEpisodes.map((episode) => episode.episodeId));

  // 회차×캐릭터 병합: 컷 수 합산, 의상·외형·표정은 마지막 기록 우선.
  const merged = new Map<string, CharacterAppearanceRecord & { cutCount: number }>();
  const episodesWithRecords = new Set<string>();
  let ignoredRecordCount = 0;
  for (const record of appearances) {
    if (!knownCharacters.has(record.characterId) || !knownEpisodes.has(record.episodeId)) {
      ignoredRecordCount += 1;
      continue;
    }
    episodesWithRecords.add(record.episodeId);
    const key = `${record.episodeId}\u0000${record.characterId}`;
    const previous = merged.get(key);
    if (previous) {
      previous.cutCount += sanitizeCutCount(record.cutCount);
      // 의상·외형·표정은 "그 회차의 마지막 모습"이 정본이라 뒤 기록으로 교체한다.
      merged.set(key, {
        episodeId: record.episodeId,
        characterId: record.characterId,
        costumeId: record.costumeId,
        appearanceId: record.appearanceId,
        expression: record.expression,
        cutCount: previous.cutCount,
      });
    } else {
      merged.set(key, { ...record, cutCount: sanitizeCutCount(record.cutCount) });
    }
  }

  const recordedNumbers = orderedEpisodes
    .filter((episode) => episodesWithRecords.has(episode.episodeId))
    .map((episode) => episode.episodeNumber);
  const latestRecordedEpisodeNumber =
    recordedNumbers.length > 0 ? Math.max(...recordedNumbers) : null;

  const rows = characters.map((character) => {
    const cells: CoverageCell[] = orderedEpisodes.map((episode) => {
      const hasAnyRecord = episodesWithRecords.has(episode.episodeId);
      const record = merged.get(`${episode.episodeId}\u0000${character.id}`);
      if (!hasAnyRecord) {
        return Object.freeze({
          episodeId: episode.episodeId,
          episodeNumber: episode.episodeNumber,
          state: "unknown" as const,
          cutCount: 0,
          costumeId: null,
          appearanceId: null,
          expression: null,
        });
      }
      if (!record) {
        return Object.freeze({
          episodeId: episode.episodeId,
          episodeNumber: episode.episodeNumber,
          state: "absent" as const,
          cutCount: 0,
          costumeId: null,
          appearanceId: null,
          expression: null,
        });
      }
      return Object.freeze({
        episodeId: episode.episodeId,
        episodeNumber: episode.episodeNumber,
        state: "present" as const,
        cutCount: record.cutCount,
        costumeId: record.costumeId,
        appearanceId: record.appearanceId,
        expression: record.expression,
      });
    });

    const present = cells.filter((cell) => cell.state === "present");
    const first = present[0] ?? null;
    const last = present[present.length - 1] ?? null;
    const episodeTitleOf = (episodeId: string) =>
      orderedEpisodes.find((episode) => episode.episodeId === episodeId)?.title ?? "";

    let currentGap: number | null = null;
    let longestGap = 0;
    if (last) {
      currentGap = cells.filter(
        (cell) => cell.episodeNumber > last.episodeNumber && cell.state !== "unknown",
      ).length;
      // 첫~마지막 등장 사이의 연속 부재 (기록 있는 회차만 센다).
      let run = 0;
      for (const cell of cells) {
        if (first && cell.episodeNumber < first.episodeNumber) continue;
        if (cell.episodeNumber > last.episodeNumber) break;
        if (cell.state === "absent") {
          run += 1;
          longestGap = Math.max(longestGap, run);
        } else if (cell.state === "present") {
          run = 0;
        }
      }
    }

    const lastAppearance: LastAppearanceSummary | null = last
      ? Object.freeze({
          characterId: character.id,
          episodeId: last.episodeId,
          episodeNumber: last.episodeNumber,
          episodeTitle: episodeTitleOf(last.episodeId),
          costumeId: last.costumeId,
          appearanceId: last.appearanceId,
          expression: last.expression,
          cutCount: last.cutCount,
          episodesAgo:
            latestRecordedEpisodeNumber === null
              ? 0
              : Math.max(
                  0,
                  cells.filter(
                    (cell) =>
                      cell.episodeNumber > last.episodeNumber && cell.state !== "unknown",
                  ).length,
                ),
        })
      : null;

    return Object.freeze({
      characterId: character.id,
      name: character.name,
      cells: Object.freeze(cells),
      appearedEpisodeCount: present.length,
      totalCuts: present.reduce((sum, cell) => sum + cell.cutCount, 0),
      firstEpisodeNumber: first?.episodeNumber ?? null,
      lastEpisodeNumber: last?.episodeNumber ?? null,
      lastAppearance,
      currentGap,
      longestGap,
      costumeFrequency: frequencyTop(present.map((cell) => cell.costumeId)),
      expressionFrequency: frequencyTop(present.map((cell) => cell.expression)),
      neverAppeared: present.length === 0,
    });
  });

  return Object.freeze({
    episodes: Object.freeze(
      orderedEpisodes.map((episode) =>
        Object.freeze({ ...episode, hasAnyRecord: episodesWithRecords.has(episode.episodeId) }),
      ),
    ),
    rows: Object.freeze(rows),
    ignoredRecordCount,
    latestRecordedEpisodeNumber,
  });
}

/**
 * 재등장 판정용: 기준 회차보다 "전에" 마지막으로 등장한 모습을 찾는다.
 * 기준 회차 자체의 등장은 세지 않는다(이번 화에 다시 그리려는 상황 기준).
 * 등장한 적이 없으면 null.
 */
export function lastAppearanceBefore(
  coverage: CharacterCoverage,
  characterId: string,
  episodeNumber: number,
): (LastAppearanceSummary & { readonly gapEpisodes: number }) | null {
  const row = coverage.rows.find((entry) => entry.characterId === characterId);
  if (!row) return null;
  const candidates = row.cells.filter(
    (cell) => cell.state === "present" && cell.episodeNumber < episodeNumber,
  );
  const last = candidates[candidates.length - 1];
  if (!last) return null;
  const episodeTitle =
    coverage.episodes.find((episode) => episode.episodeId === last.episodeId)?.title ?? "";
  return Object.freeze({
    characterId,
    episodeId: last.episodeId,
    episodeNumber: last.episodeNumber,
    episodeTitle,
    costumeId: last.costumeId,
    appearanceId: last.appearanceId,
    expression: last.expression,
    cutCount: last.cutCount,
    episodesAgo: episodeNumber - last.episodeNumber,
    gapEpisodes: episodeNumber - last.episodeNumber,
  });
}

/** 오래 안 나온 캐릭터 — 기획 판단용. 등장한 적 없는 캐릭터는 별도 목록으로 분리한다. */
export function coverageGapAlerts(
  coverage: CharacterCoverage,
  threshold = 5,
): {
  readonly longAbsent: readonly CharacterCoverageRow[];
  readonly neverAppeared: readonly CharacterCoverageRow[];
} {
  const longAbsent = coverage.rows
    .filter((row) => row.currentGap !== null && row.currentGap >= threshold)
    .sort((a, b) => (b.currentGap ?? 0) - (a.currentGap ?? 0));
  return Object.freeze({
    longAbsent: Object.freeze(longAbsent),
    neverAppeared: Object.freeze(coverage.rows.filter((row) => row.neverAppeared)),
  });
}

/** 마지막 등장 한 줄 요약 — 표면(카드·시트)이 그대로 표시하는 문장. 라벨 맵은 표시용으로만 쓴다. */
export function lastAppearanceSummaryLine(
  summary: LastAppearanceSummary,
  labels?: {
    readonly costumeLabels?: Readonly<Record<string, string>>;
    readonly appearanceLabels?: Readonly<Record<string, string>>;
  },
): string {
  const parts: string[] = [`${summary.episodeNumber}화`];
  if (summary.episodeTitle.trim()) parts[0] += ` 「${summary.episodeTitle.trim()}」`;
  parts.push(
    summary.costumeId
      ? `의상 ${labels?.costumeLabels?.[summary.costumeId] ?? summary.costumeId}`
      : "의상 기록 없음",
  );
  if (summary.appearanceId) {
    parts.push(`외형 ${labels?.appearanceLabels?.[summary.appearanceId] ?? summary.appearanceId}`);
  }
  parts.push(summary.expression ? `대표 표정 ${summary.expression}` : "표정 기록 없음");
  if (summary.cutCount > 0) parts.push(`${summary.cutCount}컷`);
  if (summary.episodesAgo > 0) parts.push(`(${summary.episodesAgo}회차 전)`);
  return parts.join(" · ");
}

/**
 * 연속성 상태(장면 단위) → 회차 등장 기록 어댑터.
 * sceneEpisode 로 장면이 어느 회차인지 알아야 접을 수 있다. 매핑이 없는 장면의
 * 상태는 버리고 skipped 로 센다. 컷 메타가 없는 작품의 폴백 경로다 —
 * 이 경로의 cutCount 는 "등장한 장면 수"이지 실제 컷 수가 아니다(표면 고지 대상).
 * 의상·외형은 회차 안에서 sequence 가 가장 큰 상태의 값을 쓴다.
 */
export function appearancesFromContinuityStates(
  states: readonly StudioCharacterContinuityState[],
  sceneEpisode: Readonly<Record<string, string>>,
): { readonly records: readonly CharacterAppearanceRecord[]; readonly skipped: number } {
  const byKey = new Map<
    string,
    { record: CharacterAppearanceRecord & { cutCount: number }; maxSequence: number }
  >();
  let skipped = 0;
  for (const state of states) {
    const episodeId = sceneEpisode[state.sceneId];
    if (!episodeId) {
      skipped += 1;
      continue;
    }
    const key = `${episodeId}\u0000${state.characterId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        record: {
          episodeId,
          characterId: state.characterId,
          costumeId: state.costumeId,
          appearanceId: state.appearanceId,
          expression: null,
          cutCount: 1,
        },
        maxSequence: state.sequence,
      });
      continue;
    }
    existing.record.cutCount += 1;
    if (state.sequence >= existing.maxSequence) {
      existing.maxSequence = state.sequence;
      byKey.set(key, {
        record: {
          ...existing.record,
          costumeId: state.costumeId,
          appearanceId: state.appearanceId,
        },
        maxSequence: state.sequence,
      });
    }
  }
  return Object.freeze({
    records: Object.freeze([...byKey.values()].map((entry) => Object.freeze(entry.record))),
    skipped,
  });
}
