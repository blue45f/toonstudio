/**
 * Studio Layer Occupancy (레이어 점유) 순수 모델.
 *
 * 근거: Drawpile의 레이어 단위 접근 제어 + CSP 페이지 잠금의 레이어판.
 * 페이지 잠금(page-edit-lock-model)이 "페이지 한 장 = 한 명"이라면, 이 모델은
 * 스튜디오 에디터 안에서 "레이어 하나 = 한 명"을 표현한다. 다른 참여자가
 * 만지는 중인 레이어를 패널 행에 잠금 아이콘·이름으로 보여 주고, 내가 작업
 * 중인 레이어와 겹치면 충돌 경고를 도출하는 것이 목적이다.
 *
 * 규칙:
 * - 점유는 "주장(claim)"이다. 레이어를 선택해 실제로 만지기 시작할 때 주장하고,
 *   레이어를 떠나거나 페이지를 닫으면 해제한다. 보는 것만으로는 주장하지
 *   않는다 — 프레즌스(누가 페이지를 열고 있는가)와 점유(누가 어느 레이어를
 *   만지는가)는 다른 신호다.
 * - 한 레이어의 점유자는 한 번에 한 명. 동시 시작 경쟁에서는 주장을 시작한
 *   시각(claimedAt)이 가장 이른 사람이 점유자이고, 나머지는 점유자가 아니다.
 *   전원이 같은 규칙으로 계산하므로 결과가 하나로 모인다(페이지 잠금과 동일).
 * - 점유는 하트비트로 살아 있다. TTL 안에 하트비트가 없으면 주장은 사라진다
 *   (브라우저가 그냥 닫혀도 레이어가 영원히 잠기지 않는다). 하트비트는 남의
 *   점유를 빼앗지 않고, 만료된 내 주장을 조용히 되살리지도 않는다 — 되살리는
 *   것은 명시적 주장(claim)뿐이다.
 * - 이 모듈은 전송 방식을 모른다. (b) 서버 프레즌스·세션 전송 계층이 붙으면
 *   항목을 그대로 실어 보내고 `mergeLayerOccupancy`로 합치면 되고, 같은
 *   브라우저 탭 사이에서는 BroadcastChannel 메시지를
 *   `parseLayerOccupancyMessage`로 검증해 같은 merge로 합친다. UI는 전송이
 *   무엇이든 이 모델의 도출값만 본다.
 *
 * Pure, deterministic (시각은 주입), zero-dependency.
 */

export interface LayerOccupancyEntry {
  readonly pageId: string;
  readonly layerId: string;
  /** 참여 배정 ID. 댓글 작성자·담당자·페이지 프레즌스와 같은 식별자를 쓴다. */
  readonly actorId: string;
  readonly displayName: string;
  /** 주장을 시작한 시각(ISO). 점유자 결정(가장 이른 주장 우선)의 기준이라 하트비트로 바뀌지 않는다. */
  readonly claimedAt: string;
  /** 마지막 하트비트 시각(ISO). 생존 판정 전용. */
  readonly heartbeatAt: string;
  /** 마지막으로 실제로 레이어를 만진(그리기·이동·속성 변경) 시각(ISO). 구버전 항목에는 없을 수 있다. */
  readonly lastInteractionAt?: string;
}

export interface LayerOccupancyActor {
  readonly pageId: string;
  readonly layerId: string;
  readonly actorId: string;
  readonly displayName: string;
}

/** 하트비트가 이 시간보다 오래되면 점유를 놓은 것으로 본다(페이지 프레즌스와 같은 값). */
export const LAYER_OCCUPANCY_TTL_MS = 90_000;
/** 점유 중 하트비트를 보내는 간격. TTL의 1/3이라 두 번 놓쳐도 살아 있다. */
export const LAYER_OCCUPANCY_HEARTBEAT_MS = 30_000;
/** 같은 브라우저의 다른 탭과 점유를 주고받는 채널 이름(페이지 프레즌스 채널과 같은 방식). */
export const LAYER_OCCUPANCY_CHANNEL_NAME = "toonstudio-studio-layer-occupancy-v1";
/** 전송 메시지 1건이 실을 수 있는 점유 항목 상한(비정상 페이로드 차단). */
export const LAYER_OCCUPANCY_MAX_ENTRIES = 512;
/** 시계 오차로 하트비트가 살짝 미래여도 점유로 인정하는 범위. */
const CLOCK_SKEW_MS = 5_000;

