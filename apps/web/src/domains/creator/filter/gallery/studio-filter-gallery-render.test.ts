import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_RENDER_EFFECTS as EFFECTS } from "./studio-filter-gallery-render";

import type {
  StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParamValue, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

/** 결이 있는 RGB 와 들쭉날쭉한 알파(왼쪽 위 3×3 은 완전 투명)를 가진 시험 이미지. opaque 면 알파를 모두 255 로 둔다. */
function textured(width: number, height: number, opaque = false): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 37 + y * 11 + ((x * y) % 7) * 19) % 256;
      data[offset + 1] = (x * 13 + y * 41 + ((x + 2 * y) % 5) * 29) % 256;
      data[offset + 2] = (x * 7 + y * 23 + ((3 * x + y) % 9) * 17) % 256;
      data[offset + 3] = opaque ? 255 : x < 3 && y < 3 ? 0 : 60 + ((x * 29 + y * 17) % 196);
    }
  }
  return { width, height, data };
}

function solid(width: number, height: number, rgba: readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return { width, height, data };
}

/** 슬라이더를 기본·최소·최대로 맞춘 매개변수(나머지는 기본값). */
function paramsOf(
  effect: StudioFilterGalleryEffectDef,
  pick: "default" | "min" | "max" = "default",
  overrides: StudioFilterGalleryParams = {},
): StudioFilterGalleryParams {
  const params: Record<string, StudioFilterGalleryParamValue> = {};
  for (const spec of effect.params) params[spec.key] = spec.control === "slider" && pick !== "default" ? spec[pick] : spec.default;
  return { ...params, ...overrides };
}

function run(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params = paramsOf(effect), seed = 7): Uint8ClampedArray {
  const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(copy, params, { seed, scale: 1 });
  return copy.data;
}

function meanAbsDiff(left: Uint8ClampedArray, right: Uint8ClampedArray): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index]! - right[index]!);
  return sum / left.length;
}

const alphaOf = (data: Uint8ClampedArray): number[] => Array.from(data.filter((_, index) => index % 4 === 3));
const rgbAt = (data: Uint8ClampedArray, width: number, x: number, y: number): number[] =>
  Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3));

function effectById(id: string): StudioFilterGalleryEffectDef {
  const found = EFFECTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`효과 없음: ${id}`);
  return found;
}

/** 등록부 정규화(snapToStep)와 같은 규칙으로 기본값이 간격 격자 위에 있는지 본다. */
function onStepGrid(min: number, step: number, value: number): boolean {
  const decimals = Math.min(6, (String(step).split(".")[1] ?? "").length);
  return Number((min + Math.round((value - min) / step) * step).toFixed(decimals)) === value;
}

const SEEDED = ["render.fibers", "render.plasma", "render.voronoi", "render.maze", "render.sinus", "render.difference-clouds"];
const UNSEEDED = ["render.fractal", "render.checkerboard", "render.grid", "render.spiral"];

