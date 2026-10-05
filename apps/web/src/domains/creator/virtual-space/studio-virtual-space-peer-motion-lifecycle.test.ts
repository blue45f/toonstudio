import { describe, expect, it } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { CAMPUS_INTERACTIONS, CAMPUS_OBJECTS } from "./studio-virtual-space-campus-blueprint";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import { STUDIO_COFFEE_BREW_MS } from "./studio-virtual-space-interactable-objects";
import {
  StudioInteractionFxRuntime,
  type StudioInteractionFxCallbacks,
} from "./studio-virtual-space-interaction-fx";
import { peerImpactOffsetAt } from "./studio-virtual-space-peer-motion";
import {
  STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS,
  StudioVirtualSpacePresenceController,
} from "./studio-virtual-space-presence";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

/**
 * 피어 모션 전파 2명 생애주기 (VS 120 웨이브 3).
 *
 * 동시접속 지원 수준(2명 기준)에서 "입장 → 반발 목격 → 오브젝트 반응 목격 → 퇴장"이
 * 한 흐름으로 닫히는지 검증한다. 배선 모양은 실제 페이지·캔버스와 같다:
 * fx 런타임의 onObjectStateChange → 컨트롤러 sendObjectState → 상대 컨트롤러
 * 스냅샷 objectStates → 상대 fx 런타임 applyRemoteObjectState.
 */

function participant(sessionId: string, displayName: string): StudioLiveParticipant {
  return { sessionId, displayName, role: "editor" };
}

type Listener = (sender: StudioLiveParticipant, raw: string) => void;

/** 두 컨트롤러를 직접 연결하고, 보낸 원문과 리스너를 테스트가 쥐는 가짜 포트. */
function createLinkedPorts(participants: StudioLiveParticipant[]) {
  const listeners = new Map<string, Listener>();
  const sent: { readonly from: StudioLiveParticipant; readonly to: string; readonly raw: string }[] = [];
  const portFor = (self: StudioLiveParticipant): StudioLiveDirectPort => ({
    getPeers: () => participants,
    send: (targetSessionId: string, payload: string) => {
      sent.push({ from: self, to: targetSessionId, raw: payload });
      listeners.get(targetSessionId)?.(self, payload);
      return true;
    },
    subscribe: (listener: Listener) => {
      listeners.set(self.sessionId, listener);
      return () => {
        listeners.delete(self.sessionId);
      };
    },
  });
  return { portFor, sent, listeners };
}

