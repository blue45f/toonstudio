import { describe, expect, it, vi } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { CAMPUS_INTERACTIONS, CAMPUS_OBJECTS } from "./studio-virtual-space-campus-blueprint";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import { STUDIO_COFFEE_BREW_MS } from "./studio-virtual-space-interactable-objects";
import {
  StudioInteractionFxRuntime,
  type StudioInteractionFxCallbacks,
  type StudioInteractionFxObjectStateChange,
} from "./studio-virtual-space-interaction-fx";
import {
  createStudioInteractionFxLiveWiring,
  type StudioInteractionFxLiveWiring,
} from "./studio-virtual-space-interaction-fx-live";
import {
  STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS,
  StudioVirtualSpacePresenceController,
} from "./studio-virtual-space-presence";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

/**
 * fx 런타임 라이브 인스턴스화 종단 간 검증 (VS 120 웨이브 3 잔여).
 *
 * 캔버스가 실제로 거치는 배선 모양 그대로 검증한다:
 * 브리지(npcSay 주입·전이 통지) → 프레즌스 컨트롤러 → 상대 브리지 syncObjectStates → fx.
 * 로컬 전이가 fx 프레임에 반영되고, 원격 상태가 같은 fx에 부수효과 없이 합쳐지며,
 * 퇴장 정리가 전파 머신을 되돌리는지 확인한다.
 */

/* --- interaction-fx용 가짜 장면 (peer-motion-lifecycle.test.ts와 같은 방식) --- */

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
const NEAR_COUNTER = { x: 2690, y: 340 };
const BARISTA = { id: "npc-barista", point: { x: 2700, y: 360 } };

function createClock() {
  let now = 1_700_000_000_000;
  const handlers: (() => void)[] = [];
  return {
    now: () => now,
    advance: (ms: number) => { now += ms; },
    tick: () => { for (const handler of [...handlers]) handler(); },
    dependencies: {
      now: () => now,
      setInterval: (handler: () => void) => { handlers.push(handler); return handlers.length; },
      clearInterval: () => undefined,
    },
  };
}

interface WiringRig {
  readonly wiring: StudioInteractionFxLiveWiring;
  readonly changes: StudioInteractionFxObjectStateChange[];
  readonly events: StudioSpaceUiEvent[];
  readonly emotes: StudioSpaceEmoteId[];
  readonly graphics: FakeObject[];
  readonly texts: FakeObject[];
}

function wiringRig(
  clock: { now: () => number },
  options: {
    readonly npcs?: readonly { readonly id: string; readonly point: { x: number; y: number } }[];
    readonly onChange?: (change: StudioInteractionFxObjectStateChange) => void;
  } = {},
): WiringRig {
  const fake = fakeScene();
  const changes: StudioInteractionFxObjectStateChange[] = [];
  const events: StudioSpaceUiEvent[] = [];
  const emotes: StudioSpaceEmoteId[] = [];
  const wiring = createStudioInteractionFxLiveWiring(
    (callbacks: StudioInteractionFxCallbacks) => new StudioInteractionFxRuntime(
      fake.scene as unknown as ConstructorParameters<typeof StudioInteractionFxRuntime>[0],
      CAMPUS_INTERACTIONS as readonly StudioWorldInteractionDefinition[],
      { style: "sky-island", objects: CAMPUS_OBJECTS, badge: { plate: 0x0b101d, text: 0xf1f4ff, accent: 0xb39bff }, translate: (ko) => ko },
      callbacks,
    ),
    {
      now: clock.now,
      notify: (event) => { events.push(event); },
      selfEmote: (emote) => { emotes.push(emote); },
      onObjectStateChange: (change) => { changes.push(change); options.onChange?.(change); },
      npcCandidates: () => options.npcs ?? [BARISTA],
    },
  );
  return { wiring, changes, events, emotes, graphics: fake.graphics, texts: fake.texts };
}

function fxFrame(wiring: StudioInteractionFxLiveWiring, time: number, self: { x: number; y: number }) {
  wiring.runtime.beginFrame(time, VIEW, false, 1);
  wiring.runtime.endFrame(self, false);
}

type Listener = (sender: StudioLiveParticipant, raw: string) => void;

function createLinkedPorts(participants: StudioLiveParticipant[]) {
  const listeners = new Map<string, Listener>();
  const portFor = (self: StudioLiveParticipant): StudioLiveDirectPort => ({
    getPeers: () => participants,
    send: (targetSessionId: string, payload: string) => {
      listeners.get(targetSessionId)?.(self, payload);
      return true;
    },
    subscribe: (listener: Listener) => {
      listeners.set(self.sessionId, listener);
      return () => { listeners.delete(self.sessionId); };
    },
  });
  return { portFor };
}

function createPair(clock: ReturnType<typeof createClock>) {
  const alpha = { sessionId: "peer-a", displayName: "작가A", role: "editor" } as StudioLiveParticipant;
  const beta = { sessionId: "peer-b", displayName: "작가B", role: "editor" } as StudioLiveParticipant;
  const linked = createLinkedPorts([alpha, beta]);
  const a = new StudioVirtualSpacePresenceController(alpha, linked.portFor(alpha), { x: 100, y: 120 }, clock.dependencies);
  const b = new StudioVirtualSpacePresenceController(beta, linked.portFor(beta), { x: 640, y: 480 }, clock.dependencies);
  a.start();
  b.start();
  clock.advance(STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS + 100);
  clock.tick();
  return { a, b };
}

