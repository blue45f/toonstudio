/**
 * 캐릭터 등장 씬/회차 역조회 (REPORT G4 — Plottr 프로필↔씬 연결) 코어.
 *
 * 문제: 캐릭터 시트(프로필)는 "이 인물이 어떤 사람인가"만 알려준다. 정작 작가가
 * 필요한 순간은 "이 캐릭터, 몇 화 어떤 씬에 나왔지?" 인데, 지금까지는 회차마다
 * 일일이 열어 뒤져야 했다. Plottr 가 프로필에서 씬 목록으로 바로 잇는 것처럼,
 * 이 모듈은 등장 기록을 캐릭터 기준으로 뒤집어 "등장 회차 → 그 안의 씬" 목록을
 * 만들고, 표면은 항목 클릭 한 번으로 회차 룸/콘티로 보낸다.
 *
 * 데이터 공유: 회차 단위 등장 기록은 캐릭터 커버리지 맵
 * (studio-character-coverage.ts)의 CharacterAppearanceRecord 를 그대로 쓴다.
 * 씬 단위 기록은 이 모듈이 신설하는 입력 계약이다 — 컷·콘티 메타 집계든,
 * 연속성 상태(StudioCharacterContinuityState) 어댑터든 같은 모양으로 들어온다.
 *
 * 정직성 규칙 (커버리지 맵과 동일):
 * - 씬 단위 기록이 없는 회차는 "씬 없음"이 아니라 sceneDetail: "none" 으로
 *   구분한다. 회차 단위 기록만으로 등장 사실은 확정하되, 씬 목록을 지어내지
 *   않는다.
 * - 씬 제목·순서를 모르면 null 그대로 둔다. 임의의 "씬 1" 같은 이름을 만들지
 *   않는다 (표면은 sceneId 가 아니라 "제목 기록 없음"으로 말한다).
 * - 모르는 캐릭터·회차 id 를 가리키는 기록은 버리되 ignoredRecordCount 로
 *   드러낸다 (조용한 누락 금지). 다른 캐릭터의 기록은 이 캐릭터의 역조회에
 *   섞지 않고, 세지도 않는다 — 남의 기록은 이 조회에서 "버려진 것"이 아니다.
 * - 컷 수 이중계상 금지: 한 회차에 씬 기록이 있으면 컷 수는 씬 기록 합을 쓰고,
 *   회차 단위 기록의 cutCount 는 씬 기록이 없을 때만 쓴다. 두 출처가 같은
 *   등장을 세는 경우가 대부분이라 합산하면 부풀려진다.
 * - 의상·외형·표정도 같은 우선순위다: 씬 기록이 있으면 마지막 씬(순서 최대,
 *   동률이면 입력 순서 뒤)의 값, 없으면 회차 단위 기록의 값.
 */
import type {
  StudioCharacterContinuityState,
  StudioStoryCharacter,
} from "../studio-story-bible";
import type {
  CharacterAppearanceRecord,
  CoverageEpisodeRef,
} from "./studio-character-coverage";

/**
 * 씬 단위 등장 기록 1건 — 이 캐릭터가 이 회차의 이 씬에 나왔다는 사실.
 * 같은 회차×씬×캐릭터에 기록이 여럿이면 컷 수는 합산하고, 의상·외형·표정은
 * 마지막(입력 순서) 기록의 값을 쓴다 (커버리지 맵의 회차 병합 규칙과 동일).
 */
export interface CharacterSceneAppearanceRecord {
  readonly episodeId: string;
  readonly characterId: string;
  readonly sceneId: string;
  /** 그 씬에서 실제로 입은 의상 id. 기록이 없으면 null. */
  readonly costumeId: string | null;
  /** 그 씬의 외형(헤어 등) id. 기록이 없으면 null. */
  readonly appearanceId: string | null;
  /** 그 씬의 대표 표정 라벨 (자유 문자열). 기록이 없으면 null. */
  readonly expression: string | null;
  /** 그 씬에서 이 캐릭터가 나온 컷 수. 0이면 "등장은 했으나 컷 수 미상". */
  readonly cutCount: number;
}

