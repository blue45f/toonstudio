import { describe, expect, it } from "vitest";

import { CAMPUS_TERRAIN } from "./studio-virtual-space-campus-blueprint";
import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import {
  createStudioMotionFeelFrame,
  STUDIO_MOTION_FEEL_REFERENCE_SPRINT,
  StudioMotionFeelRuntime,
  studioCampusFloorSurface,
  studioMotionFeelTerrainSurface,
} from "./studio-virtual-space-motion-feel-runtime";

interface FakeSprite {
  visible: boolean;
  alpha: number;
  depth: number;
  x: number;
  y: number;
  textureKey: string;
  setVisible(value: boolean): FakeSprite;
  setTint(value: number): FakeSprite;
  setTexture(key: string): FakeSprite;
  setOrigin(): FakeSprite;
  setDisplaySize(): FakeSprite;
  setFlipX(): FakeSprite;
  setPosition(x: number, y: number): FakeSprite;
  setDepth(value: number): FakeSprite;
  setAlpha(value: number): FakeSprite;
  destroy(): void;
}

function fakeSprite(): FakeSprite {
  const sprite: FakeSprite = {
    visible: true, alpha: 1, depth: 0, x: 0, y: 0, textureKey: "",
    setVisible(value) { sprite.visible = value; return sprite; },
    setTint() { return sprite; },
    setTexture(key) { sprite.textureKey = key; return sprite; },
    setOrigin() { return sprite; },
    setDisplaySize() { return sprite; },
    setFlipX() { return sprite; },
    setPosition(x, y) { sprite.x = x; sprite.y = y; return sprite; },
    setDepth(value) { sprite.depth = value; return sprite; },
    setAlpha(value) { sprite.alpha = value; return sprite; },
    destroy() { sprite.visible = false; },
  };
  return sprite;
}

interface FakeBurst { count: number; x: number; y: number; tint: number }

/** 이미터 대역: 터뜨린 기록·깊이 지정 기록·파괴 여부를 남긴다. */
function fakeEmitter() {
  const log = { bursts: [] as FakeBurst[], depths: [] as number[], destroyed: false };
  let tint = 0;
  const emitter = {
    log,
    setDepth(value: number) { log.depths.push(value); return emitter; },
    setParticleTint(value: number) { tint = value; return emitter; },
    explode(count: number, x: number, y: number) { log.bursts.push({ count, x, y, tint }); },
    destroy() { log.destroyed = true; },
  };
  return emitter;
}

function fakeScene() {
  const dust = fakeEmitter();
  const spark = fakeEmitter();
  const bursts = dust.log.bursts;
  const sprites: FakeSprite[] = [];
  const graphics = { fillStyle() { return graphics; }, fillCircle() { return graphics; }, generateTexture() { /* fake */ }, destroy() { /* fake */ } };
  const textures = new Set<string>();
  const scene = {
    textures: { exists: (key: string) => textures.has(key) },
    make: { graphics: () => { textures.add("studio-move-dust"); return graphics; } },
    add: {
      // 폭죽 불꽃 이미터만 중력(gravityY)을 쓴다.
      particles: (_x: number, _y: number, _key: string, config: { gravityY?: number }) => (config.gravityY === undefined ? dust : spark),
      sprite: () => { const sprite = fakeSprite(); sprites.push(sprite); return sprite; },
    },
  };
  return { scene, bursts, sprites, dust: dust.log, spark: spark.log };
}

/** 잔상 복제 원본(내 캐릭터)처럼 텍스처·프레임·원점을 가진 스프라이트. */
function sourceSprite() {
  return Object.assign(fakeSprite(), {
    texture: { key: "self-walk" }, frame: { name: 3 }, originX: 0.5, originY: 0.92,
    displayWidth: 60, displayHeight: 80, flipX: false, depth: 1_501,
  });
}

function runtimeFor() {
  const fake = fakeScene();
  const runtime = new StudioMotionFeelRuntime(fake.scene as unknown as ConstructorParameters<typeof StudioMotionFeelRuntime>[0]);
  return { runtime, ...fake };
}

