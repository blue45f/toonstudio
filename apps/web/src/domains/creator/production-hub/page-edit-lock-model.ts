/**
 * 페이지 단위 편집 잠금 + 프레즌스 순수 모델 (CSP 팀 작업의 페이지 잠금 방식).
 *
 * 규칙:
 * - 한 페이지의 편집자는 한 번에 한 명만. 먼저 편집을 시작한 사람의 하트비트가
 *   살아 있는 동안 다른 사람은 "보는 중"으로만 남고, 편집 변경은 적용되지 않는다.
 * - 프레즌스는 하트비트 시각으로만 판단한다. TTL 안에 하트비트가 없는 항목은
 *   사람이 떠난 것으로 보고 잠금도 함께 풀린다(브라우저가 그냥 닫혀도 잠금이
 *   영원히 남지 않는다).
 * - 이 모듈은 전송 방식을 모른다. 회차 룸은 같은 브라우저 탭 사이를
 *   BroadcastChannel로, 서버 프레즌스가 붙으면 그 항목을 그대로 합칠 수 있게
 *   `mergePagePresence`를 제공한다.
 */

export type PagePresenceMode = "editing" | "viewing";

export interface PagePresenceEntry {
  readonly pageId: string;
  /** 참여 배정 ID. 댓글 작성자·담당자와 같은 식별자를 쓴다. */
  readonly actorId: string;
  readonly displayName: string;
  readonly mode: PagePresenceMode;
  /** 마지막 하트비트 시각(ISO). */
  readonly heartbeatAt: string;
  /**
   * 지금 보고 있는 공정 (presence-location-model의 stageId 규약:
   * PRODUCTION_PROCESS_LABELS 키 또는 "review"). 위치 맥락 표시용으로만
   * 쓰며 잠금 판정에는 관여하지 않는다. 예전 항목에는 없을 수 있다.
   */
  readonly stageId?: string | null;
}

export interface PagePresenceActor {
  readonly pageId: string;
  readonly actorId: string;
  readonly displayName: string;
  /** 지금 보고 있는 공정. 생략하면 기존 항목의 공정을 유지한다. */
  readonly stageId?: string | null;
}

/** 하트비트가 이 시간보다 오래되면 떠난 것으로 본다. */
export const PAGE_PRESENCE_TTL_MS = 90_000;
/** 같은 브라우저의 다른 탭과 프레즌스를 주고받는 채널 이름(제작 세션 채널과 같은 방식). */
export const PAGE_PRESENCE_CHANNEL_NAME = "toonstudio-production-page-presence-v1";
/** 편집·열람 중 하트비트를 보내는 간격. TTL의 1/3이라 두 번 놓쳐도 살아 있다. */
export const PAGE_PRESENCE_HEARTBEAT_MS = 30_000;
/** 시계 오차로 하트비트가 살짝 미래여도 프레즌스로 인정하는 범위. */
const CLOCK_SKEW_MS = 5_000;

function heartbeatTime(entry: PagePresenceEntry): number {
  return Date.parse(entry.heartbeatAt);
}

export function isFreshPagePresence(entry: PagePresenceEntry, now: Date): boolean {
  const at = heartbeatTime(entry);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= -CLOCK_SKEW_MS && age <= PAGE_PRESENCE_TTL_MS;
}

function entryKey(entry: Pick<PagePresenceEntry, "pageId" | "actorId">): string {
  return `${entry.pageId}::${entry.actorId}`;
}

/**
 * 오래된 항목을 버리고 (페이지, 사람)당 가장 최근 하트비트 하나만 남긴다.
 * 순서는 페이지·사람 ID 기준이라 입력 순서와 무관하게 결과가 같다.
 */
