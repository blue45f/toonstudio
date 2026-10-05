import { describe, expect, it } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS,
  STUDIO_VIRTUAL_SPACE_STALE_MS,
  StudioVirtualSpacePresenceController,
} from "./studio-virtual-space-presence";

/**
 * 동시접속 지원 수준(2명 기준)의 생애주기 검증.
 *
 * 지원 수준은 1:1 협업 규모로 고정한다(2026-10-06 사용자 확정 — 이 VM의
 * 자원 제약으로 다인 동시 테스트가 불가능해 검증 가능한 2명으로 못 박음).
 * 그래서 다인 부하가 아니라 "두 명이 서로를 보고, 움직임을 따라가고,
 * 정상 퇴장과 비정상 단절이 모두 조용히 깨지지 않는 것"을 검증한다.
 */

function participant(sessionId: string, displayName: string): StudioLiveParticipant {
  return { sessionId, displayName, role: "editor" };
}

/** 두 컨트롤러를 직접 연결하는 가짜 포트. send 즉시 상대에게 전달한다. */
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
  return { portFor };
}

function createClock() {
  let now = 1_700_000_000_000;
  const handlers: (() => void)[] = [];
  return {
    advance: (ms: number) => {
      now += ms;
    },
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

function createPair() {
  const clock = createClock();
  const alpha = participant("peer-a", "작가A");
  const beta = participant("peer-b", "작가B");
  const { portFor } = createLinkedPorts([alpha, beta]);
  const a = new StudioVirtualSpacePresenceController(alpha, portFor(alpha), { x: 100, y: 120 }, clock.dependencies);
  const b = new StudioVirtualSpacePresenceController(beta, portFor(beta), { x: 640, y: 480 }, clock.dependencies);
  a.start();
  b.start();
  // 하트비트 주기가 지나면 서로의 존재를 확정한다.
  clock.advance(STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS + 100);
  clock.tick();
  return { clock, a, b };
}

describe("프레즌스 2명 생애주기", () => {
  it("두 명이 서로를 발견하고 초기 위치를 교환한다", () => {
    const { a, b } = createPair();
    const aPeers = a.snapshot().peers;
    const bPeers = b.snapshot().peers;
    expect(aPeers).toHaveLength(1);
    expect(aPeers[0]?.participant.sessionId).toBe("peer-b");
    expect(aPeers[0]?.state).toMatchObject({ x: 640, y: 480 });
    expect(bPeers).toHaveLength(1);
    expect(bPeers[0]?.participant.sessionId).toBe("peer-a");
    expect(bPeers[0]?.state).toMatchObject({ x: 100, y: 120 });
  });

  it("한쪽이 이동하면 상대 스냅샷의 위치가 따라간다(양방향)", () => {
    const { clock, a, b } = createPair();
    a.update({ x: 300, y: 260 });
    clock.tick();
    expect(b.snapshot().peers[0]?.state).toMatchObject({ x: 300, y: 260 });

    b.update({ x: 512, y: 128 });
    clock.tick();
    expect(a.snapshot().peers[0]?.state).toMatchObject({ x: 512, y: 128 });
  });

  it("하트비트가 이어지는 동안에는 시간이 흘러도 서로를 유지한다", () => {
    const { clock, a, b } = createPair();
    for (let elapsed = 0; elapsed < 60_000; elapsed += 1_000) {
      clock.advance(1_000);
      clock.tick();
    }
    expect(a.snapshot().peers).toHaveLength(1);
    expect(b.snapshot().peers).toHaveLength(1);
  });

  it("정상 퇴장(close)하면 상대 목록에서 즉시 사라진다", () => {
    const { a, b } = createPair();
    a.close();
    expect(b.snapshot().peers).toHaveLength(0);
    // 퇴장한 쪽은 자기 피어 목록도 비운다.
    expect(a.snapshot().peers).toHaveLength(0);
  });

  it("상대 송신이 끊기면 stale 경계 안에서 유지되고 경과 후에 제거된다", () => {
    // 얼어붙은 쪽 전용 시계: tick을 돌리지 않으면 하트비트도 나가지 않는다.
    const frozenClock = createClock();
    const liveClock = createClock();
    const alpha = participant("peer-a", "작가A");
    const beta = participant("peer-b", "작가B");
    const { portFor } = createLinkedPorts([alpha, beta]);
    const a = new StudioVirtualSpacePresenceController(alpha, portFor(alpha), { x: 100, y: 120 }, frozenClock.dependencies);
    const b = new StudioVirtualSpacePresenceController(beta, portFor(beta), { x: 640, y: 480 }, liveClock.dependencies);
    a.start();
    b.start();
    // 발견 단계: 양쪽 시계를 함께 굴려 서로를 확정한다.
    frozenClock.advance(STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS + 100);
    liveClock.advance(STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS + 100);
    frozenClock.tick();
    liveClock.tick();
    expect(b.snapshot().peers).toHaveLength(1);

    // 이후 A는 얼어붙는다(frozenClock을 더 돌리지 않는다). B만 시간이 흐른다.
    // 경계 안: 아직 제거하지 않는다.
    liveClock.advance(STUDIO_VIRTUAL_SPACE_STALE_MS - 1_000);
    liveClock.tick();
    expect(b.snapshot().peers).toHaveLength(1);

    // 경계 경과: 조용히 남기지 않고 목록에서 거둔다.
    liveClock.advance(2_000);
    liveClock.tick();
    expect(b.snapshot().peers).toHaveLength(0);
  });
});
