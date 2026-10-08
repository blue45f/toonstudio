/** Browser-local origin receipt, not a server role, credential or manuscript snapshot. */
export const STUDIO_LOCAL_DRAFT_OWNER_PREFIX = "toonstudio:local-draft-origin:v1:";
interface OriginStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface OwnerLocks {
  request(
    name: string,
    options: { ifAvailable: true } | { signal: AbortSignal },
    callback: (lock: unknown | null) => Promise<void>,
  ): Promise<void>;
}
export function studioLocalDraftOwnerScope(input: {
  ownerId: string | null; projectId: string | null; documentId: string | null; draftId: string | null;
}): string {
  return JSON.stringify([input.ownerId, input.projectId, input.documentId, input.draftId]);
}
function valid(scope: string, room: string): boolean {
  return scope.length > 0 && scope.length <= 4096
    && /^work-instant-[a-z0-9]+-[a-z0-9]{4}$/u.test(room) && room.length <= 160;
}
/**
 * Reads the room a scope's origin receipt points at, with the same strict shape checks as the
 * verifier below. Re-entry paths that carry no room of their own (document links,
 * `resume=latest`) need the pointed room itself as their recovery candidate; without this read
 * they can only mint a fresh room and then overwrite the receipt, orphaning the previous room
 * and every recovery layer keyed by it. Fail-closed: anything malformed reads as no receipt.
 */
export function readStudioLocalDraftOriginRoom(storage: OriginStorage, scope: string): string | null {
  try {
    const raw = storage.getItem(STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(scope));
    if (!raw || raw.length > 12288) return null;
    const value = JSON.parse(raw) as { v?: unknown; scope?: unknown; room?: unknown };
    if (value?.v !== 1 || value.scope !== scope || typeof value.room !== "string") return null;
    if (Object.keys(value).sort().join() !== "room,scope,v") return null;
    return valid(scope, value.room) ? value.room : null;
  } catch { return null; }
}
export function hasStudioLocalDraftOrigin(storage: OriginStorage, scope: string, room: string): boolean {
  if (!valid(scope, room)) return false;
  return readStudioLocalDraftOriginRoom(storage, scope) === room;
}
/**
 * A restarted local origin may reclaim only its own exact browser/account/document room after
 * acquiring a non-stealing Web Lock. Active companions remain joiners. No saved-work or remix
 * caller is admitted; a query string alone never establishes ownership. Unsupported locks and
 * denied/corrupt storage do not promote a joiner. The browser releases the lease on process exit.
 *
 * 이 탭이 이미 소유한 룸(knownTabOwner)은 같은 페이지가 리스를 다시 잡는 순간(효과 재실행·문서 경계
 * 재마운트·StrictMode)에도 끊기면 안 된다. 직전 리스의 해제는 새 요청보다 늦게 브라우저에 닿으므로
 * ifAvailable로 다시 요청하면 자기 리스와 경합해 null을 받고, 비어 버린 리스를 sessionStorage가 복제된
 * 탭이 회복해 같은 룸의 두 번째 소유자가 된다. 그래서 소유 탭은 빼앗지 않는(non-stealing) 대기 요청으로
 * 직전 리스를 그대로 이어받고, 해제 시 대기 요청을 취소한다. 동행·복구 후보는 기존대로 ifAvailable로만
 * 시도해 살아 있는 원점을 기다렸다가 승격되는 일이 없다.
 */
export function holdStudioLocalDraftOwnership(input: {
  scope: string; room: string; knownTabOwner: boolean; workId: string | null; remixId: string | null;
  storage: OriginStorage | null; locks: OwnerLocks | null; onRecovered: () => void;
}): () => void {
  let active = true;
  let release = () => {};
  let cancelQueuedRequest = () => {};
  const dispose = () => { active = false; cancelQueuedRequest(); release(); };
  const { storage, locks, scope, room } = input;
  if (input.workId || input.remixId || !storage || !locks || !valid(scope, room)) return dispose;
  if (!input.knownTabOwner && !hasStudioLocalDraftOrigin(storage, scope, room)) return dispose;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let options: { ifAvailable: true } | { signal: AbortSignal } = { ifAvailable: true };
  if (input.knownTabOwner) {
    const queued = new AbortController();
    cancelQueuedRequest = () => queued.abort();
    options = { signal: queued.signal };
  }
  void Promise.resolve().then(() => locks.request(
    STUDIO_LOCAL_DRAFT_OWNER_PREFIX + JSON.stringify([scope, room]), options,
    async (lock) => {
      if (!active || !lock) return;
      if (input.knownTabOwner) {
        try {
          storage.setItem(STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(scope),
            JSON.stringify({ v: 1, scope, room }));
        } catch { /* Existing tab ownership remains unchanged; no restart guarantee. */ }
      } else {
        // Recheck after acquiring the lease: another local document may have replaced the pointer.
        if (!hasStudioLocalDraftOrigin(storage, scope, room)) return;
        input.onRecovered();
      }
      await held;
    },
  )).catch(() => {
    // Never turn unsupported/denied ownership coordination into an edit grant.
    // 해제로 취소된 소유 탭의 대기 요청(AbortError)도 여기서 끝나며 콜백은 실행되지 않는다.
  });
  return dispose;
}