function timeOf(iso: string): number {
  return Date.parse(iso);
}

export function isFreshLayerOccupancy(entry: LayerOccupancyEntry, now: Date): boolean {
  const at = timeOf(entry.heartbeatAt);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= -CLOCK_SKEW_MS && age <= LAYER_OCCUPANCY_TTL_MS;
}

function claimKey(entry: Pick<LayerOccupancyEntry, "pageId" | "layerId" | "actorId">): string {
  return `${entry.pageId}::${entry.layerId}::${entry.actorId}`;
}

/**
 * 만료 항목을 버리고 (페이지, 레이어, 사람)당 가장 최근 하트비트 하나만 남긴다.
 * 순서는 키 기준이라 입력 순서와 무관하게 결과가 같다.
 */
export function pruneLayerOccupancy(
  entries: readonly LayerOccupancyEntry[],
  now: Date,
): readonly LayerOccupancyEntry[] {
  const latest = new Map<string, LayerOccupancyEntry>();
  for (const entry of entries) {
    if (!isFreshLayerOccupancy(entry, now)) continue;
    const key = claimKey(entry);
    const previous = latest.get(key);
    if (!previous || timeOf(entry.heartbeatAt) >= timeOf(previous.heartbeatAt)) {
      latest.set(key, entry);
    }
  }
  return [...latest.values()].sort((left, right) => claimKey(left).localeCompare(claimKey(right)));
}

/**
 * 두 점유 목록을 합친다 — (b) 전송 계층의 합류 지점.
 * 같은 (페이지, 레이어, 사람)은 하트비트가 최근인 쪽이 이긴다. 서로 다른
 * 사람의 같은 레이어 주장은 둘 다 남고, 점유자는 derive가 결정한다.
 */
export function mergeLayerOccupancy(
  base: readonly LayerOccupancyEntry[],
  incoming: readonly LayerOccupancyEntry[],
  now: Date,
): readonly LayerOccupancyEntry[] {
  return pruneLayerOccupancy([...base, ...incoming], now);
}

/**
 * 한 레이어의 점유자. 살아 있는 주장이 여럿이면(동시 시작 경쟁) claimedAt이
 * 가장 이른 사람이 점유자다. 동시각이면 actorId 순으로 결정해 전원이 같은
 * 결과를 본다.
 */
export function deriveLayerOccupant(
  entries: readonly LayerOccupancyEntry[],
  pageId: string,
  layerId: string,
  now: Date,
): LayerOccupancyEntry | null {
  const claims = pruneLayerOccupancy(entries, now)
    .filter((entry) => entry.pageId === pageId && entry.layerId === layerId)
    .sort(
      (left, right) =>
        timeOf(left.claimedAt) - timeOf(right.claimedAt) || left.actorId.localeCompare(right.actorId),
    );
  return claims[0] ?? null;
}

export interface LayerOccupancySummary {
  readonly layerId: string;
  /** 이 레이어의 점유자(경쟁에서 이긴 주장). */
  readonly holder: LayerOccupancyEntry;
  /** 점유 경쟁에서 진 살아 있는 주장들. 보통 비어 있고, 있으면 동시 시작이 겹친 것이다. */
  readonly contenders: readonly LayerOccupancyEntry[];
}

/** 한 페이지의 레이어별 점유 요약. layerId 순이라 패널이 그대로 대조할 수 있다. */
export function summarizeLayerOccupancy(
  entries: readonly LayerOccupancyEntry[],
  pageId: string,
  now: Date,
): readonly LayerOccupancySummary[] {
  const byLayer = new Map<string, LayerOccupancyEntry[]>();
  for (const entry of pruneLayerOccupancy(entries, now)) {
    if (entry.pageId !== pageId) continue;
    const list = byLayer.get(entry.layerId) ?? [];
    list.push(entry);
    byLayer.set(entry.layerId, list);
  }
  return [...byLayer.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([layerId, claims]) => {
      const sorted = [...claims].sort(
        (left, right) =>
          timeOf(left.claimedAt) - timeOf(right.claimedAt) || left.actorId.localeCompare(right.actorId),
      );
      return { layerId, holder: sorted[0]!, contenders: sorted.slice(1) };
    });
}

