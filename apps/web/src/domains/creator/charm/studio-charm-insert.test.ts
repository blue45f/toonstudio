import { beforeAll, describe, expect, it, vi } from "vitest";

import { STUDIO_RASTER_ASSETS } from "../render/studio-raster-assets";
import { createCanvasImageElement } from "../studio-image-placement";
import { buildStudioCharmCatalog, type StudioCharmCatalog } from "./studio-charm-catalog";
import { loadStudioCharmCatalogData } from "./studio-charm-catalog-data";
import {
  activateStudioCharm,
  planStudioCharmPlacement,
  studioCharmBubbleFootprint,
  type StudioCharmActivationContext,
  type StudioCharmHostCommands,
} from "./studio-charm-insert";
import { createStudioCharmId } from "./studio-charm-model";

import type { StudioCharmDescriptor } from "./studio-charm-descriptor";

function context(overrides: Partial<StudioCharmActivationContext> = {}): StudioCharmActivationContext {
  return {
    documentWidth: 720,
    documentHeight: 1280,
    selection: null,
    visible: null,
    snap: { enabled: false, gridSize: 40, viewportScale: 1 },
    sequenceFor: () => 0,
    ...overrides,
  };
}

const VISIBLE = {
  center: { x: 360, y: 640 },
  bounds: { x: 0, y: 400, width: 720, height: 480 },
} as const;

