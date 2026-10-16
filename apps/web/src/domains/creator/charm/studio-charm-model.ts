/**
 * 참(Charm) 바의 순수 상태 모델.
 *
 * 참은 자주 쓰는 반복 요소(집중선·땀방울·소품 등)를 한 번 누르거나 끌어다 놓아 붙이는 즐겨찾기 칩이다.
 * 이 모듈은 소재를 복제하지 않고, 기존 소재·삽입 카탈로그의 항목을 가리키는 참조(ID)와 그 순서만 다룬다.
 * 그래서 새 소재 포맷이 생기지 않고 권리 메타데이터는 항상 원본 카탈로그 항목이 그대로 가진다.
 *
 * React·DOM·저장소에 의존하지 않는다. 저장은 `studio-charm-bar-store.ts` 가 기존 UI 환경설정
 * 저장소(SQLite/OPFS)에 맡긴다.
 */

export const STUDIO_CHARM_KINDS = [
  "element",
  "fx",
  "emoji",
  "raster",
  "library",
  "sfx",
  "bubble",
  "object",
] as const;
export type StudioCharmKind = (typeof STUDIO_CHARM_KINDS)[number];

export const STUDIO_CHARM_BAR_STATE_VERSION = 1 as const;
/** 참 바에 고정할 수 있는 최대 개수. 한 줄에서 훑을 수 있는 크기로 제한한다. */
export const STUDIO_CHARM_BAR_MAX_CHARMS = 24;
export const STUDIO_CHARM_ID_MAX_LENGTH = 160;
const STUDIO_CHARM_EMOJI_MAX_CODE_POINTS = 8;

declare const studioCharmIdBrand: unique symbol;
/** `<종류>:<원본 ID>` 형태의 충돌 없는 참 ID. 종류가 다르면 같은 원본 ID 도 서로 다른 참이다. */
export type StudioCharmId = `${StudioCharmKind}:${string}` & {
  readonly [studioCharmIdBrand]: "StudioCharmId";
};

export interface StudioCharmBarState {
  readonly version: typeof STUDIO_CHARM_BAR_STATE_VERSION;
  /** 왼쪽(위)부터 보이는 순서. */
  readonly charms: readonly StudioCharmId[];
  /** 참 바를 화면에 펼쳤는지. 사용자 선택이므로 함께 저장한다. */
  readonly open: boolean;
  /**
   * 기본 스타터 팩을 이미 처리했는지. 처음 연 빈 바에만 한 번 자동으로 담고,
   * 사용자가 목록을 한 번이라도 고치면 다시는 자동으로 담지 않는다.
   */
  readonly starterSettled: boolean;
}

export type StudioCharmPinFailure = "full" | "invalid";
export type StudioCharmPinResult =
  | { readonly ok: true; readonly state: StudioCharmBarState; readonly changed: boolean }
  | { readonly ok: false; readonly state: StudioCharmBarState; readonly reason: StudioCharmPinFailure };

const KIND_SET: ReadonlySet<string> = new Set(STUDIO_CHARM_KINDS);
const SAFE_RAW_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u;

function freezeState(
  charms: readonly StudioCharmId[],
  open: boolean,
  starterSettled: boolean,
): StudioCharmBarState {
  return Object.freeze({
    version: STUDIO_CHARM_BAR_STATE_VERSION,
    charms: Object.freeze([...charms]),
    open,
    starterSettled,
  });
}

export function createEmptyStudioCharmBarState(): StudioCharmBarState {
  return freezeState([], false, false);
}

/** 형식이 맞는 참 ID 인지 검사하는 타입 가드. 길이·종류·원본 ID 문자를 모두 확인한다. */
export function isStudioCharmId(value: unknown): value is StudioCharmId {
  if (typeof value !== "string" || value.length > STUDIO_CHARM_ID_MAX_LENGTH) return false;
  const separator = value.indexOf(":");
  if (separator <= 0 || separator !== value.lastIndexOf(":")) return false;
  const kind = value.slice(0, separator);
  const rawId = value.slice(separator + 1);
  return KIND_SET.has(kind) && SAFE_RAW_ID.test(rawId);
}

