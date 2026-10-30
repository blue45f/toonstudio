import { describe, expect, it, vi } from "vitest";
import { createReviewDraftRepository, draftNoteInputSchema, parseReviewDraftShelf, reviewDraftScopeKey, REVIEW_PRIVATE_DRAFT_MAX_BYTES, type ReviewDraftScope } from "./studio-review-draft-shelf";
import { publishReviewDrafts } from "./studio-review-draft-publish";
import type { StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";
import type { StudioReviewComment, StudioReviewCommentCreateInput } from "../project-graph/studio-project-graph-contract";

const scope: ReviewDraftScope = { actorId: "artist-a", subject: { schemaVersion: 1, workId: "work", projectId: "graph", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) } };
const input = (id = "draft-a") => draftNoteInputSchema.parse({ id, body: `본문 ${id}`, severity: "note", anchor: { kind: "artifact", artifactId: "artifact", revisionId: "revision", scope: { projectId: "graph" } } });
function fixture() {
  const rows = new Map<string, string>(), tails = new Map<string, Promise<unknown>>();
  const store = { get: vi.fn(async (key: string) => rows.get(key) ?? null), set: vi.fn(async (key: string, value: string) => { rows.set(key, value); }), delete: vi.fn(async (key: string) => { rows.delete(key); }) };
  const lock = <T,>(key: string, action: () => Promise<T>): Promise<T> => { const result = (tails.get(key) ?? Promise.resolve()).then(action); tails.set(key, result.catch(() => undefined)); return result; };
  const repository = createReviewDraftRepository(store, lock), comments: StudioReviewComment[] = [];
  const verify = vi.fn(async (): Promise<StudioVirtualSpaceReviewVerification> => ({ ok: true, subject: scope.subject,
    verifiedAt: Date.now(), expiresAt: Date.now() + 15_000, href: "/review",
    project: { access: { view: true, comment: true } }, revision: { id: "revision", rootGraphHash: "a".repeat(64) },
    review: { status: "open", comments: [...comments] },
  } as unknown as StudioVirtualSpaceReviewVerification));
  const create = vi.fn(async (_reviewId: string, raw: StudioReviewCommentCreateInput) => {
    const note = draftNoteInputSchema.parse(raw);
    comments.push({ ...note, reviewId: "review", authorUserId: "artist-a", dueAt: note.dueAt ?? null, status: "open", resolutionRevisionId: null, resolvedBy: null, createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z" });
    return { id: note.id, reviewId: "review", status: "open" as const, anchor: note.anchor, createdAt: "2026-09-21T00:00:00Z",
      ...(note.strokes?.length ? { strokes: note.strokes } : {}) };
  });
  return { repository, rows, store, comments, dependencies: { verify, create } };
}
describe("private draft storage", () => {
  it("persists only scoped draft input and deduplicates repeated content", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    await f.repository.add(scope, { ...input(), id: "different-id" }, () => true);
    expect(await f.repository.list(scope)).toHaveLength(1);
    expect(await f.repository.list({ ...scope, actorId: "artist-b" })).toEqual([]);
    expect(await f.repository.list({ ...scope, subject: { ...scope.subject, reviewId: "other-review" } })).toEqual([]);
    expect(f.rows.get(reviewDraftScopeKey(scope))).not.toContain("url");
  });
  it("edits only unpublished text, keeping original identity and anchor", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const edited = await f.repository.reviseBody(scope, "draft-a", "수정한 초안", () => true);
    expect(edited[0]?.input).toEqual({ ...input(), body: "수정한 초안" });
    await f.repository.markAttempt(scope, edited[0]!.input, () => true);
    await expect(f.repository.reviseBody(scope, "draft-a", "변경", () => true)).rejects.toThrow();
    await expect(f.repository.remove(scope, "draft-a", () => true)).rejects.toThrow();
  });
  it("rejects scope mismatch, unreadable storage and invalidating operations without overwriting", async () => {
    const f = fixture(), key = reviewDraftScopeKey(scope);
    await expect(f.repository.add(scope, { ...input(), anchor: { ...input().anchor, revisionId: "other" } }, () => true)).rejects.toThrow();
    expect(f.store.set).not.toHaveBeenCalled();
    f.rows.set(key, "unreadable"); await expect(f.repository.add(scope, input(), () => true)).rejects.toThrow();
    expect(f.rows.get(key)).toBe("unreadable"); f.rows.delete(key);
    await expect(f.repository.add(scope, input(), () => false)).rejects.toThrow();
    expect(f.store.set).not.toHaveBeenCalled();
  });
  it("keeps existing drafts when capacity or write acknowledgement fails", async () => {
    const f = fixture(); for (let i = 0; i < 20; i++) await f.repository.add(scope, input(`draft-${i}`), () => true);
    const before = f.rows.get(reviewDraftScopeKey(scope));
    await expect(f.repository.add(scope, input("overflow"), () => true)).rejects.toThrow();
    expect(f.rows.get(reviewDraftScopeKey(scope))).toBe(before);
    f.store.set.mockRejectedValueOnce(new Error("storage failure"));
    await expect(f.repository.reviseBody(scope, "draft-0", "new", () => true)).rejects.toThrow();
    expect(f.rows.get(reviewDraftScopeKey(scope))).toBe(before);
    expect(() => parseReviewDraftShelf("x".repeat(REVIEW_PRIVATE_DRAFT_MAX_BYTES + 1), scope)).toThrow("Draft capacity exceeded");
  });
});