describe("참 붙일 위치 계획", () => {
  it("선택이 없으면 보이는 화면 중앙에 놓는다", () => {
    const plan = planStudioCharmPlacement(context({ visible: VISIBLE }), { width: 200, height: 200 });
    expect(plan.source).toBe("viewport");
    expect(plan.placement.anchor).toEqual({ x: 360, y: 640 });
    expect(plan.placement.bounds).toEqual(VISIBLE.bounds);
    expect(plan.placement.inset).toBeGreaterThanOrEqual(16);
    expect(plan.placement.inset).toBeLessThanOrEqual(40);
  });

  it("보이는 화면 정보도 없으면 문서 중앙이다", () => {
    const plan = planStudioCharmPlacement(context(), { width: 200, height: 200 });
    expect(plan.source).toBe("document");
    expect(plan.placement.anchor).toEqual({ x: 360, y: 640 });
  });

  it("선택한 컷(프레임)이 있으면 그 중앙이고 컷 안에 맞춘다", () => {
    const plan = planStudioCharmPlacement(
      context({ selection: { id: "frame-1", type: "frame", x: 100, y: 200, width: 400, height: 300 }, visible: VISIBLE }),
      { width: 200, height: 200 },
    );
    expect(plan.source).toBe("selected-frame");
    expect(plan.placement.anchor).toEqual({ x: 300, y: 350 });
    expect(plan.placement.bounds).toEqual({ x: 100, y: 200, width: 400, height: 300 });
    expect(plan.placement.inset).toBeCloseTo(12, 5);
  });

  it("프레임이 아닌 요소를 골랐다면 그 요소의 중앙을 선택 위치로 본다", () => {
    const plan = planStudioCharmPlacement(
      context({ selection: { id: "img-1", type: "image", x: 50, y: 60, width: 200, height: 100 }, visible: VISIBLE }),
      { width: 120, height: 120 },
    );
    expect(plan.source).toBe("pointer");
    expect(plan.placement.anchor).toEqual({ x: 150, y: 110 });
    expect(plan.placement.bounds).toEqual({ x: 0, y: 0, width: 720, height: 1280 });
  });

  it("크기가 없는 선택(펜 획 등)은 선택 위치로 쓰지 않고 보이는 화면으로 돌아간다", () => {
    const plan = planStudioCharmPlacement(
      context({ selection: { type: "draw", x: 0, y: 0, width: 0, height: 0 }, visible: VISIBLE }),
      { width: 120, height: 120 },
    );
    expect(plan.source).toBe("viewport");
  });

  it("연속 삽입 횟수만큼 계단식으로 비껴 완전히 겹치지 않는다", () => {
    const base = planStudioCharmPlacement(context({ visible: VISIBLE }), { width: 100, height: 100 });
    const second = planStudioCharmPlacement(context({ visible: VISIBLE, sequenceFor: () => 1 }), { width: 100, height: 100 });
    expect(second.placement.anchor?.x).toBeGreaterThan(base.placement.anchor?.x ?? 0);
    expect(second.placement.anchor?.y).toBeGreaterThan(base.placement.anchor?.y ?? 0);
  });

  it("대상 키별로 호출자가 센 횟수를 받는다", () => {
    const sequenceFor = vi.fn(() => 0);
    const plan = planStudioCharmPlacement(context({ visible: VISIBLE, sequenceFor }), { width: 100, height: 100 });
    expect(sequenceFor).toHaveBeenCalledOnce();
    expect(sequenceFor).toHaveBeenCalledWith(plan.targetKey);
  });

  it("격자 스냅이 켜져 있으면 객체 끌기와 같은 자석 규칙으로 왼쪽 위 모서리를 격자에 맞춘다", () => {
    const selection = { id: "f", type: "frame", x: 103, y: 203, width: 400, height: 300 } as const;
    const item = { width: 200, height: 200 };
    const off = planStudioCharmPlacement(context({ selection }), item);
    const offElement = createCanvasImageElement({ id: "e", src: "", canvasWidth: 720, canvasHeight: 1280, sourceWidth: 200, sourceHeight: 200, placement: off.placement });
    expect(offElement.x).toBe(203);
    const on = planStudioCharmPlacement(
      context({ selection, snap: { enabled: true, gridSize: 40, viewportScale: 1 } }),
      item,
    );
    const onElement = createCanvasImageElement({ id: "e", src: "", canvasWidth: 720, canvasHeight: 1280, sourceWidth: 200, sourceHeight: 200, placement: on.placement });
    expect(onElement.x).toBe(200);
    expect(onElement.y).toBe(253);
  });

  it("스냅 허용 거리는 화면 px 기준이라 축소하면 더 멀리서도 끌어당긴다", () => {
    const selection = { id: "f", type: "frame", x: 103, y: 203, width: 400, height: 300 } as const;
    const item = { width: 200, height: 200 };
    const zoomedOut = planStudioCharmPlacement(
      context({ selection, snap: { enabled: true, gridSize: 40, viewportScale: 0.25 } }),
      item,
    );
    const element = createCanvasImageElement({ id: "e", src: "", canvasWidth: 720, canvasHeight: 1280, sourceWidth: 200, sourceHeight: 200, placement: zoomedOut.placement });
    expect(element.y).toBe(240);
  });

  it("스티커·말풍선의 중심점도 같은 스냅 규칙을 거치고, 스냅이 꺼져 있으면 앵커 그대로다", () => {
    const selection = { id: "f", type: "frame", x: 203, y: 203, width: 400, height: 300 } as const;
    const off = planStudioCharmPlacement(context({ selection }), { width: 80, height: 80 });
    expect(off.point).toEqual({ x: 403, y: 353 });
    const on = planStudioCharmPlacement(
      context({ selection, snap: { enabled: true, gridSize: 40, viewportScale: 1 } }),
      { width: 80, height: 80 },
    );
    // 왼쪽 위 모서리(363)가 격자(360)에 3px 안이라 끌려가고, 세로(313→320)는 7px 이라 허용 거리 밖이다.
    expect(on.point).toEqual({ x: 400, y: 353 });
  });

  it("문서 가장자리 근처 선택에서도 결과가 문서 안에 머문다", () => {
    const plan = planStudioCharmPlacement(
      context({ selection: { type: "image", x: 700, y: 1260, width: 20, height: 20 } }),
      { width: 300, height: 300 },
    );
    const element = createCanvasImageElement({ id: "e", src: "", canvasWidth: 720, canvasHeight: 1280, sourceWidth: 300, sourceHeight: 300, placement: plan.placement });
    expect(element.x).toBeGreaterThanOrEqual(0);
    expect(element.y).toBeGreaterThanOrEqual(0);
    expect(element.x + element.width).toBeLessThanOrEqual(720);
    expect(element.y + element.height).toBeLessThanOrEqual(1280);
  });
});

