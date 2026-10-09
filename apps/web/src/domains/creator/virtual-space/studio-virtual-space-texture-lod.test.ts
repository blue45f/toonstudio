import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_LANCZOS_HALF_WEIGHTS,
  studioHalveRgba,
  studioLodCellsOverlap,
  studioLodImageStages,
  studioPremultiplyRgba,
  type StudioRgbaImage,
} from "./studio-virtual-space-texture-lod-pixels";
import {
  STUDIO_TEXTURE_LOD_FLAG_KEY,
  StudioTextureLodRuntime,
  createStudioTextureLod,
  studioTextureDensity,
  studioTextureLodLevel,
  type StudioLodRenderer,
  type StudioLodScene,
  type StudioLodTexture,
  type StudioLodWrapper,
} from "./studio-virtual-space-texture-lod";

function solid(width: number, height: number, rgba: readonly [number, number, number, number]): StudioRgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) data.set(rgba, index);
  return { data, width, height };
}

function pixel(image: StudioRgbaImage, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  return [image.data[at], image.data[at + 1], image.data[at + 2], image.data[at + 3]];
}

function runStages<T>(stages: Generator<void, T>): T {
  for (;;) {
    const step = stages.next();
    if (step.done) return step.value;
  }
}

describe("텍스처 밀도와 LOD 단계", () => {
  it("밀도는 원본 텍셀 ÷ 화면 픽셀이고, 가로·세로 중 더 크게 그려지는 쪽을 따른다", () => {
    expect(studioTextureDensity(0.5, 0.5, 1)).toBeCloseTo(2);
    expect(studioTextureDensity(0.4167, 0.4167, 1)).toBeCloseTo(2.4, 1);
    expect(studioTextureDensity(0.25, 0.5, 1)).toBeCloseTo(2);
    expect(studioTextureDensity(-0.5, 0.25, 2)).toBeCloseTo(1);
    expect(studioTextureDensity(0, 0, 1)).toBeNaN();
  });

  it("남는 축소가 1~2배가 되도록 단계를 고르고, 확대는 7%까지만 허용한다", () => {
    expect(studioTextureLodLevel(0.5)).toBe(0);
    expect(studioTextureLodLevel(1)).toBe(0);
    expect(studioTextureLodLevel(1.5)).toBe(0);
    expect(studioTextureLodLevel(1.86)).toBe(0);
    expect(studioTextureLodLevel(1.88)).toBe(1);
    expect(studioTextureLodLevel(2.4)).toBe(1);
    expect(studioTextureLodLevel(3.7)).toBe(1);
    expect(studioTextureLodLevel(3.8)).toBe(2);
    expect(studioTextureLodLevel(5.56)).toBe(2);
    expect(studioTextureLodLevel(7.5)).toBe(3);
    expect(studioTextureLodLevel(40)).toBe(3);
    expect(studioTextureLodLevel(Number.NaN)).toBe(0);
    expect(studioTextureLodLevel(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("프리멀티플라이드 변환과 Lanczos3 반감", () => {
  it("알파 0은 0으로, 255는 그대로, 중간 알파는 색에 알파를 곱한다", () => {
    const out = studioPremultiplyRgba([10, 20, 30, 0, 200, 100, 50, 255, 200, 100, 50, 128], 3, 1);
    expect([...out]).toEqual([0, 0, 0, 0, 200, 100, 50, 255, 100, 50, 25, 128]);
  });

  it("가중치는 대칭 6쌍이고 합이 정확히 1이다(균일한 이미지가 밝기 변화 없이 줄어든다)", () => {
    const sum = [...STUDIO_LANCZOS_HALF_WEIGHTS].reduce((total, weight) => total + weight * 2, 0);
    expect(sum).toBe(1 << 14);
    expect(STUDIO_LANCZOS_HALF_WEIGHTS[0]).toBeGreaterThan(STUDIO_LANCZOS_HALF_WEIGHTS[1]);
    expect(STUDIO_LANCZOS_HALF_WEIGHTS[3]).toBeLessThan(0);
  });

  it("균일한 불투명·반투명 이미지는 값이 그대로이고 홀수 크기는 올림한다", () => {
    const opaque = studioHalveRgba(solid(16, 16, [100, 50, 25, 255]));
    expect([opaque.width, opaque.height]).toEqual([8, 8]);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) expect(pixel(opaque, x, y)).toEqual([100, 50, 25, 255]);
    const half = studioHalveRgba(solid(5, 3, [50, 25, 12, 128]));
    expect([half.width, half.height]).toEqual([3, 2]);
    expect(pixel(half, 1, 1)).toEqual([50, 25, 12, 128]);
  });

  it("알파 가장자리를 줄여도 색이 알파를 넘지 않고(프리멀티플라이드 제약), 가장자리가 단조롭게 이어진다", () => {
    const image = solid(32, 8, [0, 0, 0, 0]);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 16; x += 1) image.data.set([255, 255, 255, 255], (y * 32 + x) * 4);
    const out = studioHalveRgba(image);
    for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) {
      const [r, g, b, a] = pixel(out, x, y);
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(a);
    }
    expect(pixel(out, 2, 2)).toEqual([255, 255, 255, 255]);
    expect(pixel(out, 13, 2)[3]).toBe(0);
    // 경계(원본 x=16 ↔ 출력 x=8) 부근에서 알파가 왼쪽 255에서 오른쪽 0으로 내려간다
    const alphas = Array.from({ length: out.width }, (_, x) => pixel(out, x, 2)[3]);
    expect(alphas[6]).toBeGreaterThan(200);
    expect(alphas[9]).toBeLessThan(55);
  });

  it("에너지가 보존된다: 점 하나를 줄이면 알파 합이 대략 4분의 1이 된다", () => {
    const image = solid(32, 32, [0, 0, 0, 0]);
    image.data.set([255, 255, 255, 255], (16 * 32 + 16) * 4);
    image.data.set([255, 255, 255, 255], (16 * 32 + 17) * 4);
    image.data.set([255, 255, 255, 255], (17 * 32 + 16) * 4);
    image.data.set([255, 255, 255, 255], (17 * 32 + 17) * 4);
    const out = studioHalveRgba(image);
    let total = 0;
    for (let index = 3; index < out.data.length; index += 4) total += out.data[index];
    expect(total).toBeGreaterThan(255 * 0.9);
    expect(total).toBeLessThan(255 * 1.1);
  });
});

describe("칸별 독립 LOD 이미지", () => {
  it("칸 경계를 넘어 읽지 않는다: 흰 칸과 검은 칸이 맞닿아도 경계에 회색이 번지지 않는다", () => {
    const image = solid(16, 8, [0, 0, 0, 255]);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) image.data.set([255, 255, 255, 255], (y * 16 + x) * 4);
    const cells = [{ x: 0, y: 0, width: 8, height: 8 }, { x: 8, y: 0, width: 8, height: 8 }];
    const lod = runStages(studioLodImageStages(image, cells, 1));
    expect([lod.width, lod.height]).toEqual([8, 4]);
    for (let y = 0; y < 4; y += 1) {
      expect(pixel(lod, 3, y)).toEqual([255, 255, 255, 255]);
      expect(pixel(lod, 4, y)).toEqual([0, 0, 0, 255]);
    }
    // 통째로 줄이면 경계가 번진다(칸별 처리가 필요한 이유)
    const whole = studioHalveRgba(image);
    expect(pixel(whole, 3, 2)[0]).toBeLessThan(255);
    expect(pixel(whole, 4, 2)[0]).toBeGreaterThan(0);
  });

  it("단계가 둘이면 칸 크기가 두 번 올림되고 칸은 원점/2^단계에 놓인다", () => {
    const image = solid(40, 20, [9, 9, 9, 255]);
    const lod = runStages(studioLodImageStages(image, [{ x: 0, y: 0, width: 20, height: 20 }, { x: 20, y: 0, width: 20, height: 20 }], 2));
    expect([lod.width, lod.height]).toEqual([10, 5]);
    expect(pixel(lod, 0, 0)).toEqual([9, 9, 9, 255]);
    expect(pixel(lod, 9, 4)).toEqual([9, 9, 9, 255]);
  });

  it("칸의 원점이 블록 격자에 맞지 않아도 사본 화소가 원본 블록에 정확히 대응한다(칸을 반 화소 밀어 붙이지 않는다)", () => {
    const image = solid(16, 4, [0, 0, 0, 0]);
    for (let y = 0; y < 4; y += 1) for (let x = 3; x < 11; x += 1) image.data.set([255, 255, 255, 255], (y * 16 + x) * 4);
    const lod = runStages(studioLodImageStages(image, [{ x: 3, y: 0, width: 8, height: 4 }], 1));
    const alphas = Array.from({ length: lod.width }, (_, x) => pixel(lod, x, 1)[3]);
    // 원본 [3,11)을 덮는 블록 [2,4)·[4,6)·[6,8)·[8,10)·[10,12) = 사본 열 1~5. 이웃의 흔적 없이 그 밖은 투명하다.
    expect(alphas).toEqual([0, 255, 255, 255, 255, 255, 0, 0]);
  });

  it("두 칸이 같은 블록에 걸치면 알파가 큰 쪽의 값을 둔다", () => {
    const image = solid(8, 2, [0, 0, 0, 0]);
    for (let y = 0; y < 2; y += 1) for (let x = 0; x < 3; x += 1) image.data.set([255, 255, 255, 255], (y * 8 + x) * 4);
    for (let y = 0; y < 2; y += 1) for (let x = 5; x < 8; x += 1) image.data.set([10, 10, 10, 255], (y * 8 + x) * 4);
    // 경계 x=3~5 사이는 투명: 첫 칸 [0,3)은 블록 [2,4)에 걸친다
    const lod = runStages(studioLodImageStages(image, [{ x: 0, y: 0, width: 3, height: 2 }, { x: 3, y: 0, width: 5, height: 2 }], 1));
    expect(pixel(lod, 1, 0)[3]).toBe(255);
    const [red, , , alpha] = pixel(lod, 3, 0);
    expect(alpha).toBe(255);
    expect(Math.abs(red - 10)).toBeLessThanOrEqual(2); // 필터의 작은 되울림(±2)은 허용한다
  });

  it("칸 사각형이 8픽셀을 넘게 겹치면 겹침으로 본다(몇 픽셀 걸치는 알파 외곽 아틀라스는 허용한다)", () => {
    expect(studioLodCellsOverlap([{ x: 0, y: 0, width: 8, height: 8 }, { x: 8, y: 0, width: 8, height: 8 }])).toBe(false);
    expect(studioLodCellsOverlap([{ x: 0, y: 0, width: 300, height: 300 }, { x: 4, y: 296, width: 300, height: 300 }])).toBe(false);
    expect(studioLodCellsOverlap([{ x: 0, y: 0, width: 300, height: 300 }, { x: 5, y: 280, width: 300, height: 300 }])).toBe(true);
    expect(studioLodCellsOverlap([{ x: 0, y: 0, width: 8, height: 8 }, { x: 5, y: 0, width: 8, height: 8 }], 2)).toBe(true);
  });
});

interface FakeWrapper extends StudioLodWrapper {
  readonly id: string;
}

const wrapperOf = (id: string): FakeWrapper => ({ id, flipY: false, wrapS: 33071, wrapT: 33071, minFilter: 9729, magFilter: 9729, format: 6408 });

/** Phaser의 Frame처럼 glTexture를 source에서 읽는다(WebGL 파이프라인이 frame.source.glTexture를 바인딩한다). LOD는 칸의 source를 갈아 끼운다. */
class FakeFrame {
  constructor(
    readonly name: string, readonly cutX: number, readonly cutY: number, readonly cutWidth: number, readonly cutHeight: number,
    public source: { readonly glTexture: StudioLodWrapper | null },
  ) {}
  get glTexture(): StudioLodWrapper | null { return this.source.glTexture; }
}

interface FakeRenderer extends StudioLodRenderer {
  readonly created: Array<{ wrapper: FakeWrapper; pixels: Uint8Array; width: number; height: number; pma: boolean }>;
  readonly deleted: StudioLodWrapper[];
}

function fakeRenderer(): FakeRenderer {
  const renderer: FakeRenderer = {
    type: 2, gl: {}, created: [], deleted: [],
    createTexture2D(_mip, _min, _mag, _wrapT, _wrapS, _format, pixels, width, height, pma) {
      const wrapper = wrapperOf(`copy-${renderer.created.length + 1}`);
      renderer.created.push({ wrapper, pixels, width, height, pma });
      return wrapper;
    },
    deleteTexture(wrapper) { renderer.deleted.push(wrapper); },
  };
  return renderer;
}

interface FakeSprite {
  type: string;
  visible: boolean;
  alpha: number;
  scaleX: number;
  scaleY: number;
  texture: { readonly key: string };
  frame: { readonly name: string };
  parentContainer?: { scaleX: number; scaleY: number; type: string; visible: boolean; alpha: number } | null;
  list?: unknown[];
}

function sprite(key: string, scale: number, options: { frame?: string; type?: string; scaleY?: number } = {}): FakeSprite {
  return { type: options.type ?? "Sprite", visible: true, alpha: 1, scaleX: scale, scaleY: options.scaleY ?? scale, texture: { key }, frame: { name: options.frame ?? "__BASE" } };
}

function makeTexture(key: string, size: number, options: { scaleMode?: number; isCanvas?: boolean; cells?: Array<[number, number, number, number]> } = {}) {
  const base = wrapperOf(`base-${key}`);
  const image = { tag: `image:${key}` };
  const source = {
    width: size, height: size, image, scaleMode: options.scaleMode ?? 0, isCanvas: options.isCanvas ?? false, isVideo: false, isRenderTexture: false,
    isGLTexture: false, compressionAlgorithm: null, glTexture: base,
  };
  const frames: Record<string, FakeFrame> = { __BASE: new FakeFrame("__BASE", 0, 0, size, size, source) };
  (options.cells ?? []).forEach(([x, y, w, h], index) => { frames[String(index)] = new FakeFrame(String(index), x, y, w, h, source); });
  const texture: StudioLodTexture = { key, frames, source: [source] };
  return { texture, base, frames, image, source };
}

function makeScene(textures: Array<ReturnType<typeof makeTexture>>, objects: unknown[], options: { zoom?: number; renderer?: FakeRenderer | null } = {}) {
  const byKey = new Map(textures.map((entry) => [entry.texture.key, entry.texture] as const));
  const listeners = new Map<string, Set<(key: string) => void>>();
  const renderer = options.renderer === undefined ? fakeRenderer() : options.renderer;
  const state = { zoom: options.zoom ?? 1 };
  const scene: StudioLodScene = {
    children: { list: objects },
    cameras: { main: { get zoom() { return state.zoom; } } },
    textures: {
      exists: (key) => byKey.has(key),
      get: (key) => {
        const texture = byKey.get(key);
        if (!texture) throw new Error(`no texture ${key}`);
        return texture;
      },
      on: (event, listener) => { (listeners.get(event) ?? listeners.set(event, new Set()).get(event))?.add(listener); },
      off: (event, listener) => { listeners.get(event)?.delete(listener); },
    },
    game: { renderer },
  };
  const emit = (event: string, key: string) => listeners.get(event)?.forEach((listener) => listener(key));
  const remove = (key: string) => { byKey.delete(key); emit("removetexture", key); };
  return { scene, state, emit, remove, listeners, renderer };
}

/** size×size 직선 알파 픽셀(불투명 사각형)을 돌려주는 읽기 주입. */
const readSquare = (size: number) => () => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < data.length; index += 4) data.set([200, 120, 60, 255], index);
  return { data, width: size, height: size };
};

