import { describe, expect, it } from "vitest";

import {
  InMemoryStudioLiveOpLogStore,
  STUDIO_OP_ROOM_IDLE_EVICTION_MS,
  StudioLiveOpRoomRegistry,
  type StudioLiveOp,
} from "./studio-live-op";

function makeAddStrokeOp(actorId: string, counter: number, strokeId: string): StudioLiveOp {
  return {
    opId: `${actorId}:${counter}`,
    actorId,
    lamport: counter,
    baseSeq: counter - 1,
    body: {
      kind: "add",
      stroke: {
        id: strokeId,
        pageId: "page-1",
        layerId: "layer-1",
        payload: {
          version: 1,
          type: "draw",
          kind: "freehand",
          mode: "pen",
          stroke: "#111111",
          strokeWidth: 4,
          points: [0, 0, counter * 4, counter * 3],
        },
      },
    },
  };
}

describe("StudioLiveOpRoomRegistry long-session multi-room stability", () => {
  it("trims in-memory op log on persistSnapshot while preserving incremental state parity", async () => {
    const store = new InMemoryStudioLiveOpLogStore();
    const registry = new StudioLiveOpRoomRegistry(store, { snapshotDepth: 10 });
    const room = await registry.getRoom("work-long-1", 1_000);

    for (let index = 1; index <= 25; index += 1) {
      const outcome = await room.submit(
        makeAddStrokeOp("actor-a", index, `stroke-${index}`),
        "user-a",
      );
      expect(outcome.status).toBe("accepted");
    }

    const snap = await room.persistSnapshot();
    expect(snap.seq).toBe(25);
    expect(snap.opIds).toHaveLength(25);
    expect(room.verifyIncrementalState()).toBe(true);

    // Submitting subsequent ops continues seamlessly from the persisted snapshot base.
    const nextOutcome = await room.submit(
      makeAddStrokeOp("actor-a", 26, "stroke-26"),
      "user-a",
    );
    expect(nextOutcome.status).toBe("accepted");
    expect(room.lastSeq).toBe(26);
    expect(room.verifyIncrementalState()).toBe(true);

    // Clients catching up from seq 25 only receive the post-snapshot tail op.
    const delta = room.syncFor(25);
    expect(delta.snapshot).toBeUndefined();
    expect(delta.ops.map((op) => op.seq)).toEqual([26]);
  });

  it("evicts idle rooms across multi-room load while protecting active rooms and clamping NTP clock jumps", async () => {
    const store = new InMemoryStudioLiveOpLogStore();
    const registry = new StudioLiveOpRoomRegistry(store);
    let now = 5_000_000;

    await registry.getRoom("work-active", now);
    await registry.getRoom("work-idle-1", now);
    await registry.getRoom("work-idle-2", now);
    expect(registry.size).toBe(3);

    // Backward NTP clock jump must not falsely evict rooms or stall future eviction.
    now -= 120_000;
    expect(registry.evictIdleRooms(now, STUDIO_OP_ROOM_IDLE_EVICTION_MS, new Set(["work-active"]))).toBe(0);
    expect(registry.size).toBe(3);

    // Advance past idle TTL from the clamped timestamp: idle rooms evict, active room stays loaded.
    now += STUDIO_OP_ROOM_IDLE_EVICTION_MS + 1_000;
    const evicted = registry.evictIdleRooms(
      now,
      STUDIO_OP_ROOM_IDLE_EVICTION_MS,
      new Set(["work-active"]),
    );
    expect(evicted).toBe(2);
    expect(registry.size).toBe(1);
  });
});