describe("말풍선 크기", () => {
  it("기본은 260×140 이고 이어 말하기·상태창·러블리만 다르다", () => {
    expect(studioCharmBubbleFootprint("speech")).toEqual({ width: 260, height: 140 });
    expect(studioCharmBubbleFootprint("shout")).toEqual({ width: 260, height: 140 });
    expect(studioCharmBubbleFootprint("double")).toEqual({ width: 280, height: 180 });
    expect(studioCharmBubbleFootprint("system")).toEqual({ width: 280, height: 150 });
    expect(studioCharmBubbleFootprint("heart")).toEqual({ width: 200, height: 180 });
  });
});

let catalog: StudioCharmCatalog;

beforeAll(async () => {
  catalog = buildStudioCharmCatalog({ data: await loadStudioCharmCatalogData(), library: [], libraryReady: true });
});

function descriptor(id: Parameters<StudioCharmCatalog["resolve"]>[0]): StudioCharmDescriptor {
  const resolution = catalog.resolve(id);
  if (resolution.status !== "ready") throw new Error(`${id} 를 해석하지 못했습니다`);
  return resolution.descriptor;
}

function commandsWithSpies() {
  const spies = {
    addRenderedImage: vi.fn(() => true),
    addSticker: vi.fn(),
    addBubble: vi.fn(),
    addBuiltinRasterAsset: vi.fn(async () => true as boolean | void),
    addSfxPreset: vi.fn(async () => undefined),
    openStudioObjectInsert: vi.fn(),
  };
  const commands: StudioCharmHostCommands = spies;
  const totalCalls = () => Object.values(spies).reduce((sum, spy) => sum + spy.mock.calls.length, 0);
  return { spies, commands, totalCalls };
}

