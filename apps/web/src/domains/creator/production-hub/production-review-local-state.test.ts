import { beforeEach, describe, expect, it, vi } from "vitest";
import { addStudioCommentThread, createEmptyStudioCommentsDocument, normalizeStudioCommentsDocument,
  serializeStudioCommentsDocument } from "../studio-comments";
import { addComparePoolItem, createCompareImageAnchor, createEmptyCompareSession, parseCompareSession,
  poolItemFromExternal, serializeCompareSession } from "./compare-review-model";
import { productionReviewLocalScope, productionReviewLocalStorageKey, readProductionReviewLocalState,
  writeProductionReviewLocalState, type ProductionReviewLocalScope, type ProductionReviewLocalStorage } from "./production-review-local-state";

const auth = vi.hoisted(() => ({ userId: "account-A" as string | null }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => auth.userId }));
const NOW = "2026-10-30T00:00:00.000Z";
const a = productionReviewLocalScope("account-A", "project", "work", "episode");
const b = productionReviewLocalScope("account-B", "project", "work", "episode");
const session = addComparePoolItem(createEmptyCompareSession("episode"), poolItemFromExternal({
  assetId: "private-image", label: "미제출 시안.png", imageUrl: "data:image/png;base64,AAAA",
  addedBy: "role-A", addedAt: NOW, rightsNote: "A의 원본 권리 메모",
}));
const comments = addStudioCommentThread(createEmptyStudioCommentsDocument(), {
  id: "private-comment", anchor: createCompareImageAnchor("private-image", { x: 0.25, y: 0.5 }),
  author: { id: "role-A", displayName: "검수 역할" }, body: "A의 미제출 비교 댓글",
}, new Date(NOW));
const sessionRaw = serializeCompareSession(session), commentsRaw = serializeStudioCommentsDocument(comments);

function memoryStorage(): ProductionReviewLocalStorage & { readonly rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return { rows, getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value); } };
}
beforeEach(() => { auth.userId = "account-A"; });

