import { describe, expect, it } from "vitest";

import {
  buildLayerOccupancyMessage,
  claimLayerOccupancy,
  deriveLayerOccupant,
  deriveMyLayerConflicts,
  evaluateLayerConflict,
  heartbeatLayerOccupancy,
  layerOccupancyRowState,
  layerOccupantByLayerId,
  leavePageLayerOccupancy,
  mergeLayerOccupancy,
  parseLayerOccupancyMessage,
  pruneLayerOccupancy,
  recordLayerOccupancyInteraction,
  releaseLayerOccupancy,
  summarizeLayerOccupancy,
  type LayerOccupancyActor,
  type LayerOccupancyEntry,
} from "./studio-layer-occupancy";

const T0 = new Date("2026-10-14T00:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1_000);

function entry(overrides: Partial<LayerOccupancyEntry> = {}): LayerOccupancyEntry {
  return {
    pageId: "page-1",
    layerId: "layer-1",
    actorId: "actor-a",
    displayName: "민지",
    claimedAt: T0.toISOString(),
    heartbeatAt: T0.toISOString(),
    lastInteractionAt: T0.toISOString(),
    ...overrides,
  };
}

const actorA: LayerOccupancyActor = {
  pageId: "page-1",
  layerId: "layer-1",
  actorId: "actor-a",
  displayName: "민지",
};
const actorB: LayerOccupancyActor = { ...actorA, actorId: "actor-b", displayName: "준호" };

describe("claimLayerOccupancy", () => {
  it("빈 레이어를 주장하면 점유자가 된다", () => {
    const result = claimLayerOccupancy([], actorA, T0);
    expect(result.claimed).toBe(true);
    expect(result.holder?.actorId).toBe("actor-a");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.claimedAt).toBe(T0.toISOString());
  });

  it("남이 점유 중이면 빼앗지 않고 실패를 돌려준다", () => {
    const mine = claimLayerOccupancy([], actorA, T0).entries;
    const result = claimLayerOccupancy(mine, actorB, at(5));
    expect(result.claimed).toBe(false);
    expect(result.holder?.actorId).toBe("actor-a");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.actorId).toBe("actor-a");
  });

  it("내가 다시 주장하면 claimedAt은 유지하고 상호작용 시각만 갱신한다", () => {
    const mine = claimLayerOccupancy([], actorA, T0).entries;
    const result = claimLayerOccupancy(mine, actorA, at(40));
    expect(result.claimed).toBe(true);
    expect(result.entries[0]?.claimedAt).toBe(T0.toISOString());
    expect(result.entries[0]?.lastInteractionAt).toBe(at(40).toISOString());
    expect(result.entries[0]?.heartbeatAt).toBe(at(40).toISOString());
  });

  it("기존 주장이 만료됐으면 새로 주장할 수 있다", () => {
    const stale = [entry({ heartbeatAt: T0.toISOString() })];
    const result = claimLayerOccupancy(stale, actorB, at(120));
    expect(result.claimed).toBe(true);
    expect(result.holder?.actorId).toBe("actor-b");
    expect(result.entries).toHaveLength(1);
  });

  it("다른 페이지·다른 레이어의 점유와는 간섭하지 않는다", () => {
    const mine = claimLayerOccupancy([], actorA, T0).entries;
    const otherLayer = claimLayerOccupancy(mine, { ...actorB, layerId: "layer-2" }, at(5));
    expect(otherLayer.claimed).toBe(true);
    const otherPage = claimLayerOccupancy(mine, { ...actorB, pageId: "page-2" }, at(5));
    expect(otherPage.claimed).toBe(true);
  });
});

describe("deriveLayerOccupant / 동시 시작 경쟁", () => {
  it("주장이 여럿이면 claimedAt이 가장 이른 사람이 점유자다", () => {
    const entries = [
      entry({ actorId: "actor-b", displayName: "준호", claimedAt: at(3).toISOString(), heartbeatAt: at(3).toISOString() }),
      entry({ claimedAt: T0.toISOString() }),
    ];
    expect(deriveLayerOccupant(entries, "page-1", "layer-1", at(10))?.actorId).toBe("actor-a");
  });

  it("claimedAt이 동시각이면 actorId 순으로 결정된다", () => {
    const entries = [
      entry({ actorId: "actor-b", displayName: "준호" }),
      entry({ actorId: "actor-a" }),
    ];
    expect(deriveLayerOccupant(entries, "page-1", "layer-1", at(10))?.actorId).toBe("actor-a");
  });

  it("만료된 주장은 점유자에서 제외된다", () => {
    const entries = [entry({ heartbeatAt: T0.toISOString() })];
    expect(deriveLayerOccupant(entries, "page-1", "layer-1", at(120))).toBeNull();
  });
});

