import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/domains/auth/public/session/auth-session-state";

import {
  addCompareSendInboxEntry,
  acknowledgeCompareSendInbox,
  compareSendInboxKey,
  compareSendInboxScope,
  compareSendInboxToPoolItems,
  consumeCompareSendInbox,
  parseCompareSendInbox,
  peekCompareSendInbox,
  writeCompareSendInbox,
  COMPARE_SEND_INBOX_LIMIT,
  COMPARE_SEND_INBOX_PREFIX,
  type CompareSendInboxEntry,
  type CompareSendInboxLockProvider,
  type CompareSendStorage,
} from "./compare-send-inbox";
import { createCompareSendInboxTestLocks } from "./compare-send-inbox-lock.test-fixture";

const auth = vi.hoisted(() => ({ userId: "account-A" as string | null, listeners: new Set<(session: Session) => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => auth.userId, listeners: auth.listeners }));
let locks: CompareSendInboxLockProvider;
beforeEach(() => {
  auth.userId = "account-A";
  locks = createCompareSendInboxTestLocks();
  vi.stubGlobal("navigator", { locks });
});
afterEach(() => { try { expect(auth.listeners.size).toBe(0); } finally { vi.unstubAllGlobals(); } });

function publishAuth(userId: string | null, name = "계정") {
  auth.userId = userId;
  const session: Session = userId ? { user: { id: userId, name } } : null;
  auth.listeners.forEach((listener) => listener(session));
}
function gate() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, release() { if (!resolve) throw new Error("대기 신호가 준비되지 않았습니다."); resolve(); } };
}
async function holdScope(name: string) {
  const entered = gate(), released = gate();
  const held = locks.request(name, { mode: "exclusive" }, async () => { entered.release(); await released.promise; });
  await entered.promise;
  return { release: released.release, held };
}

const entry = (pageId: string, sentAt = "2026-10-14T00:00:00.000Z"): CompareSendInboxEntry => ({
  id: `send-${pageId}`,
  pageId,
  pageLabel: `에디터 · ${pageId}`,
  imageUrl: "data:image/png;base64,AAAA",
  sentAt,
});

function memoryStorage(): CompareSendStorage & { dump(): ReadonlyMap<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    dump: () => map,
  };
}

