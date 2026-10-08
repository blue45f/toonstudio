import { ENGINEERING_STATUS_META, type EngineeringStatus, type LocalizedText } from "./engineering-story-content";
import type { TalkTable, TalkTableSource } from "./engineering-talk-types";

/**
 * 세미나 발표 슬라이드 본문 파일들이 함께 쓰는 작은 도우미.
 * 슬라이드 본문(`engineering-talk-slides-*.ts`)은 이 파일에서 `t`와 표 도우미만 가져온다.
 */

export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/**
 * 표의 "상태" 칸. 상태 이름은 기술 스토리의 상태 라벨 그대로 쓰고, 어떤 상태인지는 근거 지도 행·도감 카드가 정한다
 * (슬라이드는 상태를 소유하지 않는다 — 콘텐츠 테스트가 근거의 상태와 칸을 대조한다).
 * `note`를 주면 라벨 뒤에 짧은 덧말을 붙인다(예: "제외 · legacy 보존").
 */
export function statusCell(status: EngineeringStatus, note?: LocalizedText): LocalizedText {
  const label = ENGINEERING_STATUS_META[status].label;
  return note ? { ko: `${label.ko} · ${note.ko}`, en: `${label.en} · ${note.en}` } : label;
}

/**
 * 데모 슬라이드의 시간 규칙. 단계마다 쓰는 시간(초)과, 한 단계가 틀려도 일정이 무너지지 않게 남기는 여유(초)다.
 * 슬라이드 시간은 `단계 수 × TALK_DEMO_STEP_SECONDS + TALK_DEMO_MIN_SLACK_SECONDS` 이상이어야 하고 콘텐츠 테스트가 확인한다.
 */
export const TALK_DEMO_STEP_SECONDS = 25;
export const TALK_DEMO_MIN_SLACK_SECONDS = 20;
/** 데모 단계가 실패했을 때 예비 화면으로 넘어가는 데 쓰는 시간(초). 여유 시간 안에 들어야 한다. */
export const TALK_DEMO_FALLBACK_SECONDS = 15;

/** 표 슬라이드가 읽히는 최대 행 수. 덱 엔진의 `DECK_TABLE_MAX_ROWS`와 같아야 하고 콘텐츠 테스트가 확인한다. */
export const TALK_TABLE_MAX_ROWS = 8;

/** 표의 한 행: 첫 값은 행의 근거 id(지도 행 또는 도감 카드), 나머지는 칸이다. */
export type TalkSourcedRow = readonly [sourceId: string, ...cells: readonly LocalizedText[]];

export interface TalkSourcedTable {
  readonly table: TalkTable;
  /** 표의 행 순서와 같은 근거 id. */
  readonly sourceIds: readonly string[];
}

/**
 * 행마다 근거 id 를 붙여 쓴 표를 슬라이드의 표와 근거 목록으로 나눈다.
 * 근거 id 가 칸 옆에 붙어 있어 행을 지우거나 순서를 바꿔도 근거가 어긋나지 않는다.
 */
export function sourcedTable(
  columns: readonly LocalizedText[],
  rows: readonly TalkSourcedRow[],
  caption?: LocalizedText,
): TalkSourcedTable {
  return {
    table: { columns, rows: rows.map(([, ...cells]) => cells), caption },
    sourceIds: rows.map(([sourceId]) => sourceId),
  };
}

export type TalkTableSources = Readonly<Record<string, TalkTableSource>>;