export function parseStudioCharmId(value: unknown): StudioCharmId | null {
  return isStudioCharmId(value) ? value : null;
}

/** 허용된 종류와 URL 에 안전한 원본 ID 로만 참 ID 를 만든다. 잘못된 입력은 TypeError. */
export function createStudioCharmId(kind: StudioCharmKind, rawId: string): StudioCharmId {
  const candidate = `${kind}:${typeof rawId === "string" ? rawId.trim() : ""}`;
  if (!isStudioCharmId(candidate)) {
    throw new TypeError(
      `참 ID 는 지원하는 종류와 영문·숫자·._~- 로 이루어진 ${STUDIO_CHARM_ID_MAX_LENGTH}자 이하 원본 ID 가 필요합니다.`,
    );
  }
  return candidate;
}

export function splitStudioCharmId(id: StudioCharmId): {
  readonly kind: StudioCharmKind;
  readonly rawId: string;
} {
  const separator = id.indexOf(":");
  const kind = id.slice(0, separator);
  const rawId = id.slice(separator + 1);
  // 타입 가드로 검증된 ID 이므로 종류는 항상 목록 안에 있다. 방어적으로 한 번 더 좁힌다.
  const matched = STUDIO_CHARM_KINDS.find((candidate) => candidate === kind);
  return { kind: matched ?? "element", rawId };
}

/** 이모지를 URL 에 안전한 코드포인트 식별자(`1f4a7`, `1f3f3-fe0f` 등)로 바꾼다. */
export function studioCharmEmojiRawId(emoji: string): string | null {
  if (typeof emoji !== "string" || emoji.length === 0) return null;
  const points = [...emoji].map((character) => character.codePointAt(0));
  if (points.length === 0 || points.length > STUDIO_CHARM_EMOJI_MAX_CODE_POINTS) return null;
  const hex: string[] = [];
  for (const point of points) {
    if (point === undefined || point < 0x20 || point === 0x7f) return null;
    hex.push(point.toString(16));
  }
  return hex.join("-");
}

export function studioCharmEmojiFromRawId(rawId: string): string | null {
  if (typeof rawId !== "string" || rawId.length === 0) return null;
  const parts = rawId.split("-");
  if (parts.length > STUDIO_CHARM_EMOJI_MAX_CODE_POINTS) return null;
  const points: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,6}$/u.test(part)) return null;
    const point = Number.parseInt(part, 16);
    if (point < 0x20 || point === 0x7f || point > 0x10ffff) return null;
    if (point >= 0xd800 && point <= 0xdfff) return null;
    points.push(point);
  }
  return String.fromCodePoint(...points);
}

/** 저장된 값이나 신뢰할 수 없는 입력을 정규화된 v1 상태로 바꾼다. 잘못된 항목은 조용히 버린다. */
export function normalizeStudioCharmBarState(raw: unknown): StudioCharmBarState {
  let decoded = raw;
  if (typeof raw === "string") {
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      return createEmptyStudioCharmBarState();
    }
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    return createEmptyStudioCharmBarState();
  }
  const candidate = decoded as {
    version?: unknown;
    charms?: unknown;
    open?: unknown;
    starterSettled?: unknown;
  };
  if (candidate.version !== STUDIO_CHARM_BAR_STATE_VERSION || !Array.isArray(candidate.charms)) {
    return createEmptyStudioCharmBarState();
  }
  const seen = new Set<StudioCharmId>();
  const charms: StudioCharmId[] = [];
  for (const entry of candidate.charms) {
    const id = parseStudioCharmId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    charms.push(id);
    if (charms.length >= STUDIO_CHARM_BAR_MAX_CHARMS) break;
  }
  return freezeState(charms, candidate.open === true, candidate.starterSettled === true);
}