const startRuntime = (scene: StudioLodScene, size: number) => new StudioTextureLodRuntime({ scene, enabled: true, now: () => 0, readPixels: readSquare(size), workerFactory: null });

describe("StudioTextureLodRuntime", () => {
  it("2배 넘게 줄어 그려지는 칸은 반감 사본을 읽고, 원본 텍스처·크기·UV 기준은 건드리지 않는다", () => {
    const asset = makeTexture("player", 160);
    const { scene, renderer } = makeScene([asset], [sprite("player", 66 / 160)]);
    const lod = startRuntime(scene, 160);
    lod.update(0);
    expect(renderer?.created).toHaveLength(1);
    const copy = renderer?.created[0];
    expect([copy?.width, copy?.height]).toEqual([80, 80]);
    expect(copy?.pixels).toBeInstanceOf(Uint8Array);
    expect(copy?.pixels.length).toBe(80 * 80 * 4);
    expect(copy?.pma).toBe(false);
    expect(asset.frames.__BASE.glTexture).toBe(copy?.wrapper);
    // 칸의 source만 파생 객체로 바뀌고, 원본 TextureSource와 그 GPU 텍스처는 그대로다(나머지 속성은 원본에서 물려받는다)
    expect(asset.frames.__BASE.source).not.toBe(asset.source);
    expect(Object.getPrototypeOf(asset.frames.__BASE.source)).toBe(asset.source);
    expect(asset.texture.source[0].glTexture).toBe(asset.base);
    expect([asset.texture.source[0].width, asset.texture.source[0].height]).toEqual([160, 160]);
    expect(lod.entries()).toEqual([{ key: "player", copies: [{ level: 1, width: 80, height: 80 }], frames: { 1: 1 } }]);
    expect(lod.copyBytes()).toBe(80 * 80 * 4);
    expect(lod.summary()).toBe("텍스처 1개 · 칸 1/1 · 사본 0.0MB");
  });

  it("같은 시트에서도 크게 그려지는 칸(깔개)은 원본을 읽고, 줄어 그려지는 칸만 사본을 읽는다", () => {
    const asset = makeTexture("furniture", 256, { cells: [[0, 0, 128, 128], [128, 0, 128, 128], [0, 128, 128, 128]] });
    const { scene, renderer } = makeScene([asset], [
      sprite("furniture", 0.4, { frame: "0" }), sprite("furniture", 1, { frame: "1" }), sprite("furniture", 0.2, { frame: "2" }),
    ]);
    const lod = startRuntime(scene, 256);
    lod.update(0);
    lod.update(1);
    // 칸 0은 밀도 2.5(1단계), 칸 2는 밀도 5(2단계), 칸 1은 밀도 1(원본)
    expect(renderer?.created.map((entry) => [entry.width, entry.height])).toEqual([[128, 128], [64, 64]]);
    expect(asset.frames["0"].glTexture).toBe(renderer?.created[0]?.wrapper);
    expect(asset.frames["2"].glTexture).toBe(renderer?.created[1]?.wrapper);
    expect(asset.frames["1"].glTexture).toBe(asset.base);
    expect(lod.entries()[0]?.frames).toEqual({ 1: 1, 2: 1 });
  });

  it("칸 하나가 크게 그려져도 다른 칸의 사본은 막지 않는다(깔개가 가구 시트 전체를 원본에 묶던 문제)", () => {
    const asset = makeTexture("rugs", 256, { cells: [[0, 0, 128, 128], [128, 0, 128, 128]] });
    const { scene, renderer } = makeScene([asset], [sprite("rugs", 0.96, { frame: "1", scaleY: 0.41 }), sprite("rugs", 0.4, { frame: "0" })]);
    const lod = startRuntime(scene, 256);
    lod.update(0);
    expect(renderer?.created).toHaveLength(1);
    expect(asset.frames["0"].glTexture).toBe(renderer?.created[0]?.wrapper);
    expect(asset.frames["1"].glTexture).toBe(asset.base);
  });

  it("컨테이너 배율을 곱해 밀도를 잰다", () => {
    const asset = makeTexture("child", 160);
    const parent = { scaleX: 0.5, scaleY: 0.5, type: "Container", visible: true, alpha: 1 };
    const child: FakeSprite = { ...sprite("child", 0.5), parentContainer: parent };
    const container = { ...parent, list: [child] };
    const { scene, renderer } = makeScene([asset], [container]);
    startRuntime(scene, 160).update(0);
    expect(renderer?.created.map((entry) => [entry.width, entry.height])).toEqual([[40, 40]]);
  });

  it("칸마다 따로 줄이고, 칸이 겹치는 시트는 사본을 만들지 않고 실패로 센다", () => {
    const grid = makeTexture("grid", 128, { cells: [[0, 0, 64, 128], [64, 0, 64, 128]] });
    const overlap = makeTexture("overlap", 128, { cells: [[0, 0, 100, 128], [30, 0, 98, 128]] });
    const { scene, renderer } = makeScene([grid, overlap], [sprite("grid", 0.4, { frame: "0" }), sprite("overlap", 0.4, { frame: "0" })]);
    const lod = startRuntime(scene, 128);
    lod.update(0);
    lod.update(1);
    expect(renderer?.created).toHaveLength(1);
    expect([renderer?.created[0]?.width, renderer?.created[0]?.height]).toEqual([64, 64]);
    expect(overlap.frames["0"].glTexture).toBe(overlap.base);
    expect(lod.summary()).toContain("실패 1");
  });

  it("건드리지 않는 경우: 픽셀 아트(NEAREST)·캔버스 텍스처·작은 텍스처·반복 타일·WebGL 없음·꺼짐", () => {
    const nearest = makeTexture("nearest", 160, { scaleMode: 1 });
    const canvas = makeTexture("canvas", 160, { isCanvas: true });
    const small = makeTexture("small", 64);
    const tile = makeTexture("tile", 160);
    const objects = [sprite("nearest", 0.3), sprite("canvas", 0.3), sprite("small", 0.3), sprite("tile", 0.3, { type: "TileSprite" })];
    const { scene, renderer } = makeScene([nearest, canvas, small, tile], objects);
    const lod = startRuntime(scene, 160);
    lod.update(0);
    lod.update(1_000);
    expect(renderer?.created).toHaveLength(0);

    const player = makeTexture("player", 160);
    const noGl = makeScene([player], [sprite("player", 0.3)], { renderer: { ...fakeRenderer(), gl: undefined } });
    startRuntime(noGl.scene, 160).update(0);
    expect(noGl.renderer?.created).toHaveLength(0);

    const off = makeScene([player], [sprite("player", 0.3)]);
    const disabled = new StudioTextureLodRuntime({ scene: off.scene, enabled: false, now: () => 0, readPixels: readSquare(160), workerFactory: null });
    disabled.update(0);
    expect(off.renderer?.created).toHaveLength(0);
    expect(disabled.summary()).toBe("off");
    expect(off.listeners.size).toBe(0);
  });

  it("더 크게 그려지면(줌 인) 곧바로 원본으로 되돌리고, 다시 줄어도 한동안 안정돼야 사본을 읽는다(사본은 다시 만들지 않는다)", () => {
    const asset = makeTexture("zoomy", 160);
    const { scene, state, renderer } = makeScene([asset], [sprite("zoomy", 0.4)]);
    const lod = startRuntime(scene, 160);
    lod.update(0);
    const copy = renderer?.created[0]?.wrapper;
    expect(asset.frames.__BASE.glTexture).toBe(copy);
    state.zoom = 2; // 0.8배로 그려져 사본(80px)이 흐려진다
    lod.update(100);
    expect(asset.frames.__BASE.glTexture).toBe(asset.base);
    expect(asset.frames.__BASE.source).toBe(asset.source);
    state.zoom = 1;
    lod.update(200);
    lod.update(700);
    expect(asset.frames.__BASE.glTexture).toBe(asset.base); // 안정 시간(1.2초) 전
    lod.update(1_500);
    expect(asset.frames.__BASE.glTexture).toBe(copy);
    expect(renderer?.created).toHaveLength(1);
  });

  it("쓰이지 않는 사본은 오래 지난 뒤 GPU에서 내리고, 텍스처가 지워지면 사본을 함께 내린다", () => {
    const asset = makeTexture("idle", 160);
    const other = makeTexture("other", 160);
    const { scene, state, renderer, remove } = makeScene([asset, other], [sprite("idle", 0.4), sprite("other", 0.4)]);
    const lod = startRuntime(scene, 160);
    lod.update(0);
    lod.update(1);
    expect(renderer?.created).toHaveLength(2);
    state.zoom = 2;
    lod.update(100);
    lod.update(5_000);
    expect(renderer?.deleted).toHaveLength(0);
    lod.update(12_000);
    expect(renderer?.deleted).toHaveLength(2);
    expect(lod.entries()).toEqual([]);
    state.zoom = 1;
    lod.update(13_000);
    lod.update(15_000); // 안정 시간이 지나 사본을 다시 만든다(작업은 프레임마다 하나씩 끝낸다)
    lod.update(15_050);
    expect(renderer?.created).toHaveLength(4);
    remove("idle");
    expect(lod.entries().map((entry) => entry.key)).toEqual(["other"]);
    lod.dispose();
    lod.update(30_000);
  });

  it("이미 줄인 텍스처에서 새 칸이 처음 쓰이면 주기를 기다리지 않고 그 프레임에 적용한다", () => {
    const asset = makeTexture("atlas", 256, { cells: [[0, 0, 128, 128], [128, 0, 128, 128]] });
    const objects: unknown[] = [sprite("atlas", 0.4, { frame: "0" })];
    const { scene, renderer } = makeScene([asset], objects);
    const lod = startRuntime(scene, 256);
    lod.update(0);
    expect(asset.frames["1"].glTexture).toBe(asset.base);
    objects.push(sprite("atlas", 0.4, { frame: "1" }));
    lod.update(10); // 재측정 주기(400ms)보다 훨씬 이르다
    expect(asset.frames["1"].glTexture).toBe(renderer?.created[0]?.wrapper);
    expect(renderer?.created).toHaveLength(1);
  });

  it("숨겼거나 거의 안 보이는 객체는 밀도 측정에서 제외한다", () => {
    const asset = makeTexture("hidden", 160);
    const hidden = { ...sprite("hidden", 1), visible: false };
    const tiny = sprite("hidden", 0.001);
    const { scene, renderer } = makeScene([asset], [hidden, tiny, sprite("hidden", 0.3)]);
    startRuntime(scene, 160).update(0);
    expect(renderer?.created).toHaveLength(1);
  });
});