describe("캠퍼스 발밑 재질", () => {
  it("구역 바닥을 먼저 읽고 비었으면 섬 잔디를 읽는다", () => {
    const tilemap = studioVirtualCampusManifest(false).tilemap;
    expect(tilemap).toBeDefined();
    if (!tilemap) return;
    // 로비(대리석) 한가운데
    expect(studioCampusFloorSurface(tilemap, 448, 500)?.surface).toBe("tile");
    // 카페(붉은 나무)
    expect(studioCampusFloorSurface(tilemap, 2688, 420)?.surface).toBe("wood");
    // 토크(카펫)
    expect(studioCampusFloorSurface(tilemap, 448, 1000)?.surface).toBe("carpet");
    // 섬 가장자리 잔디(구역 바닥 없음)
    expect(studioCampusFloorSurface(tilemap, 100, 1500)?.color).toBe(studioCampusFloorSurface(tilemap, 2950, 1500)?.color);
    expect(studioCampusFloorSurface(tilemap, -10, 10)).toBeNull();
    expect(CAMPUS_TERRAIN.marble).toBe(5);
  });

  it("일반 지형은 main 캔버스와 같은 분류를 쓴다", () => {
    expect(studioMotionFeelTerrainSurface("stone").surface).toBe("tile");
    expect(studioMotionFeelTerrainSurface("bridge").surface).toBe("wood");
    expect(studioMotionFeelTerrainSurface("grass").surface).toBe("carpet");
  });
});

describe("이동 게임필 런타임", () => {
  it("달리다 멈추면 먼지·퍼프를 내고 달리기 최고속에서만 잔상을 남긴다", () => {
    const { runtime, bursts, sprites } = runtimeFor();
    const source = sourceSprite();
    const frame = createStudioMotionFeelFrame();
    Object.assign(frame, { deltaSeconds: 1 / 60, sprintSpeed: 208, depth: 1_500, particleDensity: 1 });
    const ghosts = () => sprites.filter((sprite) => sprite.visible).length;
    // 걷기(160px/s): 달리기 최고속 80% 미만이라 잔상이 없다.
    for (let index = 0; index < 30; index += 1) {
      Object.assign(frame, { time: index * 16, x: 100 + index * 2.6, y: 200, speed: 160, inputSpeed: 160 });
      runtime.step(frame, source as never);
    }
    expect(ghosts()).toBe(0);
    // 달리기(208px/s): 90ms마다 잔상.
    for (let index = 30; index < 60; index += 1) {
      Object.assign(frame, { time: index * 16, x: 100 + index * 3.4, y: 200, speed: 208, inputSpeed: 208 });
      runtime.step(frame, source as never);
    }
    expect(ghosts()).toBeGreaterThan(0);
    const before = bursts.length;
    // 입력을 놓아 급정지: 미끄럼 먼지와 착지 퍼프.
    Object.assign(frame, { time: 1_000, speed: 40, inputSpeed: 0 });
    runtime.step(frame, source as never);
    expect(bursts.length).toBeGreaterThan(before);
    expect(bursts.at(-1)!.tint).toBe(0xe8e4da);
    // 잔상은 수명이 지나면 숨는다.
    Object.assign(frame, { time: 2_000, speed: 0 });
    runtime.step(frame, source as never);
    expect(ghosts()).toBe(0);
  });

  it("모션 줄이기면 아무것도 내지 않는다", () => {
    const { runtime, bursts, sprites } = runtimeFor();
    const frame = createStudioMotionFeelFrame();
    Object.assign(frame, { deltaSeconds: 1 / 30, sprintSpeed: STUDIO_MOTION_FEEL_REFERENCE_SPRINT, reducedMotion: true });
    for (let index = 0; index < 40; index += 1) {
      Object.assign(frame, { time: index * 33, x: 100 + index * 9, y: 200, speed: index < 30 ? 276 : 0, inputSpeed: index < 30 ? 276 : 0 });
      runtime.step(frame, sourceSprite() as never);
    }
    expect(bursts).toEqual([]);
    expect(sprites.some((sprite) => sprite.visible)).toBe(false);
  });
});

