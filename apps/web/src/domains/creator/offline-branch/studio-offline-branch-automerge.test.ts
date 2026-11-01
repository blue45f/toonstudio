import * as Automerge from "@automerge/automerge/slim";
import { beforeAll, describe, expect, it } from "vitest";

import {
  StudioOfflineBranchAutomergeEngine,
  initializeStudioOfflineBranchAutomerge,
} from "./studio-offline-branch-automerge";
import {
  STUDIO_OFFLINE_BRANCH_DOCUMENT_VERSION,
  STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION,
  studioOfflineBranchPendingOperations,
  studioOfflineBranchRetainedPayloadOperations,
} from "./studio-offline-branch-contract";
import {
  decodeStudioOfflineBranchPayload,
  encodeStudioOfflineBranchPayload,
} from "./studio-offline-branch-payload";

import type {
  StudioOfflineBranchOperation,
  StudioOfflineBranchReceipt,
  StudioOfflineBranchDocument,
  StudioOfflineBranchResolution,
} from "./studio-offline-branch-contract";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const FP_A = `fp1:${"1".repeat(16)}`;
const FP_B = `fp1:${"2".repeat(16)}`;

function operation(input: {
  id: string;
  actorId: string;
  targetId: string;
  createdAt: number;
  hash?: string;
  fingerprint?: string;
  dedupeKey?: string;
}): StudioOfflineBranchOperation {
  return {
    version: 1,
    id: input.id,
    dedupeKey: input.dedupeKey ?? `dedupe-${input.targetId}`,
    targetType: "stroke",
    action: "upsert",
    targetId: input.targetId,
    pageId: "page-1",
    layerId: "page-root",
    beforeId: null,
    previousBeforeId: null,
    expectedFingerprint: null,
    resultFingerprint: input.fingerprint ?? FP_A,
    payloadHash: input.hash ?? HASH_A,
    payloadBytes: 128,
    previousPayloadHash: null,
    previousPayloadBytes: 0,
    actorId: input.actorId,
    createdAt: input.createdAt,
  };
}

function engine(id: string, actorId: string, createdAt: number) {
  return StudioOfflineBranchAutomergeEngine.create({
    id,
    workId: "work-1",
    scope: "user-1",
    actorId,
    createdAt,
  });
}

function conflictedEngine() {
  const branch = engine("branch-conflict", "actor-1", 1);
  const original = operation({ id: "op-conflict", actorId: "actor-1", targetId: "stroke-1", createdAt: 2 });
  branch.append([original], 2);
  branch.recordConflicts([{
    operationId: original.id, code: "target-exists", message: "정본의 같은 대상이 변경됐습니다.", detectedAt: 3,
  }], 3);
  return { branch, original };
}

function decision(action: StudioOfflineBranchResolution["action"]): StudioOfflineBranchResolution {
  return {
    operationId: "op-conflict", action,
    replacementOperationId: action === "reapply-local" ? "op-replacement" : null,
    actorId: "actor-1", resolvedAt: 5,
  };
}

function replacement(original: StudioOfflineBranchOperation): StudioOfflineBranchOperation {
  return {
    ...original, id: "op-replacement", dedupeKey: "replacement-semantic-key", createdAt: 4,
    expectedFingerprint: FP_B, previousPayloadHash: HASH_B, previousPayloadBytes: 64,
  };
}