const penStroke = { id: "pen-one", points: [{ x: 10, y: 20 }, { x: 40, y: 60 }], color: "#e5484d", width: 4 };
const penInput = () => ({ ...draftNoteInputSchema.parse({ ...input(),
  anchor: { ...input().anchor, kind: "region", x: 10, y: 20, width: 30, height: 40,
    source: { version: 1, sourceServerRevision: 3, sourceContentDigest: scope.subject.rootGraphHash, pageOrdinal: 0, pageId: "page-one" } },
  strokes: [penStroke],
}), strokes: [penStroke] });

describe("펜 첨삭 초안의 영속성과 복구", () => {
  it("50획과 획당 500점의 유효한 첨삭을 자르지 않고 초안에 보관한다", async () => {
    const f = fixture(), pen = penInput();
    const full = { ...pen, body: "획".repeat(20_000), strokes: Array.from({ length: 50 }, (_, stroke) => ({ ...penStroke, id: `pen-${stroke}`,
      points: Array.from({ length: 500 }, (_, point) => ({ x: 10 + point * .123456789, y: 20 + point * .1987654321 })) })) };
    await f.repository.add(scope, full, () => true);
    const raw = f.rows.get(reviewDraftScopeKey(scope)); if (!raw) throw new Error("실제 저장된 초안이 필요합니다.");
    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(1_000_000);
    expect((await f.repository.list(scope))[0]?.input.strokes).toEqual(full.strokes);
  });
  it("초안 보관과 새 repository 조회에서 모든 펜 획을 유지한다", async () => {
    const f = fixture(), pen = penInput();
    await f.repository.add(scope, pen, () => true);
    const raw = f.rows.get(reviewDraftScopeKey(scope));
    expect(parseReviewDraftShelf(raw ?? null, scope)[0]?.input).toEqual(pen);
    const changed = { ...pen, id: "other-pen", strokes: [{ ...penStroke, width: 5 }] };
    await f.repository.add(scope, changed, () => true);
    expect(await f.repository.list(scope)).toHaveLength(2);
  });
  it("저장 응답이 사라져도 같은 ID와 서버의 같은 획으로만 초안을 정리한다", async () => {
    const f = fixture(), pen = penInput(); await f.repository.add(scope, pen, () => true);
    const create = f.dependencies.create.getMockImplementation(); if (!create) throw new Error("fixture create");
    f.dependencies.create.mockImplementationOnce(async (reviewId, note) => { await create(reviewId, note); throw new Error("response lost"); });
    expect(await publishReviewDrafts(scope, [pen], f.repository, () => true, f.dependencies)).toEqual({ confirmed: [], stopped: pen.id });
    expect((await f.repository.list(scope))[0]?.input.strokes).toEqual(pen.strokes);
    expect(await publishReviewDrafts(scope, [pen], f.repository, () => true, f.dependencies)).toEqual({ confirmed: [pen.id], stopped: null });
    expect(f.dependencies.create).toHaveBeenCalledTimes(1); expect(f.comments).toHaveLength(1);
  });
  it.each(["missing", "changed"])("서버의 획이 %s이면 초안을 폐기하거나 새 쓰기를 보내지 않는다", async (mode) => {
    const f = fixture(), pen = penInput(); await f.repository.add(scope, pen, () => true);
    await f.dependencies.create("review", pen);
    const stored = f.comments[0]; if (!stored) throw new Error("fixture comment");
    f.comments[0] = { ...stored, strokes: mode === "missing" ? [] : [{ ...penStroke, width: 5 }] };
    f.dependencies.create.mockClear();
    expect(await publishReviewDrafts(scope, [pen], f.repository, () => true, f.dependencies)).toEqual({ confirmed: [], stopped: pen.id });
    expect((await f.repository.list(scope))[0]?.input).toEqual(pen);
    expect(f.dependencies.create).not.toHaveBeenCalled();
  });
});
describe("explicit per-note publication", () => {
  it("persists attempt identities before sending and removes only server-confirmed notes", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const create = f.dependencies.create.getMockImplementation()!;
    f.dependencies.create.mockImplementation(async (reviewId, note) => {
      expect((await f.repository.list(scope))[0]?.state).toBe("attempted");
      return create(reviewId, note);
    });
    expect(await publishReviewDrafts(scope, ["draft-a"].map((id) => input(id)), f.repository, () => true, f.dependencies)).toEqual({ confirmed: ["draft-a"], stopped: null });
    expect(await f.repository.list(scope)).toEqual([]); expect(f.comments).toHaveLength(1);
  });
  it("reconciles a lost response using the same ID without sending a duplicate", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const create = f.dependencies.create.getMockImplementation()!;
    f.dependencies.create.mockImplementationOnce(async (reviewId, note) => { await create(reviewId, note); throw new Error("response lost"); });
    expect(await publishReviewDrafts(scope, ["draft-a"].map((id) => input(id)), f.repository, () => true, f.dependencies)).toEqual({ confirmed: [], stopped: "draft-a" });
    expect((await f.repository.list(scope))[0]?.state).toBe("attempted");
    expect(await publishReviewDrafts(scope, ["draft-a"].map((id) => input(id)), f.repository, () => true, f.dependencies)).toEqual({ confirmed: ["draft-a"], stopped: null });
    expect(f.dependencies.create).toHaveBeenCalledTimes(1); expect(await f.repository.list(scope)).toEqual([]);
  });
  it("reports partial publication and preserves the remaining original IDs", async () => {
    const f = fixture(); for (const id of ["draft-a", "draft-b", "draft-c"]) await f.repository.add(scope, input(id), () => true);
    const create = f.dependencies.create.getMockImplementation()!;
    f.dependencies.create.mockImplementation(async (reviewId, note) => { if (note.id === "draft-b") throw new Error("unavailable"); return create(reviewId, note); });
    expect(await publishReviewDrafts(scope, ["draft-a", "draft-b", "draft-c"].map((id) => input(id)), f.repository, () => true, f.dependencies)).toEqual({ confirmed: ["draft-a"], stopped: "draft-b" });
    expect((await f.repository.list(scope)).map((entry) => [entry.input.id, entry.state])).toEqual([["draft-b", "attempted"], ["draft-c", "draft"]]);
    expect(f.dependencies.create).toHaveBeenCalledTimes(2);
  });
  it.each(["denied", "expired", "different-source", "closed"])("does not send for %s verification", async (mode) => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const original = await f.dependencies.verify(); if (!original.ok) throw new Error("fixture");
    f.dependencies.verify.mockResolvedValue(mode === "denied" ? { ok: false, reason: "access-denied" }
      : mode === "expired" ? { ...original, expiresAt: 0 }
        : mode === "different-source" ? { ...original, revision: { ...original.revision, rootGraphHash: "b".repeat(64) } }
          : { ...original, review: { ...original.review, status: "approved" } });
    const outcome = await publishReviewDrafts(scope, ["draft-a"].map((id) => input(id)), f.repository, () => true, f.dependencies);
    expect(outcome.confirmed).toEqual([]); expect(f.dependencies.create).not.toHaveBeenCalled();
    expect((await f.repository.list(scope))[0]?.state).toBe("draft");
  });
  it("does not send when durable attempt storage fails", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    f.store.set.mockRejectedValueOnce(new Error("quota"));
    expect((await publishReviewDrafts(scope, ["draft-a"].map((id) => input(id)), f.repository, () => true, f.dependencies)).confirmed).toEqual([]);
    expect(f.dependencies.create).not.toHaveBeenCalled();
  });
  it("does not accept another actor's matching note as this draft's receipt", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    await f.dependencies.create("review", input()); f.comments[0] = { ...f.comments[0]!, authorUserId: "someone-else" };
    f.dependencies.create.mockClear();
    const outcome = await publishReviewDrafts(scope, ["draft-a"].map((id) => input(id)), f.repository, () => true, f.dependencies);
    expect(outcome.confirmed).toEqual([]); expect(await f.repository.list(scope)).toHaveLength(1);
    expect(f.dependencies.create).not.toHaveBeenCalled();
  });
  it("stops after a context change and rejects duplicate batch selection", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    let active = true; const original = await f.dependencies.verify();
    f.dependencies.verify.mockImplementation(async () => { active = false; return original; });
    expect(await publishReviewDrafts(scope, ["draft-a"].map((id) => input(id)), f.repository, () => active, f.dependencies)).toEqual({ confirmed: [], stopped: "cancelled" });
    expect(f.dependencies.create).not.toHaveBeenCalled();
    await expect(publishReviewDrafts(scope, ["draft-a", "draft-a"].map((id) => input(id)), f.repository, () => true, f.dependencies)).rejects.toThrow();
  });
});