/**
 * 레이어 패널 행 대조용 맵: layerId → 점유자.
 * 점유되지 않은 레이어는 맵에 없다(행에 아무것도 표시하지 않는다).
 */
export function layerOccupantByLayerId(
  entries: readonly LayerOccupancyEntry[],
  pageId: string,
  now: Date,
): ReadonlyMap<string, LayerOccupancyEntry> {
  const map = new Map<string, LayerOccupancyEntry>();
  for (const summary of summarizeLayerOccupancy(entries, pageId, now)) {
    map.set(summary.layerId, summary.holder);
  }
  return map;
}

export type LayerOccupancyRowState = "free" | "mine" | "other";

/** 패널 행 표시 상태: 비었는가, 내가 만지는 중인가, 남이 만지는 중인가. */
export function layerOccupancyRowState(
  holder: LayerOccupancyEntry | null,
  selfActorId: string | null,
): LayerOccupancyRowState {
  if (!holder) return "free";
  return selfActorId !== null && holder.actorId === selfActorId ? "mine" : "other";
}

export interface ClaimLayerOccupancyResult {
  readonly entries: readonly LayerOccupancyEntry[];
  readonly claimed: boolean;
  /** 주장 후 이 레이어의 점유자. claimed가 false면 남이 점유 중이라는 뜻이다. */
  readonly holder: LayerOccupancyEntry | null;
}

/**
 * 레이어 점유 주장. 레이어를 실제로 만지기 시작할 때 호출한다.
 * - 남이 살아 있는 점유자면 목록을 바꾸지 않고 실패를 돌려준다(빼앗지 않는다).
 * - 내가 이미 점유자면 하트비트·상호작용 시각만 갱신한다(claimedAt 유지).
 * - 비어 있으면(또는 기존 주장이 전부 만료) 새 주장을 만든다.
 */
export function claimLayerOccupancy(
  entries: readonly LayerOccupancyEntry[],
  actor: LayerOccupancyActor,
  now: Date,
): ClaimLayerOccupancyResult {
  const pruned = pruneLayerOccupancy(entries, now);
  const holder = deriveLayerOccupant(pruned, actor.pageId, actor.layerId, now);
  if (holder && holder.actorId !== actor.actorId) {
    return { entries: pruned, claimed: false, holder };
  }
  const existing = pruned.find((entry) => claimKey(entry) === claimKey(actor));
  const mine: LayerOccupancyEntry = existing
    ? {
        ...existing,
        displayName: actor.displayName,
        heartbeatAt: now.toISOString(),
        lastInteractionAt: now.toISOString(),
      }
    : {
        pageId: actor.pageId,
        layerId: actor.layerId,
        actorId: actor.actorId,
        displayName: actor.displayName,
        claimedAt: now.toISOString(),
        heartbeatAt: now.toISOString(),
        lastInteractionAt: now.toISOString(),
      };
  const next = pruneLayerOccupancy(
    [...pruned.filter((entry) => claimKey(entry) !== claimKey(mine)), mine],
    now,
  );
  return { entries: next, claimed: true, holder: mine };
}

/**
 * 실제 상호작용 기록: 내가 점유자인 레이어에서 그리기·이동·속성 변경이
 * 일어났을 때 하트비트와 상호작용 시각을 함께 갱신한다.
 * 점유자가 아니거나(남의 레이어·미주장) 항목이 없으면 아무것도 바꾸지
 * 않는다 — 상호작용 기록이 점유를 만들거나 빼앗지 않는다.
 */
export function recordLayerOccupancyInteraction(
  entries: readonly LayerOccupancyEntry[],
  pageId: string,
  layerId: string,
  actorId: string,
  now: Date,
): readonly LayerOccupancyEntry[] {
  const holder = deriveLayerOccupant(entries, pageId, layerId, now);
  if (!holder || holder.actorId !== actorId) return entries;
  return entries.map((entry) =>
    entry.pageId === pageId && entry.layerId === layerId && entry.actorId === actorId
      ? { ...entry, heartbeatAt: now.toISOString(), lastInteractionAt: now.toISOString() }
      : entry,
  );
}