export function prunePagePresence(
  entries: readonly PagePresenceEntry[],
  now: Date,
): readonly PagePresenceEntry[] {
  const latest = new Map<string, PagePresenceEntry>();
  for (const entry of entries) {
    if (!isFreshPagePresence(entry, now)) continue;
    const key = entryKey(entry);
    const previous = latest.get(key);
    if (!previous || heartbeatTime(entry) >= heartbeatTime(previous)) latest.set(key, entry);
  }
  return [...latest.values()].sort((left, right) => entryKey(left).localeCompare(entryKey(right)));
}

/** 두 프레즌스 목록을 합친다. 같은 (페이지, 사람)은 하트비트가 최근인 쪽이 이긴다. */
export function mergePagePresence(
  base: readonly PagePresenceEntry[],
  incoming: readonly PagePresenceEntry[],
  now: Date,
): readonly PagePresenceEntry[] {
  return prunePagePresence([...base, ...incoming], now);
}

export interface PageEditLock {
  readonly pageId: string;
  /** 지금 이 페이지를 편집할 수 있는 유일한 사람. 없으면 잠금이 비어 있다. */
  readonly holder: PagePresenceEntry | null;
  /** 이 페이지에 프레즌스가 있는 전원. 편집자가 맨 앞, 나머지는 이름순. */
  readonly present: readonly PagePresenceEntry[];
  /** 페이지에 있는 "보는 중"인 사람들(편집자 제외). */
  readonly viewers: readonly PagePresenceEntry[];
}

/**
 * 페이지 잠금 상태.
 * 편집 중 항목이 여럿이면(동시 시작 경쟁) 하트비트가 가장 이른 사람이 편집자이고,
 * 나머지는 편집자가 아니다 — 전원이 같은 규칙으로 계산하므로 결과가 하나로 모인다.
 */
export function derivePageEditLock(
  entries: readonly PagePresenceEntry[],
  pageId: string,
  now: Date,
): PageEditLock {
  const onPage = prunePagePresence(entries, now).filter((entry) => entry.pageId === pageId);
  const editors = onPage
    .filter((entry) => entry.mode === "editing")
    .sort((left, right) => heartbeatTime(left) - heartbeatTime(right) || left.actorId.localeCompare(right.actorId));
  const holder = editors[0] ?? null;
  const viewers = onPage.filter((entry) => entry.actorId !== holder?.actorId);
  const present = holder ? [holder, ...viewers] : viewers;
  return { pageId, holder, present, viewers };
}

export type PageEditBlockReason = "self-holder" | "free" | "locked-by-other";

export interface PageEditDecision {
  readonly allowed: boolean;
  readonly reason: PageEditBlockReason;
  readonly holder: PagePresenceEntry | null;
}

/**
 * 이 사람이 지금 이 페이지를 편집해도 되는가.
 * - 잠금을 잡은 본인: 허용.
 * - 잠금이 비어 있음: 허용(편집 시작과 함께 잠금을 잡는 흐름이 전제).
 * - 다른 사람이 잠금을 잡고 있음: 금지 — 충돌 방지.
 */
export function canEditPage(
  entries: readonly PagePresenceEntry[],
  pageId: string,
  actorId: string,
  now: Date,
): PageEditDecision {
  const { holder } = derivePageEditLock(entries, pageId, now);
  if (!holder) return { allowed: true, reason: "free", holder: null };
  return holder.actorId === actorId
    ? { allowed: true, reason: "self-holder", holder }
    : { allowed: false, reason: "locked-by-other", holder };
}

export interface AcquirePageEditLockResult {
  readonly entries: readonly PagePresenceEntry[];
  readonly acquired: boolean;
  readonly holder: PagePresenceEntry | null;
}

/**
 * 편집 잠금 잡기. 다른 사람의 살아 있는 잠금이 있으면 목록을 바꾸지 않고
 * 실패를 돌려준다(그 잠금을 빼앗지 않는다). 내 항목이 이미 있으면 편집 중으로
 * 갱신하고, 잠금이 비었거나 만료됐으면 내가 편집자가 된다.
 */
