// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import { STUDIO_INTERACT_KEY_CODES } from "../studio-virtual-space-interact-prompt";
import type { StudioVirtualSpacePeer } from "../studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import { TOON_HQ_CAMPUS_PORTAL, TOON_HQ_PHYSICS_PROPS } from "./hq/toon-hq-blueprint";
import { studioVirtualToonHqManifest } from "./hq/toon-hq-manifest";
import { advanceOffice2dActor, createOffice2dActor, office2dActorBob, office2dActorFrame } from "./office2d-actors";
import type { Office2dCanvas2D } from "./office2d-procedural-art";
import type { Office2dDrawable, Office2dRendererHost } from "./office2d-renderer";
import { Office2dRuntime, type Office2dRuntimeCallbacks } from "./office2d-runtime";

class FakeGradient {
  addColorStop(): void {}
}

/** 실제로 쓰는 2D 컨텍스트 메서드만 기록하는 대역. */
class FakeContext implements Office2dCanvas2D {
  calls = new Map<string, number>();
  fillStyle: string | CanvasGradient | CanvasPattern = "#000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000";
  lineWidth = 1;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  imageSmoothingEnabled = true;
  lineJoin: CanvasLineJoin = "miter";
  lineCap: CanvasLineCap = "butt";
  private count(name: string): void { this.calls.set(name, (this.calls.get(name) ?? 0) + 1); }
  save(): void { this.count("save"); }
  restore(): void { this.count("restore"); }
  translate(): void {}
  scale(): void {}
  rotate(): void {}
  setTransform(): void { this.count("setTransform"); }
  fillRect(_x?: number, _y?: number, width?: number, height?: number): void {
    this.count("fillRect");
    // 뷰포트(1280×720, 배율 1) 전체를 반투명으로 덮는 칠은 순간 이동 막뿐이다.
    if (width === 1280 && height === 720 && this.globalAlpha > 0.05 && this.globalAlpha < 0.95) this.count("viewportVeil");
  }
  strokeRect(): void {}
  clearRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  ellipse(): void {}
  quadraticCurveTo(): void {}
  rect(): void {}
  fill(): void { this.count("fill"); }
  stroke(): void {}
  drawImage(): void { this.count("drawImage"); }
  fillText(): void { this.count("fillText"); }
  measureText(text: string): TextMetrics {
    const width = text.length * 7;
    return { width, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width,
      fontBoundingBoxAscent: 9, fontBoundingBoxDescent: 3, emHeightAscent: 9, emHeightDescent: 3, hangingBaseline: 8, alphabeticBaseline: 0, ideographicBaseline: -2 };
  }
  createLinearGradient(): CanvasGradient { return new FakeGradient(); }
  createRadialGradient(): CanvasGradient { return new FakeGradient(); }
  clip(): void {}
  setLineDash(): void {}
}

function selfState(x: number, y: number) {
  return { x, y, zoneId: "hq-lobby", facing: "up" as const, activity: "available" as const, moving: false, avatarIndex: 1 };
}

function snapshot(peers: readonly StudioVirtualSpacePeer[] = [], x = 336, y = 1470): StudioVirtualSpaceSnapshot {
  return {
    self: selfState(x, y), peers, nearbyPeers: [], selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null,
    peerTyping: [], peerImpacts: [], objectStates: [], peerFixtures: [], direct: false,
  };
}

function peer(sessionId: string, x: number, y: number): StudioVirtualSpacePeer {
  return {
    participant: { sessionId, displayName: "동료 작가", role: "editor", joinedAt: 0 } as unknown as StudioVirtualSpacePeer["participant"],
    state: { ...selfState(x, y), avatarIndex: 3 },
    lastSeen: 0,
    sequence: 1,
  };
}