/** 씬 표시 메타 — 제목·순서를 아는 씬만 넘긴다. 모르는 씬은 목록에 없어도 된다. */
export interface AppearanceSceneRef {
  readonly sceneId: string;
  readonly episodeId: string;
  /** 씬 제목. 모르면 null — 표면은 지어내지 않고 "제목 기록 없음"으로 말한다. */
  readonly title: string | null;
  /** 회차 안에서의 씬 순서(작을수록 앞). 모르면 null. */
  readonly sequence: number | null;
}

export interface AppearanceSceneEntry {
  readonly sceneId: string;
  /** 씬 제목. 모르면 null. */
  readonly title: string | null;
  /** 회차 안 씬 순서. 모르면 null (정렬에서는 뒤로 간다). */
  readonly sequence: number | null;
  readonly costumeId: string | null;
  readonly appearanceId: string | null;
  readonly expression: string | null;
  readonly cutCount: number;
}

export interface AppearanceEpisodeEntry {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly episodeTitle: string;
  /**
   * 컷 수 — 씬 기록이 있으면 씬 합, 없으면 회차 단위 기록의 값.
   * 어느 출처인지 cutSource 로 함께 드러낸다.
   */
  readonly cutCount: number;
  readonly cutSource: "scenes" | "episode-record";
  readonly costumeId: string | null;
  readonly appearanceId: string | null;
  readonly expression: string | null;
  /** 씬 단위 기록이 있으면 그 목록(순서 오름차순), 없으면 빈 배열. */
  readonly scenes: readonly AppearanceSceneEntry[];
  /** "scenes" = 씬 목록을 펼칠 수 있다. "none" = 회차 단위 기록만 있다. */
  readonly sceneDetail: "scenes" | "none";
}

export interface CharacterAppearanceLookup {
  readonly characterId: string;
  readonly name: string;
  /** 등장 회차 목록 — 최근 회차부터 (역조회는 최신 등장을 먼저 찾는 동선). */
  readonly episodes: readonly AppearanceEpisodeEntry[];
  readonly totalEpisodes: number;
  /** 씬 단위 기록이 있는 씬 수 합계. */
  readonly totalScenes: number;
  readonly totalCuts: number;
  /** 씬 목록까지 펼칠 수 있는 회차 수. */
  readonly episodesWithSceneDetail: number;
  /** 이 캐릭터를 가리키지만 모르는 회차를 참조해 버려진 기록 수. */
  readonly ignoredRecordCount: number;
}

function sanitizeCutCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * 캐릭터 1명의 등장 역조회.
 * episodeRecords 는 커버리지 맵과 공유하는 회차 단위 기록(전 캐릭터분),
 * sceneRecords 는 씬 단위 기록(전 캐릭터분)이다 — 이 캐릭터 것만 골라 쓴다.
 * sceneRefs 는 아는 씬의 제목·순서 메타 (없으면 전부 미상).
 */
