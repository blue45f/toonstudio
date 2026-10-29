import { describe, expect, it, vi } from "vitest";
import {
  StudioThreeActorLifetimes,
  StudioThreeProximityPublication,
  StudioThreeRuntimePublication,
} from "./studio-virtual-space-three-runtime-policy";

const interaction = {
  id: "desk", zoneId: "room", point: { x: 1, y: 2 }, radius: 80,
  labelKo: "작업대", labelEn: "Desk", action: "canvas",
};
const npcBody = { id: "helper" };
const npc = {
  id: "helper", npc: npcBody, labelKo: "도우미", labelEn: "Helper", activityKo: "대기",
  activityEn: "Idle", skinKey: "helper", distance: 100, interaction,
};

describe("3D 근접 HUD 발행", () => {
  it("빈 상태를 한 번 알리고 같은 null/빈 배열을 시간마다 재발행하지 않는다", () => {
    const callbacks = { interaction: vi.fn(), npcs: vi.fn() };
    const publisher = new StudioThreeProximityPublication(callbacks);
    for (let index = 0; index < 6; index += 1) publisher.sample(null, []);
    expect(callbacks.interaction.mock.calls).toEqual([[null]]);
    expect(callbacks.npcs.mock.calls).toEqual([[[]]]);
  });

  it("소수 거리·새 객체만의 변화는 억제하지만 대상·카드 변경과 이탈은 즉시 발행한다", () => {
    const callbacks = { interaction: vi.fn(), npcs: vi.fn() };
    const publisher = new StudioThreeProximityPublication<typeof interaction, typeof npc>(callbacks);
    publisher.sample(interaction, [npc]);
    publisher.sample({ ...interaction }, [{ ...npc, npc: { ...npcBody }, distance: 99.9 }]);
    expect(callbacks.interaction).toHaveBeenCalledTimes(1);
    expect(callbacks.npcs).toHaveBeenCalledTimes(1);
    publisher.sample(null, []);
    expect(callbacks.interaction).toHaveBeenCalledTimes(2);
    expect(callbacks.interaction.mock.calls.at(-1)).toEqual([null]);
    expect(callbacks.npcs.mock.calls.at(-1)).toEqual([[]]);
    publisher.sample(null, []);
    expect(callbacks.interaction).toHaveBeenCalledTimes(2);
    publisher.sample(interaction, [{ ...npc, labelKo: "새 이름" }]);
    expect(callbacks.npcs.mock.calls.at(-1)?.[0][0]).toMatchObject({ labelKo: "새 이름" });
  });

  it("프롬프트 우선순위인 NPC 순서와 interaction 내용 변경을 놓치지 않는다", () => {
    const callbacks = { interaction: vi.fn(), npcs: vi.fn() };
    const publisher = new StudioThreeProximityPublication<typeof interaction, typeof npc>(callbacks);
    const other = { ...npc, id: "other" };
    publisher.sample(interaction, [npc, other]);
    publisher.sample(interaction, [other, npc]);
    expect(callbacks.npcs).toHaveBeenCalledTimes(2);
    publisher.sample({ ...interaction, radius: 90 }, [other, npc]);
    expect(callbacks.interaction).toHaveBeenCalledTimes(2);
  });
});

const counters = {
  qualityTier: "ultra" as const, peerCount: 0, visiblePeerCount: 0, npcCount: 1,
  visibleNpcCount: 1, routeWaypoints: 0, failedTextures: 0,
};

