// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioScopedSavePendingRepository } from "./studio-scoped-save-pending-sqlite";
import { decodeStudioScopedSavePending, STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, studioScopedSavePendingKey,
  studioScopedSavePendingRepository, studioScopedSaveSnapshotDigest, type StudioScopedSavePending } from "./studio-scoped-save-pending";
import { studioScopedSaveMutationId } from "./studio-scoped-save-document";
import { useStudioScopedSavePendingStatus } from "./use-studio-scoped-save-pending";
import { reviewEditorFixture } from "../review-handoff/studio-review-editor-test-fixture";

const data = vi.hoisted(() => new Map<string, string>());
const database = vi.hoisted(() => ({
  kvGet: vi.fn(async (namespace: string, key: string) => data.get(`${namespace}:${key}`) ?? null),
  kvSet: vi.fn(async (namespace: string, key: string, raw: string) => { data.set(`${namespace}:${key}`, raw); }),
  kvDelete: vi.fn(async (namespace: string, key: string) => { data.delete(`${namespace}:${key}`); }),
}));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => database }));
const scope = { actorUserId: "actor", workId: "work" };
const rawKey = () => `${STUDIO_SCOPED_SAVE_PENDING_NAMESPACE}:${studioScopedSavePendingKey(scope)}`;
const repository = () => createStudioScopedSavePendingRepository({ acquireDatabase: async () => database });
async function entry(baseRevision = 7, policyVersion = 1): Promise<StudioScopedSavePending> {
  const body = { baseRevision, crdtServerSequence: "9007199254740993", doc: {
    opaqueExtension: { source: "원본 JSON 본문", nested: [{ flag: false, nullable: null }] },
    pagesList: [{ id: "page", canvasH: 1200, elements: [{ id: "own", type: "draw", points: [1, 2, 3, 4] }] }],
  }, writeContext: { version: 1 as const, policyVersion, grantIds: ["original-grant"], creations: [], restorations: [] } };
  const intentScope = { ownerId: "actor", documentKey: "device-draft" };
  return { version: 1, ...scope, body: { ...body, mutationId: await studioScopedSaveMutationId(scope.actorUserId, scope.workId, body) },
    snapshotDigest: "a".repeat(64), hasExcludedDraft: false, intentScope,
    intent: { version: 1, id: "intent-original", scope: intentScope, queuedAt: 1_700_000_000_000, serverRevision: 7 } };
}
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); data.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("제한 저장 원문의 기존 SQLite 영속 경계", () => {
  it("repository 재생성/reload 뒤에도 opaque 원문·원래 intent·bigint fence를 그대로 복원한다", async () => {
    const original = await entry(); expect(await repository().remember(scope, original)).toEqual(original);
    expect(await repository().load(scope)).toEqual(original);
    expect((await repository().load(scope))?.body.crdtServerSequence).toBe("9007199254740993");
    expect(database.kvSet).toHaveBeenCalledWith(STUDIO_SCOPED_SAVE_PENDING_NAMESPACE, studioScopedSavePendingKey(scope), JSON.stringify(original));
  });
  it("새 base·policy·UUID의 후보가 기존 미확인 원문을 대체하지 않는다", async () => {
    const original = await entry(), future = await entry(8, 2);
    await repository().remember(scope, original);
    expect(await repository().remember(scope, future)).toEqual(original);
    expect(await repository().load(scope)).toEqual(original); expect(database.kvSet).toHaveBeenCalledTimes(1);
  });
  it("여러 repository의 동시 remember도 최초 원문 하나를 보존한다", async () => {
    const original = await entry(), future = await entry(8, 2);
    const results = await Promise.all([repository().remember(scope, original), repository().remember(scope, future)]);
    expect(results).toEqual([original, original]); expect(await repository().load(scope)).toEqual(original);
  });
  it("다른 actor/work는 원문을 읽거나 ACK 삭제하지 못한다", async () => {
    const original = await entry(); await repository().remember(scope, original);
    for (const other of [{ ...scope, actorUserId: "other" }, { ...scope, workId: "other-work" }]) {
      expect(await repository().load(other)).toBeNull();
      await expect(decodeStudioScopedSavePending(JSON.stringify(original), other)).rejects.toThrow("계정·작품");
      expect(await repository().clear(other, original.body.mutationId)).toBe(true);
    }
    expect(await repository().load(scope)).toEqual(original);
  });
  it("본문·scope·checksum 손상은 행을 보존하고 fallback 없이 실패한다", async () => {
    const original = await entry(), corrupt = { ...original, body: { ...original.body, baseRevision: 99 } };
    data.set(rawKey(), JSON.stringify(corrupt));
    await expect(repository().load(scope)).rejects.toThrow("이전 저장 원문");
    await expect(repository().clear(scope, original.body.mutationId)).rejects.toThrow("이전 저장 원문");
    expect(data.get(rawKey())).toBe(JSON.stringify(corrupt)); expect(database.kvDelete).not.toHaveBeenCalled();
  });
  it("SQLite write/readback 불일치를 영속 성공으로 반환하지 않는다", async () => {
    const repo = createStudioScopedSavePendingRepository({ acquireDatabase: async () => ({ ...database, kvSet: async () => undefined }) });
    await expect(repo.remember(scope, await entry())).rejects.toThrow("다시 읽지 못했습니다");
    expect(await repository().load(scope)).toBeNull();
  });
  it("오래된 ACK는 나중에 저장된 다른 원문을 삭제하지 않는다", async () => {
    const original = await entry(), future = await entry(8, 2), repo = repository();
    await repo.remember(scope, original); expect(await repo.clear(scope, original.body.mutationId)).toBe(true);
    await repo.remember(scope, future); expect(await repo.clear(scope, original.body.mutationId)).toBe(false);
    expect(await repo.load(scope)).toEqual(future);
  });
  it("보기 페이지·저장 시각은 snapshot SHA를 바꾸지 않지만 원고·공용·페이지·작품 정보는 바꾼다", async () => {
    const { snapshot } = reviewEditorFixture(() => "a".repeat(64)), digest = await studioScopedSaveSnapshotDigest(snapshot);
    expect(await studioScopedSaveSnapshotDigest({ ...snapshot, savedAt: "2026-10-30T06:00:00.000Z", currentPageId: "p2" })).toBe(digest);
    for (const changed of [{ ...snapshot, title: "다른 작품 초안" }, { ...snapshot, master: { elements: [] } },
      { ...snapshot, panelGutter: snapshot.panelGutter + 1 },
      { ...snapshot, pagesList: snapshot.pagesList.map((page) => ({ ...page, canvasH: page.canvasH + 1 })) }]) {
      expect(await studioScopedSaveSnapshotDigest(changed)).not.toBe(digest);
    }
  });
  it("확인 UI 신호는 readback된 같은 actor/work만 표시하고 scope 전환 시 즉시 숨긴다", async () => {
    const hook = renderHook(({ currentScope }) => useStudioScopedSavePendingStatus(currentScope), { initialProps: { currentScope: scope } });
    await waitFor(() => expect(hook.result.current.loading).toBe(false)); expect(hook.result.current.pending).toBe(false);
    await act(async () => { await studioScopedSavePendingRepository.remember(scope, await entry()); });
    expect(hook.result.current.pending).toBe(true);
    hook.rerender({ currentScope: { ...scope, actorUserId: "other" } });
    expect(hook.result.current.pending).toBe(false);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.pending).toBe(false); expect(await repository().load(scope)).not.toBeNull();
  });
});