export function buildCharacterAppearanceLookup(
  character: StudioStoryCharacter,
  episodes: readonly CoverageEpisodeRef[],
  episodeRecords: readonly CharacterAppearanceRecord[],
  sceneRecords: readonly CharacterSceneAppearanceRecord[],
  sceneRefs: readonly AppearanceSceneRef[] = [],
): CharacterAppearanceLookup {
  const episodeById = new Map(episodes.map((episode) => [episode.episodeId, episode]));
  const sceneRefByKey = new Map(
    sceneRefs.map((ref) => [`${ref.episodeId}\u0000${ref.sceneId}`, ref] as const),
  );
  let ignoredRecordCount = 0;

  // 회차 단위 기록 — 이 캐릭터 것만, 같은 회차 중복은 커버리지 맵과 같은 규칙
  // (컷 합산, 의상·외형·표정은 마지막 기록 우선).
  const episodeRecordById = new Map<string, CharacterAppearanceRecord & { cutCount: number }>();
  for (const record of episodeRecords) {
    if (record.characterId !== character.id) continue;
    if (!episodeById.has(record.episodeId)) {
      ignoredRecordCount += 1;
      continue;
    }
    const previous = episodeRecordById.get(record.episodeId);
    if (previous) {
      episodeRecordById.set(record.episodeId, {
        episodeId: record.episodeId,
        characterId: record.characterId,
        costumeId: record.costumeId,
        appearanceId: record.appearanceId,
        expression: record.expression,
        cutCount: previous.cutCount + sanitizeCutCount(record.cutCount),
      });
    } else {
      episodeRecordById.set(record.episodeId, {
        ...record,
        cutCount: sanitizeCutCount(record.cutCount),
      });
    }
  }

  // 씬 단위 기록 — 회차×씬 병합 후 회차별로 모은다.
  const mergedScenes = new Map<string, CharacterSceneAppearanceRecord & { cutCount: number }>();
  for (const record of sceneRecords) {
    if (record.characterId !== character.id) continue;
    if (!episodeById.has(record.episodeId)) {
      ignoredRecordCount += 1;
      continue;
    }
    const key = `${record.episodeId}\u0000${record.sceneId}`;
    const previous = mergedScenes.get(key);
    if (previous) {
      mergedScenes.set(key, {
        episodeId: record.episodeId,
        characterId: record.characterId,
        sceneId: record.sceneId,
        costumeId: record.costumeId,
        appearanceId: record.appearanceId,
        expression: record.expression,
        cutCount: previous.cutCount + sanitizeCutCount(record.cutCount),
      });
    } else {
      mergedScenes.set(key, { ...record, cutCount: sanitizeCutCount(record.cutCount) });
    }
  }
  const scenesByEpisode = new Map<string, (CharacterSceneAppearanceRecord & { cutCount: number })[]>();
  for (const scene of mergedScenes.values()) {
    const list = scenesByEpisode.get(scene.episodeId) ?? [];
    list.push(scene);
    scenesByEpisode.set(scene.episodeId, list);
  }

  const presentEpisodeIds = new Set<string>([
    ...episodeRecordById.keys(),
    ...scenesByEpisode.keys(),
  ]);

  const entries: AppearanceEpisodeEntry[] = [...presentEpisodeIds].map((episodeId) => {
    const episode = episodeById.get(episodeId) as CoverageEpisodeRef;
    const episodeRecord = episodeRecordById.get(episodeId) ?? null;
    const sceneRecordsOfEpisode = scenesByEpisode.get(episodeId) ?? [];

    const sceneEntries: AppearanceSceneEntry[] = sceneRecordsOfEpisode
      .map((scene, index) => {
        const ref = sceneRefByKey.get(`${episodeId}\u0000${scene.sceneId}`) ?? null;
        return {
          entry: Object.freeze({
            sceneId: scene.sceneId,
            title: ref?.title ?? null,
            sequence: ref?.sequence ?? null,
            costumeId: scene.costumeId,
            appearanceId: scene.appearanceId,
            expression: scene.expression,
            cutCount: scene.cutCount,
          }) satisfies AppearanceSceneEntry,
          index,
        };
      })
      // 순서 아는 씬부터 오름차순, 모르는 씬은 뒤에 입력 순서대로.
      .sort((a, b) => {
        const aSeq = a.entry.sequence;
        const bSeq = b.entry.sequence;
        if (aSeq !== null && bSeq !== null) return aSeq - bSeq || a.index - b.index;
        if (aSeq !== null) return -1;
        if (bSeq !== null) return 1;
        return a.index - b.index;
      })
      .map(({ entry }) => entry);

    const hasScenes = sceneEntries.length > 0;
    // 의상·외형·표정의 "그 회차 마지막 모습": 씬이 있으면 정렬 후 마지막 씬,
    // 없으면 회차 단위 기록.
    const lastScene = hasScenes ? (sceneEntries[sceneEntries.length - 1] as AppearanceSceneEntry) : null;
    return Object.freeze({
      episodeId,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      cutCount: hasScenes
        ? sceneEntries.reduce((sum, scene) => sum + scene.cutCount, 0)
        : (episodeRecord?.cutCount ?? 0),
      cutSource: hasScenes ? ("scenes" as const) : ("episode-record" as const),
      costumeId: lastScene ? lastScene.costumeId : (episodeRecord?.costumeId ?? null),
      appearanceId: lastScene ? lastScene.appearanceId : (episodeRecord?.appearanceId ?? null),
      expression: lastScene ? lastScene.expression : (episodeRecord?.expression ?? null),
      scenes: Object.freeze(sceneEntries),
      sceneDetail: hasScenes ? ("scenes" as const) : ("none" as const),
    });
  });

  // 역조회 동선: 최근 회차부터.
  entries.sort((a, b) => b.episodeNumber - a.episodeNumber);

  return Object.freeze({
    characterId: character.id,
    name: character.name,
    episodes: Object.freeze(entries),
    totalEpisodes: entries.length,
    totalScenes: entries.reduce((sum, entry) => sum + entry.scenes.length, 0),
    totalCuts: entries.reduce((sum, entry) => sum + entry.cutCount, 0),
    episodesWithSceneDetail: entries.filter((entry) => entry.sceneDetail === "scenes").length,
    ignoredRecordCount,
  });
}