describe("createStudioTextureLod와 진단 값", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { __studioTextureLod?: unknown }).__studioTextureLod;
  });

  it("픽셀 아트 화풍이면 꺼진 껍데기를 돌려주고, 진단 값은 꺼짐과 빈 실패 목록으로 읽힌다", () => {
    const { scene } = makeScene([], []);
    const lod = createStudioTextureLod(scene, { pixelated: true });
    expect(lod.diagnostics()).toEqual({ textureLod: "off", textureLodFailures: "[]" });
    lod.dispose();
  });

  it("저장소의 끄기 스위치가 off이면 픽셀 아트가 아니어도 꺼진다", () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => (key === STUDIO_TEXTURE_LOD_FLAG_KEY ? "off" : null) });
    const { scene } = makeScene([], []);
    const lod = createStudioTextureLod(scene, { pixelated: false });
    expect(lod.summary()).toBe("off");
    lod.dispose();
  });

  it("켜진 런타임은 요약과 실패 목록(JSON)을 진단 값으로 내고, 개발 모드에서는 하네스용 전역 핸들을 노출한다", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const { scene } = makeScene([], []);
    const lod = createStudioTextureLod(scene, { pixelated: false });
    expect(lod.diagnostics()).toEqual({ textureLod: "텍스처 0개 · 칸 0/0 · 사본 0.0MB", textureLodFailures: "[]" });
    expect((globalThis as { __studioTextureLod?: unknown }).__studioTextureLod).toBe(lod);
    lod.dispose();
  });
});