/**
 * 하트비트: 내 주장의 생존 시각만 갱신한다.
 * - 내가 점유자면 claimedAt·상호작용 시각을 유지한 채 하트비트만 갱신한다.
 * - 동시 시작으로 내가 경쟁에서 졌으면 내 주장은 걷어낸다(진 주장이 남아
 *   있으면 상대 화면에서도 계속 경쟁으로 보이기 때문).
 * - 내 주장이 없거나 만료됐으면 아무것도 만들지 않는다 — 부활은 claim만 한다.
 */
export function heartbeatLayerOccupancy(
  entries: readonly LayerOccupancyEntry[],
  actor: LayerOccupancyActor,
  now: Date,
): readonly LayerOccupancyEntry[] {
  const pruned = pruneLayerOccupancy(entries, now);
  const mine = pruned.find((entry) => claimKey(entry) === claimKey(actor));
  if (!mine) return pruned;
  const holder = deriveLayerOccupant(pruned, actor.pageId, actor.layerId, now);
  if (holder && holder.actorId !== actor.actorId) {
    return pruned.filter((entry) => claimKey(entry) !== claimKey(mine));
  }
  const refreshed: LayerOccupancyEntry = {
    ...mine,
    displayName: actor.displayName,
    heartbeatAt: now.toISOString(),
  };
  return pruneLayerOccupancy(
    [...pruned.filter((entry) => claimKey(entry) !== claimKey(refreshed)), refreshed],
    now,
  );
}

/** 점유 해제: 레이어를 떠나거나 다른 레이어로 옮길 때 내 주장을 지운다. */
export function releaseLayerOccupancy(
  entries: readonly LayerOccupancyEntry[],
  pageId: string,
  layerId: string,
  actorId: string,
): readonly LayerOccupancyEntry[] {
  return entries.filter(
    (entry) => !(entry.pageId === pageId && entry.layerId === layerId && entry.actorId === actorId),
  );
}

/** 페이지를 떠날 때 그 페이지의 내 주장을 전부 지운다. */
export function leavePageLayerOccupancy(
  entries: readonly LayerOccupancyEntry[],
  pageId: string,
  actorId: string,
): readonly LayerOccupancyEntry[] {
  return entries.filter((entry) => !(entry.pageId === pageId && entry.actorId === actorId));
}

export type LayerConflictStatus = "free" | "mine" | "other";

export interface LayerConflictEvaluation {
  readonly status: LayerConflictStatus;
  /** 이 레이어를 지금 만져도 충돌이 없는가. 남이 점유 중일 때만 false. */
  readonly allowed: boolean;
  readonly holder: LayerOccupancyEntry | null;
}

/**
 * 이 레이어를 지금 만져도 되는가 — 편집 동작 직전의 충돌 판정.
 * 페이지 잠금의 canEditPage와 같은 계약을 레이어 단위로 내린 것이다.
 */
export function evaluateLayerConflict(
  entries: readonly LayerOccupancyEntry[],
  pageId: string,
  layerId: string,
  actorId: string,
  now: Date,
): LayerConflictEvaluation {
  const holder = deriveLayerOccupant(entries, pageId, layerId, now);
  if (!holder) return { status: "free", allowed: true, holder: null };
  return holder.actorId === actorId
    ? { status: "mine", allowed: true, holder }
    : { status: "other", allowed: false, holder };
}

export type LayerConflictWarningKind =
  /** 내가 작업 중인 레이어를 지금은 남이 점유하고 있다(내가 잠시 비운 사이 넘어갔거나, 내 주장이 만료된 뒤 남이 잡음). */
  | "my-layer-taken"
  /** 내가 점유자인데 남이 같은 레이어를 만지기 시작했다(경쟁에서 진 주장이 남아 있음). */
  | "my-layer-contended";

export interface LayerConflictWarning {
  readonly layerId: string;
  readonly kind: LayerConflictWarningKind;
  /** 경고를 일으킨 상대 항목. my-layer-taken이면 현재 점유자, contended면 경쟁 주장자. */
  readonly other: LayerOccupancyEntry;
}

/**
 * "내 레이어" 충돌 경고 도출.
 * myLayerIds는 호출부가 아는 내 작업 맥락이다 — 지금 선택한 레이어 + 이
 * 세션에서 내가 주장했던 레이어들. 그 레이어들에 대해:
 * - 점유자가 남이면 my-layer-taken (내가 돌아가면 부딪힌다 — 먼저 알려야 한다)
 * - 내가 점유자인데 남의 살아 있는 주장이 겹쳐 있으면 my-layer-contended
 * 내 작업 맥락 밖의 레이어는 경고하지 않는다(남의 작업은 행 배지로 충분하다).
 */
