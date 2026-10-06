import { describe, expect, it } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import type { StudioBuildPlacementRequest } from "./studio-virtual-space-build-mode";
import {
  parseStudioVirtualSpacePacket,
  STUDIO_VIRTUAL_SPACE_FIXTURES_PACKET_MAX_BYTES,
  STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES,
  STUDIO_VIRTUAL_SPACE_WIRE,
  StudioVirtualSpacePresenceController,
} from "./studio-virtual-space-presence";
import { mergeStudioPeerPlacedFixtures } from "./studio-virtual-space-peer-fixtures";

function participant(sessionId: string, displayName: string): StudioLiveParticipant {
  return { sessionId, displayName, role: "editor" };
}

function request(refId: string, x: number, y: number): StudioBuildPlacementRequest {
  return { entryId: `furniture:${refId}`, category: "furniture", refId, point: { x, y }, rotation: 0 };
}

/** 두세 컨트롤러를 직접 연결하는 가짜 포트. send 즉시 상대에게 전달하고 리스너도 노출한다. */
function createLinkedPorts(participants: StudioLiveParticipant[]) {
  const listeners = new Map<string, (sender: StudioLiveParticipant, raw: string) => void>();
  const portFor = (self: StudioLiveParticipant): StudioLiveDirectPort => ({
    getPeers: () => participants,
    send: (targetSessionId: string, payload: string) => {
      listeners.get(targetSessionId)?.(self, payload);
      return true;
    },
    subscribe: (listener: (sender: StudioLiveParticipant, raw: string) => void) => {
      listeners.set(self.sessionId, listener);
      return () => {
        listeners.delete(self.sessionId);
      };
    },
  });
  return { portFor, listeners };
}

function createClock() {
  const now = 1_700_000_000_000;
  const handlers: (() => void)[] = [];
  return {
    now: () => now,
    tick: () => {
      for (const handler of [...handlers]) handler();
    },
    dependencies: {
      now: () => now,
      setInterval: (handler: () => void) => {
        handlers.push(handler);
        return handlers.length;
      },
      clearInterval: () => undefined,
    },
  };
}

function fixturesPacket(sequence: number, fixtures: unknown): string {
  return JSON.stringify({
    wire: STUDIO_VIRTUAL_SPACE_WIRE,
    kind: "fixtures",
    sequence,
    at: 1_700_000_000_000,
    fixtures,
  });
}

describe("배치 가구 전파 (fixtures 패킷)", () => {
  it("A의 배치가 B의 스냅샷에 실리고 합성하면 B 화면에 상대 가구가 생긴다", () => {
    const clock = createClock();
    const a = participant("session-a", "A");
    const b = participant("session-b", "B");
    const { portFor } = createLinkedPorts([a, b]);
    const controllerA = new StudioVirtualSpacePresenceController(a, portFor(a), { x: 100, y: 100 }, clock.dependencies);
    const controllerB = new StudioVirtualSpacePresenceController(b, portFor(b), { x: 200, y: 200 }, clock.dependencies);
    controllerA.start();
    controllerB.start();

    controllerA.setPlacedFixtures([request("floor-lamp", 320, 416)]);

    const peerFixtures = controllerB.snapshot().peerFixtures;
    expect(peerFixtures).toHaveLength(1);
    expect(peerFixtures[0]?.sessionId).toBe("session-a");
    expect(peerFixtures[0]?.requests).toEqual([request("floor-lamp", 320, 416)]);
    const merged = mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-b",
      localRequests: [],
      peerSets: peerFixtures,
    });
    expect(merged.map((owned) => owned.fixture.objectId)).toEqual(["build:floor-lamp@320,416"]);
    expect(merged[0]?.own).toBe(false);

    // 목록을 비우면 상대 스냅샷도 빈 목록으로 수렴한다.
    controllerA.setPlacedFixtures([]);
    expect(controllerB.snapshot().peerFixtures[0]?.requests).toEqual([]);
    controllerA.close();
    controllerB.close();
  });

  it("늦게 합류한 피어에게도 tick이 현재 배치 목록을 보낸다", () => {
    const clock = createClock();
    const a = participant("session-a", "A");
    const b = participant("session-b", "B");
    const participants = [a];
    const { portFor } = createLinkedPorts(participants);
    const controllerA = new StudioVirtualSpacePresenceController(a, portFor(a), { x: 100, y: 100 }, clock.dependencies);
    controllerA.start();
    controllerA.setPlacedFixtures([request("whiteboard", 512, 256)]);

    participants.push(b);
    const controllerB = new StudioVirtualSpacePresenceController(b, portFor(b), { x: 200, y: 200 }, clock.dependencies);
    controllerB.start();
    expect(controllerB.snapshot().peerFixtures).toEqual([]);
    clock.tick();
    expect(controllerB.snapshot().peerFixtures[0]?.requests).toEqual([request("whiteboard", 512, 256)]);
    controllerA.close();
    controllerB.close();
  });

  it("A가 나가면 B의 스냅샷에서 A의 배치 목록이 정리된다", () => {
    const clock = createClock();
    const a = participant("session-a", "A");
    const b = participant("session-b", "B");
    const { portFor } = createLinkedPorts([a, b]);
    const controllerA = new StudioVirtualSpacePresenceController(a, portFor(a), { x: 100, y: 100 }, clock.dependencies);
    const controllerB = new StudioVirtualSpacePresenceController(b, portFor(b), { x: 200, y: 200 }, clock.dependencies);
    controllerA.start();
    controllerB.start();
    controllerA.setPlacedFixtures([request("floor-lamp", 320, 416)]);
    expect(controllerB.snapshot().peerFixtures).toHaveLength(1);

    controllerA.close();
    expect(controllerB.snapshot().peerFixtures).toEqual([]);
    controllerB.close();
  });

  it("배치를 보내지 않는 구버전 피어가 섞여도 스냅샷은 깨지지 않는다", () => {
    const clock = createClock();
    const a = participant("session-a", "A");
    const b = participant("session-b", "B");
    const { portFor } = createLinkedPorts([a, b]);
    const controllerA = new StudioVirtualSpacePresenceController(a, portFor(a), { x: 100, y: 100 }, clock.dependencies);
    const controllerB = new StudioVirtualSpacePresenceController(b, portFor(b), { x: 200, y: 200 }, clock.dependencies);
    controllerA.start();
    controllerB.start();
    // B는 fixtures를 한 번도 보내지 않는다(구버전 클라이언트).
    expect(controllerA.snapshot().peerFixtures).toEqual([]);
    expect(controllerA.snapshot().peers.map((peer) => peer.participant.sessionId)).toEqual(["session-b"]);
    controllerA.close();
    controllerB.close();
  });

  it("오래된 순서의 fixtures 패킷은 최신 목록을 덮지 못하고, 모르는 항목은 살균에서 버려진다", () => {
    const clock = createClock();
    const a = participant("session-a", "A");
    const b = participant("session-b", "B");
    const { portFor, listeners } = createLinkedPorts([a, b]);
    const controllerB = new StudioVirtualSpacePresenceController(b, portFor(b), { x: 200, y: 200 }, clock.dependencies);
    controllerB.start();
    const deliverToB = listeners.get("session-b");
    if (!deliverToB) throw new Error("B 리스너가 등록돼야 한다");

    deliverToB(a, fixturesPacket(100, [["furniture:floor-lamp", 320, 416, 0], ["furniture:nope", 1, 1, 0]]));
    expect(controllerB.snapshot().peerFixtures[0]?.requests).toEqual([request("floor-lamp", 320, 416)]);
    deliverToB(a, fixturesPacket(50, [["furniture:whiteboard", 512, 256, 0]]));
    expect(controllerB.snapshot().peerFixtures[0]?.requests).toEqual([request("floor-lamp", 320, 416)]);
    deliverToB(a, fixturesPacket(150, [["furniture:whiteboard", 512, 256, 0]]));
    expect(controllerB.snapshot().peerFixtures[0]?.requests).toEqual([request("whiteboard", 512, 256)]);
    controllerB.close();
  });
});

