import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultClearTimeout, defaultSetTimeout } from "./studio-crdt-binding-timers";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { type StudioCrdtUpdateRequest } from "./studio-crdt-protocol";
import {
  StudioCrdtRoomBinding,
  type StudioCrdtBindingStatus,
} from "./studio-crdt-room-binding";
import {
  add,
  DurableMemoryOutbox,
  FakeRoom,
  MemoryRecoveryVault,
  room,
  transportState,
} from "./studio-crdt-room-binding.test-support";
import { projectStudioLiveSyncSnapshot } from "./studio-live-sync-safety";

function latestStatus(statuses: readonly StudioCrdtBindingStatus[]): StudioCrdtBindingStatus {
  const status = statuses.at(-1);
  if (!status) throw new Error("기기 보관 상태가 전달되지 않았습니다.");
  return status;
}

function offlineSnapshot(status: StudioCrdtBindingStatus) {
  return projectStudioLiveSyncSnapshot({
    availability: "connecting",
    mode: "server",
    canEdit: true,
    operationSyncReady: true,
    telemetry: status,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("권위 서버 단절 중 CRDT 기기 보관 복구", () => {
  it("첫 put이 일시 거절돼도 추가 입력이나 재연결 없이 같은 요청을 기기에 다시 보관한다", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server, "server");
    fake.crdtFanout = "authoritative";
    const outbox = new DurableMemoryOutbox();
    const durablePut = outbox.put.bind(outbox);
    const attempted: StudioCrdtUpdateRequest[] = [];
    vi.spyOn(outbox, "put").mockImplementation(async (scope, request) => {
      attempted.push({ ...request });
      if (attempted.length === 1) throw new Error("일시적인 기기 보관 실패");
      await durablePut(scope, request);
    });
    const statuses: StudioCrdtBindingStatus[] = [];
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      recoveryVault: new MemoryRecoveryVault(),
      outboxScope: "offline-first-put-recovery",
      onStatus: (status) => statuses.push(status),
    });
    try {
      await binding.start();
      expect(fake.syncRequests).toBe(1);
      transportState(fake, "disconnected");
      add(client, "offline-first-put-stroke", 53);
      // 문서의 기존 40ms 배치만 진행한다. 이후에는 입력·flush·보호 barrier를 추가하지 않는다.
      await vi.advanceTimersByTimeAsync(40);
      expect(attempted).toHaveLength(1);
      expect(outbox.requests.size).toBe(0);
      expect(latestStatus(statuses)).toMatchObject({
        state: "error",
        durabilityAtRisk: true,
        pendingCount: 1,
        persistenceDurability: "degraded",
        transportReady: false,
      });
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "durability-risk",
        editsDurablyProtected: false,
      });

      // 기존 persistence 재시도의 첫 backoff(300ms) 뒤에만 자동 복구를 관찰한다.
      await vi.advanceTimersByTimeAsync(300);
      expect(attempted).toHaveLength(2);
      const original = attempted[0];
      const retried = attempted[1];
      if (!original || !retried) throw new Error("원래 요청과 자동 재시도 요청이 필요합니다.");
      expect(retried.updateId).toBe(original.updateId);
      expect(retried.clientSequence).toBe(original.clientSequence);
      expect(retried).toEqual(original);
      expect([...outbox.requests.values()]).toEqual([original]);
      expect(latestStatus(statuses)).toMatchObject({
        state: "retrying",
        pendingCount: 1,
        persistenceDurability: "durable",
        transportReady: false,
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "offline-queued",
        pendingCount: 1,
        editsDurablyProtected: true,
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(fake.publications).toEqual([]);
      expect(fake.syncRequests).toBe(1);
      expect(server.getStroke("offline-first-put-stroke")).toBeNull();
      expect(client.getStroke("offline-first-put-stroke")).not.toBeNull();
    } finally {
      binding.close();
      client.destroy();
      server.destroy();
    }
  });

  it("기본 750ms timeout 뒤 첫 저장이 늦게 끝나도 같은 요청의 자동 재시도로 보호를 복구한다", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server, "server");
    fake.crdtFanout = "authoritative";
    const outbox = new DurableMemoryOutbox();
    const durablePut = outbox.put.bind(outbox);
    const attempted: StudioCrdtUpdateRequest[] = [];
    const statuses: StudioCrdtBindingStatus[] = [];
    const late: { completed: boolean; status: StudioCrdtBindingStatus | null } = {
      completed: false,
      status: null,
    };
    let lateTimer: ReturnType<typeof setTimeout> | null = null;
    let releaseLatePut: () => void = () => undefined;
    let latePut: Promise<void> = Promise.resolve();
    vi.spyOn(outbox, "put").mockImplementation(async (scope, request) => {
      attempted.push({ ...request });
      if (attempted.length !== 1) {
        await durablePut(scope, request);
        return;
      }
      const delayed = new Promise<void>((resolve) => {
        releaseLatePut = resolve;
        lateTimer = setTimeout(() => {
          lateTimer = null;
          resolve();
        }, 1_000);
      });
      latePut = delayed.then(async () => {
        await durablePut(scope, request);
        late.completed = true;
        late.status = latestStatus(statuses);
      });
      await latePut;
    });
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      recoveryVault: new MemoryRecoveryVault(),
      outboxScope: "offline-put-timeout-recovery",
      onStatus: (status) => statuses.push(status),
    });
    try {
      await binding.start();
      transportState(fake, "disconnected");
      add(client, "offline-timeout-stroke", 55);
      // 40ms의 문서 배치가 끝난 뒤부터 기본 put timeout 750ms를 별도로 센다.
      await vi.advanceTimersByTimeAsync(40);
      expect(attempted).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(749);
      expect(attempted).toHaveLength(1);
      expect(late.completed).toBe(false);
      expect(statuses.some((status) => status.state === "error")).toBe(false);
      expect(latestStatus(statuses)).toMatchObject({
        pendingCount: 1,
        persistenceDurability: "checking",
        transportReady: false,
      });

      await vi.advanceTimersByTimeAsync(1);
      expect(late.completed).toBe(false);
      expect(outbox.requests.size).toBe(0);
      expect(latestStatus(statuses)).toMatchObject({
        state: "error",
        durabilityAtRisk: true,
        pendingCount: 1,
        persistenceDurability: "degraded",
      });
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "durability-risk",
        editsDurablyProtected: false,
      });

      // 원 put은 1,000ms에 끝나지만 750ms에 실패한 wrapper를 성공으로 바꾸지 않는다.
      // 그 뒤 300ms backoff의 재시도가 원래 ID와 내용으로 기기 보호를 다시 확인한다.
      await vi.advanceTimersByTimeAsync(300);
      expect(late.completed).toBe(true);
      const atLateCompletion = late.status;
      if (!atLateCompletion) throw new Error("늦게 끝난 첫 저장 시점의 상태가 필요합니다.");
      expect(atLateCompletion).toMatchObject({
        state: "error",
        durabilityAtRisk: true,
        persistenceDurability: "degraded",
      });
      expect(attempted).toHaveLength(2);
      const original = attempted[0];
      const retried = attempted[1];
      if (!original || !retried) throw new Error("timeout 전후의 동일 요청이 필요합니다.");
      expect(retried.updateId).toBe(original.updateId);
      expect(retried.clientSequence).toBe(original.clientSequence);
      expect(retried).toEqual(original);
      expect([...outbox.requests.values()]).toEqual([original]);
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "offline-queued",
        pendingCount: 1,
        persistenceDurability: "durable",
        editsDurablyProtected: true,
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(fake.publications).toEqual([]);
      expect(fake.syncRequests).toBe(1);
      expect(server.getStroke("offline-timeout-stroke")).toBeNull();
      expect(client.getStroke("offline-timeout-stroke")).not.toBeNull();
    } finally {
      binding.close();
      if (lateTimer !== null) clearTimeout(lateTimer);
      // 앞선 단언이 실패해도 첫 저장 promise를 남기지 않고 실제 완료까지 정리한다.
      releaseLatePut();
      try {
        await latePut;
      } finally {
        client.destroy();
        server.destroy();
      }
    }
  });

  it("계속 실패하는 기기 보관은 안전하다고 표시하지 않고 종료 뒤 재시도를 멈춘다", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server, "server");
    fake.crdtFanout = "authoritative";
    const outbox = new DurableMemoryOutbox();
    const put = vi.spyOn(outbox, "put").mockRejectedValue(new Error("기기 보관을 사용할 수 없습니다."));
    const statuses: StudioCrdtBindingStatus[] = [];
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      recoveryVault: new MemoryRecoveryVault(),
      outboxScope: "offline-closed-put-recovery",
      onStatus: (status) => statuses.push(status),
    });
    try {
      await binding.start();
      transportState(fake, "disconnected");
      add(client, "offline-unprotected-stroke", 54);
      await vi.advanceTimersByTimeAsync(40);
      expect(put).toHaveBeenCalledOnce();
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "durability-risk",
        pendingCount: 1,
        editsDurablyProtected: false,
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(outbox.requests.size).toBe(0);
      expect(client.getStroke("offline-unprotected-stroke")).not.toBeNull();

      await vi.advanceTimersByTimeAsync(300);
      expect(put).toHaveBeenCalledTimes(2);
      expect(latestStatus(statuses)).toMatchObject({
        state: "error",
        durabilityAtRisk: true,
        pendingCount: 1,
        persistenceDurability: "degraded",
        transportReady: false,
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "durability-risk",
        pendingCount: 1,
        editsDurablyProtected: false,
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(outbox.requests.size).toBe(0);
      expect(fake.publications).toEqual([]);
      expect(server.getStroke("offline-unprotected-stroke")).toBeNull();
      expect(client.getStroke("offline-unprotected-stroke")).not.toBeNull();

      binding.close();
      const statusCountAfterClose = statuses.length;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(put).toHaveBeenCalledTimes(2);
      expect(statuses.slice(statusCountAfterClose)).toEqual([]);
      expect(fake.publications).toEqual([]);
      expect(server.getStroke("offline-unprotected-stroke")).toBeNull();
    } finally {
      binding.close();
      client.destroy();
      server.destroy();
    }
  });

  it("기기 보관을 복구하면 durable 대기열을 깨우는 300ms 예약을 반복하지 않는다", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server, "server");
    fake.crdtFanout = "authoritative";
    const outbox = new DurableMemoryOutbox();
    const durablePut = outbox.put.bind(outbox);
    const attempted: StudioCrdtUpdateRequest[] = [];
    vi.spyOn(outbox, "put").mockImplementation(async (scope, request) => {
      attempted.push(structuredClone(request));
      if (attempted.length === 1) throw new Error("일시적인 기기 보관 실패");
      await durablePut(scope, request);
    });
    const scheduledDelays: number[] = [];
    const statuses: StudioCrdtBindingStatus[] = [];
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      recoveryVault: new MemoryRecoveryVault(),
      outboxScope: "offline-recovered-idle",
      onStatus: (status) => statuses.push(status),
      setTimeout: (handler, delay) => {
        scheduledDelays.push(delay);
        return defaultSetTimeout(handler, delay);
      },
      clearTimeout: defaultClearTimeout,
    });
    try {
      await binding.start();
      transportState(fake, "disconnected");
      add(client, "offline-recovered-idle-stroke", 56);
      await vi.advanceTimersByTimeAsync(40);
      expect(attempted).toHaveLength(1);
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "durability-risk",
        pendingCount: 1,
        editsDurablyProtected: false,
      });
      expect(scheduledDelays.filter((delay) => delay === 300)).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(300);
      expect(attempted).toHaveLength(2);
      const original = attempted[0];
      if (!original) throw new Error("복구할 원래 기기 보관 요청이 필요합니다.");
      expect(attempted[1]).toEqual(original);
      expect([...outbox.requests.values()]).toEqual([original]);
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "offline-queued",
        pendingCount: 1,
        persistenceDurability: "durable",
        editsDurablyProtected: true,
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(scheduledDelays.filter((delay) => delay === 300)).toHaveLength(1);

      const schedulesAfterRecovery = scheduledDelays.length;
      await vi.advanceTimersByTimeAsync(1_500);
      expect(scheduledDelays.slice(schedulesAfterRecovery).filter((delay) => delay === 300)).toEqual([]);
      expect(attempted).toHaveLength(2);
      expect([...outbox.requests.values()]).toEqual([original]);
      expect(offlineSnapshot(latestStatus(statuses))).toMatchObject({
        phase: "offline-queued",
        pendingCount: 1,
        editsDurablyProtected: true,
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(fake.publications).toEqual([]);
      expect(fake.syncRequests).toBe(1);
      expect(server.getStroke("offline-recovered-idle-stroke")).toBeNull();
      expect(client.getStroke("offline-recovered-idle-stroke")).not.toBeNull();
    } finally {
      binding.close();
      client.destroy();
      server.destroy();
    }
  });

  it("최초 정본 동기화를 기다릴 때도 durable 요청의 300ms drain을 반복 예약하지 않는다", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server, "server");
    fake.crdtFanout = "authoritative";
    let releaseSync: () => void = () => { throw new Error("최초 동기화 대기 경계가 없습니다."); };
    fake.nextSyncBarrier = new Promise<void>((resolve) => { releaseSync = resolve; });
    const outbox = new DurableMemoryOutbox();
    const scheduledDelays: number[] = [];
    const statuses: StudioCrdtBindingStatus[] = [];
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      recoveryVault: new MemoryRecoveryVault(),
      outboxScope: "initial-sync-durable-idle",
      onStatus: (status) => statuses.push(status),
      setTimeout: (handler, delay) => {
        scheduledDelays.push(delay);
        return defaultSetTimeout(handler, delay);
      },
      clearTimeout: defaultClearTimeout,
    });
    const starting = binding.start();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.syncRequests).toBe(1);
      add(client, "initial-sync-durable-stroke", 57);
      await vi.advanceTimersByTimeAsync(40);
      expect(outbox.requests.size).toBe(1);
      const stored = [...outbox.requests.values()].map((request) => structuredClone(request));
      expect(latestStatus(statuses)).toMatchObject({
        pendingCount: 1,
        persistenceDurability: "durable",
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(fake.publications).toEqual([]);

      await vi.advanceTimersByTimeAsync(1_500);
      expect(scheduledDelays.filter((delay) => delay === 300)).toEqual([]);
      expect([...outbox.requests.values()]).toEqual(stored);
      expect(latestStatus(statuses)).toMatchObject({
        pendingCount: 1,
        persistenceDurability: "durable",
        lastAckAt: null,
        lastAckServerSequence: null,
      });
      expect(fake.publications).toEqual([]);
      expect(fake.syncRequests).toBe(1);
      expect(server.getStroke("initial-sync-durable-stroke")).toBeNull();
      expect(client.getStroke("initial-sync-durable-stroke")).not.toBeNull();
    } finally {
      binding.close();
      releaseSync();
      try {
        await starting;
      } finally {
        client.destroy();
        server.destroy();
      }
    }
  });

  it("기기 저장을 기다리는 사이 정본 재연결이 끝나면 추가 입력 없이 원래 요청을 승인한다", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server, "server");
    fake.crdtFanout = "authoritative";
    const requestSync = fake.requestCrdtSync.bind(fake);
    let completedSyncResponses = 0;
    vi.spyOn(fake, "requestCrdtSync").mockImplementation(async (request) => {
      const response = await requestSync(request);
      completedSyncResponses += 1;
      return response;
    });
    const outbox = new DurableMemoryOutbox();
    const durablePut = outbox.put.bind(outbox);
    let releasePut: () => void = () => { throw new Error("기기 저장 대기 경계가 없습니다."); };
    const putGate = new Promise<void>((resolve) => { releasePut = resolve; });
    const attempted: StudioCrdtUpdateRequest[] = [];
    const writes: Promise<void>[] = [];
    vi.spyOn(outbox, "put").mockImplementation((scope, request) => {
      attempted.push(structuredClone(request));
      const writing = putGate.then(() => durablePut(scope, request));
      writes.push(writing);
      return writing;
    });
    const scheduledDelays: number[] = [];
    const statuses: StudioCrdtBindingStatus[] = [];
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      recoveryVault: new MemoryRecoveryVault(),
      outboxScope: "reconnected-during-device-put",
      onStatus: (status) => statuses.push(status),
      setTimeout: (handler, delay) => {
        scheduledDelays.push(delay);
        return defaultSetTimeout(handler, delay);
      },
      clearTimeout: defaultClearTimeout,
    });
    try {
      await binding.start();
      transportState(fake, "disconnected");
      add(client, "reconnected-during-device-put-stroke", 58);
      await vi.advanceTimersByTimeAsync(40);
      expect(attempted).toHaveLength(1);
      expect(latestStatus(statuses)).toMatchObject({ pendingCount: 1, persistenceDurability: "checking" });
      expect(outbox.requests.size).toBe(0);
      const original = attempted[0];
      if (!original) throw new Error("재연결 전에 작성한 원래 요청이 필요합니다.");

      transportState(fake, "ready");
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.syncRequests).toBe(2);
      expect(completedSyncResponses).toBe(2);
      expect(fake.publications).toEqual([]);
      expect(latestStatus(statuses)).toMatchObject({ pendingCount: 1, transportReady: true });

      releasePut();
      await vi.advanceTimersByTimeAsync(500);
      expect(attempted).toEqual([original]);
      expect(fake.publications).toEqual([original]);
      expect(outbox.requests.size).toBe(0);
      expect(latestStatus(statuses)).toMatchObject({
        state: "ready",
        pendingCount: 0,
        persistenceDurability: "durable",
        lastAckServerSequence: "1",
      });
      expect(latestStatus(statuses).lastAckAt).not.toBeNull();
      expect(server.getStroke("reconnected-during-device-put-stroke")).not.toBeNull();
      expect(server.getStateVectorBase64()).toBe(client.getStateVectorBase64());

      const schedulesAfterAck = scheduledDelays.length;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(scheduledDelays.slice(schedulesAfterAck).filter((delay) => delay === 300)).toEqual([]);
      expect(fake.publications).toEqual([original]);
      expect(latestStatus(statuses)).toMatchObject({ state: "ready", pendingCount: 0, lastAckServerSequence: "1" });
    } finally {
      binding.close();
      releasePut();
      try {
        await Promise.all(writes);
      } finally {
        client.destroy();
        server.destroy();
      }
    }
  });
});