/** 역조회 한 회차의 한 줄 요약 — 목록 행·카드가 그대로 표시하는 문장. 라벨 맵은 표시용으로만 쓴다. */
export function appearanceEpisodeLine(
  entry: AppearanceEpisodeEntry,
  labels?: {
    readonly costumeLabels?: Readonly<Record<string, string>>;
    readonly appearanceLabels?: Readonly<Record<string, string>>;
  },
): string {
  const parts: string[] = [`${entry.episodeNumber}화`];
  if (entry.episodeTitle.trim()) parts[0] += ` 「${entry.episodeTitle.trim()}」`;
  if (entry.sceneDetail === "scenes") {
    parts.push(`씬 ${entry.scenes.length}개`);
  }
  parts.push(
    entry.costumeId
      ? `의상 ${labels?.costumeLabels?.[entry.costumeId] ?? entry.costumeId}`
      : "의상 기록 없음",
  );
  if (entry.appearanceId) {
    parts.push(`외형 ${labels?.appearanceLabels?.[entry.appearanceId] ?? entry.appearanceId}`);
  }
  parts.push(entry.expression ? `대표 표정 ${entry.expression}` : "표정 기록 없음");
  if (entry.cutCount > 0) parts.push(`${entry.cutCount}컷`);
  return parts.join(" · ");
}

/**
 * 연속성 상태(장면 단위) → 씬 등장 기록 어댑터.
 * sceneEpisode 로 장면이 어느 회차인지 알아야 접을 수 있다 (커버리지 맵의
 * 회차 어댑터와 같은 매핑 계약). 매핑이 없는 장면의 상태는 버리고 skipped 로
 * 센다. 연속성 상태에는 컷 수·표정이 없어 cutCount 는 0("등장했으나 컷 수
 * 미상"), expression 은 null 로 둔다 — 지어내지 않는다.
 */
export function sceneAppearancesFromContinuityStates(
  states: readonly StudioCharacterContinuityState[],
  sceneEpisode: Readonly<Record<string, string>>,
): { readonly records: readonly CharacterSceneAppearanceRecord[]; readonly skipped: number } {
  let skipped = 0;
  const records: CharacterSceneAppearanceRecord[] = [];
  for (const state of states) {
    const episodeId = sceneEpisode[state.sceneId];
    if (!episodeId) {
      skipped += 1;
      continue;
    }
    records.push(
      Object.freeze({
        episodeId,
        characterId: state.characterId,
        sceneId: state.sceneId,
        costumeId: state.costumeId,
        appearanceId: state.appearanceId,
        expression: null,
        cutCount: 0,
      }),
    );
  }
  return Object.freeze({ records: Object.freeze(records), skipped });
}
