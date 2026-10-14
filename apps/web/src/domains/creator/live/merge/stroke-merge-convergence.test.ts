/**
 * 병합 엔진 수렴성 시뮬레이션 하네스.
 *
 * 다중 클라이언트가 무작위 op를 만들고, 네트워크가 중복·중복 순서 뒤바뀜·지연·
 * 단절(오프라인)을 섞어 전달해도, 정지(quiescence) 시점에 전 복제본이 서버와
 * 동일한 문서 해시에 도달함을 단언한다. PRNG는 시드 고정 — 실패하면 같은 시드로 재현된다.
 *
 * 실행: vitest (로컬 검증 절차는 폴더 NOTES.md 참조).
 */

import { describe, expect, it } from "vitest";

import { computePropsInverse, currentTransform, hashMergeState } from "./stroke-merge-core";
import { StrokeMergeSequencer } from "./stroke-merge-server";
import { StrokeMergeClient } from "./stroke-merge-sync";
import { StrokeUndoManager } from "./stroke-merge-undo";
import type {
  SequencedStrokeOp,
  StrokeInput,
  StrokeOp,
  StrokeOpBody,
} from "./stroke-merge-types";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimClient {
  client: StrokeMergeClient;
  undo: StrokeUndoManager;
  online: boolean;
  inbox: SequencedStrokeOp[];
  strokeCounter: number;
}

const PAGES = [
  { pageId: "p1", layerId: "l1" },
  { pageId: "p1", layerId: "l2" },
  { pageId: "p2", layerId: "l1" },
];

class World {
  readonly server = new StrokeMergeSequencer({ snapshotDepth: 40 });
  readonly clients: SimClient[] = [];
  readonly knownStrokeIds: string[] = [];
  private readonly rng: () => number;

  constructor(seed: number, clientCount: number) {
    this.rng = mulberry32(seed);
    for (let i = 0; i < clientCount; i += 1) {
      const actorId = `actor-${i}`;
      const client = new StrokeMergeClient(actorId);
      const undo = new StrokeUndoManager({
        state: () => client.state,
        submit: (body) => client.createOp(body),
      });
      this.clients.push({ client, undo, online: true, inbox: [], strokeCounter: 0 });
    }
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length)];
  }

  /** 클라이언트 한 명의 무작위 행동 1회. */
  act(sim: SimClient): void {
    const roll = this.rng();
    const { client } = sim;
    if (roll < 0.34 || this.knownStrokeIds.length === 0) {
      sim.strokeCounter += 1;
      const spot = this.pick(PAGES);
      const input: StrokeInput = {
        id: `${client.actorId}-s${sim.strokeCounter}`,
        pageId: spot.pageId,
        layerId: spot.layerId,
        payload: {
          version: 1,
          type: "draw",
          kind: "pen",
          mode: "pen",
          stroke: "#222222",
          strokeWidth: 2 + Math.floor(this.rng() * 6),
          points: [0, 0, 0.25, 0.25, 0.5, 0.5],
        },
      };
      this.knownStrokeIds.push(input.id);
      const before =
        this.knownStrokeIds.length > 1 && this.rng() < 0.4
          ? this.pick(this.knownStrokeIds)
          : null;
      this.submitUserOp(sim, { kind: "add", stroke: input, beforeStrokeId: before });
      return;
    }
    const targetId = this.pick(this.knownStrokeIds);
    const stroke = client.state.strokes.get(targetId);
    if (roll < 0.5) {
      this.submitUserOp(sim, { kind: "remove", strokeId: targetId });
    } else if (roll < 0.6) {
      this.submitUserOp(sim, { kind: "restore", strokeId: targetId });
    } else if (roll < 0.75) {
      const next = {
        dx: this.rng() / 10,
        dy: this.rng() / 10,
        scale: 1,
        rotation: Math.floor(this.rng() * 90),
      };
      this.submitUserOp(sim, {
        kind: "transform",
        strokeId: targetId,
        transform: next,
        prev: stroke ? currentTransform(stroke.payload) : { dx: 0, dy: 0, scale: 1, rotation: 0 },
      });
    } else if (roll < 0.9) {
      const patch = {
        set: { strokeWidth: 1 + Math.floor(this.rng() * 10) },
        unset: [] as never[],
      };
      this.submitUserOp(sim, {
        kind: "setProps",
        strokeId: targetId,
        patch,
        prev: stroke
          ? computePropsInverse(stroke.payload, patch)
          : { set: {}, unset: [] },
      });
    } else if (roll < 0.95) {
      sim.undo.undo();
    } else {
      sim.undo.redo();
    }
  }

  private submitUserOp(sim: SimClient, body: StrokeOpBody): void {
    const op: StrokeOp = sim.client.createOp(body);
    sim.undo.track(op);
    if (sim.online) this.sendToServer(sim);
  }

  /** pending을 서버로 보내고, 확정분을 온라인 전원의 inbox로 (중복 섞어) 방송한다. */
  sendToServer(sim: SimClient): void {
    for (const op of sim.client.outbox()) {
      const sequenced = this.server.submit(op).op;
      for (const target of this.clients) {
        if (!target.online) continue;
        target.inbox.push(sequenced);
        if (this.rng() < 0.2) target.inbox.push(sequenced); // 중복 전달
      }
    }
  }

  /** inbox를 섞어서 전달한다. 간격이 생기면 catch-up을 요청한다. */
  processInbox(sim: SimClient): void {
    const inbox = sim.inbox.splice(0, sim.inbox.length);
    for (let i = inbox.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [inbox[i], inbox[j]] = [inbox[j], inbox[i]];
    }
    for (const op of inbox) sim.client.receive(op);
    if (sim.client.hasGap) this.catchUp(sim);
  }

  /** 서버와 재동기화: 스냅샷 계획 + 누락분 + 내 미제출분 재전송. */
  catchUp(sim: SimClient): void {
    const plan = this.server.syncFor(sim.client.lastSeq);
    if (plan.snapshot) {
      const covered = new Set(
        this.server.since(0).filter((op) => op.seq <= plan.snapshot!.seq).map((op) => op.opId),
      );
      sim.client.adoptSnapshot(plan.snapshot, covered);
    }
    for (const op of plan.ops) sim.client.receive(op);
    if (sim.online) this.sendToServer(sim);
    for (const op of this.server.since(sim.client.lastSeq)) sim.client.receive(op);
  }

  /** 연결 토글. 다시 온라인이 되면 즉시 재동기화한다. */
  toggleConnection(sim: SimClient): void {
    sim.online = !sim.online;
    if (sim.online) this.catchUp(sim);
  }

  run(actions: number): void {
    for (let i = 0; i < actions; i += 1) {
      const sim = this.pick(this.clients);
      const roll = this.rng();
      if (roll < 0.55) this.act(sim);
      else if (roll < 0.8) this.processInbox(sim);
      else if (roll < 0.9) this.toggleConnection(sim);
      else this.catchUp(sim);
    }
  }

  /** 전원 온라인·전송 완료·수신 완료 상태로 몰아간다. */
  quiesce(): void {
    for (let round = 0; round < 60; round += 1) {
      for (const sim of this.clients) {
        sim.online = true;
        this.catchUp(sim);
        this.processInbox(sim);
      }
      const settled = this.clients.every(
        (sim) =>
          sim.client.pendingCount === 0 &&
          sim.client.lastSeq === this.server.lastSeq &&
          sim.inbox.length === 0,
      );
      if (settled) return;
    }
    throw new Error("quiesce에 도달하지 못했습니다");
  }
}

