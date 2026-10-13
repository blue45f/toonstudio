// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { StudioBuildPlacementEvent } from "./studio-virtual-space-build-placement";
import {
  createStudioBuildPlacementCanvasController,
  type StudioBuildPlacementCanvasHooks,
} from "./studio-virtual-space-build-placement-canvas";
import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioPlacedFixturePointNear } from "./studio-virtual-space-placed-fixtures";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldSpawn,
} from "./studio-virtual-space-world-manifest";

const world = DEFAULT_STUDIO_WORLD_MANIFEST;
const spawn = studioWorldSpawn(world).point;
const freePoint = studioPlacedFixturePointNear(world, [], spawn)!;
const LAMP = "furniture:floor-lamp";

function graphicsStub() {
  return {
    clear: vi.fn(), setVisible: vi.fn(), setDepth: vi.fn(), fillStyle: vi.fn(),
    fillRoundedRect: vi.fn(), lineStyle: vi.fn(), strokeRoundedRect: vi.fn(),
    lineBetween: vi.fn(), fillEllipse: vi.fn(), fillCircle: vi.fn(), strokeCircle: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fillPath: vi.fn(),
    destroy: vi.fn(),
  };
}

function textStub() {
  return {
    setOrigin: vi.fn(), setDepth: vi.fn(), setVisible: vi.fn(), setText: vi.fn(),
    setPosition: vi.fn(), destroy: vi.fn(),
  };
}

function pointerStub(point: StudioVirtualSpacePoint, button: "left" | "right" = "left") {
  return {
    worldX: point.x, worldY: point.y, wasTouch: false,
    leftButtonDown: () => button === "left",
    rightButtonDown: () => button === "right",
  } as unknown as import("phaser").Input.Pointer;
}

function setup() {
  const bridge = new StudioVirtualSpaceEngineBridge();
  const events: StudioBuildPlacementEvent[] = [];
  const heldKeys = new Set<string>();
  const canvas = document.createElement("canvas");
  const scene = {
    add: { graphics: () => graphicsStub(), text: () => textStub() },
    input: { on: vi.fn(), off: vi.fn() },
    game: { canvas },
  } as unknown as import("phaser").Scene;
  const hooks: StudioBuildPlacementCanvasHooks = {
    bridge,
    heldKeys,
    badgeColors: { plate: 0x1c1f26, text: 0xffffff },
    getWorld: () => world,
    getOccupiedPoints: () => [],
    getPlacedCount: () => 0,
    getSelfPoint: () => spawn,
    isInputBlocked: () => false,
    reducedMotion: () => false,
    translate: (ko) => ko,
    emit: (event) => events.push(event),
    onSessionStart: vi.fn(),
  };
  const controller = createStudioBuildPlacementCanvasController(scene, hooks);
  return { bridge, events, heldKeys, canvas, controller, hooks };
}

const verdicts = (events: StudioBuildPlacementEvent[]) =>
  events.filter((event) => event.type === "verdict");