describe("compare send inbox (잔여 배선 ④)", () => {
  it("같은 페이지를 다시 보내면 교체되고, 풀 항목은 reference 소스가 된다", () => {
    const first = addCompareSendInboxEntry([], entry("page-1"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addCompareSendInboxEntry(first.entries, entry("page-1", "2026-10-14T01:00:00.000Z"));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.entries).toHaveLength(1);
    const items = compareSendInboxToPoolItems(second.entries, "work-1");
    expect(items[0].source).toEqual({ kind: "reference", boardId: "editor-send:work-1", itemId: "send-page-1" });
    expect(items[0].imageUrl).toBe("data:image/png;base64,AAAA");
  });

  it("이미지가 아닌 값과 깨진 저장값은 거부·탈락한다", () => {
    expect(addCompareSendInboxEntry([], { ...entry("p"), imageUrl: "https://x/y.png" }).ok).toBe(false);
    expect(parseCompareSendInbox("not-json")).toEqual([]);
    expect(parseCompareSendInbox(JSON.stringify([{ id: 1 }]))).toEqual([]);
  });

  it("쓰고 소비하면 비워져 두 번 들어가지 않는다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    const written = await writeCompareSendInbox(storage, scope, entry("page-9"));
    expect(written.ok).toBe(true);
    expect(storage.dump().has(compareSendInboxKey(scope))).toBe(true);
    expect(await consumeCompareSendInbox(storage, scope)).toHaveLength(1);
    expect(await consumeCompareSendInbox(storage, scope)).toHaveLength(0);
  });

  it("B는 A 수신함을 읽거나 삭제하지 못하고 A 재로그인 뒤 원본 PNG가 다시 수신된다", async () => {
    const storage = memoryStorage(), a = compareSendInboxScope("account-A", "work-1"), b = compareSendInboxScope("account-B", "work-1");
    const original = entry("page-1");
    expect((await writeCompareSendInbox(storage, a, original)).ok).toBe(true);
    const raw = storage.getItem(compareSendInboxKey(a));
    auth.userId = "account-B";
    expect(await consumeCompareSendInbox(storage, b)).toEqual([]);
    expect(await consumeCompareSendInbox(storage, a)).toEqual([]);
    expect(storage.getItem(compareSendInboxKey(a))).toBe(raw);
    auth.userId = "account-A";
    expect(await consumeCompareSendInbox(storage, a)).toEqual([original]);
    expect(storage.getItem(compareSendInboxKey(a))).toBeNull();
  });

  it("캡처 시작 계정과 현재 계정이 다르면 늦은 PNG를 기록하거나 B scope로 바꾸지 않는다", async () => {
    const storage = memoryStorage(), captured = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, captured, entry("before"));
    const original = new Map(storage.dump());
    auth.userId = "account-B";
    expect(await writeCompareSendInbox(storage, captured, entry("late"))).toEqual({ ok: false, reason: "scope-changed" });
    expect(storage.dump()).toEqual(original);
    expect(storage.getItem(compareSendInboxKey(compareSendInboxScope("account-B", "work-1")))).toBeNull();
  });

  it("같은 계정에서도 다른 작품의 PNG를 소비하거나 삭제하지 않는다", async () => {
    const storage = memoryStorage(), a = compareSendInboxScope("account-A", "work-1"), other = compareSendInboxScope("account-A", "work-2");
    await writeCompareSendInbox(storage, a, entry("original"));
    expect(await consumeCompareSendInbox(storage, other)).toEqual([]);
    expect(await consumeCompareSendInbox(storage, a)).toEqual([entry("original")]);
  });

  it("잘못된 scope 봉투를 복사한 현재 키는 읽기·삭제·덮어쓰기를 거절한다", async () => {
    const storage = memoryStorage(), a = compareSendInboxScope("account-A", "work-1"), other = compareSendInboxScope("account-A", "work-2");
    await writeCompareSendInbox(storage, other, entry("original"));
    const raw = storage.getItem(compareSendInboxKey(other));
    if (raw === null) throw new Error("실제 수신함 봉투가 없습니다.");
    storage.setItem(compareSendInboxKey(a), raw);
    expect(await consumeCompareSendInbox(storage, a)).toEqual([]);
    expect(await writeCompareSendInbox(storage, a, entry("replacement"))).toEqual({ ok: false, reason: "storage-failed" });
    expect(storage.getItem(compareSendInboxKey(a))).toBe(raw);
  });

  it("소유자 없는 기존 수신함 원문은 A/B 모두 자동 채택하거나 삭제·덮어쓰지 않는다", async () => {
    const storage = memoryStorage(), legacyKey = COMPARE_SEND_INBOX_PREFIX + "work-1", raw = JSON.stringify([entry("legacy")]);
    storage.setItem(legacyKey, raw);
    for (const userId of ["account-A", "account-B"]) {
      auth.userId = userId;
      const scope = compareSendInboxScope(userId, "work-1");
      expect(await consumeCompareSendInbox(storage, scope)).toEqual([]);
      expect((await writeCompareSendInbox(storage, scope, entry(userId))).ok).toBe(true);
      expect(await consumeCompareSendInbox(storage, scope)).toEqual([entry(userId)]);
      expect(storage.getItem(legacyKey)).toBe(raw);
    }
  });

  it("익명·샘플도 UID가 생기면 소비할 수 없고 로그인된 샘플은 실제 계정을 우선한다", async () => {
    const storage = memoryStorage(), guest = compareSendInboxScope(null, "work-1"), sampleGuest = compareSendInboxScope(null, "work-1", true);
    auth.userId = null;
    await writeCompareSendInbox(storage, guest, entry("anonymous"));
    await writeCompareSendInbox(storage, sampleGuest, entry("sample"));
    auth.userId = "account-A";
    const account = compareSendInboxScope("account-A", "work-1", true);
    expect(account.owner).toEqual({ kind: "account", userId: "account-A" });
    expect(await consumeCompareSendInbox(storage, guest)).toEqual([]);
    expect(await consumeCompareSendInbox(storage, sampleGuest)).toEqual([]);
    expect(await consumeCompareSendInbox(storage, account)).toEqual([]);
    expect(await writeCompareSendInbox(storage, guest, entry("late"))).toEqual({ ok: false, reason: "scope-changed" });
    expect((await writeCompareSendInbox(storage, account, entry("account-sample"))).ok).toBe(true);
    auth.userId = "account-B";
    expect(await consumeCompareSendInbox(storage, compareSendInboxScope("account-B", "work-1", true))).toEqual([]);
    expect(await consumeCompareSendInbox(storage, account)).toEqual([]);
    auth.userId = "account-A";
    expect(await consumeCompareSendInbox(storage, account)).toEqual([entry("account-sample")]);
    auth.userId = null;
    expect(await consumeCompareSendInbox(storage, guest)).toEqual([entry("anonymous")]);
    expect(await consumeCompareSendInbox(storage, sampleGuest)).toEqual([entry("sample")]);
  });

  it("scoped 봉투도 기존 8개 상한과 원본 PNG·페이지 메타데이터를 유지한다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    for (let index = 0; index < COMPARE_SEND_INBOX_LIMIT + 1; index += 1) {
      expect((await writeCompareSendInbox(storage, scope, entry("page-" + index))).ok).toBe(true);
    }
    const received = await consumeCompareSendInbox(storage, scope);
    expect(received).toHaveLength(8);
    expect(received).toEqual(Array.from({ length: 8 }, (_, index) => entry("page-" + (index + 1))));
  });

  it("peek를 반복해도 원문은 그대로이며 ACK는 가져온 정확한 항목만 정리한다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, scope, entry("original"));
    const raw = storage.getItem(compareSendInboxKey(scope)), first = peekCompareSendInbox(storage, scope);
    expect(peekCompareSendInbox(storage, scope)).toEqual(first);
    expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
    await writeCompareSendInbox(storage, scope, entry("new"));
    expect(await acknowledgeCompareSendInbox(storage, scope, first)).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("new")]);
    expect(await acknowledgeCompareSendInbox(storage, scope, first)).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("new")]);
  });

  it.each(["imageUrl", "pageLabel", "pageId", "sentAt"] as const)("같은 ID라도 %s가 바뀐 전송본은 이전 원문의 ACK로 지우지 않는다", async (field) => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, scope, entry("original"));
    const first = peekCompareSendInbox(storage, scope);
    const replacement = { ...entry("original"), [field]: field === "imageUrl" ? "data:image/png;base64,BBBB" : "changed" };
    await writeCompareSendInbox(storage, scope, replacement);
    expect(await acknowledgeCompareSendInbox(storage, scope, first)).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([replacement]);
  });

  it("ACK 중 계정이 바뀌거나 봉투·본문이 손상되면 수신함을 수정하지 않는다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, scope, entry("original"));
    const first = peekCompareSendInbox(storage, scope), key = compareSendInboxKey(scope), original = storage.getItem(key);
    auth.userId = "account-B";
    expect(await acknowledgeCompareSendInbox(storage, scope, first)).toBe(false);
    expect(storage.getItem(key)).toBe(original);
    auth.userId = "account-A";
    for (const raw of ["{broken", JSON.stringify({ version: 1, scope: "wrong", payload: "[]" }),
      JSON.stringify({ version: 1, scope: JSON.stringify(["account", "account-A", "work-1"]), payload: JSON.stringify([entry("original"), { broken: true }]) })]) {
      storage.setItem(key, raw);
      expect(peekCompareSendInbox(storage, scope)).toEqual([]);
      expect(await acknowledgeCompareSendInbox(storage, scope, first)).toBe(false);
      expect(storage.getItem(key)).toBe(raw);
    }
  });

  it("ACK가 저장소 예외를 만나면 기존 전송본을 남겨 재진입 때 다시 읽을 수 있다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, scope, entry("original"));
    const first = peekCompareSendInbox(storage, scope), raw = storage.getItem(compareSendInboxKey(scope));
    const blocked: CompareSendStorage = { ...storage, setItem: () => { throw new Error("저장 차단"); } };
    expect(await acknowledgeCompareSendInbox(blocked, scope, first)).toBe(false);
    expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
    expect(peekCompareSendInbox(storage, scope)).toEqual(first);
  });

  it.each(["new", "replacement"] as const)("ACK의 읽기와 쓰기 사이 시작한 %s 송신은 ACK 뒤에도 남는다", async (kind) => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), original = entry("original");
    await writeCompareSendInbox(storage, scope, original);
    const next = kind === "new" ? entry("new") : { ...original, pageLabel: "교체본", imageUrl: "data:image/png;base64,BBBB" };
    const pending: { sending?: ReturnType<typeof writeCompareSendInbox> } = {};
    const interrupted: CompareSendStorage = { ...storage, getItem(key) {
      const raw = storage.getItem(key);
      if (!pending.sending) pending.sending = writeCompareSendInbox(storage, scope, next);
      return raw;
    } };
    expect(await acknowledgeCompareSendInbox(interrupted, scope, [original])).toBe(true);
    if (!pending.sending) throw new Error("ACK를 읽는 동안 송신이 시작되지 않았습니다.");
    expect((await pending.sending).ok).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([next]);
  });

  it("송신 B의 읽기와 쓰기 사이 시작한 C도 직렬로 합쳐져 서로 덮어쓰지 않는다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, scope, entry("A"));
    const pending: { sending?: ReturnType<typeof writeCompareSendInbox> } = {};
    const interrupted: CompareSendStorage = { ...storage, getItem(key) {
      const raw = storage.getItem(key);
      if (!pending.sending) pending.sending = writeCompareSendInbox(storage, scope, entry("C"));
      return raw;
    } };
    expect((await writeCompareSendInbox(interrupted, scope, entry("B"))).ok).toBe(true);
    if (!pending.sending) throw new Error("송신 B를 읽는 동안 C가 시작되지 않았습니다.");
    expect((await pending.sending).ok).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("A"), entry("B"), entry("C")]);
  });

  it("송신이 목록을 읽는 동안 시작한 ACK는 이미 전달된 A를 되살리지 않는다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), original = entry("A");
    await writeCompareSendInbox(storage, scope, original);
    const pending: { acknowledgement?: Promise<boolean> } = {};
    const interrupted: CompareSendStorage = { ...storage, getItem(key) {
      const raw = storage.getItem(key);
      if (!pending.acknowledgement) pending.acknowledgement = acknowledgeCompareSendInbox(storage, scope, [original]);
      return raw;
    } };
    expect((await writeCompareSendInbox(interrupted, scope, entry("B"))).ok).toBe(true);
    if (!pending.acknowledgement) throw new Error("송신을 읽는 동안 ACK가 시작되지 않았습니다.");
    expect(await pending.acknowledgement).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("B")]);
  });

  it("서로 다른 항목의 ACK가 읽기와 쓰기 사이 겹쳐도 정리한 항목이 되살아나지 않는다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, scope, entry("A"));
    await writeCompareSendInbox(storage, scope, entry("B"));
    const pending: { acknowledgement?: Promise<boolean> } = {};
    const interrupted: CompareSendStorage = { ...storage, getItem(key) {
      const raw = storage.getItem(key);
      if (!pending.acknowledgement) pending.acknowledgement = acknowledgeCompareSendInbox(storage, scope, [entry("B")]);
      return raw;
    } };
    expect(await acknowledgeCompareSendInbox(interrupted, scope, [entry("A")])).toBe(true);
    if (!pending.acknowledgement) throw new Error("첫 ACK를 읽는 동안 두 번째 ACK가 시작되지 않았습니다.");
    expect(await pending.acknowledgement).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([]);
  });

  it("소비의 읽기와 삭제 사이 시작한 송신도 같은 잠금을 기다린 뒤 보존된다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), original = entry("A");
    await writeCompareSendInbox(storage, scope, original);
    const pending: { sending?: ReturnType<typeof writeCompareSendInbox> } = {};
    const interrupted: CompareSendStorage = { ...storage, getItem(key) {
      const raw = storage.getItem(key);
      if (!pending.sending) pending.sending = writeCompareSendInbox(storage, scope, entry("B"));
      return raw;
    } };
    expect(await consumeCompareSendInbox(interrupted, scope)).toEqual([original]);
    if (!pending.sending) throw new Error("소비를 읽는 동안 송신이 시작되지 않았습니다.");
    expect((await pending.sending).ok).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("B")]);
  });

  it.each([false, true])("대기 중 UID 변경은 세 변경을 폐기하고 A로 돌아와도 복구하지 않는다: %s", async (returnToA) => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), original = entry("A");
    await writeCompareSendInbox(storage, scope, original);
    const raw = storage.getItem(compareSendInboxKey(scope)), blocker = await holdScope(compareSendInboxKey(scope));
    try {
      const sending = writeCompareSendInbox(storage, scope, entry("B"));
      const acknowledging = acknowledgeCompareSendInbox(storage, scope, [original]);
      const consuming = consumeCompareSendInbox(storage, scope);
      publishAuth("account-B");
      if (returnToA) publishAuth("account-A");
      expect(await sending).toEqual({ ok: false, reason: "scope-changed" });
      expect(await acknowledging).toBe(false);
      expect(await consuming).toEqual([]);
      expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
    } finally { blocker.release(); await blocker.held; }
  });

  it("같은 UID의 프로필 발행은 대기 송신을 취소하지 않는다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), blocker = await holdScope(compareSendInboxKey(scope));
    const sending = writeCompareSendInbox(storage, scope, entry("A"));
    publishAuth("account-A", "새 프로필");
    blocker.release(); await blocker.held;
    expect((await sending).ok).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("A")]);
  });

  it("호출자의 대기 취소는 세 변경을 실행하지 않고 원문과 구독을 정리한다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), controller = new AbortController();
    await writeCompareSendInbox(storage, scope, entry("A"));
    const raw = storage.getItem(compareSendInboxKey(scope)), blocker = await holdScope(compareSendInboxKey(scope));
    try {
      const options = { signal: controller.signal };
      const sending = writeCompareSendInbox(storage, scope, entry("B"), options);
      const acknowledging = acknowledgeCompareSendInbox(storage, scope, [entry("A")], options);
      const consuming = consumeCompareSendInbox(storage, scope, options);
      controller.abort();
      expect(await sending).toEqual({ ok: false, reason: "storage-failed" });
      expect(await acknowledging).toBe(false);
      expect(await consuming).toEqual([]);
      expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
      expect(auth.listeners.size).toBe(0);
    } finally { blocker.release(); await blocker.held; }
  });

  it.each(["계정 전환", "호출 취소"] as const)("잠금 진입 뒤 읽는 도중 %s가 생겨도 쓰기 직전 다시 거절한다", async (kind) => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), controller = new AbortController();
    await writeCompareSendInbox(storage, scope, entry("A"));
    const raw = storage.getItem(compareSendInboxKey(scope));
    const interrupted: CompareSendStorage = { ...storage, getItem(key) {
      const value = storage.getItem(key);
      if (kind === "계정 전환") { publishAuth("account-B"); publishAuth("account-A"); } else controller.abort();
      return value;
    } };
    expect(await writeCompareSendInbox(interrupted, scope, entry("B"), { signal: controller.signal })).toEqual({
      ok: false, reason: kind === "계정 전환" ? "scope-changed" : "storage-failed",
    });
    expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
  });

  it("대기 전에 scope와 송신 항목을 복사해 호출자가 바꿔도 원래 의도만 저장한다", async () => {
    const storage = memoryStorage(), originalScope = compareSendInboxScope("account-A", "work-1");
    const scope = { owner: { kind: "account" as const, userId: "account-A" }, workId: "work-1" }, original = entry("A"), mutable = { ...original };
    const blocker = await holdScope(compareSendInboxKey(originalScope));
    const sending = writeCompareSendInbox(storage, scope, mutable);
    scope.workId = "work-2"; scope.owner.userId = "account-B";
    mutable.id = "변경"; mutable.pageId = "변경"; mutable.pageLabel = "변경";
    mutable.imageUrl = "data:image/png;base64,BBBB"; mutable.sentAt = "변경";
    blocker.release(); await blocker.held;
    expect((await sending).ok).toBe(true);
    expect(peekCompareSendInbox(storage, originalScope)).toEqual([original]);
    expect(storage.getItem(compareSendInboxKey(scope))).toBeNull();
  });

  it("대기 전에 ACK 목록과 항목을 복사해 나중에 바꾼 목록으로 다른 전송본을 지우지 않는다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), first = { ...entry("A") }, delivered = [first];
    await writeCompareSendInbox(storage, scope, first);
    await writeCompareSendInbox(storage, scope, entry("B"));
    const blocker = await holdScope(compareSendInboxKey(scope));
    const acknowledging = acknowledgeCompareSendInbox(storage, scope, delivered);
    first.imageUrl = "data:image/png;base64,BBBB"; delivered.push(entry("B"));
    blocker.release(); await blocker.held;
    expect(await acknowledging).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("B")]);
  });

  it.each(["없음", "예외"] as const)("잠금 %s에서는 읽기·쓰기·삭제 없이 명시적으로 실패한다", async (kind) => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, scope, entry("A"));
    const raw = storage.getItem(compareSendInboxKey(scope));
    const guarded = { getItem: vi.fn(storage.getItem), setItem: vi.fn(storage.setItem), removeItem: vi.fn(storage.removeItem) };
    const rejected: CompareSendInboxLockProvider = { request: () => Promise.reject(new Error("잠금 거절")) };
    const options = { locks: kind === "없음" ? null : rejected };
    expect(await writeCompareSendInbox(guarded, scope, entry("B"), options)).toEqual({ ok: false, reason: "storage-failed" });
    expect(await acknowledgeCompareSendInbox(guarded, scope, [entry("A")], options)).toBe(false);
    expect(await consumeCompareSendInbox(guarded, scope, options)).toEqual([]);
    expect(guarded.getItem).not.toHaveBeenCalled(); expect(guarded.setItem).not.toHaveBeenCalled(); expect(guarded.removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
  });

  it("브라우저가 잠금을 지원하지 않으면 무잠금 저장으로 돌아가지 않는다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    vi.stubGlobal("navigator", {});
    expect(await writeCompareSendInbox(storage, scope, entry("A"))).toEqual({ ok: false, reason: "storage-failed" });
    expect(storage.dump().size).toBe(0);
  });

  it("quota는 저장을 거절하고 소비의 삭제 실패는 기존 항목 반환과 원문 보존을 유지한다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    await writeCompareSendInbox(storage, scope, entry("A"));
    const raw = storage.getItem(compareSendInboxKey(scope));
    const blocked: CompareSendStorage = { ...storage,
      setItem: () => { throw new DOMException("저장 공간 부족", "QuotaExceededError"); },
      removeItem: () => { throw new Error("삭제 거절"); },
    };
    expect(await writeCompareSendInbox(blocked, scope, entry("B"))).toEqual({ ok: false, reason: "storage-failed" });
    expect(await acknowledgeCompareSendInbox(blocked, scope, [entry("A")])).toBe(false);
    expect(await consumeCompareSendInbox(blocked, scope)).toEqual([entry("A")]);
    expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
  });

  it("송신과 ACK는 같은 배타 잠금의 콜백 안에서만 전체 읽기와 쓰기를 실행한다", async () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1"), name = compareSendInboxKey(scope);
    await writeCompareSendInbox(storage, scope, entry("A"));
    const requests: { readonly name: string; readonly mode: "exclusive" }[] = [];
    let active = 0;
    const observed: CompareSendInboxLockProvider = {
      request(key, options, operation) {
        requests.push({ name: key, mode: options.mode });
        return locks.request(key, options, async () => {
          active += 1;
          try { return await operation(); } finally { active -= 1; }
        });
      },
    };
    const guarded: CompareSendStorage = {
      getItem: vi.fn((key: string) => { expect(active).toBe(1); return storage.getItem(key); }),
      setItem: vi.fn((key: string, value: string) => { expect(active).toBe(1); storage.setItem(key, value); }),
      removeItem: vi.fn((key: string) => { expect(active).toBe(1); storage.removeItem(key); }),
    };
    const blocker = await holdScope(name);
    const sending = writeCompareSendInbox(guarded, scope, entry("B"), { locks: observed });
    const acknowledging = acknowledgeCompareSendInbox(guarded, scope, [entry("A")], { locks: observed });
    try {
      expect(requests).toEqual([{ name, mode: "exclusive" }, { name, mode: "exclusive" }]);
      expect(active).toBe(0);
      expect(guarded.getItem).not.toHaveBeenCalled();
      expect(guarded.setItem).not.toHaveBeenCalled();
      expect(guarded.removeItem).not.toHaveBeenCalled();
    } finally { blocker.release(); await blocker.held; }
    expect((await sending).ok).toBe(true);
    expect(await acknowledging).toBe(true);
    expect(guarded.getItem).toHaveBeenCalledTimes(2);
    expect(guarded.setItem).toHaveBeenCalledTimes(2);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("B")]);
  });

  it("잠금 도우미는 보유 콜백 완료를 기다리고 취소된 대기를 건너뛰어 FIFO로 허용한다", async () => {
    const scope = compareSendInboxScope("account-A", "work-1"), name = compareSendInboxKey(scope), order: string[] = [];
    const blocker = await holdScope(name), controller = new AbortController();
    const cancelled = locks.request(name, { mode: "exclusive", signal: controller.signal }, () => { order.push("취소본"); });
    const cancelledResult = cancelled.catch((error: unknown) => error);
    const first = locks.request(name, { mode: "exclusive" }, () => { order.push("첫째"); });
    const second = locks.request(name, { mode: "exclusive" }, () => { order.push("둘째"); });
    expect(order).toEqual([]);
    controller.abort();
    expect(await cancelledResult).toBeInstanceOf(DOMException);
    blocker.release(); await blocker.held; await Promise.all([first, second]);
    expect(order).toEqual(["첫째", "둘째"]);
  });
});