export function isStudioCharmPinned(state: StudioCharmBarState, id: StudioCharmId): boolean {
  return state.charms.includes(id);
}

/**
 * 참을 맨 뒤에 고정한다. 이미 있으면 상태를 그대로 돌려주고, 가득 찼으면 실패 이유를 알린다.
 * 사용자가 목록을 고친 것이므로 이후에는 기본 스타터 팩을 자동으로 담지 않는다.
 */
export function pinStudioCharm(state: StudioCharmBarState, id: StudioCharmId): StudioCharmPinResult {
  if (!isStudioCharmId(id)) return { ok: false, state, reason: "invalid" };
  if (state.charms.includes(id)) return { ok: true, state, changed: false };
  if (state.charms.length >= STUDIO_CHARM_BAR_MAX_CHARMS) return { ok: false, state, reason: "full" };
  return {
    ok: true,
    state: freezeState([...state.charms, id], state.open, true),
    changed: true,
  };
}

export function unpinStudioCharm(state: StudioCharmBarState, id: StudioCharmId): StudioCharmBarState {
  if (!state.charms.includes(id)) return state;
  return freezeState(
    state.charms.filter((candidate) => candidate !== id),
    state.open,
    true,
  );
}

export function toggleStudioCharm(state: StudioCharmBarState, id: StudioCharmId): StudioCharmPinResult {
  if (state.charms.includes(id)) {
    return { ok: true, state: unpinStudioCharm(state, id), changed: true };
  }
  return pinStudioCharm(state, id);
}

/** 참을 목록의 `toIndex` 위치로 옮긴다. 범위를 벗어나는 인덱스는 양 끝으로 맞춘다. */
export function moveStudioCharm(
  state: StudioCharmBarState,
  id: StudioCharmId,
  toIndex: number,
): StudioCharmBarState {
  const from = state.charms.indexOf(id);
  if (from < 0 || !Number.isFinite(toIndex)) return state;
  const target = Math.min(Math.max(Math.trunc(toIndex), 0), state.charms.length - 1);
  if (target === from) return state;
  const next = state.charms.filter((candidate) => candidate !== id);
  next.splice(target, 0, id);
  return freezeState(next, state.open, true);
}

/** 현재 위치에서 `delta` 칸만큼 옮긴다(키보드 Alt+방향키, 편집 모드의 ◀ ▶ 버튼). */
export function shiftStudioCharm(
  state: StudioCharmBarState,
  id: StudioCharmId,
  delta: number,
): StudioCharmBarState {
  const from = state.charms.indexOf(id);
  if (from < 0 || !Number.isFinite(delta)) return state;
  return moveStudioCharm(state, id, from + Math.trunc(delta));
}

export function setStudioCharmBarOpen(state: StudioCharmBarState, open: boolean): StudioCharmBarState {
  if (state.open === open) return state;
  return freezeState(state.charms, open, state.starterSettled);
}

/**
 * 스타터 참을 뒤에 덧붙인다. 이미 있는 참은 건너뛰고 최대 개수를 넘기지 않는다.
 * 사용자가 직접 부른 경우에도 쓰이므로 `starterSettled` 를 켠다.
 */
export function appendStudioCharms(
  state: StudioCharmBarState,
  ids: readonly StudioCharmId[],
): StudioCharmBarState {
  const next = [...state.charms];
  for (const id of ids) {
    if (next.length >= STUDIO_CHARM_BAR_MAX_CHARMS) break;
    if (!isStudioCharmId(id) || next.includes(id)) continue;
    next.push(id);
  }
  if (next.length === state.charms.length && state.starterSettled) return state;
  return freezeState(next, state.open, true);
}

/** 두 상태가 같은 내용인지 비교한다(저장 생략 판단용). */
export function studioCharmBarStatesEqual(left: StudioCharmBarState, right: StudioCharmBarState): boolean {
  return left.open === right.open
    && left.starterSettled === right.starterSettled
    && left.charms.length === right.charms.length
    && left.charms.every((id, index) => id === right.charms[index]);
}