describe("StudioBuildPlacementCanvasController", () => {
  it("세션이 없으면 어떤 입력도 가로채지 않는다", () => {
    const { controller } = setup();
    controller.update(0, { canvasFocused: true });
    expect(controller.active).toBe(false);
    expect(controller.consumePointerDown(pointerStub(freePoint))).toBe(false);
    expect(controller.handleEscape()).toBe(false);
  });

  it("브리지 세션이 열리면 활성화되고 판정 이벤트는 서명이 바뀔 때만 나간다", () => {
    const { bridge, controller, events, hooks } = setup();
    bridge.beginBuildPlacement(LAMP);
    controller.update(0, { canvasFocused: true });
    expect(controller.active).toBe(true);
    expect(hooks.onSessionStart).toHaveBeenCalledTimes(1);
    expect(verdicts(events)).toHaveLength(1);
    controller.update(16, { canvasFocused: true });
    expect(verdicts(events)).toHaveLength(1);
  });

  it("빈 지점을 찍으면 디스크립터와 같은 규칙의 배치 요청이 확정된다", () => {
    const { bridge, controller, events } = setup();
    bridge.beginBuildPlacement(LAMP);
    controller.update(0, { canvasFocused: true });
    expect(controller.consumePointerDown(pointerStub(freePoint))).toBe(true);
    const confirm = events.find((event) => event.type === "confirm");
    expect(confirm).toMatchObject({
      type: "confirm",
      request: { entryId: LAMP, category: "furniture", refId: "floor-lamp", point: freePoint, rotation: 0 },
    });
  });

  it("확정한 지점은 페이지 반영 전에도 세션 점유로 잡혀 이중 배치를 막는다", () => {
    const { bridge, controller, events } = setup();
    bridge.beginBuildPlacement(LAMP);
    controller.update(0, { canvasFocused: true });
    controller.consumePointerDown(pointerStub(freePoint));
    controller.update(32, { canvasFocused: true });
    const last = verdicts(events).at(-1);
    expect(last).toMatchObject({ type: "verdict", verdict: { ok: false, reason: "occupied", point: freePoint } });
    // 같은 지점을 다시 찍으면 확정 대신 거부 이벤트가 나간다.
    controller.consumePointerDown(pointerStub(freePoint));
    expect(events.filter((event) => event.type === "confirm")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "rejected", reason: "occupied" });
  });

  it("월드 가장자리를 찍으면 bounds 거부만 나가고 확정은 없다", () => {
    const { bridge, controller, events } = setup();
    bridge.beginBuildPlacement(LAMP);
    controller.update(0, { canvasFocused: true });
    controller.consumePointerDown(pointerStub({ x: 0, y: 0 }));
    expect(events.some((event) => event.type === "confirm")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "rejected", reason: "bounds" });
  });

  it("우클릭은 취소하고, 페이지가 세션을 닫기 전에는 다시 열리지 않는다", () => {
    const { bridge, controller, events } = setup();
    bridge.beginBuildPlacement(LAMP);
    controller.update(0, { canvasFocused: true });
    expect(controller.consumePointerDown(pointerStub(freePoint, "right"))).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "cancelled" });
    expect(controller.active).toBe(false);
    controller.update(48, { canvasFocused: true });
    expect(controller.active).toBe(false);
    // 페이지가 세션을 닫았다가 다시 열면 정상적으로 재개된다.
    bridge.endBuildPlacement();
    controller.update(64, { canvasFocused: true });
    bridge.beginBuildPlacement(LAMP);
    controller.update(80, { canvasFocused: true });
    expect(controller.active).toBe(true);
  });

  it("Esc로 취소할 수 있다", () => {
    const { bridge, controller, events } = setup();
    bridge.beginBuildPlacement(LAMP);
    controller.update(0, { canvasFocused: true });
    expect(controller.handleEscape()).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "cancelled" });
    expect(controller.active).toBe(false);
  });

  it("키보드만으로 조준·확정할 수 있다(방향키 이동 + Enter 확정 + R 회전)", () => {
    const { bridge, controller, events, heldKeys, canvas } = setup();
    bridge.beginBuildPlacement(LAMP);
    controller.update(0, { canvasFocused: true });
    const start = verdicts(events).at(-1);
    expect(start?.type).toBe("verdict");
    if (start?.type !== "verdict") throw new Error("verdict expected");
    // 고스트를 빈 지점 위로 키보드로 옮긴다: 시작 지점에서 freePoint까지의 격자 차이만큼 누른다.
    const dxSteps = Math.round((freePoint.x - start.verdict.point.x) / 16);
    const dySteps = Math.round((freePoint.y - start.verdict.point.y) / 16);
    heldKeys.add(dxSteps >= 0 ? "ArrowRight" : "ArrowLeft");
    for (let i = 0; i < Math.abs(dxSteps); i += 1) {
      controller.update(100 + i * 400, { canvasFocused: true });
      heldKeys.delete(dxSteps >= 0 ? "ArrowRight" : "ArrowLeft");
      controller.update(100 + i * 400 + 16, { canvasFocused: true });
      heldKeys.add(dxSteps >= 0 ? "ArrowRight" : "ArrowLeft");
    }
    heldKeys.clear();
    heldKeys.add(dySteps >= 0 ? "ArrowDown" : "ArrowUp");
    for (let i = 0; i < Math.abs(dySteps); i += 1) {
      controller.update(2_000 + i * 400, { canvasFocused: true });
      heldKeys.delete(dySteps >= 0 ? "ArrowDown" : "ArrowUp");
      controller.update(2_000 + i * 400 + 16, { canvasFocused: true });
      heldKeys.add(dySteps >= 0 ? "ArrowDown" : "ArrowUp");
    }
    heldKeys.clear();
    const aimed = verdicts(events).at(-1);
    expect(aimed).toMatchObject({ type: "verdict", verdict: { ok: true, point: freePoint } });
    canvas.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
    const confirm = events.find((event) => event.type === "confirm");
    expect(confirm).toMatchObject({ type: "confirm", request: { point: freePoint, rotation: 90 } });
  });
});
