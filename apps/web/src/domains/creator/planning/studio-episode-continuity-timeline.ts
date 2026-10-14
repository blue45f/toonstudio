/**
 * 회차 간 연속성 타임라인 검사 (REPORT R-4) — 시간·장소 태그 정렬·후보 검출 코어.
 *
 * 문제: 이야기 내 시간 흐름(하루가 지났는지, 계절이 바뀌었는지)과 장소 이동의
 * 모순은 장기 연재의 고전 사고다. 그런데 main 의 스토리 바이블
 * (studio-story-bible.ts)에는 "타임라인" 데이터 자체가 없다 — 사실(facts)은
 * label·characterIds·locationId 뿐이고, 회차 줄거리(studio-episode-synopsis)에도
 * 시간·장소 태그 필드가 없다. 그래서 이 모듈은 태그를 "입력 계약"으로 신설하고,
 * 바이블 장소(StudioStoryLocation)로 이름·유효성을 대조하는 순수 검사만 맡는다.
 * 태그를 어디에 저장할지는 호스트(기획 표면) 배선 몫이다.
 *
 * 정직성 규칙 (기존 레인들과 동일):
 * - 태그가 없는 회차, 또는 시작/끝 일차가 모두 비어 있는 회차는 "미기록"으로
 *   빈칸 그대로 둔다. 앞 회차 값으로 몰래 이어 붙이거나 0일차로 채우지 않는다.
 * - 역행·겹침은 전부 "후보"다. 플래시백·병행 시점 같은 의도적 구성일 수 있어
 *   확정 판정 문구를 쓰지 않고, 최종 판정은 사람이 내린다.
 * - 모르는 장소 id 를 가리키는 태그는 그 장소만 버리되, 버린 개수를
 *   ignoredLocationRefCount 로 드러낸다 (조용한 누락 금지).
 * - 시작만 있고 끝이 없으면 그날 하루(start == end)로 본다. 반대로 끝만 있고
 *   시작이 없으면 구간을 만들 수 없어 미기록으로 둔다.
 *
 * 시간 표현: storyDay 는 이야기 시작일을 1 로 하는 누적 일차(양의 유한수).
 * 시각(아침/밤 등)은 판정에 쓰지 않고 timeLabel 로 표시만 한다 — 문자열 시각을
 * 억지로 순서화하지 않는다.
 */
import type { StudioStoryLocation } from "../studio-story-bible";

/** 타임라인이 열로 삼는 회차 최소 참조. core EpisodePlan 이 구조적으로 만족한다. */
export interface ContinuityEpisodeRef {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
}

/**
 * 회차 1개의 시간·장소 태그 — 컷 메타 집계든 수동 입력이든 이 모양으로 들어온다.
 * 같은 회차에 태그가 여럿이면 호출부가 먼저 합쳐서 1건으로 넘긴다.
 */
export interface EpisodeTimePlaceTag {
  readonly episodeId: string;
  /** 이야기 누적 일차 구간 시작 (1 = 첫날). 기록이 없으면 null. */
  readonly storyDayStart: number | null;
  /** 구간 끝. null 이면 시작일 하루로 본다. */
  readonly storyDayEnd: number | null;
  /** 그 회차의 주 장소 id 들 (바이블 장소 기준). 기록이 없으면 빈 배열. */
  readonly locationIds: readonly string[];
  /** 표시용 시간대 라벨 (예: "밤", "다음 날 아침"). 판정에는 쓰지 않는다. */
  readonly timeLabel: string | null;
}

export type ContinuityTimelineCandidateCode =
  | "time-regression"
  | "time-overlap"
  | "parallel-place"
  | "invalid-range";

export interface ContinuityTimelineEntry {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
  /** 시간 태그가 있어 타임라인에 올릴 수 있으면 true. false 면 미기록 빈칸. */
  readonly recorded: boolean;
  /** recorded 일 때만 의미가 있다. 미기록이면 null. */
  readonly storyDayStart: number | null;
  readonly storyDayEnd: number | null;
  /** 바이블에 있는 장소 id 만 남긴 목록. 미기록 회차는 빈 배열. */
  readonly locationIds: readonly string[];
  readonly locationNames: readonly string[];
  readonly timeLabel: string | null;
}

