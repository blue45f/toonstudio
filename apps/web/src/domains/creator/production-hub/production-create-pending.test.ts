// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionCreatePendingStore } from "./production-create-pending-store";
import { decodeProductionCreatePending, prepareProductionCreatePending, productionCreatePendingKey,
  PRODUCTION_CREATE_PENDING_NAMESPACE } from "./production-create-pending";

const scope = { actorUserId: "actor", workId: "work" }, rows = new Map<string, string>();
const rowKey = (namespace: string, key: string) => namespace + ":" + key;
const database = {
  kvGet: vi.fn(async (namespace: string, key: string) => rows.get(rowKey(namespace, key)) ?? null),
  kvSet: vi.fn(async (namespace: string, key: string, raw: string) => { rows.set(rowKey(namespace, key), raw); }),
  kvDelete: vi.fn(async (namespace: string, key: string) => { rows.delete(rowKey(namespace, key)); }),
};
const withLock = async <T>(_key: string, operation: () => Promise<T>) => operation();
const store = () => createProductionCreatePendingStore({ acquireDatabase: async () => database, withLock });
const pending = () => prepareProductionCreatePending(scope, { workId: scope.workId, title: "실제 저장 작품",
  ownerDisplayName: "소유자", collaborationModel: "studio-production" });
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); rows.clear(); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllGlobals());

describe("실제 Production 생성 원문의 SQLite 보관", () => {
  it("reload 뒤 최초 project/party/body/mutation ID를 그대로 읽는다", async () => {
    const original = await pending();
    expect(await store().remember(scope, original)).toEqual(original);
    expect(await store().load(scope)).toEqual(original);
    expect(database.kvSet).toHaveBeenCalledWith(PRODUCTION_CREATE_PENDING_NAMESPACE, productionCreatePendingKey(scope), JSON.stringify(original));
  });
  it("다른 제목·모델·새 UUID의 후보가 기존 원문을 덮지 않는다", async () => {
    const original = await pending(), replacement = await prepareProductionCreatePending(scope, {
      workId: "work", title: "다른 제목", collaborationModel: "solo", ownerDisplayName: "다른 표시" });
    await store().remember(scope, original);
    expect(await store().remember(scope, replacement)).toEqual(original);
    expect(database.kvSet).toHaveBeenCalledTimes(1);
  });
  it("다른 actor/work는 원문을 읽거나 잘못된 ACK로 삭제하지 못한다", async () => {
    const original = await pending(); await store().remember(scope, original);
    expect(await store().load({ ...scope, actorUserId: "other" })).toBeNull();
    await expect(decodeProductionCreatePending(JSON.stringify(original), { ...scope, workId: "other" })).rejects.toThrow("계정·작품");
    expect(await store().clear(scope, crypto.randomUUID(), () => true)).toBe(false);
    expect(await store().clear(scope, original.clientMutationId, () => false)).toBe(false);
    expect(await store().load(scope)).toEqual(original);
  });
  it("본문 손상은 삭제·새 원문 대체 없이 전송 불가로 남긴다", async () => {
    const original = await pending(), key = rowKey(PRODUCTION_CREATE_PENDING_NAMESPACE, productionCreatePendingKey(scope));
    const damaged = JSON.stringify({ ...original, input: { ...original.input, title: "손상" } }); rows.set(key, damaged);
    await expect(store().load(scope)).rejects.toThrow("이전 생성 원문");
    await expect(store().remember(scope, original)).rejects.toThrow("이전 생성 원문");
    await expect(store().clear(scope, original.clientMutationId, () => true)).rejects.toThrow("이전 생성 원문");
    expect(rows.get(key)).toBe(damaged); expect(database.kvDelete).not.toHaveBeenCalled();
  });
  it("write/readback 불일치는 영속 성공으로 반환하지 않는다", async () => {
    const repository = createProductionCreatePendingStore({ acquireDatabase: async () => ({
      ...database, kvSet: async () => undefined }), withLock });
    await expect(repository.remember(scope, await pending())).rejects.toThrow("다시 읽지 못했습니다");
  });
  it("SQLite와 탭 간 잠금 실패는 메모리 fallback으로 저장하지 않는다", async () => {
    const unavailable = createProductionCreatePendingStore({ acquireDatabase: async () => { throw new Error("SQLite unavailable"); }, withLock });
    await expect(unavailable.remember(scope, await pending())).rejects.toThrow("SQLite unavailable");
    const noLock = createProductionCreatePendingStore({ acquireDatabase: async () => database,
      withLock: async () => { throw new Error("lock unavailable"); } });
    await expect(noLock.load(scope)).rejects.toThrow("lock unavailable");
    expect(database.kvSet).not.toHaveBeenCalled();
  });
});