export function deriveMyLayerConflicts(
  entries: readonly LayerOccupancyEntry[],
  pageId: string,
  myLayerIds: readonly string[],
  selfActorId: string,
  now: Date,
): readonly LayerConflictWarning[] {
  const mine = new Set(myLayerIds);
  if (mine.size === 0) return [];
  const warnings: LayerConflictWarning[] = [];
  for (const summary of summarizeLayerOccupancy(entries, pageId, now)) {
    if (!mine.has(summary.layerId)) continue;
    if (summary.holder.actorId !== selfActorId) {
      warnings.push({ layerId: summary.layerId, kind: "my-layer-taken", other: summary.holder });
    } else {
      for (const contender of summary.contenders) {
        warnings.push({ layerId: summary.layerId, kind: "my-layer-contended", other: contender });
      }
    }
  }
  return warnings.sort(
    (left, right) =>
      left.layerId.localeCompare(right.layerId) || left.kind.localeCompare(right.kind),
  );
}

// ── 전송 메시지 검증 ────────────────────────────────────────────────────────
// (b) 전송 계층·BroadcastChannel 양쪽에서 쓰는 경계 검증. 검증되지 않은
// 페이로드를 그대로 상태에 넣으면 남의 이름·시각을 위조한 항목이 패널에
// 뜰 수 있으므로, 항목 단위로 버리고 상한을 둔다(throw 하지 않는다).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): LayerOccupancyEntry | null {
  if (!isRecord(value)) return null;
  const { pageId, layerId, actorId, displayName, claimedAt, heartbeatAt, lastInteractionAt } = value;
  if (
    typeof pageId !== "string" ||
    pageId.length === 0 ||
    typeof layerId !== "string" ||
    layerId.length === 0 ||
    typeof actorId !== "string" ||
    actorId.length === 0 ||
    typeof displayName !== "string" ||
    displayName.length === 0 ||
    typeof claimedAt !== "string" ||
    !Number.isFinite(Date.parse(claimedAt)) ||
    typeof heartbeatAt !== "string" ||
    !Number.isFinite(Date.parse(heartbeatAt))
  ) {
    return null;
  }
  if (
    lastInteractionAt !== undefined &&
    (typeof lastInteractionAt !== "string" || !Number.isFinite(Date.parse(lastInteractionAt)))
  ) {
    return null;
  }
  return {
    pageId,
    layerId,
    actorId,
    displayName,
    claimedAt,
    heartbeatAt,
    ...(typeof lastInteractionAt === "string" ? { lastInteractionAt } : {}),
  };
}

/**
 * 전송 페이로드(항목 배열 또는 { entries } 메시지)를 검증된 항목 목록으로
 * 바꾼다. 잘못된 항목은 버리고, (페이지·레이어·사람) 중복은 하트비트가
 * 최근인 쪽만 남기며, 상한을 넘는 입력은 앞에서부터 상한까지만 받는다.
 * 신선도(TTL) 판정은 하지 않는다 — 받는 쪽이 자기 now로 prune/merge 한다.
 */
export function parseLayerOccupancyMessage(value: unknown): readonly LayerOccupancyEntry[] {
  const raw = Array.isArray(value) ? value : isRecord(value) ? value.entries : null;
  if (!Array.isArray(raw)) return [];
  const latest = new Map<string, LayerOccupancyEntry>();
  for (const item of raw.slice(0, LAYER_OCCUPANCY_MAX_ENTRIES)) {
    const entry = parseEntry(item);
    if (!entry) continue;
    const key = claimKey(entry);
    const previous = latest.get(key);
    if (!previous || timeOf(entry.heartbeatAt) >= timeOf(previous.heartbeatAt)) {
      latest.set(key, entry);
    }
  }
  return [...latest.values()].sort((left, right) => claimKey(left).localeCompare(claimKey(right)));
}

/** 전송 메시지 조립: 받는 쪽의 parseLayerOccupancyMessage와 짝이다. */
export function buildLayerOccupancyMessage(
  entries: readonly LayerOccupancyEntry[],
): { readonly type: "layer-occupancy"; readonly entries: readonly LayerOccupancyEntry[] } {
  return { type: "layer-occupancy", entries };
}
