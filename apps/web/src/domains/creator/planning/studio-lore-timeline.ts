/**
 * 로어 연표 전용 뷰 모델 — story 섹션 timeline 뷰의 본문 데이터 도출.
 *
 * 왜 별도 파일인가 (현재 상태 실측, 2026-10-14):
 * - 세계관 허브(StudioWorldLoreHub) 안 연표 섹션은 허브의 한 부분이라, 허브를
 *   열지 않으면 사건의 시간 순서를 한눈에 볼 방법이 없었다. story 뷰 레지스트리
 *   (studio-project-views.ts)에는 "timeline" 뷰가 이미 선언돼 있지만 본문 표면이
 *   없어 목적지 배너만 떴다.
 * - 이 뷰는 새 데이터가 아니다. 사건 목록·정렬은 허브와 완전히 같은 출처를 쓴다:
 *   같은 저장소(studio-world-lore-store)가 돌려준 StudioWorldLore 를, 허브가 쓰는
 *   바로 그 도출 함수 loreTimeline() 으로 정렬한다. 그래서 허브에서 사건을
 *   추가·수정·삭제하면 연표 뷰도 같은 순서·같은 내용으로 따라간다(구독은 컨테이너 몫).
 * - 이 파일이 더하는 것은 "전용 뷰로서의 읽기 모양"뿐이다: 표시용 시기 문구(없으면
 *   "시기 미정"), 시기 미정 판정(검증기 validateWorldLore 의 lore-event-undated 와
 *   같은 조건 — 시기 표기도 순서 키도 없는 사건), 연결 상대 이름 해소, 요약 수치.
 *   정렬 규칙을 여기서 다시 정의하지 않는다 — loreTimeline 이 단일 출처다.
 */
import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  loreRelatedEntries,
  loreTimeline,
  type StudioLoreEntry,
  type StudioWorldLore,
} from "./studio-world-lore";

/** 시기 표기가 없을 때 화면에 보이는 대체 문구 — 모델이 단일 출처로 고정한다. */
export const LORE_TIMELINE_UNDATED_LABEL = "시기 미정";

export interface StudioLoreTimelineRow {
  readonly entry: StudioLoreEntry;
  /** 1부터 시작하는 연표 순서 — loreTimeline 정렬 결과 그대로. */
  readonly position: number;
  /** 작가가 적은 시기 표기 (없으면 빈 문자열). */
  readonly eraLabel: string;
  /** 화면 표기용 시기 — eraLabel 이 비면 LORE_TIMELINE_UNDATED_LABEL. */
  readonly eraDisplay: string;
  /**
   * 시기 미정 — 시기 표기도 없고 정렬 키도 없는 사건.
   * validateWorldLore 의 "lore-event-undated" 경고와 같은 조건이라, 이 표시가
   * 뜨는 사건은 허브 검증에서도 같은 경고가 뜬다.
   */
  readonly undated: boolean;
  /** 연결된 설정 항목의 이름들 (저장 순서, dangling 참조는 loreRelatedEntries 가 제외). */
  readonly relatedNames: readonly string[];
  /** 연결된 캐릭터의 이름들 (모르는 id 는 id 문자열로 폴백 — 허브 표기와 같은 규칙). */
  readonly characterNames: readonly string[];
}

export interface StudioLoreTimelineView {
  readonly rows: readonly StudioLoreTimelineRow[];
  /** 작품의 전체 설정 항목 수 — "설정은 있는데 사건만 없는" 빈 상태를 구분하는 데 쓴다. */
  readonly totalEntryCount: number;
  readonly eventCount: number;
  /** 시기 표기 또는 정렬 키가 있는 사건 수. */
  readonly datedCount: number;
  readonly undatedCount: number;
}

export function buildLoreTimelineView(
  lore: StudioWorldLore,
  characters: readonly StudioStoryCharacter[],
): StudioLoreTimelineView {
  const characterName = (id: string) =>
    characters.find((character) => character.id === id)?.name ?? id;

  const rows = loreTimeline(lore).map((entry, index) => {
    const eraLabel = entry.eraLabel.trim();
    const undated = eraLabel === "" && entry.timelineOrder === null;
    return Object.freeze({
      entry,
      position: index + 1,
      eraLabel,
      eraDisplay: eraLabel === "" ? LORE_TIMELINE_UNDATED_LABEL : eraLabel,
      undated,
      relatedNames: Object.freeze(loreRelatedEntries(lore, entry).map((rel) => rel.name)),
      characterNames: Object.freeze(entry.characterIds.map((id) => characterName(id))),
    });
  });

  const undatedCount = rows.filter((row) => row.undated).length;
  return Object.freeze({
    rows: Object.freeze(rows),
    totalEntryCount: lore.entries.length,
    eventCount: rows.length,
    datedCount: rows.length - undatedCount,
    undatedCount,
  });
}

/** 연표 상단 요약 한 줄 — 사건이 없을 때는 빈 문자열(빈 상태 문구가 대신 말한다). */
export function loreTimelineSummaryLine(view: StudioLoreTimelineView): string {
  if (view.eventCount === 0) return "";
  const base = `사건 ${view.eventCount}개 · 시기 표기 있음 ${view.datedCount}개`;
  return view.undatedCount > 0 ? `${base} · 시기 미정 ${view.undatedCount}개` : base;
}