describe("heartbeat / interaction / release", () => {
  it("하트비트는 claimedAt을 유지한 채 생존만 연장한다", () => {
    const mine = claimLayerOccupancy([], actorA, T0).entries;
    const next = heartbeatLayerOccupancy(mine, actorA, at(30));
    expect(next[0]?.claimedAt).toBe(T0.toISOString());
    expect(next[0]?.heartbeatAt).toBe(at(30).toISOString());
    expect(next[0]?.lastInteractionAt).toBe(T0.toISOString());
    expect(deriveLayerOccupant(next, "page-1", "layer-1", at(100))?.actorId).toBe("actor-a");
  });

  it("하트비트는 없는 주장을 만들지 않는다", () => {
    expect(heartbeatLayerOccupancy([], actorA, T0)).toHaveLength(0);
  });

  it("경쟁에서 진 내 주장은 하트비트 때 걷어낸다", () => {
    const entries = [
      entry({ claimedAt: T0.toISOString(), heartbeatAt: at(10).toISOString() }),
      entry({ actorId: "actor-b", displayName: "준호", claimedAt: at(5).toISOString(), heartbeatAt: at(10).toISOString() }),
    ];
    const next = heartbeatLayerOccupancy(entries, actorB, at(20));
    expect(next.find((e) => e.actorId === "actor-b")).toBeUndefined();
    expect(deriveLayerOccupant(next, "page-1", "layer-1", at(20))?.actorId).toBe("actor-a");
  });

  it("상호작용 기록은 점유자 본인만 갱신하고 남의 것은 바꾸지 않는다", () => {
    const mine = claimLayerOccupancy([], actorA, T0).entries;
    const touched = recordLayerOccupancyInteraction(mine, "page-1", "layer-1", "actor-a", at(50));
    expect(touched[0]?.lastInteractionAt).toBe(at(50).toISOString());
    const notMine = recordLayerOccupancyInteraction(mine, "page-1", "layer-1", "actor-b", at(50));
    expect(notMine).toBe(mine);
  });

  it("해제와 페이지 이탈은 내 주장만 지운다", () => {
    const entries = [
      ...claimLayerOccupancy([], actorA, T0).entries,
      ...claimLayerOccupancy([], { ...actorB, layerId: "layer-2" }, T0).entries,
    ];
    expect(releaseLayerOccupancy(entries, "page-1", "layer-1", "actor-a")).toHaveLength(1);
    const both = [
      ...entries,
      entry({ layerId: "layer-3", actorId: "actor-a" }),
    ];
    const left = leavePageLayerOccupancy(both, "page-1", "actor-a");
    expect(left.every((e) => e.actorId !== "actor-a")).toBe(true);
    expect(left).toHaveLength(1);
  });
});

describe("merge / prune (전송 합류)", () => {
  it("merge는 같은 주장의 최근 하트비트를 이기게 하고 남의 주장은 함께 남긴다", () => {
    const base = claimLayerOccupancy([], actorA, T0).entries;
    const incoming = [
      entry({ heartbeatAt: at(20).toISOString(), lastInteractionAt: at(20).toISOString() }),
      entry({ actorId: "actor-b", displayName: "준호", claimedAt: at(10).toISOString(), heartbeatAt: at(10).toISOString() }),
    ];
    const merged = mergeLayerOccupancy(base, incoming, at(25));
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.actorId === "actor-a")?.heartbeatAt).toBe(at(20).toISOString());
    expect(deriveLayerOccupant(merged, "page-1", "layer-1", at(25))?.actorId).toBe("actor-a");
  });

  it("prune은 (페이지·레이어·사람)당 최신 1개만 남긴다", () => {
    const entries = [
      entry({ heartbeatAt: T0.toISOString() }),
      entry({ heartbeatAt: at(10).toISOString() }),
    ];
    const pruned = pruneLayerOccupancy(entries, at(15));
    expect(pruned).toHaveLength(1);
    expect(pruned[0]?.heartbeatAt).toBe(at(10).toISOString());
  });
});

describe("evaluateLayerConflict / row state", () => {
  it("free·mine·other를 구분하고 other만 금지한다", () => {
    const mine = claimLayerOccupancy([], actorA, T0).entries;
    expect(evaluateLayerConflict([], "page-1", "layer-1", "actor-b", T0)).toMatchObject({ status: "free", allowed: true });
    expect(evaluateLayerConflict(mine, "page-1", "layer-1", "actor-a", at(5))).toMatchObject({ status: "mine", allowed: true });
    const other = evaluateLayerConflict(mine, "page-1", "layer-1", "actor-b", at(5));
    expect(other).toMatchObject({ status: "other", allowed: false });
    expect(other.holder?.displayName).toBe("민지");
  });

  it("행 상태는 점유자 유무와 본인 여부로 도출된다", () => {
    const holder = entry();
    expect(layerOccupancyRowState(null, "actor-a")).toBe("free");
    expect(layerOccupancyRowState(holder, "actor-a")).toBe("mine");
    expect(layerOccupancyRowState(holder, "actor-b")).toBe("other");
    expect(layerOccupancyRowState(holder, null)).toBe("other");
  });
});