describe("3D 실제 rAF 간격 발행", () => {
  it("측정 구간 없이 0 FPS를 발행하지 않고 실제 50Hz 간격을 보고한다", () => {
    const publish = vi.fn();
    const readCounters = vi.fn(() => counters);
    const metrics = new StudioThreeRuntimePublication(publish, readCounters);
    metrics.frame(0);
    metrics.frame(Number.NaN);
    expect(publish).not.toHaveBeenCalled();
    expect(readCounters).not.toHaveBeenCalled();
    for (let frame = 1; frame <= 50; frame += 1) metrics.frame(frame * 20);
    expect(publish).toHaveBeenCalledWith({ ...counters, fps: 50, frameTimeMs: 20, updatedAt: 1_000 });
    expect(readCounters).toHaveBeenCalledTimes(1);
    for (let frame = 51; frame <= 100; frame += 1) metrics.frame(frame * 20);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("클램프한 물리 dt가 아니라 긴 프레임 간격을 포함하며 count 변경도 발행한다", () => {
    const publish = vi.fn();
    let snapshot = counters;
    const metrics = new StudioThreeRuntimePublication(publish, () => snapshot);
    metrics.frame(0);
    metrics.frame(1_000);
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ fps: 1, frameTimeMs: 1_000 });
    snapshot = { ...counters, peerCount: 1, visiblePeerCount: 1 };
    metrics.frame(2_000);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]?.[0]).toMatchObject({ peerCount: 1, visiblePeerCount: 1 });
  });
});

describe("3D actor 비동기 수명", () => {
  it("퇴장 peer만 해제하고 self/NPC와 현재 peer를 유지한다", () => {
    const self = {}, helper = {}, peerA = {}, peerB = {};
    const actors = new Map([["self", self], ["helper", helper], ["peer:a", peerA], ["peer:b", peerB]]);
    const release = vi.fn();
    const lifetime = new StudioThreeActorLifetimes(actors, release);
    const pending = lifetime.begin("peer:b");
    if (!pending) throw new Error("로드 ticket 생성 실패");
    lifetime.prunePeers(new Set(["peer:a"]));
    expect(release.mock.calls).toEqual([[peerB]]);
    expect([...actors.keys()]).toEqual(["self", "helper", "peer:a"]);
    expect(lifetime.isCurrent(pending)).toBe(false);
    lifetime.prunePeers(new Set(["peer:a"]));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("같은 ID로 재입장해도 이전 VRM 응답은 새 actor를 갱신할 수 없다", () => {
    const actors = new Map([["peer:a", {}]]);
    const lifetime = new StudioThreeActorLifetimes(actors, vi.fn());
    const old = lifetime.begin("peer:a");
    if (!old) throw new Error("옛 ticket 생성 실패");
    lifetime.prunePeers(new Set());
    const replacement = {};
    actors.set("peer:a", replacement);
    const current = lifetime.begin("peer:a");
    if (!current) throw new Error("새 ticket 생성 실패");
    expect(lifetime.isCurrent(old)).toBe(false);
    expect(lifetime.isCurrent(current)).toBe(true);
    expect(current.actor).toBe(replacement);
  });

  it("같은 actor의 새 아바타 요청이 먼저 완료돼도 옛 응답과 dispose 이후 응답을 거부한다", () => {
    const actors = new Map([["self", {}]]);
    const release = vi.fn();
    const lifetime = new StudioThreeActorLifetimes(actors, release);
    const first = lifetime.begin("self"), second = lifetime.begin("self");
    if (!first || !second) throw new Error("ticket 생성 실패");
    expect(lifetime.isCurrent(first)).toBe(false);
    expect(lifetime.isCurrent(second)).toBe(true);
    lifetime.dispose();
    expect(lifetime.isCurrent(second)).toBe(false);
    expect(lifetime.begin("self")).toBeNull();
    lifetime.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    expect(actors.size).toBe(0);
  });

  it("한 actor 해제 실패가 나머지 actor 해제와 ticket 폐기를 막지 않는다", () => {
    const a = {}, b = {};
    const actors = new Map([["peer:a", a], ["peer:b", b]]);
    const release = vi.fn((actor: object) => { if (actor === a) throw new Error("release failed"); });
    const lifetime = new StudioThreeActorLifetimes(actors, release);
    expect(() => lifetime.dispose()).toThrow(AggregateError);
    expect(release).toHaveBeenCalledTimes(2);
    expect(actors.size).toBe(0);
  });
});
