/**
 * 프레즌스 위치 맥락 순수 모델 — "누가 어디(회차·페이지·공정)를 보고 있는가".
 *
 * 배경: 마그마 같은 단일 캔버스 도구에서는 프레즌스 칩에 이름만으로 충분하지만,
 * ToonStudio 제작 허브는 회차가 여럿이고 회차마다 페이지와 공정이 나뉜다.
 * 이름만 있는 칩은 "저 사람이 지금 어느 회차의 몇 페이지를, 무슨 공정으로
 * 보고 있는지"를 말해 주지 못해, 같이 일하려면 결국 물어봐야 한다.
 * 이 모델은 프레즌스 신호(페이지 프레즌스·라이브 뷰)에 이미 실려 오는
 * 식별자를 사람이 읽는 위치 라벨로 바꾸고, 그 위치로 이동할 경로를 만든다.
 *
 * 규칙:
 * - 위치는 세 조각이다: 회차(episodeId), 페이지(pageId), 공정(stageId).
 *   없는 조각은 지어내지 않고 라벨에서 빠진다. 아무 조각도 없으면 라벨은
 *   null이고, 칩은 위치를 표시하지 않는다(모르는 위치를 아는 척하지 않는다).
 * - 페이지 ID 규약은 원고 페이지 ID(`episode-12-page-03`)를 따른다.
 *   회차 번호·페이지 번호는 이 규약에서만 도출하고, 규약 밖 ID는
 *   페이지 번호만 뽑거나, 아무것도 못 뽑으면 ID 자체를 최후의 라벨로 쓴다.
 * - 공정 라벨은 제작 허브의 공정 라벨표(PRODUCTION_PROCESS_LABELS)를 그대로
 *   쓴다. 표에 없는 "review"(검수 룸)만 이 모델에서 보탠다 — 검수는 공정은
 *   아니지만 회차 룸에서 사람이 머무는 맥락이라 위치 표시에 필요하다.
 * - 집중 모드처럼 위치 신호 자체를 숨기는 정책은 이 모델이 정하지 않는다.
 *   표시 정책은 세션 모델(deriveSessionPresence)이 정하고, 이 모델은
 *   "보여도 되는 위치를 어떻게 읽히게 할까"만 담당한다.
 */

import { PRODUCTION_PROCESS_LABELS, type BilingualLabel } from "./production-labels";

/** 프레즌스 위치: 회차·페이지·공정 식별자. 모르는 조각은 null. */
export interface PresenceLocation {
  readonly episodeId: string | null;
  readonly pageId: string | null;
  /** 공정 키 (PRODUCTION_PROCESS_LABELS의 키, 또는 "review"). */
  readonly stageId: string | null;
}

export const EMPTY_PRESENCE_LOCATION: PresenceLocation = Object.freeze({
  episodeId: null,
  pageId: null,
  stageId: null,
});

/** 공정 라벨표에 없는 위치 맥락 라벨. 검수 룸에 머무는 상태. */
const EXTRA_STAGE_LABELS: Readonly<Record<string, BilingualLabel>> = Object.freeze({
  review: { ko: "검수", en: "Review" },
});

/** 공정·맥락 라벨을 찾는다. 표에 없는 키는 null (호출부가 원문을 쓸지 정한다). */
export function presenceStageLabel(stageId: string | null): BilingualLabel | null {
  if (!stageId) return null;
  return PRODUCTION_PROCESS_LABELS[stageId] ?? EXTRA_STAGE_LABELS[stageId] ?? null;
}

/* --------------------------------- 페이지 ID 파싱 --------------------------------- */

export interface ParsedPresencePageId {
  /** `episode-<번호>` 접두가 규약대로일 때만 채워진다. */
  readonly episodeId: string | null;
  readonly episodeNumber: number | null;
  readonly pageNumber: number | null;
}

const EPISODE_PREFIX_PATTERN = /^episode-(\d+)$/;
const PAGE_SUFFIX_PATTERN = /-page-(\d+)$/;

/**
 * 페이지 ID에서 회차·페이지 번호를 뽑는다.
 * - `episode-12-page-03` → 회차 12, 페이지 3.
 * - `something-page-07` → 회차는 모르지만 페이지는 7 (접두가 회차 규약이
 *   아니므로 회차로 단정하지 않는다).
 * - 규약 밖 ID → 전부 null. 라벨은 ID 원문 폴백이 담당한다.
 */