describe("참 붙이기: 호스트 명령 한 번 = 되돌리기 한 단계", () => {
  it("SVG 효과는 이미지 삽입 명령을 정확히 한 번, 이름과 계획된 위치와 함께 부른다", async () => {
    const { spies, commands, totalCalls } = commandsWithSpies();
    const result = await activateStudioCharm(descriptor(createStudioCharmId("fx", "radial-focus")), context({ visible: VISIBLE }), commands);
    expect(result).toEqual({ status: "inserted" });
    expect(totalCalls()).toBe(1);
    const call = spies.addRenderedImage.mock.calls[0] as unknown as readonly unknown[];
    expect(String(call[0]).startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(call.slice(1, 6)).toEqual([480, 480, undefined, false, { name: "집중선" }]);
    expect(call[6]).toMatchObject({ anchor: { x: 360, y: 640 } });
  });

  it("호스트가 거절하면 rejected 이고 다른 명령으로 우회하지 않는다", async () => {
    const { spies, commands, totalCalls } = commandsWithSpies();
    spies.addRenderedImage.mockReturnValueOnce(false);
    const result = await activateStudioCharm(descriptor(createStudioCharmId("fx", "speed-lines")), context(), commands);
    expect(result).toEqual({ status: "rejected" });
    expect(totalCalls()).toBe(1);
  });

  it("이모지·말풍선은 계획된 중심점으로 스티커/말풍선 명령을 한 번 부른다", async () => {
    const emoji = commandsWithSpies();
    expect(await activateStudioCharm(descriptor(createStudioCharmId("emoji", "1f4a7")), context({ visible: VISIBLE }), emoji.commands)).toEqual({ status: "inserted" });
    expect(emoji.spies.addSticker).toHaveBeenCalledWith("💧", { x: 360, y: 640 });
    expect(emoji.totalCalls()).toBe(1);
    const bubble = commandsWithSpies();
    await activateStudioCharm(descriptor(createStudioCharmId("bubble", "speech")), context({ visible: VISIBLE }), bubble.commands);
    expect(bubble.spies.addBubble).toHaveBeenCalledWith("speech", { x: 360, y: 640 }, false);
    expect(bubble.totalCalls()).toBe(1);
  });

  it("말풍선은 변종마다 호스트가 놓는 실제 크기로 왼쪽 위 모서리를 격자에 맞춘다", async () => {
    // 컷 중앙(411,389) 기준 260×140 말풍선의 모서리는 (281,319) → 격자(280,320)에 끌려간다.
    const selection = { id: "f", type: "frame", x: 211, y: 239, width: 400, height: 300 } as const;
    const snap = { enabled: true, gridSize: 40, viewportScale: 1 } as const;
    const { spies, commands } = commandsWithSpies();
    await activateStudioCharm(descriptor(createStudioCharmId("bubble", "speech")), context({ selection, snap }), commands);
    expect(spies.addBubble).toHaveBeenCalledWith("speech", { x: 410, y: 390 }, false);
    // 스냅이 꺼져 있으면 컷 중앙 그대로다.
    const off = commandsWithSpies();
    await activateStudioCharm(descriptor(createStudioCharmId("bubble", "speech")), context({ selection }), off.commands);
    expect(off.spies.addBubble).toHaveBeenCalledWith("speech", { x: 411, y: 389 }, false);
  });

  it("내장 일러스트는 기존 일러스트 삽입 명령(출처·권리 요소 포함)을 그대로 부른다", async () => {
    const { spies, commands, totalCalls } = commandsWithSpies();
    const asset = STUDIO_RASTER_ASSETS[0];
    expect(await activateStudioCharm(descriptor(createStudioCharmId("raster", asset.id)), context(), commands)).toEqual({ status: "inserted" });
    expect(spies.addBuiltinRasterAsset).toHaveBeenCalledWith(asset);
    expect(totalCalls()).toBe(1);
    spies.addBuiltinRasterAsset.mockResolvedValueOnce(false);
    expect(await activateStudioCharm(descriptor(createStudioCharmId("raster", asset.id)), context(), commands)).toEqual({ status: "rejected" });
    spies.addBuiltinRasterAsset.mockResolvedValueOnce(undefined);
    expect(await activateStudioCharm(descriptor(createStudioCharmId("raster", asset.id)), context(), commands)).toEqual({ status: "inserted" });
  });

  it("효과음은 기존 효과음 명령으로, 3D 오브젝트는 도구 열기 명령으로 간다", async () => {
    const sfx = commandsWithSpies();
    const sfxDescriptor = descriptor(createStudioCharmId("sfx", "sfx-kwang"));
    expect(await activateStudioCharm(sfxDescriptor, context(), sfx.commands)).toEqual({ status: "inserted" });
    expect(sfx.spies.addSfxPreset).toHaveBeenCalledOnce();
    expect(sfx.totalCalls()).toBe(1);

    const object = commandsWithSpies();
    const objectDescriptor = catalog.descriptors.find((item) => item.action.type === "open-3d");
    expect(objectDescriptor).toBeDefined();
    if (!objectDescriptor || objectDescriptor.action.type !== "open-3d") return;
    expect(await activateStudioCharm(objectDescriptor, context(), object.commands)).toEqual({ status: "opened" });
    expect(object.spies.openStudioObjectInsert).toHaveBeenCalledWith({
      openTarget: objectDescriptor.action.openTarget,
      sourceId: objectDescriptor.action.sourceId,
    });
    expect(object.totalCalls()).toBe(1);
  });

  it("카탈로그 어떤 종류의 참이든 누를 때마다 호스트 명령은 정확히 한 번이다", async () => {
    const kinds = new Set<string>();
    for (const item of catalog.descriptors) {
      if (kinds.has(item.kind)) continue;
      kinds.add(item.kind);
      const { commands, totalCalls } = commandsWithSpies();
      await activateStudioCharm(item, context({ visible: VISIBLE }), commands);
      expect(totalCalls(), `${item.kind} 참`).toBe(1);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });

  it("호스트 명령이 예외를 던지면 failed 로 메시지를 돌려주고 던지지 않는다", async () => {
    const { spies, commands } = commandsWithSpies();
    spies.addRenderedImage.mockImplementationOnce(() => { throw new Error("저장 중이라 붙일 수 없어요"); });
    expect(await activateStudioCharm(descriptor(createStudioCharmId("fx", "radial-focus")), context(), commands)).toEqual({
      status: "failed",
      message: "저장 중이라 붙일 수 없어요",
    });
    spies.addSfxPreset.mockRejectedValueOnce("boom");
    const failed = await activateStudioCharm(descriptor(createStudioCharmId("sfx", "sfx-kwang")), context(), commands);
    expect(failed.status).toBe("failed");
  });
});