function setup(options: { readonly snapshot?: StudioVirtualSpaceSnapshot; readonly withImages?: boolean; readonly reducedMotion?: boolean } = {}) {
  let clock = Date.UTC(2026, 9, 28, 3, 0, 0);
  let current = options.snapshot ?? snapshot();
  const bridge = new StudioVirtualSpaceEngineBridge();
  const callbacks = {
    onLocalState: vi.fn(),
    onInteract: vi.fn(),
    onNearbyInteractionChange: vi.fn(),
    onPeerSelect: vi.fn(),
    onCancelFollow: vi.fn(),
    onPortal: vi.fn(),
    onZoneChange: vi.fn(),
    onNearbyNpcsChange: vi.fn(),
    onStuckChange: vi.fn(),
    onGhostModeChange: vi.fn(),
    onNpcInteract: vi.fn(),
    onSelfImpact: vi.fn(),
    onRuntimeMetrics: vi.fn(),
  } satisfies Office2dRuntimeCallbacks;
  const image = document.createElement("canvas");
  image.width = 128;
  image.height = 192;
  const host: Office2dRendererHost = {
    createSurface: () => null,
    image: (): Office2dDrawable | null => (options.withImages ? image : null),
  };
  const runtime = new Office2dRuntime({
    manifest: studioVirtualToonHqManifest(false),
    bridge,
    host,
    selfIdentity: "me",
    getSnapshot: () => current,
    getSelfName: () => "나",
    getSeatedActors: () => [],
    getCallbacks: () => callbacks,
    getLanguage: () => "ko",
    getReducedMotion: () => options.reducedMotion ?? true,
    clock: () => clock,
  });
  runtime.setViewport(1280, 720);
  const run = (seconds: number) => {
    for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 1 / 60) {
      clock += 1000 / 60;
      runtime.frame(1 / 60);
    }
  };
  return { runtime, bridge, callbacks, run, setSnapshot: (next: StudioVirtualSpaceSnapshot) => { current = next; } };
}