describe("수렴 시뮬레이션 — 무작위 인터리빙·중복·뒤바뀜·오프라인", () => {
  const seeds = [1, 7, 42, 1337, 20240, 90210];
  for (const seed of seeds) {
    it(`시드 ${seed}: 4개 복제본이 서버와 같은 상태로 수렴한다`, () => {
      const world = new World(seed, 4);
      world.run(320);
      world.quiesce();

      const serverHash = hashMergeState(world.server.foldedState);
      expect(world.server.verifyIncrementalState()).toBe(true);
      for (const sim of world.clients) {
        expect(sim.client.pendingCount).toBe(0);
        expect(sim.client.lastSeq).toBe(world.server.lastSeq);
        expect(hashMergeState(sim.client.authoritativeState())).toBe(serverHash);
        // pending이 비었으므로 화면 상태도 권위 상태와 같다.
        expect(hashMergeState(sim.client.state)).toBe(serverHash);
      }
      // 무언가는 실제로 그려졌어야 한다 (빈 세션 수렴으로 통과하는 것 방지).
      expect(world.server.lastSeq).toBeGreaterThan(40);
    });
  }

  it("대규모 단절 뒤 재접속해도 op를 잃지 않고 수렴한다", () => {
    const world = new World(555, 3);
    const [a, b, c] = world.clients;
    world.run(60);
    // B와 C를 길게 단절시키고 A만 계속 작업한다.
    b.online = false;
    c.online = false;
    for (let i = 0; i < 60; i += 1) world.act(a);
    // 단절된 둘도 각자 오프라인으로 그린다.
    for (let i = 0; i < 25; i += 1) world.act(b);
    for (let i = 0; i < 25; i += 1) world.act(c);
    world.quiesce();

    const serverHash = hashMergeState(world.server.foldedState);
    for (const sim of world.clients) {
      expect(hashMergeState(sim.client.state)).toBe(serverHash);
    }
    // 오프라인 op가 보존됐는지는 서버 로그 총량으로 확인한다:
    // 각 act의 상당수가 op를 만들므로, 단절 구간의 작업이 유실됐다면 도달할 수 없는 하한.
    expect(world.server.lastSeq).toBeGreaterThan(80);
  });

  it("삭제와 변형이 같은 스트로크에서 경합해도 전 복제본 판정이 같다", () => {
    const world = new World(777, 4);
    // 전원이 같은 스트로크를 동시에 지우고·되살리고·변형하는 상황을 강제한다.
    const seedClient = world.clients[0];
    const input: StrokeInput = {
      id: "contested",
      pageId: "p1",
      layerId: "l1",
      payload: {
        version: 1,
        type: "draw",
        kind: "pen",
        mode: "pen",
        stroke: "#333333",
        strokeWidth: 4,
        points: [0, 0, 1, 1],
      },
    };
    world.knownStrokeIds.push("contested");
    seedClient.client.createOp({ kind: "add", stroke: input });
    world.sendToServer(seedClient);
    world.quiesce();

    for (let i = 0; i < 80; i += 1) {
      const sim = world.clients[i % world.clients.length];
      const body: StrokeOpBody =
        i % 3 === 0
          ? { kind: "remove", strokeId: "contested" }
          : i % 3 === 1
            ? { kind: "restore", strokeId: "contested" }
            : {
                kind: "transform",
                strokeId: "contested",
                transform: { dx: i / 100, dy: 0, scale: 1, rotation: i },
                prev: { dx: 0, dy: 0, scale: 1, rotation: 0 },
              };
      sim.client.createOp(body);
      if (sim.online) world.sendToServer(sim);
      if (i % 5 === 0) world.processInbox(world.clients[(i + 1) % world.clients.length]);
    }
    world.quiesce();

    const serverState = world.server.foldedState;
    const serverHash = hashMergeState(serverState);
    for (const sim of world.clients) {
      expect(hashMergeState(sim.client.state)).toBe(serverHash);
    }
  });
});
