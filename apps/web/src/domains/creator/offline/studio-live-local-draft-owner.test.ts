import { describe, expect, it, vi } from "vitest";

import { hasStudioLocalDraftOrigin, holdStudioLocalDraftOwnership, readStudioLocalDraftOriginRoom, studioLocalDraftOwnerScope, STUDIO_LOCAL_DRAFT_OWNER_PREFIX } from "../live/studio-live-local-draft-owner";

const room = "work-instant-abc-1234";
const scope = studioLocalDraftOwnerScope({ ownerId: "a", projectId: "p", documentId: "d", draftId: null });
type LockRequestOptions = { ifAvailable: true } | { signal: AbortSignal };
function fixture() {
  const rows = new Map<string, string>();
  const held = new Set<string>();
  const waiting = new Map<string, (() => void)[]>();
  const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
  // Web Locks 의미를 따른다: 점유 중이면 ifAvailable은 즉시 null, 대기 요청은 줄을 서고 해제 시 원자적으로
  // 넘겨받으며 signal이 중단되면 대기열에서 빠진다. 해제는 브라우저처럼 콜백의 promise가 끝난 뒤에 일어난다.
  const locks = { request: vi.fn(async (name: string, options: LockRequestOptions, callback: (lock: unknown | null) => Promise<void>) => {
    const signal = "signal" in options ? options.signal : null;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (!held.has(name)) held.add(name);
    else if (!signal) { await callback(null); return; }
    else {
      await new Promise<void>((resolve, reject) => {
        const grant = () => { signal.removeEventListener("abort", cancel); resolve(); };
        const cancel = () => {
          waiting.set(name, (waiting.get(name) ?? []).filter((entry) => entry !== grant));
          reject(new DOMException("aborted", "AbortError"));
        };
        signal.addEventListener("abort", cancel, { once: true });
        waiting.set(name, [...(waiting.get(name) ?? []), grant]);
      });
    }
    try { await callback({ name }); } finally {
      const next = waiting.get(name)?.shift();
      if (next) next(); else held.delete(name);
    }
  }) };
  return { rows, storage, locks, held };
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function options(f: ReturnType<typeof fixture>) {
  return { scope, room, knownTabOwner: true, workId: null, remixId: null, storage: f.storage, locks: f.locks, onRecovered: vi.fn() };
}
describe("browser-local origin reclaim (not server authority)", () => {
  it("remembers only the current local owner and holds a non-stealing lease", async () => {
    const f = fixture(); const input = options(f); const close = holdStudioLocalDraftOwnership(input);
    await settle();
    expect(hasStudioLocalDraftOrigin(f.storage, scope, room)).toBe(true);
    expect(f.held.size).toBe(1);
    expect(input.onRecovered).not.toHaveBeenCalled();
    // 소유 탭은 빼앗지 않는(steal 없음) 대기 요청으로만 리스를 잡고, 해제 시 취소할 signal을 넘긴다.
    expect(f.locks.request.mock.calls[0]?.[1]).toEqual({ signal: expect.any(AbortSignal) });
    close(); await settle(); expect(f.held.size).toBe(0);
  });
  it("does not promote a companion while the origin tab still exists", async () => {
    const f = fixture(); const close = holdStudioLocalDraftOwnership(options(f)); await settle();
    const join = { ...options(f), knownTabOwner: false };
    const closeJoin = holdStudioLocalDraftOwnership(join); await settle();
    expect(join.onRecovered).not.toHaveBeenCalled();
    // 동행 탭은 기다리지 않는다. 살아 있는 원점이 닫힌 뒤 대기열에서 승격되는 일이 없어야 한다.
    expect(f.locks.request.mock.calls[1]?.[1]).toEqual({ ifAvailable: true });
    closeJoin(); close(); await settle();
  });
  it("같은 탭이 리스를 곧바로 다시 잡아도 끊기지 않아 복제 탭이 살아 있는 원점을 회복하지 못한다", async () => {
    // 소유 탭이 ?room=을 게시하며 효과가 재실행되는 순간(해제 직후 같은 리스 재요청)을 그대로 재현한다.
    const f = fixture(); const first = holdStudioLocalDraftOwnership(options(f)); await settle();
    first(); const second = holdStudioLocalDraftOwnership(options(f)); await settle(); await settle();
    expect(f.held.size).toBe(1);
    const duplicate = { ...options(f), knownTabOwner: false };
    const closeDuplicate = holdStudioLocalDraftOwnership(duplicate); await settle();
    expect(duplicate.onRecovered).not.toHaveBeenCalled();
    closeDuplicate(); second(); await settle(); await settle();
    expect(f.held.size).toBe(0);
  });
  it("해제된 소유 탭의 대기 요청은 대기열에서 곧바로 빠지고 나중에 리스를 얻지 않는다", async () => {
    const f = fixture(); const owner = holdStudioLocalDraftOwnership(options(f)); await settle();
    const queued = holdStudioLocalDraftOwnership(options(f)); await settle();
    const queuedRequest = f.locks.request.mock.results[1]?.value as Promise<void>;
    queued();
    // 취소가 없으면 대기 요청은 원래 소유자가 놓을 때까지 대기열에 남는다("pending").
    const outcome = await Promise.race([
      queuedRequest.then(() => "granted", (error: unknown) => (error as DOMException).name),
      settle().then(() => "pending"),
    ]);
    expect(outcome).toBe("AbortError");
    owner(); await settle(); await settle();
    expect(f.held.size).toBe(0);
  });
  it("reclaims the same local origin after the browser releases its old lease", async () => {
    const f = fixture(); const close = holdStudioLocalDraftOwnership(options(f)); await settle(); close(); await settle();
    const restarted = { ...options(f), knownTabOwner: false };
    const closeRestart = holdStudioLocalDraftOwnership(restarted); await settle();
    expect(restarted.onRecovered).toHaveBeenCalledTimes(1);
    expect(f.held.size).toBe(1);
    closeRestart(); await settle();
  });
  it.each([{ workId: "server-work", remixId: null }, { workId: null, remixId: "source" }])("never admits saved or remix sources %j", async (source) => {
    const f = fixture(); const input = { ...options(f), ...source };
    holdStudioLocalDraftOwnership(input); await settle();
    expect(f.rows.size).toBe(0); expect(f.locks.request).not.toHaveBeenCalled();
  });
  it("rejects foreign rooms, different owners and different local documents", async () => {
    const f = fixture(); const close = holdStudioLocalDraftOwnership(options(f)); await settle(); close(); await settle();
    for (const changed of [{ room: "work-instant-other-1234" },
      { scope: studioLocalDraftOwnerScope({ ownerId: "b", projectId: "p", documentId: "d", draftId: null }) },
      { scope: studioLocalDraftOwnerScope({ ownerId: "a", projectId: "p", documentId: "other", draftId: null }) }]) {
      const input = { ...options(f), knownTabOwner: false, ...changed };
      holdStudioLocalDraftOwnership(input); await settle(); expect(input.onRecovered).not.toHaveBeenCalled();
    }
  });
  it("never treats an unknown URL as proof of ownership", async () => {
    const f = fixture(); const input = { ...options(f), knownTabOwner: false };
    holdStudioLocalDraftOwnership(input); await settle();
    expect(f.rows.size).toBe(0); expect(f.locks.request).not.toHaveBeenCalled(); expect(input.onRecovered).not.toHaveBeenCalled();
  });
  it("fails closed for missing locks, denied storage and corrupt origins", async () => {
    const f = fixture(); const key = STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(scope);
    for (const raw of ["corrupt", "null", JSON.stringify({ v: 1, scope, room, extra: true }), "x".repeat(12289)]) {
      f.rows.set(key, raw); expect(hasStudioLocalDraftOrigin(f.storage, scope, room)).toBe(false);
    }
    const noLocks = { ...options(f), knownTabOwner: false, locks: null };
    holdStudioLocalDraftOwnership(noLocks); await settle(); expect(noLocks.onRecovered).not.toHaveBeenCalled();
    const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    const input = { ...options(f), knownTabOwner: false, storage: denied };
    holdStudioLocalDraftOwnership(input); await settle(); expect(input.onRecovered).not.toHaveBeenCalled();
  });
  it("reads the pointed room back for room-less re-entry candidates", async () => {
    const f = fixture(); const close = holdStudioLocalDraftOwnership(options(f)); await settle(); close(); await settle();
    expect(readStudioLocalDraftOriginRoom(f.storage, scope)).toBe(room);
    expect(readStudioLocalDraftOriginRoom(f.storage,
      studioLocalDraftOwnerScope({ ownerId: "b", projectId: "p", documentId: "d", draftId: null }))).toBeNull();
  });
  it("reads no room from missing, corrupt or foreign receipts", async () => {
    const f = fixture(); const key = STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(scope);
    expect(readStudioLocalDraftOriginRoom(f.storage, scope)).toBeNull();
    for (const raw of ["corrupt", "null",
      JSON.stringify({ v: 1, scope, room, extra: true }),
      JSON.stringify({ v: 1, scope, room: "not-a-room" }),
      JSON.stringify({ v: 2, scope, room }),
      JSON.stringify({ v: 1, scope: "other-scope", room }),
      "x".repeat(12289)]) {
      f.rows.set(key, raw);
      expect(readStudioLocalDraftOriginRoom(f.storage, scope)).toBeNull();
    }
    const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readStudioLocalDraftOriginRoom(denied, scope)).toBeNull();
  });
  it("does not recover after unmount or if the pointer changes before the lock callback", async () => {
    const f = fixture(); const owner = holdStudioLocalDraftOwnership(options(f)); await settle(); owner(); await settle();
    const input = { ...options(f), knownTabOwner: false };
    const close = holdStudioLocalDraftOwnership(input); close(); await settle(); expect(input.onRecovered).not.toHaveBeenCalled();
    holdStudioLocalDraftOwnership(input); f.rows.clear(); await settle(); expect(input.onRecovered).not.toHaveBeenCalled();
  });
});