describe("publication consent under cross-tab changes", () => {
  it("rejects a draft changed after the user selected its previous content", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    await f.repository.reviseBody(scope, "draft-a", "Changed in another tab", () => true);
    const outcome = await publishReviewDrafts(scope, [input()], f.repository, () => true, f.dependencies);
    expect(outcome).toEqual({ confirmed: [], stopped: "draft-a" });
    expect(f.dependencies.create).not.toHaveBeenCalled();
    expect((await f.repository.list(scope))[0]?.input.body).toBe("Changed in another tab");
  });
  it("rechecks consent in the storage lock after a slow access verification", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const verified = await f.dependencies.verify();
    f.dependencies.verify.mockImplementationOnce(async () => {
      await f.repository.reviseBody(scope, "draft-a", "Edited while verifying", () => true);
      return verified;
    });
    const outcome = await publishReviewDrafts(scope, [input()], f.repository, () => true, f.dependencies);
    expect(outcome.confirmed).toEqual([]); expect(f.dependencies.create).not.toHaveBeenCalled();
    expect((await f.repository.list(scope))[0]?.state).toBe("draft");
  });
  it("does not remove newer local text while reconciling an older server receipt", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    await f.dependencies.create("review", input()); f.dependencies.create.mockClear();
    const verified = await f.dependencies.verify();
    f.dependencies.verify.mockImplementationOnce(async () => {
      await f.repository.reviseBody(scope, "draft-a", "Keep this newer local edit", () => true);
      return verified;
    });
    const result = await publishReviewDrafts(scope, [input()], f.repository, () => true, f.dependencies);
    expect(result.confirmed).toEqual([]); expect(f.dependencies.create).not.toHaveBeenCalled();
    expect((await f.repository.list(scope))[0]?.input.body).toBe("Keep this newer local edit");
  });
  it("snapshots the confirmed input before waiting for the publication lock", async () => {
    const f = fixture(); const selected = input(); await f.repository.add(scope, selected, () => true);
    const result = publishReviewDrafts(scope, [selected], f.repository, () => true, f.dependencies);
    selected.body = "Mutation after confirmation";
    expect(await result).toEqual({ confirmed: ["draft-a"], stopped: null });
    expect(f.dependencies.create.mock.calls[0]?.[1].body).toBe(input().body);
  });
});