describe("폭죽 불꽃", () => {
  it("먼지 이미터와 따로, 지정한 깊이에서 색을 입혀 터뜨린다", () => {
    const { runtime, bursts, dust, spark } = runtimeFor();
    runtime.spark(120, 80, 160_300, 14, 0xffd166);
    runtime.spark(10, 20, 160_300, 12, 0xff9fb8);
    expect(spark.bursts).toEqual([
      { count: 14, x: 120, y: 80, tint: 0xffd166 },
      { count: 12, x: 10, y: 20, tint: 0xff9fb8 },
    ]);
    expect(spark.depths).toEqual([160_300, 160_300]);
    expect(bursts, "먼지 이미터는 건드리지 않는다").toEqual([]);
    expect(dust.depths).toEqual([]);
  });

  it("발밑 먼지와 같은 파티클 밀도를 따른다: 밀도만큼 개수를 줄이고, 모션 줄이기·밀도 0이면 터뜨리지 않는다", () => {
    const { runtime, spark } = runtimeFor();
    const frame = createStudioMotionFeelFrame();
    Object.assign(frame, { deltaSeconds: 1 / 60, sprintSpeed: 208, depth: 1_500, time: 0, x: 100, y: 200 });
    Object.assign(frame, { particleDensity: 0.5 });
    runtime.step(frame, null);
    runtime.spark(0, 0, 1, 14, 0xffffff);
    runtime.spark(0, 0, 1, 1, 0xffffff);
    expect(spark.bursts.map((burst) => burst.count), "14×0.5=7, 1×0.5는 반올림해 1").toEqual([7, 1]);
    Object.assign(frame, { particleDensity: 0.2 });
    runtime.step(frame, null);
    runtime.spark(0, 0, 1, 2, 0xffffff);
    expect(spark.bursts, "2×0.2=0.4는 반올림하면 0이라 터뜨리지 않는다").toHaveLength(2);
    Object.assign(frame, { particleDensity: 1, reducedMotion: true });
    runtime.step(frame, null);
    runtime.spark(0, 0, 1, 14, 0xffffff);
    Object.assign(frame, { particleDensity: 0, reducedMotion: false });
    runtime.step(frame, null);
    runtime.spark(0, 0, 1, 14, 0xffffff);
    expect(spark.bursts).toHaveLength(2);
    Object.assign(frame, { particleDensity: 1 });
    runtime.step(frame, null);
    runtime.spark(0, 0, 1, 14, 0xffffff);
    expect(spark.bursts.at(-1)?.count).toBe(14);
  });

  it("개수가 0 이하면 터뜨리지 않는다", () => {
    const { runtime, spark } = runtimeFor();
    runtime.spark(0, 0, 1, 0, 0xffffff);
    runtime.spark(0, 0, 1, -3, 0xffffff);
    expect(spark.bursts).toEqual([]);
  });

  it("발밑 효과 프레임이 먼지 깊이를 바꿔도 불꽃 깊이는 그대로다", () => {
    const { runtime, dust, spark } = runtimeFor();
    const frame = createStudioMotionFeelFrame();
    Object.assign(frame, { deltaSeconds: 1 / 60, sprintSpeed: 208, depth: 1_500, particleDensity: 1, time: 0, x: 100, y: 200 });
    runtime.spark(0, 0, 160_300, 10, 0xffffff);
    runtime.step(frame, null);
    runtime.step(frame, null);
    expect(spark.depths).toEqual([160_300]);
    expect(dust.depths).toEqual([1_498, 1_498]);
  });

  it("정리할 때 두 이미터를 모두 파괴한다", () => {
    const { runtime, dust, spark } = runtimeFor();
    runtime.destroy();
    expect(dust.destroyed).toBe(true);
    expect(spark.destroyed).toBe(true);
  });
});