describe("StudioOfflineBranchAutomergeEngine", () => {
  beforeAll(async () => {
    await initializeStudioOfflineBranchAutomerge();
  });

  it("initializes the worker-safe Automerge WASM entrypoint", () => {
    expect(Automerge.isWasmInitialized()).toBe(true);
  });

  it("imports independently-created journals without root-map data loss", () => {
    const left = engine("branch-left", "actor-left", 1);
    const right = engine("branch-right", "actor-right", 1);
    left.append([
      operation({ id: "op-left", actorId: "actor-left", targetId: "stroke-left", createdAt: 2 }),
    ], 2);
    right.append([
      operation({
        id: "op-right",
        actorId: "actor-right",
        targetId: "stroke-right",
        createdAt: 2,
        hash: HASH_B,
        fingerprint: FP_B,
      }),
    ], 2);

    expect(left.importDocument(right.save(), 3)).toEqual({
      changed: true,
      replyNeeded: true,
    });
    expect(left.snapshot().operations.map(({ id }) => id)).toEqual(["op-left", "op-right"]);

    expect(right.importDocument(left.save(), 4)).toEqual({
      changed: true,
      replyNeeded: false,
    });
    expect(right.snapshot().operations.map(({ id }) => id)).toEqual(["op-left", "op-right"]);
    left.close();
    right.close();
  });

  it("propagates monotonic server receipts across semantic imports", () => {
    const left = engine("branch-left", "actor-left", 10);
    const right = engine("branch-right", "actor-right", 10);
    const candidate = operation({
      id: "op-server",
      actorId: "actor-left",
      targetId: "stroke-server",
      createdAt: 11,
    });
    left.append([candidate], 11);
    right.importDocument(left.save(), 12);
    const receipt: StudioOfflineBranchReceipt = {
      operationId: candidate.id,
      state: "server",
      yjsUpdateId: "update-server",
      serverSequence: "42",
      appliedAt: 13,
    };
    right.recordReceipts([receipt], 13);

    expect(left.importDocument(right.save(), 14)).toEqual({
      changed: true,
      replyNeeded: false,
    });
    expect(left.snapshot().receipts[candidate.id]).toEqual(receipt);
    expect(left.snapshot().branch.state).toBe("merged");
    left.close();
    right.close();
  });

  it("allows a persisted journal to reopen with a new local writer identity", () => {
    const first = engine("branch", "actor-old", 20);
    first.append([
      operation({ id: "op-old", actorId: "actor-old", targetId: "stroke-old", createdAt: 21 }),
    ], 21);
    const bytes = first.save();
    first.close();

    const reopened = StudioOfflineBranchAutomergeEngine.load(bytes, {
      workId: "work-1",
      scope: "user-1",
      actorId: "actor-new",
    });
    expect(reopened.append([
      operation({
        id: "op-new",
        actorId: "actor-new",
        targetId: "stroke-new",
        createdAt: 22,
        hash: HASH_B,
        fingerprint: FP_B,
      }),
    ], 22)).toBe(1);
    expect(reopened.snapshot().operations).toHaveLength(2);
    reopened.close();
  });

  it("rejects a semantic dedupe collision instead of selecting a winner", () => {
    const left = engine("branch-left", "actor-left", 30);
    const right = engine("branch-right", "actor-right", 30);
    left.append([
      operation({
        id: "op-left",
        actorId: "actor-left",
        targetId: "stroke-left",
        createdAt: 31,
        dedupeKey: "same-semantic-key",
      }),
    ], 31);
    right.append([
      operation({
        id: "op-right",
        actorId: "actor-right",
        targetId: "stroke-right",
        createdAt: 31,
        hash: HASH_B,
        fingerprint: FP_B,
        dedupeKey: "same-semantic-key",
      }),
    ], 31);

    expect(() => left.importDocument(right.save(), 32)).toThrow(/dedupe collision/u);
    left.close();
    right.close();
  });

  it("해결 기록 없는 기존 schema 1 문서를 작업 손실 없이 연다", () => {
    const { branch, original } = conflictedEngine();
    const document = Automerge.load<StudioOfflineBranchDocument>(branch.save());
    const legacy = Automerge.change(document, (draft) => {
      draft.schemaVersion = 1;
      delete draft.resolutions;
    });
    expect(legacy.schemaVersion).toBe(1);
    const reopened = StudioOfflineBranchAutomergeEngine.load(Automerge.save(legacy), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    expect(reopened.snapshot().operations).toEqual([original]);
    expect(reopened.snapshot().resolutions).toEqual({});
    expect(reopened.snapshot().conflicts[original.id]?.code).toBe("target-exists");
    const saved = Automerge.load<StudioOfflineBranchDocument>(reopened.save());
    expect(saved.schemaVersion).toBe(STUDIO_OFFLINE_BRANCH_DOCUMENT_VERSION);
    expect(saved.schemaVersion).not.toBe(STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION);
    expect(saved.operations[original.id]?.version).toBe(1);
    expect(saved.operations[original.id]?.payloadHash).toBe(original.payloadHash);
    const again = StudioOfflineBranchAutomergeEngine.load(reopened.save(), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    expect(again.snapshot().operations).toEqual([original]);
    const payload = encodeStudioOfflineBranchPayload("layer-group", {
      id: "group-1", pageId: "page-1",
      payload: { version: 1, props: { name: "선화", hidden: false, locked: false } },
    });
    expect(decodeStudioOfflineBranchPayload(payload, "layer-group").version).toBe(1);
    again.close(); reopened.close(); branch.close(); Automerge.free(legacy); Automerge.free(saved);
  });

  it("기존 schema 1 피어 문서를 가져온 뒤 문서 버전 2로만 저장한다", () => {
    const { branch: peer, original } = conflictedEngine();
    const document = Automerge.load<StudioOfflineBranchDocument>(peer.save());
    const legacy = Automerge.change(document, (draft) => {
      draft.schemaVersion = 1;
      delete draft.resolutions;
    });
    const local = engine("local-with-v2-document", "actor-1", 1);
    local.importDocument(Automerge.save(legacy), 4);
    expect(local.snapshot().operations).toEqual([original]);
    const saved = Automerge.load<StudioOfflineBranchDocument>(local.save());
    expect(saved.schemaVersion).toBe(2);
    expect(saved.operations[original.id]?.version).toBe(1);
    expect(saved.resolutions).toEqual({});
    Automerge.free(saved); Automerge.free(legacy); local.close(); peer.close();
  });

  it("새 문서 버전에서 처리 기록을 누락한 bytes는 기존 문서로 오인하지 않는다", () => {
    const { branch } = conflictedEngine();
    const document = Automerge.load<StudioOfflineBranchDocument>(branch.save());
    const incomplete = Automerge.change(document, (draft) => { delete draft.resolutions; });
    expect(incomplete.schemaVersion).toBe(2);
    expect(() => StudioOfflineBranchAutomergeEngine.load(Automerge.save(incomplete), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    })).toThrow(/처리 기록이 없습니다/u);
    Automerge.free(incomplete); branch.close();
  });

  it("정본 유지 선택을 재열기 뒤에도 보관하며 서버 receipt를 만들지 않는다", () => {
    const { branch, original } = conflictedEngine();
    branch.resolveConflict(decision("keep-canonical"), null, 5);
    const reopened = StudioOfflineBranchAutomergeEngine.load(branch.save(), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    expect(reopened.snapshot().operations).toEqual([original]);
    expect(reopened.snapshot().receipts).toEqual({});
    expect(reopened.snapshot().conflicts).toEqual({});
    expect(studioOfflineBranchPendingOperations(reopened.snapshot())).toEqual([]);
    expect(studioOfflineBranchRetainedPayloadOperations(reopened.snapshot())).toEqual([original]);
    reopened.close(); branch.close();
  });

  it("재적용 작업과 원래 작업의 처리 기록을 원자적으로 보관한다", () => {
    const { branch, original } = conflictedEngine();
    const retry = replacement(original);
    branch.resolveConflict(decision("reapply-local"), retry, 5);
    const reopened = StudioOfflineBranchAutomergeEngine.load(branch.save(), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    expect(reopened.snapshot().operations).toEqual([original, retry]);
    expect(reopened.snapshot().resolutions?.[original.id]).toEqual(decision("reapply-local"));
    expect(studioOfflineBranchPendingOperations(reopened.snapshot())).toEqual([retry]);
    expect(studioOfflineBranchRetainedPayloadOperations(reopened.snapshot())).toEqual([original, retry]);
    expect(reopened.snapshot().receipts).toEqual({});
    reopened.close(); branch.close();
  });

  it("같은 선택을 반복하면 최초 replacement를 재사용하고 다른 선택은 거절한다", () => {
    const { branch, original } = conflictedEngine();
    const first = branch.resolveConflict(decision("reapply-local"), replacement(original), 5);
    expect(branch.resolveConflict({ ...decision("reapply-local"), replacementOperationId: "another-retry" }, {
      ...replacement(original), id: "another-retry", dedupeKey: "another-key", createdAt: 6,
    }, 6)).toEqual(first);
    expect(() => branch.resolveConflict(decision("keep-canonical"), null, 7)).toThrow(/선택.*원본 변경.*보존/u);
    expect(branch.snapshot()).toEqual(first);
    branch.close();
  });

  it("같은 결과 payload의 순서 기준이 정규화되면 새 fingerprint를 보관한다", () => {
    const { branch, original } = conflictedEngine();
    const retry = { ...replacement(original), beforeId: "canonical-next", resultFingerprint: FP_B };
    branch.resolveConflict(decision("reapply-local"), retry, 5);
    expect(studioOfflineBranchPendingOperations(branch.snapshot())).toEqual([retry]);
    branch.close();
  });

  it("다른 local actor는 기존 작업을 처리할 수 없다", () => {
    const { branch } = conflictedEngine();
    const other = StudioOfflineBranchAutomergeEngine.load(branch.save(), {
      workId: "work-1", scope: "user-1", actorId: "another-actor",
    });
    expect(() => other.resolveConflict(decision("keep-canonical"), null, 5)).toThrow(/사용자.*시각/u);
    other.close(); branch.close();
  });

  it.each(["canonical-local", "server"] as const)("%s receipt가 있는 작업의 처리 선택은 거절한다", (state) => {
    const { branch, original } = conflictedEngine();
    branch.recordReceipts([{
      operationId: original.id, state, yjsUpdateId: "update-1", serverSequence: state === "server" ? "4" : null,
      appliedAt: 4,
    }], 4);
    const before = branch.save();
    expect(() => branch.resolveConflict(decision("keep-canonical"), null, 5)).toThrow(/정본.*보존/u);
    expect(branch.save()).toEqual(before);
    branch.close();
  });

  it("충돌 선택을 서버 receipt로 위장하거나 다른 결과 payload로 재적용할 수 없다", () => {
    const { branch, original } = conflictedEngine();
    const before = branch.save();
    const forged = { ...decision("keep-canonical"), action: "server" } as unknown as StudioOfflineBranchResolution;
    expect(() => branch.resolveConflict(forged, null, 5)).toThrow(/올바르지/u);
    expect(() => branch.resolveConflict(decision("reapply-local"), {
      ...replacement(original), payloadHash: HASH_B,
    }, 5)).toThrow(/재적용 작업/u);
    expect(branch.save()).toEqual(before);
    branch.close();
  });

  it("해결 기록을 피어에 전파하며 오래된 충돌 문서로 다시 활성화하지 않는다", () => {
    const { branch } = conflictedEngine();
    const old = branch.save();
    const peer = StudioOfflineBranchAutomergeEngine.load(old, {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    branch.resolveConflict(decision("keep-canonical"), null, 5);
    expect(peer.importDocument(branch.save(), 6).changed).toBe(true);
    expect(peer.importDocument(old, 7)).toEqual({ changed: false, replyNeeded: true });
    expect(peer.snapshot().resolutions?.["op-conflict"]?.action).toBe("keep-canonical");
    expect(peer.snapshot().conflicts).toEqual({});
    expect(studioOfflineBranchPendingOperations(peer.snapshot())).toEqual([]);
    expect(peer.importDocument(branch.save(), 8).changed).toBe(false);
    peer.close(); branch.close();
  });

  it("두 기기의 다른 결정은 replacement를 부분 반영하지 않고 원자적으로 거절한다", () => {
    const { branch, original } = conflictedEngine();
    const peer = StudioOfflineBranchAutomergeEngine.load(branch.save(), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    branch.resolveConflict(decision("keep-canonical"), null, 5);
    peer.resolveConflict(decision("reapply-local"), replacement(original), 5);
    const before = branch.save();
    expect(() => branch.importDocument(peer.save(), 6)).toThrow(/선택.*원본 변경.*보존/u);
    expect(branch.save()).toEqual(before);
    expect(branch.snapshot().operations).toEqual([original]);
    expect(studioOfflineBranchPendingOperations(branch.snapshot())).toEqual([]);
    peer.close(); branch.close();
  });

  it("서로 다른 현재 기준에서 만든 두 replacement를 동시에 활성화하지 않는다", () => {
    const { branch, original } = conflictedEngine();
    const peer = StudioOfflineBranchAutomergeEngine.load(branch.save(), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    branch.resolveConflict(decision("reapply-local"), replacement(original), 5);
    peer.resolveConflict({ ...decision("reapply-local"), replacementOperationId: "peer-replacement" }, {
      ...replacement(original), id: "peer-replacement", dedupeKey: "different-baseline", expectedFingerprint: FP_A,
    }, 5);
    const before = branch.save();
    expect(() => branch.importDocument(peer.save(), 6)).toThrow(/선택.*원본 변경.*보존/u);
    expect(branch.save()).toEqual(before);
    expect(studioOfflineBranchPendingOperations(branch.snapshot()).map(({ id }) => id)).toEqual(["op-replacement"]);
    peer.close(); branch.close();
  });

  it("같은 의미의 재적용은 dedupe 후 연결을 비교해 중복 replacement를 만들지 않는다", () => {
    const { branch, original } = conflictedEngine();
    const peer = StudioOfflineBranchAutomergeEngine.load(branch.save(), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    branch.resolveConflict(decision("reapply-local"), replacement(original), 5);
    peer.resolveConflict({ ...decision("reapply-local"), replacementOperationId: "peer-equivalent" }, {
      ...replacement(original), id: "peer-equivalent",
    }, 5);
    expect(branch.importDocument(peer.save(), 6).changed).toBe(false);
    expect(branch.snapshot().operations.map(({ id }) => id)).toEqual([original.id, "op-replacement"]);
    expect(studioOfflineBranchPendingOperations(branch.snapshot()).map(({ id }) => id)).toEqual(["op-replacement"]);
    peer.close(); branch.close();
  });

  it("폐기 선택 뒤 거짓 서버 receipt를 추가하거나 피어로 주입할 수 없다", () => {
    const { branch, original } = conflictedEngine();
    branch.resolveConflict(decision("keep-canonical"), null, 5);
    const receipt: StudioOfflineBranchReceipt = {
      operationId: original.id, state: "server", yjsUpdateId: "fake-ack", serverSequence: "99", appliedAt: 6,
    };
    const before = branch.save();
    expect(() => branch.recordReceipts([receipt], 6)).toThrow(/수신 확인/u);
    const document = Automerge.load<StudioOfflineBranchDocument>(before);
    const forged = Automerge.change(document, (draft) => { draft.receipts[original.id] = receipt; });
    expect(() => branch.importDocument(Automerge.save(forged), 7)).toThrow(/충돌 처리 기록/u);
    expect(branch.save()).toEqual(before);
    Automerge.free(forged); branch.close();
  });

  it("dedupe 연결의 최종 검증이 실패해도 기존 journal을 계속 편집할 수 있다", () => {
    const { branch: peer, original } = conflictedEngine();
    peer.resolveConflict(decision("reapply-local"), replacement(original), 5);
    const local = engine("newer-local-copy", "actor-1", 1);
    local.append([{ ...original, id: "local-original", createdAt: 100 }], 100);
    local.recordConflicts([{
      operationId: "local-original", code: "target-exists", message: "정본과 충돌했습니다.", detectedAt: 101,
    }], 101);
    const before = local.save();
    expect(() => local.importDocument(peer.save(), 102)).toThrow(/충돌 처리 기록/u);
    expect(local.save()).toEqual(before);
    expect(local.append([operation({
      id: "after-rejected-import", actorId: "actor-1", targetId: "stroke-after", createdAt: 103,
    })], 103)).toBe(1);
    expect(local.snapshot().operations.some(({ id }) => id === "op-replacement")).toBe(false);
    local.close(); peer.close();
  });

  it("미래 시계의 피어 결정을 저장하고 재열기 뒤 새 선택도 단조롭게 기록한다", () => {
    const { branch: local } = conflictedEngine();
    const peer = engine("future-clock-peer", "actor-1", 1);
    const future = operation({
      id: "future-operation", actorId: "actor-1", targetId: "future-stroke", createdAt: 1_000,
    });
    peer.append([future], 1_000);
    peer.recordConflicts([{
      operationId: future.id, code: "target-exists", message: "다른 정본 대상이 있습니다.", detectedAt: 1_001,
    }], 1_001);
    peer.resolveConflict({
      operationId: future.id, actorId: "actor-1", action: "keep-canonical",
      replacementOperationId: null, resolvedAt: 1_100,
    }, null, 1_100);
    expect(local.importDocument(peer.save(), 10).changed).toBe(true);
    expect(local.snapshot().branch.updatedAt).toBe(1_100);
    const reopened = StudioOfflineBranchAutomergeEngine.load(local.save(), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    reopened.resolveConflict({ ...decision("keep-canonical"), resolvedAt: 1_101 }, null, 1_101);
    expect(reopened.snapshot().branch.updatedAt).toBe(1_101);
    expect(studioOfflineBranchPendingOperations(reopened.snapshot())).toEqual([]);
    expect(reopened.snapshot().operations).toHaveLength(2);
    reopened.close(); local.close(); peer.close();
  });

  it("기존 피어 metadata보다 늦은 operation 시각도 import 상한에 포함한다", () => {
    const local = engine("local-clock", "actor-1", 1);
    const peer = engine("legacy-clock-peer", "actor-1", 1);
    peer.append([operation({
      id: "late-operation", actorId: "actor-1", targetId: "late-stroke", createdAt: 2_000,
    })], 2);
    expect(peer.snapshot().branch.updatedAt).toBe(2);
    local.importDocument(peer.save(), 3);
    expect(local.snapshot().branch.updatedAt).toBe(2_000);
    const reopened = StudioOfflineBranchAutomergeEngine.load(local.save(), {
      workId: "work-1", scope: "user-1", actorId: "actor-1",
    });
    expect(reopened.snapshot().branch.updatedAt).toBe(2_000);
    reopened.append([operation({
      id: "after-clock-adoption", actorId: "actor-1", targetId: "next-stroke", createdAt: 2_001,
    })], 2_001);
    expect(reopened.snapshot().operations).toHaveLength(2);
    reopened.close(); local.close(); peer.close();
  });
});
