import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCrdtDocument } from "./studio-crdt-document";
import type { StudioCrdtOutbox, StudioCrdtOutboxStatus } from "./studio-crdt-outbox";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtUpdate,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";
import { StudioCrdtRoomBinding, type StudioCrdtBindingStatus } from "./studio-crdt-room-binding";
import {
  add,
  FakeRoom,
  MemoryRecoveryVault,
  room,
  transportState,
} from "./studio-crdt-room-binding.test-support";

interface StoredRequest {
  readonly scope: string;
  readonly request: StudioCrdtUpdateRequest;
}

/** SQLite와 같이 저장한 ID의 payload를 교체하지 않는 복구 저장소다. */
class ImmutableOutbox implements StudioCrdtOutbox {
  private readonly rows = new Map<string, StoredRequest>();
  readonly completedPuts: StoredRequest[] = [];
  readonly rejectedPuts: StoredRequest[] = [];
  readonly removals: Array<{ scope: string; workId: string; updateId: string }> = [];

  private key(scope: string, workId: string, updateId: string): string {
    return JSON.stringify([scope, workId, updateId]);
  }

  getStatus(): StudioCrdtOutboxStatus {
    return { state: "durable", message: "불변 요청의 기기 저장을 확인했습니다." };
  }

  async list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]> {
    return [...this.rows.values()]
      .filter((entry) => entry.scope === scope && entry.request.workId === workId)
      .map((entry) => structuredClone(entry.request))
      .sort((left, right) => left.clientSequence - right.clientSequence);
  }

  async put(scope: string, request: StudioCrdtUpdateRequest): Promise<void> {
    const key = this.key(scope, request.workId, request.updateId);
    const copy = structuredClone(request);
    const previous = this.rows.get(key);
    if (previous && JSON.stringify(previous.request) !== JSON.stringify(copy)) {
      this.rejectedPuts.push({ scope, request: copy });
      throw new Error("같은 복구 요청 ID의 원문을 변경할 수 없습니다.");
    }
    this.rows.set(key, { scope, request: copy });
    this.completedPuts.push({ scope, request: structuredClone(copy) });
  }

  async remove(scope: string, workId: string, updateId: string): Promise<void> {
    this.removals.push({ scope, workId, updateId });
    this.rows.delete(this.key(scope, workId, updateId));
  }
}

function nextIdentity(): () => string {
  let sequence = 0;
  return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
}

function requiredRequest(request: StudioCrdtUpdateRequest | undefined): StudioCrdtUpdateRequest {
  if (!request) throw new Error("저장된 복구 요청이 없습니다.");
  return structuredClone(request);
}

function expectRestorable(
  requests: readonly StudioCrdtUpdateRequest[],
  expected: StudioCrdtDocument,
  ids: readonly string[],
): void {
  const restored = new StudioCrdtDocument();
  try {
    for (const request of requests) restored.applyUpdate(decodeStudioCrdtUpdate(request.update));
    expect(restored.getStrokes().map((stroke) => stroke.id).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(restored.getStroke(id)?.payload).toEqual(expected.getStroke(id)?.payload);
    }
  } finally {
    restored.destroy();
  }
}

function synchronizationGate() {
  let release: () => void = () => { throw new Error("동기화 대기 경계가 준비되지 않았습니다."); };
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release: () => release() };
}

afterEach(() => { vi.useRealTimers(); });

