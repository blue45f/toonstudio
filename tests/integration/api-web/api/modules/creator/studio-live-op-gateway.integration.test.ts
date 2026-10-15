/**
 * op 채널 병행 계약 통합 테스트 — 웹 병합 코어 하네스를 게이트웨이 상대로 돌린다.
 *
 * 실제 코드만 쓴다: 게이트웨이 핸들러(submit/sync)·방·FIFO·쿼터는 API 앱 creator
 * 모듈의 프로덕션 파일을, 클라이언트는 웹 코어(StrokeMergeClient)를 그대로 쓴다.
 * 가짜는 전송(Socket.IO 소켓·방 emit)과 인증 호스트 경계뿐이다 — 기존
 * 게이트웨이 테스트들이 같은 경계를 가짜로 두는 방식과 같다.
 *
 * 위치: 웹 소스와 API 소스를 함께 가져오는 시험이라, 앱 사이 직접 import 를 0으로 고정한
 * 경계 래칫(validate-app-boundaries)이 허용하는 교차 앱 시험 자리(tests/integration)에 둔다.
 *
 * 단언하는 계약:
 *  1. submit → ACK {seq, duplicate:false} + 발신자 제외 방 브로드캐스트,
 *     수신 클라이언트가 코어 receive로 접으면 서버 방과 해시가 같다.
 *  2. 재제출 dedupe: 같은 seq·duplicate:true·재방송 없음.
 *  3. 발신자 FIFO: 카운터 gap 제출은 거부되고 영속되지 않는다. 순서가
 *     맞춰지면 같은 op가 받아들여진다.
 *  4. sync 증분 경로(ops만)와 스냅샷 경로: 스냅샷은 포함 opId 집합과
 *     digest를 싣고(계약 요구 1), 코어 adoptSnapshot이 pending을 정리한다.
 *  5. 권한 경계: 미참가 not_joined, 편집 권한 없음 forbidden, actor 위조 거부.
 *  6. 재시작 hydrate: 스냅샷을 영속한 뒤 새 레지스트리로 열어도 해시·FIFO
 *     high-water가 복원된다.
 *  7. 다중 클라이언트 수렴: 방송 중복·셔플에도 전원 해시 = 서버 해시.
 */

import { describe, expect, it } from "vitest";


import { StudioLiveCrdtQuotaLimiter } from "../../../../../../apps/api/src/modules/creator/studio-live-crdt-quota";
import * as opHandlers from "../../../../../../apps/api/src/modules/creator/studio-live-gateway-handlers-op";
import {
  InMemoryStudioLiveOpLogStore,
  StudioLiveOpRoomRegistry,
  digestStudioLiveOpIds,
  hashStudioLiveOpState,
} from "../../../../../../apps/api/src/modules/creator/studio-live-op";
import { STUDIO_CRDT_PROTOCOL_VERSION } from "../../../../../../apps/api/src/modules/creator/studio-live.protocol";
import { hashMergeState } from "../../../../../../apps/web/src/domains/creator/live/merge/stroke-merge-core";
import { StrokeMergeClient } from "../../../../../../apps/web/src/domains/creator/live/merge/stroke-merge-sync";

import type { StudioLiveParticipantInternal } from "../../../../../../apps/api/src/modules/creator/studio-live-gateway-constants";
import type { StudioLiveGatewayHost } from "../../../../../../apps/api/src/modules/creator/studio-live-gateway-host";
import type {
  StudioLiveAck,
  StudioLiveOpBroadcast,
  StudioLiveOpSubmitAck,
  StudioLiveOpSyncResult,
  StudioLiveSocket,
} from "../../../../../../apps/api/src/modules/creator/studio-live.protocol";
import type {
  StrokeInput,
  StrokeOpBody,
} from "../../../../../../apps/web/src/domains/creator/live/merge/stroke-merge-types";

const WORK_ID = "work-op-1";

interface FakeParticipantInit {
  userId: string;
  clientInstanceId: string;
  edit: boolean;
}

class FakeSocket {
  readonly id: string;
  readonly received: StudioLiveOpBroadcast[] = [];
  participant: StudioLiveParticipantInternal | null = null;
  private readonly bus: FakeBus;

  constructor(id: string, bus: FakeBus) {
    this.id = id;
    this.bus = bus;
  }

