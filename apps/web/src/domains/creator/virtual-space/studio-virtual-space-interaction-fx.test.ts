import { describe, expect, it } from "vitest";

import { CAMPUS_INTERACTIONS, CAMPUS_OBJECTS } from "./studio-virtual-space-campus-blueprint";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import { STUDIO_COFFEE_BREW_MS } from "./studio-virtual-space-interactable-objects";
import {
  STUDIO_INTERACTION_BURST_MS,
  StudioInteractionFxRuntime,
  type StudioInteractionFxCallbacks,
  type StudioInteractionFxObjectStateChange,
} from "./studio-virtual-space-interaction-fx";
import {
  studioWorldInsideStageApron,
  studioWorldInteractionFxAnchor,
  studioWorldInteractionKind,
  studioWorldInteractionPromptLabel,
  studioWorldNpcPromptLabel,
  studioWorldStageAprons,
} from "./studio-virtual-space-world-interaction-kinds";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldInteractions, type StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

const campus = CAMPUS_INTERACTIONS as readonly StudioWorldInteractionDefinition[];
const byId = (id: string) => {
  const found = campus.find((interaction) => interaction.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe("월드 상호작용 종류·동사", () => {
  it("캠퍼스 상호작용을 id 규약으로 분류한다(고양이·카페·갤러리처럼 겹치는 단어 포함)", () => {
    const kinds = Object.fromEntries(campus.map((interaction) => [interaction.id, studioWorldInteractionKind(interaction)]));
    expect(kinds).toMatchObject({
      "campus-skyport-concierge-desk": "concierge",
      "campus-personal-atelier-drawing-desk": "desk",
      "campus-personal-atelier-green-screen": "camera-set",
      "campus-story-lab-whiteboard": "board",
      "campus-story-lab-archive": "archive",
      "campus-creator-cafe-counter": "cafe-counter",
      "campus-creator-cafe-cat": "cat",
      "campus-team-meeting-table": "meeting",
      "campus-creator-fountain": "fountain",
      "campus-event-stage-screen": "stage",
      "campus-arcade-cabinet-1": "arcade",
      "campus-review-gallery-wall": "gallery",
      "campus-beach-cat": "cat",
      "environment-campus-south-falls": "waterfall",
    });
  });

  it("id 규약 밖의 월드는 action으로 종류를 고른다", () => {
    expect(studioWorldInteractionKind({ id: "room-lounge", action: "canvas" })).toBe("desk");
    expect(studioWorldInteractionKind({ id: "custom-1", action: "review" })).toBe("gallery");
    expect(studioWorldInteractionKind({ id: "custom-2", action: "community" })).toBe("generic");
    const defaults = Object.fromEntries(studioWorldInteractions(DEFAULT_STUDIO_WORLD_MANIFEST)
      .map((interaction) => [interaction.id, studioWorldInteractionKind(interaction)]));
    expect(defaults["drawing-atelier-desk"]).toBe("desk");
    expect(defaults["cafe-community-table"]).toBe("cafe-counter");
    expect(defaults["meeting-room-table"]).toBe("meeting");
    expect(defaults["asset-archive-terminal"]).toBe("archive");
  });

  it("프롬프트 라벨은 동사가 먼저 오고, 상태 가구는 상태에 따른 동사를 쓴다", () => {
    const counter = byId("campus-creator-cafe-counter");
    expect(studioWorldInteractionPromptLabel(counter)).toEqual({ ko: "주문하기 · 카페 카운터", en: "Order · Cafe counter" });
    expect(studioWorldInteractionPromptLabel(counter, "coffee:brewing").ko).toBe("추출 중… · 카페 카운터");
    expect(studioWorldInteractionPromptLabel(counter, "coffee:ready").en).toBe("Take coffee · Cafe counter");
    const desk = byId("campus-personal-atelier-drawing-desk");
    expect(studioWorldInteractionPromptLabel(desk).ko).toBe("앉아서 작업 · 내 드로잉 책상");
    expect(studioWorldInteractionPromptLabel(desk, "chair:occupied").ko).toBe("일어서기 · 내 드로잉 책상");
    expect(studioWorldInteractionPromptLabel(byId("campus-creator-fountain")).ko).toBe("동전 던지기 · 소원 분수");
    expect(studioWorldNpcPromptLabel({ ko: "린", en: "Rin" })).toEqual({ ko: "대화하기 · 린", en: "Talk · Rin" });
  });

  it("연출 기준점은 오브젝트 그림에서 고르고, 카페 카운터는 커피 머신 노즐이다", () => {
    expect(studioWorldInteractionFxAnchor(byId("campus-creator-cafe-counter"), CAMPUS_OBJECTS)).toEqual({ x: 2598, y: 208, baseY: 290 });
    const board = studioWorldInteractionFxAnchor(byId("campus-story-lab-whiteboard"), CAMPUS_OBJECTS);
    expect(board.x).toBe(1984);
    expect(board.y).toBeLessThan(250);
    expect(board.y).toBeGreaterThan(250 - 112);
    // 그림이 없으면 상호작용 지점 위로 조금 올린다.
    expect(studioWorldInteractionFxAnchor(byId("campus-beach-cat"), [])).toEqual({ x: 1344, y: 1520, baseY: 1574 });
  });

  it("무대 앞 발표 자리는 무대 상호작용마다 하나이고 타원 안만 포함한다", () => {
    const aprons = studioWorldStageAprons(campus);
    expect(aprons).toHaveLength(1);
    const [apron] = aprons;
    if (!apron) return;
    expect(studioWorldInsideStageApron(apron, 2560, 1080)).toBe(true);
    expect(studioWorldInsideStageApron(apron, 2700, 1090)).toBe(true);
    expect(studioWorldInsideStageApron(apron, 2560, 1200)).toBe(false);
    expect(studioWorldInsideStageApron(apron, Number.NaN, 1080)).toBe(false);
  });
});

/* ---------------------------------------------------------------------------------------------- */
/* 런타임(가짜 장면)                                                                                */
/* ---------------------------------------------------------------------------------------------- */

interface FakeObject {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  readonly calls: string[];
}

/** 모든 메서드가 자신을 돌려주는 가짜 Phaser 객체. 호출 이름을 기록하고 보임·위치·글자를 추적한다. */
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

function runtimeFor(interactions: readonly StudioWorldInteractionDefinition[] = campus) {
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
    { style: "sky-island", objects: CAMPUS_OBJECTS, badge: { plate: 0x0b101d, text: 0xf1f4ff, accent: 0xb39bff }, translate: (ko) => ko },
    callbacks,
  );
  return { runtime, events, lines, emotes, changes, ...fake };
}

const VIEW = { x: 0, y: 0, width: 3_200, height: 2_000 };

/** 한 프레임을 돌린다(나만 추적). */
function frame(runtime: StudioInteractionFxRuntime, time: number, self: { x: number; y: number }, options: { moving?: boolean; reducedMotion?: boolean; emote?: string | null } = {}) {
  runtime.beginFrame(time, VIEW, options.reducedMotion ?? false, 1);
  runtime.trackActor("self", sprite(self.x, self.y) as never, self.x, self.y, "down", options.emote ?? null, true);
  runtime.endFrame(self, options.moving ?? false);
}

describe("상호작용 연출 런타임", () => {
  it("카페 카운터: 주문하면 추출하고, 가까이 있으면 완성되자마자 손에 컵을 든다", () => {
    const { runtime, events, lines, emotes, images } = runtimeFor();
    const counter = byId("campus-creator-cafe-counter");
    const self = { x: 2690, y: 340 };
    runtime.prompted(counter, 100);
    expect(lines).toContain("커피 한 잔 할까요? ☕");
    runtime.activate(counter, self, 1_000, false);
    expect(runtime.promptLabel(counter).ko).toBe("추출 중… · 카페 카운터");
    expect(events.at(-1)?.titleKo).toContain("커피를 주문했어요");
    frame(runtime, 1_500, self);
    expect(runtime.diagnostics).toContain("machines:1");
    frame(runtime, 1_000 + STUDIO_COFFEE_BREW_MS + 10, self);
    expect(emotes).toEqual(["coffee"]);
    expect(events.at(-1)?.titleKo).toContain("커피를 받았어요");
    expect(runtime.promptLabel(counter).ko).toBe("주문하기 · 카페 카운터");
    // 다음 프레임에 내 손에 잔이 보인다.
    frame(runtime, 1_000 + STUDIO_COFFEE_BREW_MS + 40, self);
    expect(runtime.diagnostics).toContain("cups:1");
    expect(images.filter((image) => image.visible).length).toBeGreaterThan(0);
  });

  it("카페 카운터: 멀리 가 있으면 완성 알림 뒤 카운터에서 기다리고 X로 가져간다", () => {
    const { runtime, lines, emotes, texts } = runtimeFor();
    const counter = byId("campus-creator-cafe-counter");
    runtime.activate(counter, { x: 2690, y: 340 }, 0, false);
    const away = { x: 2400, y: 700 };
    frame(runtime, STUDIO_COFFEE_BREW_MS + 5, away);
    expect(lines).toContain("주문하신 커피 나왔어요! ☕");
    expect(runtime.promptLabel(counter).ko).toBe("커피 가져가기 · 카페 카운터");
    expect(emotes).toEqual([]);
    // 기다리는 동안 머신 위에 반응 표의 "준비 완료" 배지가 보인다(웨이브 2).
    expect(texts.some((text) => text.visible && text.text === "● 준비 완료")).toBe(true);
    runtime.activate(counter, { x: 2690, y: 340 }, STUDIO_COFFEE_BREW_MS + 2_000, false);
    expect(emotes).toEqual(["coffee"]);
    expect(runtime.promptLabel(counter).ko).toBe("주문하기 · 카페 카운터");
  });

  it("책상: X로 앉고(조명) 움직이면 일어선다", () => {
    const { runtime } = runtimeFor();
    const desk = byId("campus-personal-atelier-drawing-desk");
    runtime.activate(desk, { x: 1000, y: 620 }, 0, false);
    expect(runtime.seat).toEqual({ id: desk.id, anchorPoint: desk.point, facing: "up" });
    expect(runtime.promptLabel(desk).ko).toBe("일어서기 · 내 드로잉 책상");
    frame(runtime, 100, { x: 1000, y: 620 });
    expect(runtime.diagnostics).toContain(`seat:${desk.id}`);
    frame(runtime, 200, { x: 1010, y: 640 }, { moving: true });
    expect(runtime.seat).toBeNull();
    expect(runtime.promptLabel(desk).ko).toBe("앉아서 작업 · 내 드로잉 책상");
    // 다시 X를 두 번 누르면 앉았다가 일어선다.
    runtime.activate(desk, { x: 1000, y: 620 }, 300, false);
    runtime.activate(desk, { x: 1000, y: 620 }, 400, false);
    expect(runtime.seat).toBeNull();
  });

  it("무대 앞 발표 자리에 서면 스포트라이트·배지가 붙고, 알림은 쿨다운 동안 한 번이다", () => {
    const { runtime, events, texts } = runtimeFor();
    const onStage = { x: 2560, y: 1080 };
    frame(runtime, 0, onStage);
    expect(events.filter((event) => event.titleKo.includes("무대에 섰어요"))).toHaveLength(1);
    expect(texts.some((text) => text.visible && text.text.includes("발표 중"))).toBe(true);
    // 동료도 같은 자리면 배지를 받는다(배지 풀 재사용).
    runtime.beginFrame(100, VIEW, false, 1);
    runtime.trackActor("self", sprite(onStage.x, onStage.y) as never, onStage.x, onStage.y, "down", null, true);
    runtime.trackActor("peer-1", sprite(2620, 1090) as never, 2620, 1090, "down", null, true);
    runtime.endFrame(onStage, false);
    expect(runtime.diagnostics).toContain("stage:2");
    expect(texts.filter((text) => text.visible)).toHaveLength(2);
    // 내려왔다가 곧 다시 올라도 알림은 반복하지 않는다.
    frame(runtime, 200, { x: 2560, y: 1300 });
    expect(texts.filter((text) => text.visible)).toHaveLength(0);
    frame(runtime, 300, onStage);
    expect(events.filter((event) => event.titleKo.includes("무대에 섰어요"))).toHaveLength(1);
  });

  it("커피 리액션 중인 동료 손에도 잔이 보이고, 추적하지 않은 잔은 숨는다", () => {
    const { runtime } = runtimeFor();
    runtime.beginFrame(0, VIEW, false, 1);
    runtime.trackActor("peer-a", sprite(500, 500) as never, 500, 500, "left", "coffee", true);
    runtime.trackActor("peer-b", sprite(600, 500) as never, 600, 500, "right", "wave", true);
    runtime.endFrame({ x: 0, y: 0 }, false);
    expect(runtime.diagnostics).toContain("cups:1");
    frame(runtime, 100, { x: 0, y: 0 });
    expect(runtime.diagnostics).toContain("cups:0");
  });

  it("발동 연출은 수명이 지나면 슬롯을 비우고, 모션 줄이기에서는 정적인 고리만 그린다", () => {
    const { runtime, graphics } = runtimeFor();
    const fountain = byId("campus-creator-fountain");
    runtime.activate(fountain, { x: 1472, y: 1240 }, 0, true);
    frame(runtime, 200, { x: 1472, y: 1240 }, { reducedMotion: true });
    const drawn = graphics.flatMap((item) => item.calls);
    expect(drawn).toContain("strokeEllipse");
    expect(drawn).not.toContain("fillCircle");
    expect(runtime.diagnostics).toContain("bursts:1");
    frame(runtime, STUDIO_INTERACTION_BURST_MS + 10, { x: 1472, y: 1240 }, { reducedMotion: true });
    expect(runtime.diagnostics).toContain("bursts:0");
  });
});

describe("오브젝트 상태 전파 (웨이브 3)", () => {
  it("로컬 주문·완성 전이가 onObjectStateChange로 나간다", () => {
    const { runtime, changes } = runtimeFor();
    const counter = byId("campus-creator-cafe-counter");
    const self = { x: 2690, y: 340 };
    runtime.activate(counter, self, 1_000, false);
    expect(changes).toEqual([
      { objectId: counter.id, stateKey: "coffee:brewing", stateChangedAt: 1_000 },
    ]);
    // 가까이 있으면 완성 즉시 자동 수령(idle)까지 전이 통지가 이어진다.
    frame(runtime, 1_000 + STUDIO_COFFEE_BREW_MS + 10, self);
    expect(changes.at(-1)).toEqual({
      objectId: counter.id, stateKey: "coffee:idle", stateChangedAt: 1_000 + STUDIO_COFFEE_BREW_MS + 10,
    });
  });

  it("멀리서 완성되면 ready 전이가 통지된다", () => {
    const { runtime, changes } = runtimeFor();
    const counter = byId("campus-creator-cafe-counter");
    runtime.activate(counter, { x: 2690, y: 340 }, 0, false);
    frame(runtime, STUDIO_COFFEE_BREW_MS + 5, { x: 2400, y: 700 });
    expect(changes.at(-1)).toEqual({
      objectId: counter.id, stateKey: "coffee:ready", stateChangedAt: STUDIO_COFFEE_BREW_MS + 5,
    });
  });

  it("원격 적용은 부수효과·에코 없이 상태만 맞추고, 완성돼도 내 손에 쥐지 않는다", () => {
    const { runtime, events, lines, emotes, changes, texts } = runtimeFor();
    const counter = byId("campus-creator-cafe-counter");
    const self = { x: 2690, y: 340 }; // 카운터 바로 앞 — 로컬 머신이면 완성 즉시 손에 쥔다.
    expect(runtime.applyRemoteObjectState(counter.id, "coffee:brewing", 2_000)).toBe(true);
    expect(runtime.promptLabel(counter).ko).toBe("추출 중… · 카페 카운터");
    frame(runtime, 2_000 + STUDIO_COFFEE_BREW_MS + 10, self);
    expect(runtime.objectStateKey(counter.id)).toBe("coffee:ready");
    // 상대가 추출한 커피다: 이모트·알림·바리스타 대사·재전파가 모두 없어야 한다.
    expect(emotes).toEqual([]);
    expect(events).toEqual([]);
    expect(lines).toEqual([]);
    expect(changes).toEqual([]);
    // 대신 완성 배지는 상대 화면과 똑같이 보인다.
    expect(texts.some((text) => text.visible && text.text === "● 준비 완료")).toBe(true);
  });

  it("원격 적용은 경과를 이어받는다 — 남은 시간만 지나면 완성된다", () => {
    const { runtime } = runtimeFor();
    const counter = byId("campus-creator-cafe-counter");
    // 이미 6초 지난 추출을 지금 적용한다.
    expect(runtime.applyRemoteObjectState(counter.id, "coffee:brewing", 4_000)).toBe(true);
    frame(runtime, 9_999, { x: 2400, y: 700 });
    expect(runtime.objectStateKey(counter.id)).toBe("coffee:brewing");
    frame(runtime, 11_999, { x: 2400, y: 700 });
    // stateChangedAt(4000) 기준 7,999ms — 아직 완성 전이다.
    expect(runtime.objectStateKey(counter.id)).toBe("coffee:brewing");
    frame(runtime, 12_001, { x: 2400, y: 700 });
    // 적용 시각부터 새로 8초가 아니라, 전이 시각 + 8초에 완성된다.
    expect(runtime.objectStateKey(counter.id)).toBe("coffee:ready");
  });

  it("머신이 없는 오브젝트·잘못된 시각은 적용하지 않는다", () => {
    const { runtime } = runtimeFor();
    const fountain = byId("campus-creator-fountain");
    expect(runtime.applyRemoteObjectState(fountain.id, "coffee:brewing", 0)).toBe(false);
    expect(runtime.applyRemoteObjectState("no-such-object", "coffee:brewing", 0)).toBe(false);
    const counter = byId("campus-creator-cafe-counter");
    expect(runtime.applyRemoteObjectState(counter.id, "coffee:brewing", Number.NaN)).toBe(false);
    expect(runtime.objectStateKey(counter.id)).toBe("coffee:idle");
  });

  it("원격 상태를 정리하면 머신이 초기 상태로 돌아간다", () => {
    const { runtime } = runtimeFor();
    const counter = byId("campus-creator-cafe-counter");
    runtime.applyRemoteObjectState(counter.id, "coffee:brewing", 0);
    expect(runtime.promptLabel(counter).ko).toBe("추출 중… · 카페 카운터");
    runtime.clearRemoteObjectStates(500);
    expect(runtime.objectStateKey(counter.id)).toBe("coffee:idle");
    expect(runtime.promptLabel(counter).ko).toBe("주문하기 · 카페 카운터");
  });

  it("상대가 추출한 커피를 내가 가져가면 소유가 넘어오고 idle이 전파된다", () => {
    const { runtime, emotes, changes } = runtimeFor();
    const counter = byId("campus-creator-cafe-counter");
    runtime.applyRemoteObjectState(counter.id, "coffee:ready", 0);
    runtime.activate(counter, { x: 2690, y: 340 }, 100, false);
    expect(emotes).toEqual(["coffee"]);
    expect(changes).toEqual([
      { objectId: counter.id, stateKey: "coffee:idle", stateChangedAt: 100 },
    ]);
    expect(runtime.objectStateKey(counter.id)).toBe("coffee:idle");
  });
});