describe("summarize / occupant map (패널 표시)", () => {
  it("페이지별로 점유자와 경쟁자를 요약하고 맵은 점유자만 담는다", () => {
    const entries = [
      entry({}),
      entry({ actorId: "actor-b", displayName: "준호", claimedAt: at(5).toISOString(), heartbeatAt: at(5).toISOString() }),
      entry({ layerId: "layer-2", actorId: "actor-b", displayName: "준호" }),
      entry({ pageId: "page-2", layerId: "layer-9", actorId: "actor-b", displayName: "준호" }),
    ];
    const summary = summarizeLayerOccupancy(entries, "page-1", at(10));
    expect(summary.map((s) => s.layerId)).toEqual(["layer-1", "layer-2"]);
    expect(summary[0]?.holder.actorId).toBe("actor-a");
    expect(summary[0]?.contenders.map((c) => c.actorId)).toEqual(["actor-b"]);
    const map = layerOccupantByLayerId(entries, "page-1", at(10));
    expect(map.get("layer-1")?.actorId).toBe("actor-a");
    expect(map.get("layer-2")?.actorId).toBe("actor-b");
    expect(map.has("layer-9")).toBe(false);
  });
});

describe("deriveMyLayerConflicts (내 레이어 충돌 경고)", () => {
  it("내 작업 레이어를 남이 점유하면 taken 경고를 낸다", () => {
    const theirs = claimLayerOccupancy([], actorB, T0).entries;
    const warnings = deriveMyLayerConflicts(theirs, "page-1", ["layer-1"], "actor-a", at(5));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ layerId: "layer-1", kind: "my-layer-taken" });
    expect(warnings[0]?.other.displayName).toBe("준호");
  });

  it("내가 점유자인데 남이 겹쳐 주장하면 contended 경고를 낸다", () => {
    const entries = [
      entry({}),
      entry({ actorId: "actor-b", displayName: "준호", claimedAt: at(5).toISOString(), heartbeatAt: at(5).toISOString() }),
    ];
    const warnings = deriveMyLayerConflicts(entries, "page-1", ["layer-1"], "actor-a", at(10));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("my-layer-contended");
  });

  it("내 작업 맥락 밖 레이어와 겹치지 않으면 경고하지 않는다", () => {
    const theirs = claimLayerOccupancy([], { ...actorB, layerId: "layer-7" }, T0).entries;
    expect(deriveMyLayerConflicts(theirs, "page-1", ["layer-1"], "actor-a", at(5))).toHaveLength(0);
    const mine = claimLayerOccupancy([], actorA, T0).entries;
    expect(deriveMyLayerConflicts(mine, "page-1", ["layer-1"], "actor-a", at(5))).toHaveLength(0);
    expect(deriveMyLayerConflicts(mine, "page-1", [], "actor-a", at(5))).toHaveLength(0);
  });

  it("만료된 남의 점유는 경고하지 않는다", () => {
    const stale = [entry({ actorId: "actor-b", displayName: "준호", heartbeatAt: T0.toISOString() })];
    expect(deriveMyLayerConflicts(stale, "page-1", ["layer-1"], "actor-a", at(200))).toHaveLength(0);
  });
});

describe("parseLayerOccupancyMessage (전송 경계 검증)", () => {
  it("정상 메시지를 왕복한다", () => {
    const entries = claimLayerOccupancy([], actorA, T0).entries;
    const parsed = parseLayerOccupancyMessage(buildLayerOccupancyMessage(entries));
    expect(parsed).toEqual(entries);
    expect(parseLayerOccupancyMessage(entries)).toEqual(entries);
  });

  it("형식이 깨진 항목은 버리고 멀쩡한 항목만 남긴다", () => {
    const parsed = parseLayerOccupancyMessage({
      entries: [
        entry({}),
        { pageId: "page-1" },
        entry({ actorId: "" }),
        entry({ layerId: "layer-2", heartbeatAt: "not-a-date" }),
        "garbage",
        null,
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.layerId).toBe("layer-1");
  });

  it("메시지가 아니면 빈 목록을 돌려준다(throw 없음)", () => {
    expect(parseLayerOccupancyMessage(null)).toEqual([]);
    expect(parseLayerOccupancyMessage(42)).toEqual([]);
    expect(parseLayerOccupancyMessage({ type: "other" })).toEqual([]);
  });

  it("중복 주장은 최근 하트비트만 남긴다", () => {
    const parsed = parseLayerOccupancyMessage([
      entry({ heartbeatAt: at(30).toISOString() }),
      entry({ heartbeatAt: T0.toISOString() }),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.heartbeatAt).toBe(at(30).toISOString());
  });
});