describe("fixtures 패킷 파싱 경계", () => {
  it("fixtures 패킷이 왕복하고, 다른 kind에는 기존 바이트 상한이 유지된다", () => {
    const parsed = parseStudioVirtualSpacePacket(fixturesPacket(3, [["furniture:floor-lamp", 320, 416, 0]]));
    expect(parsed?.kind).toBe("fixtures");
    if (parsed?.kind !== "fixtures") throw new Error("fixtures 패킷이어야 한다");
    expect(parsed.fixtures).toEqual([["furniture:floor-lamp", 320, 416, 0]]);

    const bigPresence = JSON.stringify({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "presence",
      sequence: 1,
      at: 1_700_000_000_000,
      state: {
        x: 1, y: 2, zoneId: "lobby", facing: "down", activity: "available",
        moving: false, avatarIndex: -1, bubble: "가".repeat(STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES),
      },
    });
    expect(parseStudioVirtualSpacePacket(bigPresence)).toBeNull();

    const oversized = fixturesPacket(3, Array.from({ length: 24 }, (_, i) => [`furniture:floor-lamp-extra-long-${i}`, 100, 100, 0]));
    expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES);
    expect(new TextEncoder().encode(oversized).byteLength).toBeLessThanOrEqual(STUDIO_VIRTUAL_SPACE_FIXTURES_PACKET_MAX_BYTES);
    expect(parseStudioVirtualSpacePacket(oversized)?.kind).toBe("fixtures");
    const tooBig = fixturesPacket(3, [["furniture:floor-lamp", 100, 100, 0]])
      .replace("]", `${" ".repeat(STUDIO_VIRTUAL_SPACE_FIXTURES_PACKET_MAX_BYTES)}]`);
    expect(parseStudioVirtualSpacePacket(tooBig)).toBeNull();
  });

  it("모양이 틀린 항목은 항목만 버려지고, 배열이 아니면 패킷째 버려진다", () => {
    const parsed = parseStudioVirtualSpacePacket(fixturesPacket(3, [
      ["furniture:floor-lamp", 320, 416, 0],
      ["furniture:floor-lamp", 320],
      ["furniture:floor-lamp", 320, 416, 45],
      [42, 320, 416, 0],
    ]));
    expect(parsed?.kind).toBe("fixtures");
    if (parsed?.kind !== "fixtures") throw new Error("fixtures 패킷이어야 한다");
    expect(parsed.fixtures).toEqual([["furniture:floor-lamp", 320, 416, 0]]);
    expect(parseStudioVirtualSpacePacket(fixturesPacket(3, "nope"))).toBeNull();
    expect(parseStudioVirtualSpacePacket(fixturesPacket(3,
      Array.from({ length: 25 }, () => ["furniture:floor-lamp", 1, 1, 0])))).toBeNull();
  });
});