function createClock() {
  let now = 1_700_000_000_000;
  const handlers: (() => void)[] = [];
  return {
    now: () => now,
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

/* --- interaction-fx용 가짜 장면 (interaction-fx.test.ts와 같은 방식) --- */

interface FakeObject {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  readonly calls: string[];
}

function fakeObject(): FakeObject & Record<string, unknown> {
  const state: FakeObject = { visible: true, x: 0, y: 0, text: "", calls: [] };
  const proxy: FakeObject & Record<string, unknown> = new Proxy(state as FakeObject & Record<string, unknown>, {
    get(target, property) {
      if (typeof property !== "string") return undefined;
      if (property in target) return target[property as keyof FakeObject];
      return (...args: unknown[]) => {
        target.calls.push(property);
        if (property === "setVisible") target.visible = Boolean(args[0]);
        if (property === "setPosition") { target.x = Number(args[0]); target.y = Number(args[1]); }
        if (property === "setText") target.text = String(args[0]);
        return proxy;
      };
    },
  });
  return proxy;
}

function fakeScene() {
  const graphics: FakeObject[] = [];
  const images: FakeObject[] = [];
  const texts: FakeObject[] = [];
  const scene = {
    textures: { exists: () => true },
    make: { graphics: () => fakeObject() },
    add: {
      graphics: () => { const object = fakeObject(); graphics.push(object); return object; },
      image: () => { const object = fakeObject(); images.push(object); return object; },
      text: (_x: number, _y: number, value: string) => { const object = fakeObject(); object.text = value; texts.push(object); return object; },
    },
  };
  return { scene, graphics, images, texts };
}

const VIEW = { x: 0, y: 0, width: 3_200, height: 2_000 };
const COUNTER_ID = "campus-creator-cafe-counter";
const counter = CAMPUS_INTERACTIONS.find((interaction) => interaction.id === COUNTER_ID) as StudioWorldInteractionDefinition;

function fxRuntime(onObjectStateChange?: StudioInteractionFxCallbacks["onObjectStateChange"]) {
  const fake = fakeScene();
  const events: StudioSpaceUiEvent[] = [];
  const lines: string[] = [];
  const emotes: string[] = [];
  const runtime = new StudioInteractionFxRuntime(
    fake.scene as unknown as ConstructorParameters<typeof StudioInteractionFxRuntime>[0],
    CAMPUS_INTERACTIONS as readonly StudioWorldInteractionDefinition[],
    { style: "sky-island", objects: CAMPUS_OBJECTS, badge: { plate: 0x0b101d, text: 0xf1f4ff, accent: 0xb39bff }, translate: (ko) => ko },
    {
      npcSay: (_point, _radius, ko) => { lines.push(ko); },
      selfEmote: (emote) => { emotes.push(emote); },
      notify: (event) => { events.push(event); },
      ...(onObjectStateChange ? { onObjectStateChange } : {}),
    },
  );
  return { runtime, events, lines, emotes, ...fake };
}

function fxFrame(runtime: StudioInteractionFxRuntime, time: number, self: { x: number; y: number }) {
  runtime.beginFrame(time, VIEW, false, 1);
  runtime.endFrame(self, false);
}

/** 캔버스 syncSnapshot과 같은 모양의 수신 적용: 바뀐 상태만 fx 런타임에 넣는다. */
function syncObjectStates(
  controller: StudioVirtualSpacePresenceController,
  runtime: StudioInteractionFxRuntime,
  applied: Map<string, number>,
) {
  for (const state of controller.snapshot().objectStates) {
    if (applied.get(state.objectId) === state.stateChangedAt) continue;
    applied.set(state.objectId, state.stateChangedAt);
    runtime.applyRemoteObjectState(state.objectId, state.stateKey, state.stateChangedAt);
  }
}

function createPair() {
  const clock = createClock();
  const alpha = participant("peer-a", "작가A");
  const beta = participant("peer-b", "작가B");
  const linked = createLinkedPorts([alpha, beta]);
  const a = new StudioVirtualSpacePresenceController(alpha, linked.portFor(alpha), { x: 100, y: 120 }, clock.dependencies);
  const b = new StudioVirtualSpacePresenceController(beta, linked.portFor(beta), { x: 640, y: 480 }, clock.dependencies);
  a.start();
  b.start();
  clock.advance(STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS + 100);
  clock.tick();
  return { clock, alpha, beta, a, b, ...linked };
}

describe("피어 모션 전파 2명 생애주기", () => {
  it("입장 → 반발 목격 → 커피 반응 목격 → 퇴장까지 닫힌다", () => {
    const { clock, a, b } = createPair();
    // 입장: 서로를 발견한 상태다.
    expect(a.snapshot().peers).toHaveLength(1);
    expect(b.snapshot().peers).toHaveLength(1);

    // 반발 목격: A가 벽에 부딪힌 속도가 B에게 닿고, 재생 오프셋이 방향을 따른다.
    a.sendImpact(-120, 24);
    const impact = b.snapshot().peerImpacts[0];
    expect(impact).toMatchObject({ sessionId: "peer-a", vx: -120, vy: 24 });
    if (!impact) throw new Error("impact가 있어야 한다");
    const offset = peerImpactOffsetAt(impact.vx, impact.vy, 60);
    expect(offset.x).toBeLessThan(0);
    expect(offset.y).toBeGreaterThan(0);

    // 반응 목격: A가 커피를 주문하면 B의 같은 머신이 부수효과 없이 추출 중이 된다.
    const fxA = fxRuntime((change) => { a.sendObjectState(change.objectId, change.stateKey, change.stateChangedAt); });
    const fxB = fxRuntime();
    const appliedByB = new Map<string, number>();
    const nearCounter = { x: 2690, y: 340 };
    fxA.runtime.activate(counter, nearCounter, clock.now(), false);
    expect(b.snapshot().objectStates).toMatchObject([
      { objectId: COUNTER_ID, stateKey: "coffee:brewing", senderSessionId: "peer-a" },
    ]);
    syncObjectStates(b, fxB.runtime, appliedByB);
    expect(fxB.runtime.objectStateKey(COUNTER_ID)).toBe("coffee:brewing");
    expect(fxB.runtime.promptLabel(counter).ko).toBe("추출 중… · 카페 카운터");
    expect(fxB.lines).toEqual([]);
    expect(fxB.events.filter((event) => event.titleKo.includes("커피"))).toEqual([]);

    // 추출이 끝나면(A는 멀리 가 있다) B의 머신에도 완성 배지가 붙고, 손에 쥐지는 않는다.
    clock.advance(STUDIO_COFFEE_BREW_MS + 100);
    clock.tick();
    fxFrame(fxA.runtime, clock.now(), { x: 2400, y: 700 });
    expect(b.snapshot().objectStates).toMatchObject([
      { objectId: COUNTER_ID, stateKey: "coffee:ready", senderSessionId: "peer-a" },
    ]);
    syncObjectStates(b, fxB.runtime, appliedByB);
    fxFrame(fxB.runtime, clock.now(), nearCounter);
    expect(fxB.runtime.objectStateKey(COUNTER_ID)).toBe("coffee:ready");
    expect(fxB.texts.some((text) => text.visible && text.text === "● 준비 완료")).toBe(true);
    expect(fxB.emotes).toEqual([]);

    // 퇴장: A가 나가면 B의 피어·반발이 즉시 정리되고, 전파 상태는 명시적으로 되돌린다.
    a.close();
    expect(b.snapshot().peers).toHaveLength(0);
    expect(b.snapshot().peerImpacts).toHaveLength(0);
    fxB.runtime.clearRemoteObjectStates(clock.now());
    expect(fxB.runtime.objectStateKey(COUNTER_ID)).toBe("coffee:idle");
  });

  it("같은 object 패킷을 다시 받아도 복원 시각이 흔들리지 않는다(시퀀스 게이팅)", () => {
    const { clock, a, b, sent, listeners } = createPair();
    const sentAt = clock.now();
    a.sendObjectState(COUNTER_ID, "coffee:brewing", sentAt - 1_000);
    const before = b.snapshot().objectStates[0];
    expect(before?.stateChangedAt).toBe(sentAt - 1_000);
    const raw = sent.filter((item) => item.raw.includes("\"object\"")).at(-1);
    if (!raw) throw new Error("object 패킷이 전송됐어야 한다");
    clock.advance(2_000);
    listeners.get("peer-b")?.(raw.from, raw.raw);
    // 재전송이 적용됐다면 stateChangedAt이 2초 뒤로 밀렸을 것이다.
    expect(b.snapshot().objectStates[0]?.stateChangedAt).toBe(sentAt - 1_000);
  });

  it("오래된 impact 패킷 재전송은 최신 반발을 덮지 않는다(시퀀스 게이팅)", () => {
    const { clock, a, b, sent, listeners } = createPair();
    a.sendImpact(-50, 0);
    const first = sent.filter((item) => item.raw.includes("\"impact\"")).at(-1);
    if (!first) throw new Error("impact 패킷이 전송됐어야 한다");
    clock.advance(300); // 스로틀 해제
    a.sendImpact(-70, 0);
    expect(b.snapshot().peerImpacts[0]?.vx).toBe(-70);
    listeners.get("peer-b")?.(first.from, first.raw);
    expect(b.snapshot().peerImpacts[0]?.vx).toBe(-70);
  });
});
