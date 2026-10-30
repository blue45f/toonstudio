import { beforeEach, describe, expect, it, vi } from "vitest";

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
  type CompareSendStorage,
} from "./compare-send-inbox";

const auth = vi.hoisted(() => ({ userId: "account-A" as string | null }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => auth.userId }));
beforeEach(() => { auth.userId = "account-A"; });

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

  it("쓰고 소비하면 비워져 두 번 들어가지 않는다", () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    const written = writeCompareSendInbox(storage, scope, entry("page-9"));
    expect(written.ok).toBe(true);
    expect(storage.dump().has(compareSendInboxKey(scope))).toBe(true);
    expect(consumeCompareSendInbox(storage, scope)).toHaveLength(1);
    expect(consumeCompareSendInbox(storage, scope)).toHaveLength(0);
  });

  it("B는 A 수신함을 읽거나 삭제하지 못하고 A 재로그인 뒤 원본 PNG가 다시 수신된다", () => {
    const storage = memoryStorage(), a = compareSendInboxScope("account-A", "work-1"), b = compareSendInboxScope("account-B", "work-1");
    const original = entry("page-1");
    expect(writeCompareSendInbox(storage, a, original).ok).toBe(true);
    const raw = storage.getItem(compareSendInboxKey(a));
    auth.userId = "account-B";
    expect(consumeCompareSendInbox(storage, b)).toEqual([]);
    expect(consumeCompareSendInbox(storage, a)).toEqual([]);
    expect(storage.getItem(compareSendInboxKey(a))).toBe(raw);
    auth.userId = "account-A";
    expect(consumeCompareSendInbox(storage, a)).toEqual([original]);
    expect(storage.getItem(compareSendInboxKey(a))).toBeNull();
  });

  it("캡처 시작 계정과 현재 계정이 다르면 늦은 PNG를 기록하거나 B scope로 바꾸지 않는다", () => {
    const storage = memoryStorage(), captured = compareSendInboxScope("account-A", "work-1");
    writeCompareSendInbox(storage, captured, entry("before"));
    const original = new Map(storage.dump());
    auth.userId = "account-B";
    expect(writeCompareSendInbox(storage, captured, entry("late"))).toEqual({ ok: false, reason: "scope-changed" });
    expect(storage.dump()).toEqual(original);
    expect(storage.getItem(compareSendInboxKey(compareSendInboxScope("account-B", "work-1")))).toBeNull();
  });

  it("같은 계정에서도 다른 작품의 PNG를 소비하거나 삭제하지 않는다", () => {
    const storage = memoryStorage(), a = compareSendInboxScope("account-A", "work-1"), other = compareSendInboxScope("account-A", "work-2");
    writeCompareSendInbox(storage, a, entry("original"));
    expect(consumeCompareSendInbox(storage, other)).toEqual([]);
    expect(consumeCompareSendInbox(storage, a)).toEqual([entry("original")]);
  });

  it("잘못된 scope 봉투를 복사한 현재 키는 읽기·삭제·덮어쓰기를 거절한다", () => {
    const storage = memoryStorage(), a = compareSendInboxScope("account-A", "work-1"), other = compareSendInboxScope("account-A", "work-2");
    writeCompareSendInbox(storage, other, entry("original"));
    const raw = storage.getItem(compareSendInboxKey(other));
    if (raw === null) throw new Error("실제 수신함 봉투가 없습니다.");
    storage.setItem(compareSendInboxKey(a), raw);
    expect(consumeCompareSendInbox(storage, a)).toEqual([]);
    expect(writeCompareSendInbox(storage, a, entry("replacement"))).toEqual({ ok: false, reason: "storage-failed" });
    expect(storage.getItem(compareSendInboxKey(a))).toBe(raw);
  });

  it("소유자 없는 기존 수신함 원문은 A/B 모두 자동 채택하거나 삭제·덮어쓰지 않는다", () => {
    const storage = memoryStorage(), legacyKey = COMPARE_SEND_INBOX_PREFIX + "work-1", raw = JSON.stringify([entry("legacy")]);
    storage.setItem(legacyKey, raw);
    for (const userId of ["account-A", "account-B"]) {
      auth.userId = userId;
      const scope = compareSendInboxScope(userId, "work-1");
      expect(consumeCompareSendInbox(storage, scope)).toEqual([]);
      expect(writeCompareSendInbox(storage, scope, entry(userId)).ok).toBe(true);
      expect(consumeCompareSendInbox(storage, scope)).toEqual([entry(userId)]);
      expect(storage.getItem(legacyKey)).toBe(raw);
    }
  });

  it("익명·샘플도 UID가 생기면 소비할 수 없고 로그인된 샘플은 실제 계정을 우선한다", () => {
    const storage = memoryStorage(), guest = compareSendInboxScope(null, "work-1"), sampleGuest = compareSendInboxScope(null, "work-1", true);
    auth.userId = null;
    writeCompareSendInbox(storage, guest, entry("anonymous"));
    writeCompareSendInbox(storage, sampleGuest, entry("sample"));
    auth.userId = "account-A";
    const account = compareSendInboxScope("account-A", "work-1", true);
    expect(account.owner).toEqual({ kind: "account", userId: "account-A" });
    expect(consumeCompareSendInbox(storage, guest)).toEqual([]);
    expect(consumeCompareSendInbox(storage, sampleGuest)).toEqual([]);
    expect(consumeCompareSendInbox(storage, account)).toEqual([]);
    expect(writeCompareSendInbox(storage, guest, entry("late"))).toEqual({ ok: false, reason: "scope-changed" });
    expect(writeCompareSendInbox(storage, account, entry("account-sample")).ok).toBe(true);
    auth.userId = "account-B";
    expect(consumeCompareSendInbox(storage, compareSendInboxScope("account-B", "work-1", true))).toEqual([]);
    expect(consumeCompareSendInbox(storage, account)).toEqual([]);
    auth.userId = "account-A";
    expect(consumeCompareSendInbox(storage, account)).toEqual([entry("account-sample")]);
    auth.userId = null;
    expect(consumeCompareSendInbox(storage, guest)).toEqual([entry("anonymous")]);
    expect(consumeCompareSendInbox(storage, sampleGuest)).toEqual([entry("sample")]);
  });

  it("scoped 봉투도 기존 8개 상한과 원본 PNG·페이지 메타데이터를 유지한다", () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    for (let index = 0; index < COMPARE_SEND_INBOX_LIMIT + 1; index += 1) {
      expect(writeCompareSendInbox(storage, scope, entry("page-" + index)).ok).toBe(true);
    }
    const received = consumeCompareSendInbox(storage, scope);
    expect(received).toHaveLength(8);
    expect(received).toEqual(Array.from({ length: 8 }, (_, index) => entry("page-" + (index + 1))));
  });

  it("peek를 반복해도 원문은 그대로이며 ACK는 가져온 정확한 항목만 정리한다", () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    writeCompareSendInbox(storage, scope, entry("original"));
    const raw = storage.getItem(compareSendInboxKey(scope)), first = peekCompareSendInbox(storage, scope);
    expect(peekCompareSendInbox(storage, scope)).toEqual(first);
    expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
    writeCompareSendInbox(storage, scope, entry("new"));
    expect(acknowledgeCompareSendInbox(storage, scope, first)).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("new")]);
    expect(acknowledgeCompareSendInbox(storage, scope, first)).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([entry("new")]);
  });

  it.each(["imageUrl", "pageLabel", "pageId", "sentAt"] as const)("같은 ID라도 %s가 바뀐 전송본은 이전 원문의 ACK로 지우지 않는다", (field) => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    writeCompareSendInbox(storage, scope, entry("original"));
    const first = peekCompareSendInbox(storage, scope);
    const replacement = { ...entry("original"), [field]: field === "imageUrl" ? "data:image/png;base64,BBBB" : "changed" };
    writeCompareSendInbox(storage, scope, replacement);
    expect(acknowledgeCompareSendInbox(storage, scope, first)).toBe(true);
    expect(peekCompareSendInbox(storage, scope)).toEqual([replacement]);
  });

  it("ACK 중 계정이 바뀌거나 봉투·본문이 손상되면 수신함을 수정하지 않는다", () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    writeCompareSendInbox(storage, scope, entry("original"));
    const first = peekCompareSendInbox(storage, scope), key = compareSendInboxKey(scope), original = storage.getItem(key);
    auth.userId = "account-B";
    expect(acknowledgeCompareSendInbox(storage, scope, first)).toBe(false);
    expect(storage.getItem(key)).toBe(original);
    auth.userId = "account-A";
    for (const raw of ["{broken", JSON.stringify({ version: 1, scope: "wrong", payload: "[]" }),
      JSON.stringify({ version: 1, scope: JSON.stringify(["account", "account-A", "work-1"]), payload: JSON.stringify([entry("original"), { broken: true }]) })]) {
      storage.setItem(key, raw);
      expect(peekCompareSendInbox(storage, scope)).toEqual([]);
      expect(acknowledgeCompareSendInbox(storage, scope, first)).toBe(false);
      expect(storage.getItem(key)).toBe(raw);
    }
  });

  it("ACK가 저장소 예외를 만나면 기존 전송본을 남겨 재진입 때 다시 읽을 수 있다", () => {
    const storage = memoryStorage(), scope = compareSendInboxScope("account-A", "work-1");
    writeCompareSendInbox(storage, scope, entry("original"));
    const first = peekCompareSendInbox(storage, scope), raw = storage.getItem(compareSendInboxKey(scope));
    const blocked: CompareSendStorage = { ...storage, setItem: () => { throw new Error("저장 차단"); } };
    expect(acknowledgeCompareSendInbox(blocked, scope, first)).toBe(false);
    expect(storage.getItem(compareSendInboxKey(scope))).toBe(raw);
    expect(peekCompareSendInbox(storage, scope)).toEqual(first);
  });
});