describe("불변 outbox의 오프라인 요청 경계", () => {
  it("첫 durable 배치 뒤의 편집을 새 ID로 보존하고 재연결에서 각 원문을 한 번씩 승인한다", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server, "server");
    fake.crdtFanout = "authoritative";
    const outbox = new ImmutableOutbox();
    const scope = "artist-immutable-offline";
    const statuses: StudioCrdtBindingStatus[] = [];
    const binding = new StudioCrdtRoomBinding({
      document: client, room: room(fake), outbox, outboxScope: scope,
      recoveryVault: new MemoryRecoveryVault(), randomId: nextIdentity(),
      onStatus: (status) => statuses.push(status),
    });
    try {
      await binding.start();
      expect(statuses.at(-1)).toMatchObject({ state: "ready", pendingCount: 0, persistenceDurability: "durable" });
      transportState(fake, "disconnected");

      add(client, "offline-a", 10);
      await vi.advanceTimersByTimeAsync(40);
      const first = requiredRequest((await outbox.list(scope, fake.workId))[0]);
      expect(outbox.completedPuts).toEqual([{ scope, request: first }]);
      expect(statuses.at(-1)).toMatchObject({ pendingCount: 1, persistenceDurability: "durable", transportReady: false });
      expect(fake.publications).toEqual([]);
      expectRestorable([first], client, ["offline-a"]);

      // 첫 put의 성공과 durable 관측을 마친 뒤 별도의 40ms 배치를 만든다.
      add(client, "offline-b", 20);
      await vi.advanceTimersByTimeAsync(40);
      const stored = await outbox.list(scope, fake.workId);
      expect(stored.find((request) => request.updateId === first.updateId)).toEqual(first);
      expect(outbox.rejectedPuts).toEqual([]);
      expect(stored).toHaveLength(2);
      const second = requiredRequest(stored[1]);
      expect(second.updateId).not.toBe(first.updateId);
      expect(second.clientSequence).toBeGreaterThan(first.clientSequence);
      expect(second.update).not.toBe(first.update);
      expectRestorable(stored, client, ["offline-a", "offline-b"]);
      expect(statuses.at(-1)).toMatchObject({ pendingCount: 2, persistenceDurability: "durable", transportReady: false });
      expect(fake.publications).toEqual([]);
      expect(outbox.removals).toEqual([]);

      transportState(fake, "ready");
      await vi.advanceTimersByTimeAsync(0);
      await binding.flushAndWaitForAuthoritativeAck();
      expect(fake.publications).toEqual([first, second]);
      expect(outbox.removals).toEqual(stored.map(({ workId, updateId }) => ({ scope, workId, updateId })));
      expect(await outbox.list(scope, fake.workId)).toEqual([]);
      expect(server.getStrokes().map((stroke) => stroke.id).sort()).toEqual(["offline-a", "offline-b"]);
      expect(server.getStateVectorBase64()).toBe(client.getStateVectorBase64());
      expect(statuses.at(-1)).toMatchObject({ state: "ready", pendingCount: 0, persistenceDurability: "durable", lastAckServerSequence: "2" });
    } finally {
      binding.close();
      client.destroy();
      server.destroy();
    }
  });

  it("복원한 ready 요청도 최초 서버 동기화 중 새 편집으로 덮어쓰지 않는다", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const source = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    add(source, "restored-a", 30);
    const original: StudioCrdtUpdateRequest = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a",
      updateId: "11111111-1111-4111-8111-111111111111", clientSequence: 37,
      update: encodeStudioCrdtUpdate(source.encodeStateAsUpdate()),
    };
    const outbox = new ImmutableOutbox();
    const scope = "artist-immutable-restored";
    await outbox.put(scope, original);
    const fake = new FakeRoom(server, "server");
    fake.crdtFanout = "authoritative";
    const gate = synchronizationGate();
    fake.nextSyncBarrier = gate.promise;
    const statuses: StudioCrdtBindingStatus[] = [];
    const binding = new StudioCrdtRoomBinding({
      document: client, room: room(fake), outbox, outboxScope: scope,
      recoveryVault: new MemoryRecoveryVault(), randomId: nextIdentity(),
      onStatus: (status) => statuses.push(status),
    });
    let starting: Promise<void> | null = null;
    try {
      starting = binding.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.syncRequests).toBe(1);
      expect(client.getStroke("restored-a")).not.toBeNull();
      expect(fake.publications).toEqual([]);

      add(client, "before-sync-b", 40);
      await vi.advanceTimersByTimeAsync(40);
      const stored = await outbox.list(scope, fake.workId);
      expect(stored.find((request) => request.updateId === original.updateId)).toEqual(original);
      expect(outbox.rejectedPuts).toEqual([]);
      expect(stored).toHaveLength(2);
      const next = requiredRequest(stored[1]);
      expect(next.updateId).not.toBe(original.updateId);
      expect(next.clientSequence).toBeGreaterThan(original.clientSequence);
      expectRestorable(stored, client, ["restored-a", "before-sync-b"]);
      expect(fake.publications).toEqual([]);
      expect(outbox.removals).toEqual([]);

      gate.release();
      await starting;
      await binding.flushAndWaitForAuthoritativeAck();
      expect(fake.publications).toEqual([original, next]);
      expect(outbox.removals).toEqual(stored.map(({ workId, updateId }) => ({ scope, workId, updateId })));
      expect(await outbox.list(scope, fake.workId)).toEqual([]);
      expect(server.getStrokes().map((stroke) => stroke.id).sort()).toEqual(["before-sync-b", "restored-a"]);
      expect(server.getStateVectorBase64()).toBe(client.getStateVectorBase64());
      expect(statuses.at(-1)).toMatchObject({ state: "ready", pendingCount: 0, lastAckServerSequence: "2" });
    } finally {
      binding.close();
      gate.release();
      await starting;
      client.destroy();
      source.destroy();
      server.destroy();
    }
  });
});
