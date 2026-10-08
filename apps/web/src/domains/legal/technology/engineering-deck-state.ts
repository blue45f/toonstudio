/**
 * 발표 모드 URL 상태.
 *
 * - 정본 형식: `/about/technology/deck?track=talk#slide-3` (슬라이드 번호는 1부터).
 * - 슬라이드 id 형식: `#slide-talk-ai`. 슬라이드를 끼워 넣어도 이미 공유된 링크의 뜻이 바뀌지 않는다.
 *   숫자만 있는 값은 항상 번호로 읽고, 그 밖의 값은 id 로 읽는다(id → 위치 변환은 모델이 만들어진 뒤에 한다).
 * - 발표자 창: `?track=talk&view=presenter#slide-3`.
 * - 이전 형식(`?audience=seminar&duration=30#deck=seminar:9`)도 계속 연다.
 *   seminar → talk, investor → brief, study → lecture로 옮기고 번호는 그대로 유지한다.
 * - `atlas` 트랙(기술 도감 부록)은 카드가 계속 늘어나므로 주소창에도 id 형식을 쓴다.
 */

export const DECK_TRACKS = ["talk", "brief", "lecture", "atlas"] as const;
export type DeckTrack = (typeof DECK_TRACKS)[number];
export type DeckView = "audience" | "presenter";

export interface EngineeringDeckState {
  readonly track: DeckTrack;
  /** 0부터 시작하는 슬라이드 위치. 범위 제한은 `clampDeckIndex`로 한다. */
  readonly index: number;
  readonly view: DeckView;
  /** `#slide-<id>` 로 열렸을 때만 있다. 위치는 `resolveDeckSlideIndex`로 푼다(없는 id 는 `index` 로 되돌아간다). */
  readonly slideId?: string;
}

const LEGACY_AUDIENCE_TRACK = {
  seminar: "talk",
  investor: "brief",
  study: "lecture",
} as const satisfies Record<string, DeckTrack>;

type LegacyAudience = keyof typeof LEGACY_AUDIENCE_TRACK;

const MAX_SLIDE_DIGITS = 4;
/** 슬라이드 id: 영문·숫자로 시작하고 영문·숫자·`.`·`_`·`-` 만 쓴다(주소에서 인코딩이 필요 없는 문자). */
const SLIDE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;

export function isDeckTrack(value: unknown): value is DeckTrack {
  return DECK_TRACKS.some((track) => track === value);
}

/** 숫자로만 된 값은 번호이므로 id 가 될 수 없다. */
export function isDeckSlideId(value: unknown): value is string {
  return typeof value === "string" && SLIDE_ID_PATTERN.test(value) && !/^\d+$/u.test(value);
}

function isLegacyAudience(value: unknown): value is LegacyAudience {
  return typeof value === "string" && Object.hasOwn(LEGACY_AUDIENCE_TRACK, value);
}

function slidePositionFromHash(hash: string): number | null {
  const current = new RegExp(`^#slide-(\\d{1,${MAX_SLIDE_DIGITS}})$`, "u").exec(hash);
  const legacy = /^#deck=(?:investor|seminar|study):(\d{1,6})$/u.exec(hash);
  const raw = current?.[1] ?? legacy?.[1];
  if (!raw) return null;
  const position = Number(raw);
  return Number.isSafeInteger(position) && position > 0 ? position : null;
}

function slideIdFromHash(hash: string): string | null {
  const raw = /^#slide-(.+)$/u.exec(hash)?.[1];
  return raw && isDeckSlideId(raw) ? raw : null;
}

export function parseEngineeringDeckState(search: string, hash: string): EngineeringDeckState {
  const query = new URLSearchParams(search);
  const requestedTrack = query.get("track");
  const legacyHashAudience = /^#deck=(investor|seminar|study):/u.exec(hash)?.[1];
  const legacyAudience = legacyHashAudience ?? query.get("audience");
  const track: DeckTrack = isDeckTrack(requestedTrack)
    ? requestedTrack
    : isLegacyAudience(legacyAudience)
      ? LEGACY_AUDIENCE_TRACK[legacyAudience]
      : "talk";
  const position = slidePositionFromHash(hash);
  const slideId = position === null ? slideIdFromHash(hash) : null;
  return {
    track,
    index: position === null ? 0 : position - 1,
    view: query.get("view") === "presenter" ? "presenter" : "audience",
    ...(slideId ? { slideId } : {}),
  };
}

/**
 * 주소에서 읽은 상태를 슬라이드 위치로 바꾼다. `slideIds`는 그 트랙 모델의 슬라이드 id 순서다.
 * 모르는 id(삭제되었거나 다른 트랙의 id)는 조용히 첫 슬라이드가 아니라 주소의 번호(없으면 0)로 되돌린다.
 */
export function resolveDeckSlideIndex(
  state: Pick<EngineeringDeckState, "index" | "slideId">,
  slideIds: readonly string[],
): number {
  if (state.slideId) {
    const found = slideIds.indexOf(state.slideId);
    if (found >= 0) return found;
  }
  return state.index;
}

export function clampDeckIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(index)));
}

export function engineeringDeckSearch(state: Pick<EngineeringDeckState, "track" | "view">): string {
  const query = new URLSearchParams({ track: state.track });
  if (state.view === "presenter") query.set("view", "presenter");
  return `?${query.toString()}`;
}

/** `slideId`가 있으면 id 형식, 없으면 번호 형식의 해시를 만든다. */
export function engineeringDeckHash(index: number, slideId?: string): string {
  if (slideId !== undefined && isDeckSlideId(slideId)) return `#slide-${slideId}`;
  return `#slide-${Math.max(0, Math.floor(index)) + 1}`;
}

export function engineeringDeckHref(
  state: Pick<EngineeringDeckState, "track" | "index"> & { readonly view?: DeckView; readonly slideId?: string },
): string {
  return `/about/technology/deck${engineeringDeckSearch({ track: state.track, view: state.view ?? "audience" })}${engineeringDeckHash(state.index, state.slideId)}`;
}