export interface ContinuityTimelineCandidate {
  /** 결정적 id — 같은 입력이면 같은 id 가 나와 중복 표시를 막는다. */
  readonly id: string;
  readonly code: ContinuityTimelineCandidateCode;
  /** [기준 회차, 비교 회차] episodeId. invalid-range 는 해당 회차 1개만. */
  readonly episodeIds: readonly string[];
  readonly episodeNumbers: readonly number[];
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface EpisodeContinuityTimeline {
  /** episodeNumber 오름차순 (동률이면 episodeId 순) 정렬된 한 줄 타임라인. */
  readonly entries: readonly ContinuityTimelineEntry[];
  readonly candidates: readonly ContinuityTimelineCandidate[];
  readonly recordedCount: number;
  /** 미기록(빈칸) 회차 수 — 판정 문구에 그대로 드러낸다. */
  readonly unrecordedCount: number;
  /** 모르는 장소를 가리켜 버려진 장소 참조 수. */
  readonly ignoredLocationRefCount: number;
  /** 모르는 회차를 가리켜 버려진 태그 수. */
  readonly ignoredTagCount: number;
}

function validDay(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function candidate(
  code: ContinuityTimelineCandidateCode,
  episodeIds: readonly string[],
  episodeNumbers: readonly number[],
  messageKo: string,
  messageEn: string,
): ContinuityTimelineCandidate {
  return Object.freeze({
    id: `${code}:${episodeIds.join("+")}`,
    code,
    episodeIds: Object.freeze([...episodeIds]),
    episodeNumbers: Object.freeze([...episodeNumbers]),
    messageKo,
    messageEn,
  });
}

/**
 * 회차 목록 + 시간·장소 태그 + 바이블 장소를 한 줄 타임라인과 후보 목록으로 접는다.
 * 태그가 전혀 없어도 모든 회차가 미기록 빈칸인 타임라인을 반환한다 (빈 결과 아님).
 */
export function buildEpisodeContinuityTimeline(
  episodes: readonly ContinuityEpisodeRef[],
  tags: readonly EpisodeTimePlaceTag[],
  locations: readonly StudioStoryLocation[],
): EpisodeContinuityTimeline {
  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));
  const knownEpisodeIds = new Set(episodes.map((episode) => episode.episodeId));

  const orderedEpisodes = [...episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber || a.episodeId.localeCompare(b.episodeId),
  );

  let ignoredLocationRefCount = 0;
  let ignoredTagCount = 0;
  const tagByEpisodeId = new Map<string, EpisodeTimePlaceTag>();
  for (const tag of tags) {
    if (!knownEpisodeIds.has(tag.episodeId)) {
      ignoredTagCount += 1;
      continue;
    }
    // 같은 회차 태그가 여럿이면 첫 기록을 정본으로 삼는다 (덮어쓰기로 후보가 흔들리지 않게).
    if (!tagByEpisodeId.has(tag.episodeId)) tagByEpisodeId.set(tag.episodeId, tag);
  }

  const candidates: ContinuityTimelineCandidate[] = [];
  const entries: ContinuityTimelineEntry[] = orderedEpisodes.map((episode) => {
    const tag = tagByEpisodeId.get(episode.episodeId);
    if (!tag || !validDay(tag.storyDayStart)) {
      return Object.freeze({
        episodeId: episode.episodeId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        recorded: false,
        storyDayStart: null,
        storyDayEnd: null,
        locationIds: Object.freeze([]),
        locationNames: Object.freeze([]),
        timeLabel: null,
      });
    }
    const start = tag.storyDayStart;
    const end = validDay(tag.storyDayEnd) ? tag.storyDayEnd : start;
    const knownLocationIds: string[] = [];
    for (const locationId of tag.locationIds) {
      if (locationNameById.has(locationId)) knownLocationIds.push(locationId);
      else ignoredLocationRefCount += 1;
    }
    if (end < start) {
      candidates.push(candidate(
        "invalid-range",
        [episode.episodeId],
        [episode.episodeNumber],
        `${episode.episodeNumber}화의 시간 태그가 끝(${end}일차)보다 시작(${start}일차)이 늦어요. 태그 자체를 확인해 주세요.`,
        `Episode ${episode.episodeNumber}'s time tag ends (day ${end}) before it starts (day ${start}). Please check the tag itself.`,
      ));
    }
    return Object.freeze({
      episodeId: episode.episodeId,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      recorded: true,
      storyDayStart: start,
      storyDayEnd: end,
      locationIds: Object.freeze(knownLocationIds),
      locationNames: Object.freeze(knownLocationIds.map((id) => locationNameById.get(id) ?? id)),
      timeLabel: tag.timeLabel?.trim() ? tag.timeLabel.trim() : null,
    });
  });