  join(init: FakeParticipantInit): void {
    this.participant = {
      connectionId: this.id,
      clientInstanceId: init.clientInstanceId,
      userId: init.userId,
      workId: WORK_ID,
      name: init.userId,
      role: "editor",
      capabilities: { view: true, comment: true, edit: init.edit, manageMembers: false },
      state: "active",
      pageId: null,
      tool: null,
      sharingScreen: false,
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      authorizedAt: Date.now(),
      authorizationSequence: 1,
      authorizationExpiresAt: null,
    } as StudioLiveParticipantInternal;
    this.bus.join(this);
  }

  to(_room: string): { emit: (event: string, payload: StudioLiveOpBroadcast) => void } {
    return {
      emit: (_event, payload) => {
        this.bus.broadcast(this, payload);
      },
    };
  }

  emit(): void {}
  disconnect(): void {}
}

class FakeBus {
  readonly sockets: FakeSocket[] = [];
  join(socket: FakeSocket): void {
    this.sockets.push(socket);
  }
  broadcast(from: FakeSocket, payload: StudioLiveOpBroadcast): void {
    for (const socket of this.sockets) {
      if (socket !== from) socket.received.push(payload);
    }
  }
}

interface Harness {
  host: StudioLiveGatewayHost;
  bus: FakeBus;
  store: InMemoryStudioLiveOpLogStore;
  registry: StudioLiveOpRoomRegistry;
  socketFor(actorId: string, options?: { edit?: boolean; userId?: string }): FakeSocket;
}

