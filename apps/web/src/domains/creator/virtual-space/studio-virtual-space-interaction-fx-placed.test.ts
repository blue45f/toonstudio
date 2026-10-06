import { describe, expect, it } from "vitest";

import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import {
  StudioInteractionFxRuntime,
  type StudioInteractionFxCallbacks,
  type StudioInteractionFxObjectStateChange,
  type StudioInteractionFxPlacedFixture,
} from "./studio-virtual-space-interaction-fx";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldInteractions, type StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

/**
 * 배치 가구 고정물 층 검증 (VS 120 웨이브 4 B).
 *
 * 빌드 모드로 배치한 가구가 매니페스트 고정물과 같은 층에서 그려지고,
 * 토글하면 전이·전파·알림이 같은 경로로 나가며, 원격 적용·퇴장 정리·
 * 배치 해제가 닫히는지 가짜 장면으로 확인한다.
 */

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

function sprite(x: number, y: number) {
  return { x, y, depth: Math.round(y) + 1_001, displayWidth: 60, displayHeight: 80, originY: 0.96 };
}

const VIEW = { x: 0, y: 0, width: 3_200, height: 2_000 };
const SELF = { x: 120, y: 260 };

function runtimeFor(interactions: readonly StudioWorldInteractionDefinition[] = []) {
  const fake = fakeScene();
  const events: StudioSpaceUiEvent[] = [];
  const lines: string[] = [];
  const emotes: string[] = [];
  const changes: StudioInteractionFxObjectStateChange[] = [];
  const callbacks: StudioInteractionFxCallbacks = {
    npcSay: (_point, _radius, ko) => { lines.push(ko); },
    selfEmote: (emote) => { emotes.push(emote); },
    notify: (event) => { events.push(event); },
    onObjectStateChange: (change) => { changes.push(change); },
  };
  const runtime = new StudioInteractionFxRuntime(
    fake.scene as unknown as ConstructorParameters<typeof StudioInteractionFxRuntime>[0],
    interactions,
    { style: "sky-island", objects: [], badge: { plate: 0x0b101d, text: 0xf1f4ff, accent: 0xb39bff }, translate: (ko) => ko },
    callbacks,
  );
  return { runtime, events, lines, emotes, changes, ...fake };
}

function frame(runtime: StudioInteractionFxRuntime, time: number) {
  runtime.beginFrame(time, VIEW, false, 1);
  runtime.trackActor("self", sprite(SELF.x, SELF.y) as never, SELF.x, SELF.y, "down", null, true);
  runtime.endFrame(SELF, false);
}

const LAMP: StudioInteractionFxPlacedFixture = {
  objectId: "build:floor-lamp@100,200",
  kind: "light-switch",
  anchor: { x: 100, y: 146, baseY: 200 },
};
const SCREEN: StudioInteractionFxPlacedFixture = {
  objectId: "build:display-screen@500,200",
  kind: "youtube",
  anchor: { x: 500, y: 146, baseY: 200 },
};

describe("배치 가구 고정물 층", () => {
  it("등록한 조명은 초기 상태로 그려지고, 토글하면 전이·전파·알림·배지가 매니페스트 고정물과 같다", () => {
    const { runtime, events, changes, texts } = runtimeFor();
    runtime.syncPlacedFixtures([LAMP]);
    expect(runtime.objectStateKey(LAMP.objectId)).toBe("light:off");
    frame(runtime, 100);
    expect(runtime.diagnostics).toContain("fixtures:0");

    expect(runtime.activatePlacedFixture(LAMP.objectId, 200)).toBe(true);
    expect(runtime.objectStateKey(LAMP.objectId)).toBe("light:on");
    expect(changes).toEqual([{ objectId: LAMP.objectId, stateKey: "light:on", stateChangedAt: 200 }]);
    expect(events.at(-1)?.targetId).toBe(LAMP.objectId);

    frame(runtime, 500);
    expect(runtime.diagnostics).toContain("fixtures:1");
    expect(texts.some((text) => text.visible && text.text === "● 켜짐")).toBe(true);

    // 다시 토글하면 꺼지고 전파도 나간다.
    expect(runtime.activatePlacedFixture(LAMP.objectId, 600)).toBe(true);
    expect(runtime.objectStateKey(LAMP.objectId)).toBe("light:off");
    expect(changes.at(-1)).toMatchObject({ objectId: LAMP.objectId, stateKey: "light:off" });
  });

  it("같은 목록을 다시 동기화하면 상태가 유지되고, 종류가 바뀌면 새 종류로 다시 등록된다", () => {
    const { runtime } = runtimeFor();
    runtime.syncPlacedFixtures([LAMP]);
    runtime.activatePlacedFixture(LAMP.objectId, 100);
    runtime.syncPlacedFixtures([LAMP]);
    expect(runtime.objectStateKey(LAMP.objectId)).toBe("light:on");
    runtime.syncPlacedFixtures([{ ...LAMP, kind: "youtube" }]);
    expect(runtime.objectStateKey(LAMP.objectId)).toBe("media:closed");
  });

  it("원격 적용과 퇴장 정리가 배치 고정물에도 닿는다", () => {
    const { runtime, changes, events } = runtimeFor();
    runtime.syncPlacedFixtures([SCREEN]);
    expect(runtime.applyRemoteObjectState(SCREEN.objectId, "media:open", 300)).toBe(true);
    expect(runtime.objectStateKey(SCREEN.objectId)).toBe("media:open");
    // 종류와 맞지 않는 상태 가족은 적용하지 않는다.
    expect(runtime.applyRemoteObjectState(SCREEN.objectId, "light:on", 400)).toBe(false);
    expect(runtime.objectStateKey(SCREEN.objectId)).toBe("media:open");
    // 원격 적용은 부수효과가 없다.
    expect(changes).toEqual([]);
    expect(events).toEqual([]);
    runtime.clearRemoteObjectStates(500);
    expect(runtime.objectStateKey(SCREEN.objectId)).toBe("media:closed");
  });

  it("목록에서 사라진 가구는 해제되고, 매니페스트 고정물은 건드리지 않는다", () => {
    const interactions = studioWorldInteractions(DEFAULT_STUDIO_WORLD_MANIFEST);
    const board = interactions.find((interaction) => interaction.id === "lobby-today-board");
    if (!board) throw new Error("missing lobby-today-board");
    const { runtime } = runtimeFor(interactions);
    runtime.activate(board, { x: board.point.x, y: board.point.y }, 100, false);
    expect(runtime.objectStateKey(board.id)).toBe("bulletin:read");

    runtime.syncPlacedFixtures([LAMP]);
    runtime.activatePlacedFixture(LAMP.objectId, 200);
    runtime.syncPlacedFixtures([]);
    expect(runtime.objectStateKey(LAMP.objectId)).toBeNull();
    expect(runtime.activatePlacedFixture(LAMP.objectId, 300)).toBe(false);
    // 매니페스트 고정물의 상태는 배치 동기화와 무관하게 유지된다.
    expect(runtime.objectStateKey(board.id)).toBe("bulletin:read");
  });
});