describe("제작 검수 기기 원문의 계정·프로젝트·작품·회차 경계", () => {
  it("A의 이미지·댓글은 B가 읽거나 늦은 A effect로 수정하지 못하고 A 재로그인 뒤 그대로 복원된다", () => {
    const storage = memoryStorage();
    expect(writeProductionReviewLocalState(a, "compare-session", sessionRaw, storage)).toBe(true);
    expect(writeProductionReviewLocalState(a, "compare-comments", commentsRaw, storage)).toBe(true);
    const original = new Map(storage.rows);
    auth.userId = "account-B";
    for (const kind of ["compare-session", "compare-comments"] as const) {
      expect(readProductionReviewLocalState(b, kind, storage)).toBeNull();
      expect(readProductionReviewLocalState(a, kind, storage)).toBeNull();
      expect(writeProductionReviewLocalState(a, kind, "다른 본문", storage)).toBe(false);
    }
    expect(storage.rows).toEqual(original);
    auth.userId = "account-A";
    expect(readProductionReviewLocalState(a, "compare-session", storage)).toBe(sessionRaw);
    expect(parseCompareSession(readProductionReviewLocalState(a, "compare-session", storage), "episode")).toEqual(session);
    expect(normalizeStudioCommentsDocument(readProductionReviewLocalState(a, "compare-comments", storage))).toEqual(comments);
  });

  it.each(["projectId", "workId", "episodeId"] as const)("같은 계정도 %s가 다르면 원문을 합치지 않는다", (field) => {
    const storage = memoryStorage(), other: ProductionReviewLocalScope = { ...a, [field]: "other" };
    writeProductionReviewLocalState(a, "compare-session", sessionRaw, storage);
    expect(readProductionReviewLocalState(other, "compare-session", storage)).toBeNull();
    expect(writeProductionReviewLocalState(other, "compare-session", "별도 원문", storage)).toBe(true);
    expect(readProductionReviewLocalState(a, "compare-session", storage)).toBe(sessionRaw);
    expect(readProductionReviewLocalState(other, "compare-session", storage)).toBe("별도 원문");
  });

  it("잘못된 scope 봉투를 현재 키에 복사해도 복원하거나 덮어쓰지 않는다", () => {
    const storage = memoryStorage(); auth.userId = "account-B";
    writeProductionReviewLocalState(b, "compare-session", sessionRaw, storage);
    const foreign = storage.getItem(productionReviewLocalStorageKey(b, "compare-session"));
    if (foreign === null) throw new Error("B의 실제 저장 봉투가 없습니다.");
    storage.setItem(productionReviewLocalStorageKey(a, "compare-session"), foreign);
    auth.userId = "account-A";
    expect(readProductionReviewLocalState(a, "compare-session", storage)).toBeNull();
    expect(writeProductionReviewLocalState(a, "compare-session", sessionRaw, storage)).toBe(false);
    expect(storage.getItem(productionReviewLocalStorageKey(a, "compare-session"))).toBe(foreign);
  });

  it("봉투의 종류·버전이 다르거나 깨졌으면 원문을 보존하고 복원을 거절한다", () => {
    const storage = memoryStorage(), key = productionReviewLocalStorageKey(a, "compare-session");
    writeProductionReviewLocalState(a, "compare-session", sessionRaw, storage);
    const valid = storage.getItem(key);
    writeProductionReviewLocalState(a, "compare-comments", commentsRaw, storage);
    const wrongKind = storage.getItem(productionReviewLocalStorageKey(a, "compare-comments"));
    if (valid === null || wrongKind === null) throw new Error("실제 저장 봉투가 없습니다.");
    for (const raw of [wrongKind, valid.replace('"version":1', '"version":2'), "{broken"]) {
      storage.setItem(key, raw);
      expect(readProductionReviewLocalState(a, "compare-session", storage)).toBeNull();
      expect(writeProductionReviewLocalState(a, "compare-session", sessionRaw, storage)).toBe(false);
      expect(storage.getItem(key)).toBe(raw);
    }
  });

  it("소유자 없는 기존 이미지·댓글 키를 자동 채택하거나 삭제·덮어쓰지 않는다", () => {
    const storage = memoryStorage();
    storage.setItem("toonstudio.compare-review.episode", sessionRaw);
    storage.setItem("toonstudio.compare-comments.episode", commentsRaw);
    for (const owner of ["account-A", "account-B"]) {
      auth.userId = owner;
      const scope = productionReviewLocalScope(owner, "project", "work", "episode");
      expect(readProductionReviewLocalState(scope, "compare-session", storage)).toBeNull();
      expect(readProductionReviewLocalState(scope, "compare-comments", storage)).toBeNull();
      writeProductionReviewLocalState(scope, "compare-session", serializeCompareSession(createEmptyCompareSession("episode")), storage);
      writeProductionReviewLocalState(scope, "compare-comments", serializeStudioCommentsDocument(createEmptyStudioCommentsDocument()), storage);
    }
    expect(storage.getItem("toonstudio.compare-review.episode")).toBe(sessionRaw);
    expect(storage.getItem("toonstudio.compare-comments.episode")).toBe(commentsRaw);
  });

  it("익명·샘플 원문은 실제 계정 키와 분리되고 로그인으로 자동 승격되지 않는다", () => {
    const storage = memoryStorage(), guest = productionReviewLocalScope(null, "project", "work", "episode");
    const sample = productionReviewLocalScope(null, "project", "work", "episode", true);
    auth.userId = null;
    expect(writeProductionReviewLocalState(guest, "compare-session", sessionRaw, storage)).toBe(true);
    expect(writeProductionReviewLocalState(sample, "compare-session", "샘플 원문", storage)).toBe(true);
    auth.userId = "account-A";
    expect(readProductionReviewLocalState(a, "compare-session", storage)).toBeNull();
    expect(readProductionReviewLocalState(guest, "compare-session", storage)).toBeNull();
    expect(writeProductionReviewLocalState(guest, "compare-session", "계정 원문", storage)).toBe(false);
    expect(readProductionReviewLocalState(sample, "compare-session", storage)).toBeNull();
    auth.userId = null;
    expect(readProductionReviewLocalState(guest, "compare-session", storage)).toBe(sessionRaw);
    expect(readProductionReviewLocalState(sample, "compare-session", storage)).toBe("샘플 원문");
  });

  it("샘플에서도 로그인 UID를 우선하여 A와 B의 외부 이미지 원문을 분리한다", () => {
    const storage = memoryStorage(), sampleA = productionReviewLocalScope("account-A", "sample", "work", "episode", true);
    const sampleB = productionReviewLocalScope("account-B", "sample", "work", "episode", true);
    expect(sampleA.owner).toEqual({ kind: "account", userId: "account-A" });
    expect(writeProductionReviewLocalState(sampleA, "compare-session", sessionRaw, storage)).toBe(true);
    auth.userId = "account-B";
    expect(readProductionReviewLocalState(sampleB, "compare-session", storage)).toBeNull();
    expect(readProductionReviewLocalState(sampleA, "compare-session", storage)).toBeNull();
    auth.userId = "account-A";
    expect(readProductionReviewLocalState(sampleA, "compare-session", storage)).toBe(sessionRaw);
  });

  it("저장소를 사용할 수 없으면 기존 화면 계약대로 복원·기록 실패만 반환한다", () => {
    const storage: ProductionReviewLocalStorage = { getItem: () => { throw new Error("차단"); }, setItem: () => { throw new Error("차단"); } };
    expect(readProductionReviewLocalState(a, "compare-session", storage)).toBeNull();
    expect(writeProductionReviewLocalState(a, "compare-session", sessionRaw, storage)).toBe(false);
    expect(readProductionReviewLocalState(a, "compare-comments", null)).toBeNull();
    expect(writeProductionReviewLocalState(a, "compare-comments", commentsRaw, null)).toBe(false);
  });
});