function makeHarness(options: { snapshotDepth?: number } = {}): Harness {
  const bus = new FakeBus();
  const store = new InMemoryStudioLiveOpLogStore();
  const registry = new StudioLiveOpRoomRegistry(store, {
    snapshotDepth: options.snapshotDepth,
  });
  const tails = new Map<string, Promise<void>>();
  // 게이트웨이 클래스 메서드의 체인 알고리즘과 동일하다 (studio-live.gateway.ts).
  const runSerialized = async <T>(
    senderKey: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    const previous = tails.get(senderKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    tails.set(senderKey, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (tails.get(senderKey) === tail) tails.delete(senderKey);
    }
  };
  const host = {
    logger: { error: () => undefined, log: () => undefined, warn: () => undefined },
    crdtQuotaLimiter: new StudioLiveCrdtQuotaLimiter(),
    studioLiveOpRooms: registry,
    currentJoinedCrdtParticipant(client: FakeSocket, workId: string) {
      return client.participant && client.participant.workId === workId
        ? client.participant
        : null;
    },
    async runWithAuthorizedParticipant(
      client: FakeSocket,
      workId: string,
      _requireEdit: boolean,
      _forceRecheck: boolean,
      action: (participant: StudioLiveParticipantInternal) => unknown
    ) {
      const participant =
        client.participant && client.participant.workId === workId
          ? client.participant
          : null;
      if (!participant) return null;
      return { value: action(participant) };
    },
    runStudioLiveOpSerialized: runSerialized,
  };
  let socketCounter = 0;
  return {
    host: host as unknown as StudioLiveGatewayHost,
    bus,
    store,
    registry,
    socketFor(actorId, socketOptions = {}) {
      socketCounter += 1;
      const socket = new FakeSocket(`socket-${socketCounter}`, bus);
      socket.join({
        userId: socketOptions.userId ?? `user-${actorId}`,
        clientInstanceId: actorId,
        edit: socketOptions.edit ?? true,
      });
      return socket as unknown as FakeSocket;
    },
  };
}

function strokeInput(id: string, pageId = "p1", layerId = "l1"): StrokeInput {
  return {
    id,
    pageId,
    layerId,
    payload: {
      version: 1,
      type: "draw",
      kind: "pen",
      mode: "pen",
      stroke: "#111111",
      strokeWidth: 3,
      points: [0, 0, 0.5, 0.5, 1, 1],
    },
  };
}

async function submit(
  harness: Harness,
  socket: FakeSocket,
  client: StrokeMergeClient,
  body: StrokeOpBody
): Promise<StudioLiveAck<StudioLiveOpSubmitAck>> {
  const op = client.createOp(body);
  return opHandlers.submitStudioLiveOp.call(
    harness.host,
    socket as unknown as StudioLiveSocket,
    { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: WORK_ID, op },
    undefined
  ) as Promise<StudioLiveAck<StudioLiveOpSubmitAck>>;
}

async function submitRaw(
  harness: Harness,
  socket: FakeSocket,
  op: unknown
): Promise<StudioLiveAck<StudioLiveOpSubmitAck>> {
  return opHandlers.submitStudioLiveOp.call(
    harness.host,
    socket as unknown as StudioLiveSocket,
    { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: WORK_ID, op } as never,
    undefined
  ) as Promise<StudioLiveAck<StudioLiveOpSubmitAck>>;
}

async function sync(
  harness: Harness,
  socket: FakeSocket,
  fromSeq: number
): Promise<StudioLiveAck<StudioLiveOpSyncResult>> {
  return opHandlers.syncStudioLiveOps.call(
    harness.host,
    socket as unknown as StudioLiveSocket,
    { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: WORK_ID, fromSeq },
    undefined
  ) as Promise<StudioLiveAck<StudioLiveOpSyncResult>>;
}

/** 소켓이 받은 브로드캐스트를 웹 코어 클라이언트에 순서대로 먹인다. */
function drainBroadcasts(socket: FakeSocket, client: StrokeMergeClient): void {
  for (const broadcast of socket.received.splice(0)) {
    client.receive(broadcast.op);
  }
}

async function serverHash(harness: Harness): Promise<string> {
  const room = await harness.registry.getRoom(WORK_ID);
  return hashStudioLiveOpState(room.foldedState);
}

describe("op 채널 게이트웨이 계약", () => {
  it("submit → ACK + 브로드캐스트, 코어 클라이언트 해시가 서버와 같다", async () => {
    const harness = makeHarness();
    const socketA = harness.socketFor("actor-a");
    const socketB = harness.socketFor("actor-b");
    const a = new StrokeMergeClient("actor-a");
    const b = new StrokeMergeClient("actor-b");

    const ack = await submit(harness, socketA, a, {
      kind: "add",
      stroke: strokeInput("s1"),
    });
    expect(ack).toMatchObject({ ok: true, data: { seq: 1, duplicate: false, opId: "actor-a:1" } });
    // 발신자는 브로드캐스트를 받지 않고, 상대만 받는다.
    expect(socketA.received).toHaveLength(0);
    expect(socketB.received).toHaveLength(1);
    expect(socketB.received[0].op.seq).toBe(1);

    drainBroadcasts(socketB, b);
    expect(hashMergeState(b.authoritativeState())).toBe(await serverHash(harness));
    // 발신자도 자기 op의 확정본을 받으면(ACK 유실 대비 receive 경로) 조정된다.
    const room = await harness.registry.getRoom(WORK_ID);
    for (const op of room.syncFor(0).ops) a.receive(op);
    expect(a.pendingCount).toBe(0);
    expect(hashMergeState(a.authoritativeState())).toBe(await serverHash(harness));
  });

  it("재제출은 duplicate ACK를 받고 재방송·재영속이 없다", async () => {
    const harness = makeHarness();
    const socketA = harness.socketFor("actor-a");
    const socketB = harness.socketFor("actor-b");
    const a = new StrokeMergeClient("actor-a");
    const op = a.createOp({ kind: "add", stroke: strokeInput("s1") });
    const body = { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: WORK_ID, op };

    const first = (await opHandlers.submitStudioLiveOp.call(
      harness.host,
      socketA as unknown as StudioLiveSocket,
      body,
      undefined
    )) as StudioLiveAck<StudioLiveOpSubmitAck>;
    const second = (await opHandlers.submitStudioLiveOp.call(
      harness.host,
      socketA as unknown as StudioLiveSocket,
      body,
      undefined
    )) as StudioLiveAck<StudioLiveOpSubmitAck>;
    expect(first).toMatchObject({ ok: true, data: { seq: 1, duplicate: false } });
    expect(second).toMatchObject({ ok: true, data: { seq: 1, duplicate: true } });
    expect(socketB.received).toHaveLength(1);
    expect(await harness.store.listOpsAfter(WORK_ID, 0)).toHaveLength(1);
  });

  it("발신자 FIFO: gap 제출은 거부·미영속, 순서가 맞으면 받아들여진다", async () => {
    const harness = makeHarness();
    const socketA = harness.socketFor("actor-a");
    const a = new StrokeMergeClient("actor-a");
    const op1 = a.createOp({ kind: "add", stroke: strokeInput("s1") });
    const op2 = a.createOp({ kind: "add", stroke: strokeInput("s2") });

    const gapAck = await submitRaw(harness, socketA, op2);
    expect(gapAck).toMatchObject({ ok: false, code: "invalid_payload" });
    expect(await harness.store.listOpsAfter(WORK_ID, 0)).toHaveLength(0);

    const firstAck = await submitRaw(harness, socketA, op1);
    expect(firstAck).toMatchObject({ ok: true, data: { seq: 1 } });
    const secondAck = await submitRaw(harness, socketA, op2);
    expect(secondAck).toMatchObject({ ok: true, data: { seq: 2 } });
  });

  it("sync 증분 경로: 늦게 들어와도 ops만으로 서버 해시에 도달한다", async () => {
    const harness = makeHarness();
    const socketA = harness.socketFor("actor-a");
    const a = new StrokeMergeClient("actor-a");
    await submit(harness, socketA, a, { kind: "add", stroke: strokeInput("s1") });
    await submit(harness, socketA, a, { kind: "add", stroke: strokeInput("s2") });

    const socketLate = harness.socketFor("actor-late");
    const late = new StrokeMergeClient("actor-late");
    const result = await sync(harness, socketLate, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("sync failed");
    expect(result.data.snapshot).toBeUndefined();
    expect(result.data.ops.map((op) => op.seq)).toEqual([1, 2]);
    for (const op of result.data.ops) late.receive(op);
    expect(hashMergeState(late.authoritativeState())).toBe(await serverHash(harness));
  });

  it("스냅샷 경로: opId 집합·digest를 싣고 adoptSnapshot이 pending을 정리한다", async () => {
    const harness = makeHarness({ snapshotDepth: 2 });
    const socketA = harness.socketFor("actor-a");
    const socketB = harness.socketFor("actor-b");
    const a = new StrokeMergeClient("actor-a");
    const b = new StrokeMergeClient("actor-b");
    // B가 op를 만들어 제출했지만 ACK를 못 받은 상황 (pending 잔류).
    const bOp = b.createOp({ kind: "add", stroke: strokeInput("sb") });
    await submitRaw(harness, socketB, bOp);
    expect(b.pendingCount).toBe(1);
    for (let i = 1; i <= 4; i += 1) {
      await submit(harness, socketA, a, { kind: "add", stroke: strokeInput(`s${i}`) });
    }

    const result = await sync(harness, socketB, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("sync failed");
    const snapshot = result.data.snapshot;
    expect(snapshot).toBeDefined();
    if (!snapshot) throw new Error("snapshot missing");
    // 계약 요구 1: 스냅샷 seq까지의 전 opId가 seq 순으로 실리고 digest가 맞는다.
    expect(snapshot.seq).toBe(5);
    expect(snapshot.opIds).toHaveLength(5);
    expect(snapshot.opIds[0]).toBe("actor-b:1");
    expect(snapshot.opIdDigest).toBe(digestStudioLiveOpIds(snapshot.opIds));

    b.adoptSnapshot(
      { seq: snapshot.seq, state: snapshot.state },
      new Set(snapshot.opIds)
    );
    expect(b.pendingCount).toBe(0);
    expect(hashMergeState(b.authoritativeState())).toBe(await serverHash(harness));
  });

  it("권한 경계: 미참가·편집 불가·actor 위조를 거부한다", async () => {
    const harness = makeHarness();
    const busSocket = new FakeSocket("socket-stranger", harness.bus);
    const stranger = new StrokeMergeClient("actor-x");
    const strangerAck = await submitRaw(
      harness,
      busSocket as unknown as FakeSocket,
      stranger.createOp({ kind: "add", stroke: strokeInput("sx") })
    );
    expect(strangerAck).toMatchObject({ ok: false, code: "not_joined" });

    const viewerSocket = harness.socketFor("actor-viewer", { edit: false });
    const viewer = new StrokeMergeClient("actor-viewer");
    const viewerAck = await submit(harness, viewerSocket, viewer, {
      kind: "add",
      stroke: strokeInput("sv"),
    });
    expect(viewerAck).toMatchObject({ ok: false, code: "forbidden" });

    const socketA = harness.socketFor("actor-a");
    const spoof = new StrokeMergeClient("actor-evil");
    const spoofAck = await submitRaw(
      harness,
      socketA,
      spoof.createOp({ kind: "add", stroke: strokeInput("se") })
    );
    expect(spoofAck).toMatchObject({ ok: false, code: "invalid_payload" });
    expect(await harness.store.listOpsAfter(WORK_ID, 0)).toHaveLength(0);
  });

  it("재시작 hydrate: 스냅샷 영속 후 새 레지스트리에서도 해시·FIFO가 복원된다", async () => {
    const harness = makeHarness({ snapshotDepth: 2 });
    const socketA = harness.socketFor("actor-a");
    const a = new StrokeMergeClient("actor-a");
    await submit(harness, socketA, a, { kind: "add", stroke: strokeInput("s1") });
    await submit(harness, socketA, a, { kind: "add", stroke: strokeInput("s2") });
    await submit(harness, socketA, a, { kind: "remove", strokeId: "s1" });
    const room = await harness.registry.getRoom(WORK_ID);
    await room.persistSnapshot();
    const hashBefore = hashStudioLiveOpState(room.foldedState);

    const registry2 = new StudioLiveOpRoomRegistry(harness.store, { snapshotDepth: 2 });
    const room2 = await registry2.getRoom(WORK_ID);
    expect(hashStudioLiveOpState(room2.foldedState)).toBe(hashBefore);
    expect(room2.lastSeq).toBe(3);
    expect(room2.verifyIncrementalState()).toBe(true);

    // FIFO high-water 복원: actor-a의 다음 카운터(4)가 gap 없이 받아들여진다.
    const harness2: Harness = { ...harness, registry: registry2, host: { ...harness.host, studioLiveOpRooms: registry2 } as unknown as StudioLiveGatewayHost };
    const ack = await submit(harness2, socketA, a, { kind: "restore", strokeId: "s1" });
    expect(ack).toMatchObject({ ok: true, data: { seq: 4, duplicate: false } });
  });

  it("다중 클라이언트 수렴: 방송 중복·셔플에도 전원 해시 = 서버 해시", async () => {
    const harness = makeHarness();
    const actors = ["actor-a", "actor-b", "actor-c"];
    const sockets = actors.map((actor) => harness.socketFor(actor));
    const clients = actors.map((actor) => new StrokeMergeClient(actor));
    const bodies: StrokeOpBody[] = [
      { kind: "add", stroke: strokeInput("s1") },
      { kind: "add", stroke: strokeInput("s2") },
      { kind: "add", stroke: strokeInput("s3") },
      { kind: "remove", strokeId: "s2" },
      {
        kind: "setProps",
        strokeId: "s1",
        patch: { set: { stroke: "#ff0000" }, unset: [] },
        prev: { set: { stroke: "#111111" }, unset: [] },
      },
      { kind: "restore", strokeId: "s2" },
    ];
    for (let round = 0; round < bodies.length; round += 1) {
      const senderIndex = round % actors.length;
      const ack = await submit(
        harness,
        sockets[senderIndex],
        clients[senderIndex],
        bodies[round]
      );
      expect(ack.ok).toBe(true);
    }
    // 방송을 중복·역순으로 섞어 먹여도 코어 수신 규칙(seq 버퍼링)이 수렴시킨다.
    for (let i = 0; i < actors.length; i += 1) {
      const inbox = [...sockets[i].received];
      sockets[i].received.length = 0;
      const shuffled = [...inbox].reverse();
      for (const broadcast of shuffled) clients[i].receive(broadcast.op);
      for (const broadcast of inbox) clients[i].receive(broadcast.op); // 중복
      // 남은 간격은 sync catch-up으로 메운다.
      const catchUp = await sync(harness, sockets[i], clients[i].lastSeq);
      expect(catchUp.ok).toBe(true);
      if (catchUp.ok) {
        for (const op of catchUp.data.ops) clients[i].receive(op);
      }
      expect(hashMergeState(clients[i].authoritativeState())).toBe(await serverHash(harness));
    }
  });
});