export function parsePresencePageId(pageId: string | null): ParsedPresencePageId {
  if (!pageId) return { episodeId: null, episodeNumber: null, pageNumber: null };
  const pageMatch = PAGE_SUFFIX_PATTERN.exec(pageId);
  const pageNumber = pageMatch ? Number.parseInt(pageMatch[1] as string, 10) : null;
  let episodeId: string | null = null;
  let episodeNumber: number | null = null;
  if (pageMatch) {
    const prefix = pageId.slice(0, pageMatch.index);
    const episodeMatch = EPISODE_PREFIX_PATTERN.exec(prefix);
    if (episodeMatch) {
      episodeId = prefix;
      episodeNumber = Number.parseInt(episodeMatch[1] as string, 10);
    }
  }
  return {
    episodeId,
    episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : null,
    pageNumber: Number.isFinite(pageNumber) ? pageNumber : null,
  };
}

/* --------------------------------- 위치 도출 --------------------------------- */

/**
 * 프레즌스 신호에서 위치를 만든다.
 * 명시된 회차가 페이지 ID에서 뽑은 회차보다 우선한다 (세션 범위처럼
 * 신호보다 넓은 맥락을 아는 쪽이 정본이다).
 */
export function derivePresenceLocation(input: {
  readonly pageId?: string | null;
  readonly episodeId?: string | null;
  readonly stageId?: string | null;
}): PresenceLocation {
  const pageId = input.pageId ? input.pageId : null;
  const parsed = parsePresencePageId(pageId);
  return {
    episodeId: input.episodeId ? input.episodeId : parsed.episodeId,
    pageId,
    stageId: input.stageId ? input.stageId : null,
  };
}

/** 두 위치가 같은 자리인가. 이동 액션을 숨길지 정할 때 쓴다. */
export function isSamePresenceLocation(left: PresenceLocation, right: PresenceLocation): boolean {
  return left.episodeId === right.episodeId
    && left.pageId === right.pageId
    && left.stageId === right.stageId;
}

/* --------------------------------- 라벨 표시 --------------------------------- */

/**
 * 위치를 사람이 읽는 한 줄 라벨로 만든다. 예: "12화 · 3페이지 · 채색".
 * - 회차 라벨은 호출부가 회차 제목을 알면(episodeLabel) 그쪽이 우선이고,
 *   없으면 페이지 ID에서 뽑은 번호로 "N화"를 만든다. 번호도 모르는 회차 ID는
 *   라벨에 싣지 않는다 (원문 ID는 위치 설명이 아니라 식별자라서다).
 * - 공정은 라벨표에 있는 키만 번역하고, 없는 키는 원문을 그대로 쓴다
 *   (팀 커스텀 공정 키가 라벨표에 없을 수 있어서다).
 * - 조각이 하나도 없으면 null. 단, 페이지 ID만이라도 있으면 그 원문을
 *   라벨로 돌려준다 — 아무 단서도 없는 것보다는 낫고, 기존 매트릭스
 *   프레즌스가 원문을 보여 주던 동작과도 어긋나지 않는다.
 */
export function formatPresenceLocation(
  location: PresenceLocation,
  options?: { readonly episodeLabel?: string | null },
): BilingualLabel | null {
  const parsed = parsePresencePageId(location.pageId);
  const episodeLabel = options?.episodeLabel ? options.episodeLabel : null;

  const episodePart: BilingualLabel | null = episodeLabel
    ? { ko: episodeLabel, en: episodeLabel }
    : parsed.episodeNumber !== null
      ? { ko: `${parsed.episodeNumber}화`, en: `Episode ${parsed.episodeNumber}` }
      : null;
  const pagePart: BilingualLabel | null = parsed.pageNumber !== null
    ? { ko: `${parsed.pageNumber}페이지`, en: `Page ${parsed.pageNumber}` }
    : null;
  const stageKnown = presenceStageLabel(location.stageId);
  const stagePart: BilingualLabel | null = stageKnown
    ?? (location.stageId ? { ko: location.stageId, en: location.stageId } : null);

  const parts = [episodePart, pagePart, stagePart].filter(
    (part): part is BilingualLabel => part !== null,
  );
  if (!parts.length) {
    return location.pageId ? { ko: location.pageId, en: location.pageId } : null;
  }
  return {
    ko: parts.map((part) => part.ko).join(" · "),
    en: parts.map((part) => part.en).join(" · "),
  };
}

/* --------------------------------- 이동 경로 --------------------------------- */

/**
 * 그 위치로 이동할 회차 룸 경로. 회차 룸 라우트
 * (`/production/projects/<projectId>/episodes/<episodeId>`)와 같은 규약이다.
 * 회차나 프로젝트를 모르면 만들지 않는다 — 갈 곳을 모르는 이동 버튼은
 * 만들지 않는 것이 규칙이다.
 */
export function buildPresenceLocationHref(
  location: PresenceLocation,
  projectId: string | null,
): string | null {
  if (!projectId || !location.episodeId) return null;
  return `/production/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(location.episodeId)}`;
}