describe("fx 라이브 배선 브리지", () => {
  it("로컬 전이가 통지로 나가고, 프레임에 추출 연출이 반영되며, 바리스타 대사가 주입·만료된다", () => {
    const clock = createClock();
    const rig = wiringRig(clock);
    const t0 = clock.now();

    rig.wiring.runtime.activate(counter, NEAR_COUNTER, t0, false);
    expect(rig.changes).toEqual([
      { objectId: COUNTER_ID, stateKey: "coffee:brewing", stateChangedAt: t0 },
    ]);
    // 주문 대사("원두를 갈고 있어요")가 반경 안 바리스타에게 주입된다.
    expect(rig.wiring.npcLineFor(BARISTA.id, t0)?.ko).toContain("원두를 갈고 있어요");
    // 대사 길이가 지나면 주입은 정리된다.
    expect(rig.wiring.npcLineFor(BARISTA.id, t0 + 3_300)).toBeNull();

    fxFrame(rig.wiring, t0 + 100, NEAR_COUNTER);
    expect(rig.wiring.runtime.objectStateKey(COUNTER_ID)).toBe("coffee:brewing");
    expect(rig.wiring.runtime.diagnostics).toContain("machines:1");
    // 머신 그래픽이 켜지고 추출 고리(arc)가 그려졌다.
    const machineDrawn = rig.graphics.some((graphics) => graphics.visible && graphics.calls.includes("arc"));
    expect(machineDrawn).toBe(true);
  });

  it("근처에 NPC가 없으면 대사는 어디에도 붙지 않는다", () => {
    const clock = createClock();
    const rig = wiringRig(clock, { npcs: [{ id: "npc-far", point: { x: 40, y: 40 } }] });
    rig.wiring.runtime.activate(counter, NEAR_COUNTER, clock.now(), false);
    expect(rig.wiring.npcLineFor("npc-far", clock.now())).toBeNull();
    expect(rig.wiring.npcLineFor(BARISTA.id, clock.now())).toBeNull();
  });

  it("원격 상태가 같은 fx에 합쳐지고, 완성 배지까지 부수효과 없이 보인다", () => {
    const clock = createClock();
    const { a, b } = createPair(clock);
    const rigA = wiringRig(clock, {
      onChange: (change) => { a.sendObjectState(change.objectId, change.stateKey, change.stateChangedAt); },
    });
    const rigB = wiringRig(clock);
    const applySpy = vi.spyOn(rigB.wiring.runtime, "applyRemoteObjectState");

    // A가 주문하면 A의 바리스타는 말하지만, B에는 상태만 닿는다.
    rigA.wiring.runtime.activate(counter, NEAR_COUNTER, clock.now(), false);
    expect(rigA.wiring.npcLineFor(BARISTA.id, clock.now())?.ko).toContain("원두를 갈고 있어요");
    rigB.wiring.syncObjectStates(b.snapshot().objectStates);
    expect(rigB.wiring.runtime.objectStateKey(COUNTER_ID)).toBe("coffee:brewing");
    expect(rigB.wiring.npcLineFor(BARISTA.id, clock.now())).toBeNull();
    expect(rigB.events).toEqual([]);
    expect(rigB.emotes).toEqual([]);
    expect(rigB.changes).toEqual([]);
    // 같은 스냅샷을 다시 동기화해도 적용은 한 번뿐이다.
    rigB.wiring.syncObjectStates(b.snapshot().objectStates);
    expect(applySpy).toHaveBeenCalledTimes(1);

    // 추출이 끝나면(A는 멀리 있다) B의 머신에도 완성 배지가 붙고, 손에 쥐지는 않는다.
    clock.advance(STUDIO_COFFEE_BREW_MS + 100);
    fxFrame(rigA.wiring, clock.now(), { x: 2400, y: 700 });
    expect(b.snapshot().objectStates).toMatchObject([{ objectId: COUNTER_ID, stateKey: "coffee:ready" }]);
    rigB.wiring.syncObjectStates(b.snapshot().objectStates);
    fxFrame(rigB.wiring, clock.now(), NEAR_COUNTER);
    expect(rigB.wiring.runtime.objectStateKey(COUNTER_ID)).toBe("coffee:ready");
    expect(rigB.texts.some((text) => text.visible && text.text === "● 준비 완료")).toBe(true);
    expect(rigB.emotes).toEqual([]);
    expect(rigB.changes).toEqual([]);

    // 퇴장 정리: 전파 머신이 초기 상태로 돌아가고, 이후의 새 전파는 다시 적용된다.
    rigB.wiring.clearRemoteStates(clock.now());
    expect(rigB.wiring.runtime.objectStateKey(COUNTER_ID)).toBe("coffee:idle");
    rigB.wiring.syncObjectStates([
      { objectId: COUNTER_ID, stateKey: "coffee:brewing", stateChangedAt: clock.now(), senderSessionId: "peer-a" },
    ]);
    expect(rigB.wiring.runtime.objectStateKey(COUNTER_ID)).toBe("coffee:brewing");
  });
});
