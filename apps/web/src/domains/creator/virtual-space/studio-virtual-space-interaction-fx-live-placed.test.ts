import { describe, expect, it } from "vitest";

import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
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
  studioBuildPlacedFixtures,
  type StudioBuildPlacedFixture,
} from "./studio-virtual-space-build-mode-vitality";
import type { StudioBuildPlacementRequest } from "./studio-virtual-space-build-mode";

/**
 * 배치 가구 라이브 배선 검증 (VS 120 웨이브 4 B 후속 — 패널 라이브 연결).
 *
 * 캔버스가 거치는 모양 그대로 확인한다: 패널이 만든 배치 요청 → 디스크립터 →
 * 브리지 syncPlacedFixtures → fx 고정물 층 등록. 프롬프트 후보는 현재 상태로
 * 동사를 고르고, 근접 활성은 토글·전파까지 fx 경로를 탄다.
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

function furnitureRequest(refId: string, x: number, y: number): StudioBuildPlacementRequest {
  return { entryId: `furniture:${refId}`, category: "furniture", refId, point: { x, y }, rotation: 0 };
}

function wiringRig() {
  const fake = fakeScene();
  const changes: StudioInteractionFxObjectStateChange[] = [];
  const events: StudioSpaceUiEvent[] = [];
  const wiring: StudioInteractionFxLiveWiring = createStudioInteractionFxLiveWiring(
    (callbacks: StudioInteractionFxCallbacks) => new StudioInteractionFxRuntime(
      fake.scene as unknown as ConstructorParameters<typeof StudioInteractionFxRuntime>[0],
      [],
      { style: "sky-island", objects: [], badge: { plate: 0x0b101d, text: 0xf1f4ff, accent: 0xb39bff }, translate: (ko) => ko },
      callbacks,
    ),
    {
      now: () => 1_000,
      notify: (event) => { events.push(event); },
      selfEmote: () => undefined,
      onObjectStateChange: (change) => { changes.push(change); },
      npcCandidates: () => [],
    },
  );
  return { wiring, changes, events };
}

const LAMP = studioBuildPlacedFixtures([furnitureRequest("floor-lamp", 100, 200)])[0] as StudioBuildPlacedFixture;
const SCREEN = studioBuildPlacedFixtures([furnitureRequest("display-screen", 400, 200)])[0] as StudioBuildPlacedFixture;

describe("배치 가구 라이브 배선", () => {
  it("동기화된 배치 가구가 fx 고정물 층에 초기 상태로 등록되고, 목록에서 사라지면 해제된다", () => {
    const { wiring } = wiringRig();
    expect(wiring.runtime.objectStateKey(LAMP.objectId)).toBeNull();
    wiring.syncPlacedFixtures([LAMP, SCREEN]);
    expect(wiring.runtime.objectStateKey(LAMP.objectId)).toBe("light:off");
    expect(wiring.runtime.objectStateKey(SCREEN.objectId)).toBe("media:closed");
    wiring.syncPlacedFixtures([SCREEN]);
    expect(wiring.runtime.objectStateKey(LAMP.objectId)).toBeNull();
    expect(wiring.runtime.objectStateKey(SCREEN.objectId)).toBe("media:closed");
  });

  it("프롬프트 후보는 반경 안 가장 가까운 가구이고, 라벨 동사는 현재 상태를 따른다", () => {
    const { wiring } = wiringRig();
    wiring.syncPlacedFixtures([LAMP, SCREEN]);
    // 램프에서 30px, 스크린에서는 먼 지점 → 램프 후보.
    const candidate = wiring.placedPromptCandidate({ x: 130, y: 200 });
    expect(candidate).toMatchObject({ id: LAMP.objectId, kind: "interaction", labelKo: "켜기 · 플로어 램프" });
    // 반경(64) 밖이면 후보가 없다.
    expect(wiring.placedPromptCandidate({ x: 100, y: 400 })).toBeNull();
    // 켜면 다음 프롬프트는 끄기 동사가 된다.
    wiring.activatePlacedFixtureNear({ x: 130, y: 200 }, 500);
    expect(wiring.placedPromptCandidate({ x: 130, y: 200 })?.labelKo).toBe("끄기 · 플로어 램프");
    // 스크린 근처에서는 스크린 후보가 이긴다.
    expect(wiring.placedPromptCandidate({ x: 390, y: 210 })?.id).toBe(SCREEN.objectId);
  });

  it("근접 활성은 토글·전파·알림을 fx 경로로 내보내고, 반경 밖에서는 아무것도 하지 않는다", () => {
    const { wiring, changes, events } = wiringRig();
    wiring.syncPlacedFixtures([LAMP]);
    expect(wiring.activatePlacedFixtureNear({ x: 900, y: 900 }, 100)).toBe(false);
    expect(changes).toEqual([]);

    expect(wiring.activatePlacedFixtureNear({ x: 120, y: 210 }, 200)).toBe(true);
    expect(wiring.runtime.objectStateKey(LAMP.objectId)).toBe("light:on");
    expect(changes).toEqual([{ objectId: LAMP.objectId, stateKey: "light:on", stateChangedAt: 200 }]);
    expect(events.at(-1)?.targetId).toBe(LAMP.objectId);
  });

  it("동기화 전에는 프롬프트도 활성도 없다", () => {
    const { wiring } = wiringRig();
    expect(wiring.placedPromptCandidate({ x: 100, y: 200 })).toBeNull();
    expect(wiring.activatePlacedFixtureNear({ x: 100, y: 200 }, 0)).toBe(false);
  });
});