  // 역행·겹침은 "기록된 회차"끼리 인접 쌍으로만 본다. 미기록 회차를 건너뛰어
  // 비교하되, 건너뛴 사실은 메시지에서 숨기지 않는다(직전 기록 회차라고 밝힌다).
  const recordedEntries = entries.filter(
    (entry): entry is ContinuityTimelineEntry & { storyDayStart: number; storyDayEnd: number } =>
      entry.recorded && entry.storyDayStart !== null && entry.storyDayEnd !== null,
  );
  for (let index = 1; index < recordedEntries.length; index += 1) {
    const previous = recordedEntries[index - 1];
    const current = recordedEntries[index];
    if (!previous || !current) continue;
    // invalid-range 회차는 구간 비교에서 제외한다 (태그 수정이 먼저다).
    if (previous.storyDayEnd < previous.storyDayStart || current.storyDayEnd < current.storyDayStart) continue;
    const pairIds = [previous.episodeId, current.episodeId];
    const pairNumbers = [previous.episodeNumber, current.episodeNumber];
    if (current.storyDayStart < previous.storyDayStart) {
      candidates.push(candidate(
        "time-regression",
        pairIds,
        pairNumbers,
        `${current.episodeNumber}화의 시작(${current.storyDayStart}일차)이 앞선 기록 회차 ${previous.episodeNumber}화의 시작(${previous.storyDayStart}일차)보다 이릅니다. 시간 역행인지, 회상 장면인지 확인해 주세요.`,
        `Episode ${current.episodeNumber} starts on day ${current.storyDayStart}, earlier than the previous recorded episode ${previous.episodeNumber} (day ${previous.storyDayStart}). Please check whether this is a time regression or an intentional flashback.`,
      ));
    } else if (current.storyDayStart < previous.storyDayEnd) {
      candidates.push(candidate(
        "time-overlap",
        pairIds,
        pairNumbers,
        `${previous.episodeNumber}화(${previous.storyDayStart}~${previous.storyDayEnd}일차)와 ${current.episodeNumber}화(${current.storyDayStart}~${current.storyDayEnd}일차)의 이야기 시간이 겹칩니다. 같은 시간대의 병행 장면인지 확인해 주세요.`,
        `Episodes ${previous.episodeNumber} (days ${previous.storyDayStart}-${previous.storyDayEnd}) and ${current.episodeNumber} (days ${current.storyDayStart}-${current.storyDayEnd}) overlap in story time. Please check whether these are intentional parallel scenes.`,
      ));
    }
    const overlaps = current.storyDayStart < previous.storyDayEnd && previous.storyDayStart < current.storyDayEnd;
    const sharesLocation = current.locationIds.some((id) => previous.locationIds.includes(id));
    if (overlaps && previous.locationIds.length > 0 && current.locationIds.length > 0 && !sharesLocation) {
      candidates.push(candidate(
        "parallel-place",
        pairIds,
        pairNumbers,
        `${previous.episodeNumber}화와 ${current.episodeNumber}화는 시간이 겹치는데 장소가 겹치지 않아요 (${previous.locationNames.join(", ")} ↔ ${current.locationNames.join(", ")}). 두 장면이 같은 시간에 다른 곳에서 벌어지는 게 맞는지 확인해 주세요.`,
        `Episodes ${previous.episodeNumber} and ${current.episodeNumber} overlap in time but share no location (${previous.locationNames.join(", ")} vs ${current.locationNames.join(", ")}). Please check whether these scenes really happen at the same time in different places.`,
      ));
    }
  }

  const recordedCount = entries.filter((entry) => entry.recorded).length;
  return Object.freeze({
    entries: Object.freeze(entries),
    candidates: Object.freeze(candidates),
    recordedCount,
    unrecordedCount: entries.length - recordedCount,
    ignoredLocationRefCount,
    ignoredTagCount,
  });
}

/** 타임라인 한 칸의 기간 표기. 미기록이면 null — 표면이 빈칸+미기록으로 그린다. */
export function timelineDayLabel(entry: ContinuityTimelineEntry): string | null {
  if (!entry.recorded || entry.storyDayStart === null || entry.storyDayEnd === null) return null;
  return entry.storyDayStart === entry.storyDayEnd
    ? `${entry.storyDayStart}일차`
    : `${entry.storyDayStart}~${entry.storyDayEnd}일차`;
}

/** 상단 요약 한 줄 — 미기록을 숨기지 않는 문구가 판정 기준이다. */
export function continuityTimelineSummaryLine(timeline: EpisodeContinuityTimeline): string {
  const total = timeline.entries.length;
  if (total === 0) return "아직 회차가 없어 타임라인을 만들 수 없어요.";
  const base = `전체 ${total}화 중 ${timeline.recordedCount}화에 시간 태그가 있어요.`;
  const unrecorded = timeline.unrecordedCount > 0
    ? ` ${timeline.unrecordedCount}화는 미기록이라 빈칸으로 뒀어요.`
    : "";
  const found = timeline.candidates.length > 0
    ? ` 확인할 후보 ${timeline.candidates.length}건이 있어요.`
    : " 역행·겹침 후보는 없어요.";
  return `${base}${unrecorded}${found}`;
}