describe("Office2dRuntime", () => {
  it("로비 스폰에서 시작하고 준비되면 첫 구역 이벤트를 한 번 보낸다", () => {
    const { runtime, callbacks } = setup();
    runtime.start();
    runtime.start();
    expect(callbacks.onZoneChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onZoneChange.mock.calls[0]?.[0]).toMatchObject({ roomId: "hq-lobby", reason: "initial" });
    expect(runtime.debugState().self).toEqual({ x: 336, y: 1470 });
  });

  it("W로 걸어 로비 북쪽 문을 지나 남쪽 홀에 들어가면 구역 변경과 로컬 상태를 알린다", () => {
    const { runtime, callbacks, run } = setup();
    runtime.start();
    runtime.keyDown("KeyW");
    run(1.6);
    const state = runtime.debugState();
    expect(state.self.y).toBeLessThan(1150);
    expect(state.facing).toBe("up");
    expect(callbacks.onZoneChange.mock.calls.some(([zone]) => zone.roomId === "hq-south-hall" && zone.reason === "enter")).toBe(true);
    expect(callbacks.onLocalState).toHaveBeenCalled();
    expect(callbacks.onLocalState.mock.calls.at(-1)?.[0]).toMatchObject({ moving: true, facing: "up" });
  });

  it("대각선 이동도 같은 속도로 정규화된다", () => {
    const straight = setup();
    straight.runtime.start();
    straight.runtime.keyDown("KeyA");
    straight.run(0.5);
    const straightDistance = 336 - straight.runtime.debugState().self.x;
    const diagonal = setup();
    diagonal.runtime.start();
    diagonal.runtime.keyDown("KeyA");
    diagonal.runtime.keyDown("KeyW");
    diagonal.run(0.5);
    const end = diagonal.runtime.debugState().self;
    const diagonalDistance = Math.hypot(336 - end.x, 1470 - end.y);
    expect(diagonalDistance).toBeGreaterThan(straightDistance * 0.9);
    expect(diagonalDistance).toBeLessThan(straightDistance * 1.1);
  });

  it("순간 이동 직후에는 어두운 막이 가장 진하게 시작해 340ms 안에 부드럽게 풀린다", () => {
    const { runtime, bridge, run } = setup({ reducedMotion: false });
    runtime.start();
    run(0.1);
    expect(runtime.teleportVeil()).toBe(0);
    bridge.requestTeleport({ x: 700, y: 1330 });
    run(1 / 60);
    const first = runtime.teleportVeil();
    expect(first).toBeGreaterThan(0.6);
    expect(first).toBeLessThanOrEqual(0.78);
    run(0.12);
    const middle = runtime.teleportVeil();
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(first);
    run(0.3);
    expect(runtime.teleportVeil()).toBe(0);
  });

  it("순간 이동 막은 화면을 한 번 덮어 그리고, 풀린 뒤에는 그리지 않는다", () => {
    const { runtime, bridge, run } = setup({ reducedMotion: false });
    runtime.start();
    run(0.1);
    const calm = new FakeContext();
    runtime.draw(calm, 1);
    expect(calm.calls.get("viewportVeil") ?? 0).toBe(0);
    bridge.requestTeleport({ x: 700, y: 1330 });
    run(1 / 60);
    const veiled = new FakeContext();
    runtime.draw(veiled, 1);
    expect(veiled.calls.get("viewportVeil")).toBe(1);
    run(0.5);
    const settled = new FakeContext();
    runtime.draw(settled, 1);
    expect(settled.calls.get("viewportVeil") ?? 0).toBe(0);
  });

  it("동작 줄이기에서는 순간 이동에 막을 쓰지 않는다", () => {
    const { runtime, bridge, run } = setup({ reducedMotion: true });
    runtime.start();
    bridge.requestTeleport({ x: 700, y: 1330 });
    run(1 / 60);
    expect(runtime.teleportVeil()).toBe(0);
  });

  it("벽을 통과하지 못한다(로비 동쪽 벽)", () => {
    const { runtime, run } = setup();
    runtime.start();
    runtime.keyDown("KeyD");
    run(3);
    expect(runtime.debugState().self.x).toBeLessThanOrEqual(624 - 12 - 12 + 0.6);
  });

  it("커피 머신 가까이에서 E를 누르면 상호작용을 연다", () => {
    const { runtime, bridge, callbacks, run } = setup();
    runtime.start();
    bridge.requestTeleport({ x: 700, y: 1330 });
    run(0.2);
    expect(callbacks.onNearbyInteractionChange.mock.calls.at(-1)?.[0]?.id).toBe("hq-lounge-coffee");
    const interactKey = [...STUDIO_INTERACT_KEY_CODES][0] ?? "KeyE";
    runtime.keyDown(interactKey);
    run(0.05);
    expect(callbacks.onInteract).toHaveBeenCalledWith(expect.objectContaining({ id: "hq-lounge-coffee", action: "community" }));
  });

  it("로비 출입문 포털을 밟으면 캠퍼스 포털을 한 번만 연다", () => {
    const { runtime, bridge, callbacks, run } = setup();
    runtime.start();
    bridge.requestTeleport({ x: TOON_HQ_CAMPUS_PORTAL.point.x, y: TOON_HQ_CAMPUS_PORTAL.point.y - 70 });
    run(0.1);
    runtime.keyDown("KeyS");
    run(1.2);
    expect(callbacks.onPortal).toHaveBeenCalledTimes(1);
    expect(callbacks.onPortal.mock.calls[0]?.[0]).toMatchObject({ id: TOON_HQ_CAMPUS_PORTAL.id, href: TOON_HQ_CAMPUS_PORTAL.href });
  });

  it("라운지 짐볼을 밀면 물리로 굴러가고 충돌을 알린다", () => {
    const { runtime, bridge, callbacks, run } = setup();
    runtime.start();
    const ball = TOON_HQ_PHYSICS_PROPS.find((prop) => prop.id === "hq-lounge-ball");
    expect(ball).toBeDefined();
    if (!ball) return;
    const ballIndex = TOON_HQ_PHYSICS_PROPS.indexOf(ball);
    bridge.requestTeleport({ x: ball.x - 70, y: ball.y });
    run(0.1);
    runtime.keyDown("ShiftLeft");
    runtime.keyDown("KeyD");
    run(0.8);
    const moved = runtime.debugState().props[ballIndex];
    expect(moved && moved.x - ball.x).toBeGreaterThan(20);
    expect(callbacks.onSelfImpact).toHaveBeenCalled();
  });

  it("클릭한 곳까지 경로를 따라 걸어간다", () => {
    const { runtime, run } = setup();
    runtime.start();
    run(0.05);
    const target = runtime.camera.worldToScreen({ x: 470, y: 1500 });
    runtime.tap(target.x, target.y);
    run(2.5);
    const self = runtime.debugState().self;
    expect(Math.hypot(self.x - 470, self.y - 1500)).toBeLessThan(16);
  });

  it("동료를 그리고, 동료를 누르면 선택 콜백을 부른다", () => {
    const harness = setup({ snapshot: snapshot([peer("peer-1", 420, 1460)]) });
    harness.runtime.start();
    harness.run(0.3);
    expect(harness.runtime.debugState().peers).toBe(1);
    const screen = harness.runtime.camera.worldToScreen({ x: 420, y: 1440 });
    harness.runtime.tap(screen.x, screen.y);
    expect(harness.callbacks.onPeerSelect).toHaveBeenCalledWith("peer-1");
    harness.setSnapshot(snapshot());
    harness.run(0.7);
    expect(harness.runtime.debugState().peers).toBe(0);
  });

  it("G로 고스트 모드를 켜고 알린다", () => {
    const { runtime, callbacks, bridge } = setup();
    runtime.keyDown("KeyG");
    expect(callbacks.onGhostModeChange).toHaveBeenCalledWith(true);
    expect(bridge.isGhostMode()).toBe(true);
  });

  it("이미지 유무와 관계없이 한 프레임을 그린다(폴백 포함)", () => {
    for (const withImages of [false, true]) {
      const { runtime, run } = setup({ withImages, snapshot: snapshot([peer("peer-2", 400, 1450)]) });
      runtime.start();
      run(0.2);
      const ctx = new FakeContext();
      runtime.draw(ctx, 2);
      expect(ctx.calls.get("fillRect") ?? 0).toBeGreaterThan(10);
      expect(ctx.calls.get("fillText") ?? 0).toBeGreaterThan(0);
      if (withImages) expect(ctx.calls.get("drawImage") ?? 0).toBeGreaterThan(5);
      expect(ctx.calls.get("save")).toBe(ctx.calls.get("restore"));
    }
  });

  it("런타임 지표를 1초마다 보낸다", () => {
    const { runtime, callbacks, run } = setup();
    runtime.start();
    run(1.2);
    expect(callbacks.onRuntimeMetrics).toHaveBeenCalled();
    expect(callbacks.onRuntimeMetrics.mock.calls[0]?.[0]).toMatchObject({ npcCount: 7, peerCount: 0 });
  });

  it("낮과 밤 밝기를 계산한다", () => {
    const { runtime, bridge } = setup();
    bridge.setDayNightCycle({ enabled: true, startMs: 0, now: 12 * 3_600_000 });
    expect(runtime.daylight()).toBeCloseTo(1);
    bridge.setDayNightCycle({ enabled: true, startMs: 0, now: 0 });
    expect(runtime.daylight()).toBeCloseTo(0.3);
  });

  it("근처 물리 소품 앞에서 Space를 누르면 방향 충격량과 스핀으로 소품을 찬다", () => {
    const { runtime, bridge, run } = setup();
    runtime.start();
    const ball = TOON_HQ_PHYSICS_PROPS.find((prop) => prop.id === "hq-lounge-ball");
    expect(ball).toBeDefined();
    if (!ball) return;
    const ballIndex = TOON_HQ_PHYSICS_PROPS.indexOf(ball);
    bridge.requestTeleport({ x: ball.x - 36, y: ball.y });
    run(0.1);
    runtime.keyDown("Space");
    run(0.6);
    const moved = runtime.debugState().props[ballIndex];
    expect(moved && moved.x - ball.x).toBeGreaterThan(25);
  });

  it("8프레임 연속 보행 주기와 정지 수렴·기울기·스쿼시 애니메이션이 자연스럽게 작동한다", () => {
    const actor = createOffice2dActor({
      id: "tester",
      kind: "self",
      character: "artist",
      accent: "#f08a7e",
      name: "테스터",
      x: 100,
      y: 100,
      facing: "right",
      now: 0,
    });
    expect(office2dActorFrame(actor)).toEqual({ row: 2, col: 0 });
    const visitedCols = new Set<number>();
    for (let step = 1; step <= 24; step += 1) {
      advanceOffice2dActor(actor, 100 + step * 3.5, 100, 1 / 60);
      visitedCols.add(office2dActorFrame(actor).col);
    }
    // 1~8열 보행 프레임을 순회하고 정지 열(0)에 머물지 않는다.
    expect(visitedCols.size).toBeGreaterThanOrEqual(6);
    expect([...visitedCols].every((col) => col >= 1 && col <= 8)).toBe(true);
    expect(actor.leanAngle).toBeGreaterThan(0.01);
    const walkingPose = office2dActorBob(actor, 1.0, false);
    expect(walkingPose.offsetY).toBeLessThan(0);
    expect(walkingPose.shadowScale).toBeLessThanOrEqual(1);

    // 멈추면 gaitBlend가 감쇠하며 정지 프레임(0열)으로 매끄럽게 복귀한다.
    for (let step = 0; step < 30; step += 1) {
      advanceOffice2dActor(actor, actor.x, actor.y, 1 / 60);
    }
    expect(actor.moving).toBe(false);
    expect(office2dActorFrame(actor).col).toBe(0);
  });

  it("빈 책상 좌석 위치에 멈추면 상주 동료가 양보하고 자동으로 착석 자세로 전환된다", () => {
    const { runtime, bridge, run } = setup();
    runtime.start();
    const deskSeat = runtime.scene.seats.find((seat) => seat.chair === "chair-back");
    expect(deskSeat).toBeDefined();
    if (!deskSeat) return;
    bridge.requestTeleport(deskSeat.anchor);
    run(0.3);
    expect(runtime.debugState().seated).toBe(true);
    expect(runtime.debugState().facing).toBe("up");
  });
});