export function acquirePageEditLock(
  entries: readonly PagePresenceEntry[],
  actor: PagePresenceActor,
  now: Date,
): AcquirePageEditLockResult {
  const pruned = prunePagePresence(entries, now);
  const { holder } = derivePageEditLock(pruned, actor.pageId, now);
  if (holder && holder.actorId !== actor.actorId) {
    return { entries: pruned, acquired: false, holder };
  }
  const existingMine = pruned.find((entry) => entryKey(entry) === entryKey(actor));
  const mine: PagePresenceEntry = {
    pageId: actor.pageId,
    actorId: actor.actorId,
    displayName: actor.displayName,
    mode: "editing",
    heartbeatAt: now.toISOString(),
    stageId: actor.stageId !== undefined ? actor.stageId : (existingMine?.stageId ?? null),
  };
  const next = prunePagePresence(
    [...pruned.filter((entry) => entryKey(entry) !== entryKey(mine)), mine],
    now,
  );
  return { entries: next, acquired: true, holder: mine };
}

/** 편집 마치기: 잠금은 풀고 프레즌스는 "보는 중"으로 남긴다. */
export function releasePageEditLock(
  entries: readonly PagePresenceEntry[],
  pageId: string,
  actorId: string,
  now: Date,
): readonly PagePresenceEntry[] {
  const pruned = prunePagePresence(entries, now);
  return pruned.map((entry) => entry.pageId === pageId && entry.actorId === actorId
    ? { ...entry, mode: "viewing" as const, heartbeatAt: now.toISOString() }
    : entry);
}

/**
 * 하트비트: 내 프레즌스 시각을 갱신한다.
 * 항목이 있으면 편집/열람 상태를 그대로 유지하고, 없으면(만료·첫 진입)
 * "보는 중"으로 새로 만든다 — 만료된 편집 잠금은 하트비트만으로 되살리지 않는다.
 */
export function heartbeatPagePresence(
  entries: readonly PagePresenceEntry[],
  actor: PagePresenceActor,
  now: Date,
): readonly PagePresenceEntry[] {
  const pruned = prunePagePresence(entries, now);
  const existing = pruned.find((entry) => entryKey(entry) === entryKey(actor));
  const mine: PagePresenceEntry = {
    pageId: actor.pageId,
    actorId: actor.actorId,
    displayName: actor.displayName,
    mode: existing?.mode ?? "viewing",
    heartbeatAt: now.toISOString(),
    stageId: actor.stageId !== undefined ? actor.stageId : (existing?.stageId ?? null),
  };
  return prunePagePresence(
    [...pruned.filter((entry) => entryKey(entry) !== entryKey(mine)), mine],
    now,
  );
}

/**
 * 전 페이지 프레즌스 요약(공정 매트릭스 같은 상위 표면용).
 * 만료 항목을 버린 뒤 편집 중인 사람을 먼저, 그다음 페이지·이름순으로 정렬한다.
 * 상위 표면은 이 목록으로 "누가 어느 페이지를 열고 있는지"만 보여 주고,
 * 잠금 판단은 페이지별로 `derivePageEditLock`을 쓴다.
 */
export function summarizePagePresence(
  entries: readonly PagePresenceEntry[],
  now: Date,
): readonly PagePresenceEntry[] {
  return [...prunePagePresence(entries, now)].sort((left, right) =>
    (left.mode === right.mode ? 0 : left.mode === "editing" ? -1 : 1)
    || left.pageId.localeCompare(right.pageId)
    || left.displayName.localeCompare(right.displayName, "ko")
    || left.actorId.localeCompare(right.actorId));
}

/** 페이지를 떠날 때 내 프레즌스를 지운다(잠금도 함께 풀린다). */
export function leavePagePresence(
  entries: readonly PagePresenceEntry[],
  pageId: string,
  actorId: string,
): readonly PagePresenceEntry[] {
  return entries.filter((entry) => !(entry.pageId === pageId && entry.actorId === actorId));
}