describe("필터 갤러리 · 렌더 계열 명세", () => {
  it("id 가 겹치지 않고 접두사가 분류와 같으며 매개변수 명세가 계약을 지킨다", () => {
    const ids = EFFECTS.map((effect) => effect.id);
    expect(ids).toEqual([
      "render.fibers", "render.plasma", "render.voronoi", "render.fractal", "render.checkerboard",
      "render.grid", "render.spiral", "render.maze", "render.sinus", "render.difference-clouds",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const effect of EFFECTS) {
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(effect.label.length).toBeGreaterThan(0);
      expect(effect.description.length).toBeGreaterThan(0);
      expect(effect.references.length).toBeGreaterThan(0);
      expect(effect.cost).toBeGreaterThan(0);
      const keys = effect.params.map((spec) => spec.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const spec of effect.params) {
        expect(spec.key).toMatch(/^[a-z][a-zA-Z0-9]*$/u);
        if (spec.control === "slider") {
          expect(spec.min).toBeLessThanOrEqual(spec.default);
          expect(spec.default).toBeLessThanOrEqual(spec.max);
          expect(spec.step).toBeGreaterThan(0);
          expect(onStepGrid(spec.min, spec.step, spec.default)).toBe(true);
        } else if (spec.control === "select") {
          expect(spec.options.map((option) => option.value)).toContain(spec.default);
        } else if (spec.control === "color") {
          expect(spec.default).toMatch(/^#[0-9a-f]{6}$/u);
        }
      }
    }
  });

  it("격자·차이 구름을 뺀 렌더 효과는 다섯 가지 합성 방식(기본 바꾸기)을 고를 수 있다", () => {
    for (const effect of EFFECTS) {
      const blend = effect.params.find((spec) => spec.key === "blend");
      if (effect.id === "render.grid" || effect.id === "render.difference-clouds") {
        expect(blend).toBeUndefined();
        continue;
      }
      expect(blend?.control).toBe("select");
      if (blend?.control !== "select") continue;
      expect(blend.default).toBe("replace");
      expect(blend.options.map((option) => option.value)).toEqual(["replace", "multiply", "screen", "overlay", "soft-light"]);
    }
  });
});

for (const effect of EFFECTS) {
  describe(effect.id, () => {
    it("같은 입력·매개변수·시드면 같은 바이트를 낸다", () => {
      const image = textured(32, 24);
      expect(run(effect, image)).toEqual(run(effect, image));
    });

    it("기본값으로 결이 있는 이미지를 눈에 띄게 바꾸고 알파는 그대로 둔다", () => {
      const image = textured(32, 24);
      const out = run(effect, image);
      expect(meanAbsDiff(out, image.data)).toBeGreaterThan(1);
      expect(alphaOf(out)).toEqual(alphaOf(image.data));
    });

    it("작은 이미지·모든 슬라이더 최소/최대·모든 선택지에서 던지지 않고 알파를 지킨다", () => {
      for (const [width, height] of [[1, 1], [3, 2], [2, 3]] as const) {
        const tiny = textured(width, height);
        for (const pick of ["default", "min", "max"] as const) {
          expect(alphaOf(run(effect, tiny, paramsOf(effect, pick)))).toEqual(alphaOf(tiny.data));
        }
      }
      const image = textured(32, 24);
      for (const pick of ["min", "max"] as const) expect(alphaOf(run(effect, image, paramsOf(effect, pick)))).toEqual(alphaOf(image.data));
      for (const spec of effect.params) {
        if (spec.control !== "select") continue;
        for (const option of spec.options) {
          expect(() => run(effect, image, paramsOf(effect, "default", { [spec.key]: option.value }))).not.toThrow();
          expect(() => run(effect, image, paramsOf(effect, "max", { [spec.key]: option.value }))).not.toThrow();
        }
      }
    });
  });
}

describe("필터 갤러리 · 렌더 계열 의미", () => {
  it("시드를 쓰는 효과는 시드가 바뀌면 결과가 바뀌고, 쓰지 않는 효과는 그대로다", () => {
    const image = textured(64, 48, true);
    for (const id of SEEDED) {
      const effect = effectById(id);
      const params = id === "render.maze" ? paramsOf(effect, "default", { cellSize: 4 }) : paramsOf(effect);
      expect(run(effect, image, params, 1), id).not.toEqual(run(effect, image, params, 2));
    }
    for (const id of UNSEEDED) {
      const effect = effectById(id);
      expect(run(effect, image, paramsOf(effect), 1), id).toEqual(run(effect, image, paramsOf(effect), 2));
    }
  });

  it("체커보드는 size 칸마다 두 색을 번갈아 놓는다", () => {
    const image = textured(16, 16, true);
    const out = run(effectById("render.checkerboard"), image, { size: 4, color1: "#ff0000", color2: "#0000ff", blend: "replace" });
    const red = [255, 0, 0], blue = [0, 0, 255];
    expect(rgbAt(out, 16, 0, 0)).toEqual(red);
    expect(rgbAt(out, 16, 3, 3)).toEqual(red);
    expect(rgbAt(out, 16, 4, 0)).toEqual(blue);
    expect(rgbAt(out, 16, 0, 4)).toEqual(blue);
    expect(rgbAt(out, 16, 4, 4)).toEqual(red);
    expect(rgbAt(out, 16, 15, 8)).toEqual(blue);
    expect(rgbAt(out, 16, 15, 12)).toEqual(red);
  });

  it("합성 방식: 흰색 곱하기·검정 스크린은 원본 그대로이고 바꾸기는 무늬 색 그대로다", () => {
    const image = textured(12, 10, true);
    const checker = effectById("render.checkerboard");
    expect(run(checker, image, { color1: "#ffffff", color2: "#ffffff", blend: "multiply" })).toEqual(image.data);
    expect(run(checker, image, { color1: "#000000", color2: "#000000", blend: "screen" })).toEqual(image.data);
    for (const blend of ["overlay", "soft-light"]) {
      const out = run(checker, image, { color1: "#808080", color2: "#808080", blend });
      expect(meanAbsDiff(out, image.data), blend).toBeLessThan(2);
    }
    const replaced = run(checker, image, { color1: "#123456", color2: "#123456", blend: "replace" });
    expect(rgbAt(replaced, 12, 5, 5)).toEqual([0x12, 0x34, 0x56]);
  });

  it("미로는 벽 색과 길 색 두 가지만 쓰고 둘 다 나온다(바꾸기·불투명)", () => {
    const image = textured(64, 48, true);
    const maze = effectById("render.maze");
    for (const algorithm of ["depth-first", "prim"]) {
      const out = run(maze, image, paramsOf(maze, "default", { cellSize: 4, algorithm }));
      const colors = new Set<string>();
      for (let offset = 0; offset < out.length; offset += 4) colors.add(`${out[offset]},${out[offset + 1]},${out[offset + 2]}`);
      expect([...colors].sort(), algorithm).toEqual(["0,0,0", "255,255,255"]);
    }
  });

  it("격자는 선 픽셀만 선 색으로 칠하고 투명한 곳은 건드리지 않는다", () => {
    const image = textured(32, 24);
    const out = run(effectById("render.grid"), image, { spacing: 8, lineWidth: 1, color: "#ff00ff", offsetX: 2, offsetY: 0 });
    expect(rgbAt(out, 32, 10, 5)).toEqual([255, 0, 255]);
    expect(rgbAt(out, 32, 5, 8)).toEqual([255, 0, 255]);
    expect(rgbAt(out, 32, 5, 5)).toEqual(rgbAt(image.data, 32, 5, 5));
    expect(rgbAt(out, 32, 2, 0)).toEqual(rgbAt(image.data, 32, 2, 0));
  });

  it("만델브로 기본 화면의 중심은 주 카디오이드 안이라 검게 칠한다", () => {
    const image = textured(33, 25, true);
    const fractal = effectById("render.fractal");
    expect(rgbAt(run(fractal, image), 33, 16, 12)).toEqual([0, 0, 0]);
    expect(run(fractal, image, paramsOf(fractal, "default", { type: "julia" }))).not.toEqual(run(fractal, image));
  });

  it("차이 구름은 검은 바탕에서 회색 구름 자체가 된다", () => {
    const out = run(effectById("render.difference-clouds"), solid(24, 24, [0, 0, 0, 255]));
    const values = new Set<number>();
    for (let offset = 0; offset < out.length; offset += 4) {
      expect(out[offset]).toBe(out[offset + 1]);
      expect(out[offset + 1]).toBe(out[offset + 2]);
      values.add(out[offset]!);
    }
    expect(values.size).toBeGreaterThan(10);
  });

  it("보로노이: 단색 이미지의 원본 색 칸은 그대로이고, 거리 그라데이션은 회색이다", () => {
    const voronoi = effectById("render.voronoi");
    const flat = solid(40, 30, [100, 150, 200, 255]);
    expect(run(voronoi, flat, paramsOf(voronoi, "default", { cellSize: 8 }))).toEqual(flat.data);
    const out = run(voronoi, textured(40, 30, true), paramsOf(voronoi, "default", { cellSize: 8, colorMode: "distance", borderWidth: 2 }));
    for (let offset = 0; offset < out.length; offset += 4) expect(out[offset]).toBe(out[offset + 2]);
  });

  it("섬유는 세로 결이라 위아래 이웃이 좌우 이웃보다 비슷하다", () => {
    const out = run(effectById("render.fibers"), textured(48, 48, true), { strength: 8 });
    let vertical = 0, horizontal = 0;
    for (let y = 0; y < 47; y += 1) {
      for (let x = 0; x < 47; x += 1) {
        const offset = (y * 48 + x) * 4;
        vertical += Math.abs(out[offset]! - out[offset + 48 * 4]!);
        horizontal += Math.abs(out[offset]! - out[offset + 4]!);
      }
    }
    expect(vertical * 2).toBeLessThan(horizontal);
  });

  it("플라스마는 채널마다 다른 무늬라 회색이 아니다", () => {
    const out = run(effectById("render.plasma"), textured(32, 32, true));
    let colorful = 0;
    for (let offset = 0; offset < out.length; offset += 4) if (Math.abs(out[offset]! - out[offset + 1]!) > 8) colorful += 1;
    expect(colorful).toBeGreaterThan(100);
  });

  it("나선은 감는 방향을 바꾸면 무늬가 거울상으로 바뀐다", () => {
    const image = textured(40, 40, true);
    const spiral = effectById("render.spiral");
    const clockwise = run(spiral, image, paramsOf(spiral, "default", { clockwise: true }));
    const counter = run(spiral, image, paramsOf(spiral, "default", { clockwise: false }));
    expect(clockwise).not.toEqual(counter);
    // 세로축으로 뒤집으면 반대 방향 나선이 되고 위상이 반 주기 밀려 두 색이 맞바뀐다(검정↔흰색, 픽셀 중심 대칭인 짝수 크기).
    let mismatch = 0;
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        if (Math.abs(clockwise[(y * 40 + x) * 4]! - (255 - counter[(y * 40 + (39 - x)) * 4]!)) > 2) mismatch += 1;
      }
    }
    expect(mismatch).toBeLessThan(40);
  });
});
