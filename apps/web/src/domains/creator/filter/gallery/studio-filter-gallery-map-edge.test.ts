import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_EDGE_EFFECTS, STUDIO_FILTER_GALLERY_MAP_EFFECTS } from "./studio-filter-gallery-map-edge";

import { isStudioFilterGalleryEffectId } from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

const EFFECTS = [...STUDIO_FILTER_GALLERY_MAP_EFFECTS, ...STUDIO_FILTER_GALLERY_EDGE_EFFECTS];
const CASES = EFFECTS.map((effect) => [effect.id, effect] as const);
const ALPHA_KEEPING = ["map.bump-map", "edge.laplace", "edge.image-gradient", "edge.distance-map"] as const;

const EXPECTED_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  "map.bump-map": ["GIMP · 범프 맵", "Krita · 퐁 범프맵"],
  "map.illusion": ["GIMP · 환영(Illusion)"],
  "map.little-planet": ["GIMP · 작은 행성"],
  "map.paper-tile": ["GIMP · 종이 타일"],
  "map.small-tiles": ["GIMP · 타일(작은 타일)", "Krita · 작은 타일"],
  "map.tile-seamless": ["GIMP · 이음매 없는 타일"],
  "map.displace": ["Photoshop · 변위", "GIMP · 변위"],
  "edge.laplace": ["GIMP · 라플라스"],
  "edge.image-gradient": ["GIMP · 이미지 기울기"],
  "edge.distance-map": ["GIMP · 거리 맵"],
};

/** 무늬가 촘촘하고 알파가 0~255 로 다양한 32×24 시험 그림(opaque 면 알파 255). */
function fixture(width = 32, height = 24, opaque = false): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 31 + y * 7 + ((x + y) % 3) * 41) % 256;
      data[offset + 1] = (x * 13 + y * 29 + ((x * y) % 5) * 23) % 256;
      data[offset + 2] = (x * 5 + y * 37 + ((x + y) % 7) * 17) % 256;
      data[offset + 3] = opaque ? 255 : x < 2 ? 0 : 48 + ((x * 19 + y * 11) % 208);
    }
  }
  return { width, height, data };
}

function paint(width: number, height: number, color: (x: number, y: number) => readonly [number, number, number, number]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(color(x, y), (y * width + x) * 4);
  return { width, height, data };
}

const clone = (image: StudioFilterGalleryImage): StudioFilterGalleryImage =>
  ({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) });

const defaults = (effect: StudioFilterGalleryEffectDef): StudioFilterGalleryParams =>
  Object.fromEntries(effect.params.map((spec) => [spec.key, spec.default]));

function extreme(effect: StudioFilterGalleryEffectDef, side: "min" | "max"): StudioFilterGalleryParams {
  return Object.fromEntries(effect.params.map((spec) => {
    switch (spec.control) {
      case "slider": return [spec.key, side === "min" ? spec.min : spec.max];
      case "select": return [spec.key, (side === "min" ? spec.options[0] : spec.options[spec.options.length - 1])?.value ?? spec.default];
      case "color": return [spec.key, side === "min" ? "#000000" : "#ffffff"];
      case "toggle": return [spec.key, side === "max"];
    }
  }));
}

function run(
  effect: StudioFilterGalleryEffectDef,
  params: StudioFilterGalleryParams = defaults(effect),
  input: StudioFilterGalleryImage = fixture(),
  seed = 7,
): StudioFilterGalleryImage {
  const image = clone(input);
  effect.apply(image, params, { seed, scale: 1 });
  return image;
}

function meanAbsDiff(left: StudioFilterGalleryImage, right: StudioFilterGalleryImage): number {
  let total = 0;
  for (let index = 0; index < left.data.length; index += 1) total += Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0));
  return total / Math.max(1, left.data.length);
}

const pixel = (image: StudioFilterGalleryImage, x: number, y: number): number[] =>
  Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

const alphaOf = (image: StudioFilterGalleryImage): number[] => Array.from(image.data.filter((_value, index) => index % 4 === 3));

const byId = (id: string): StudioFilterGalleryEffectDef => {
  const effect = EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`missing ${id}`);
  return effect;
};

describe("필터 갤러리 · 매핑·가장자리 계열 계약", () => {
  it("정해진 id·분류·참조를 갖고 매개변수 명세가 올바르다", () => {
    expect(EFFECTS.map((effect) => effect.id)).toEqual(Object.keys(EXPECTED_REFERENCES));
    expect(new Set(EFFECTS.map((effect) => effect.id)).size).toBe(EFFECTS.length);
    expect(STUDIO_FILTER_GALLERY_MAP_EFFECTS.every((effect) => effect.category === "map")).toBe(true);
    expect(STUDIO_FILTER_GALLERY_EDGE_EFFECTS.every((effect) => effect.category === "edge")).toBe(true);
    for (const effect of EFFECTS) {
      expect(effect.id.split(".")[0]).toBe(effect.category);
      expect(isStudioFilterGalleryEffectId(effect.id)).toBe(true);
      expect(effect.references).toEqual(EXPECTED_REFERENCES[effect.id]);
      expect(effect.label).toMatch(/[가-힣]/u);
      expect(effect.description).toMatch(/[가-힣]/u);
      expect(Number.isFinite(effect.cost) && effect.cost > 0).toBe(true);
      expect(new Set(effect.params.map((spec) => spec.key)).size).toBe(effect.params.length);
      for (const spec of effect.params) {
        expect(spec.key).toMatch(/^[a-z][a-zA-Z0-9]*$/u);
        expect(spec.label).toMatch(/[가-힣]/u);
        if (spec.control === "slider") {
          expect(spec.min).toBeLessThan(spec.max);
          expect(spec.step).toBeGreaterThan(0);
          expect(spec.default).toBeGreaterThanOrEqual(spec.min);
          expect(spec.default).toBeLessThanOrEqual(spec.max);
          // 등록부가 값을 step 격자에 맞추므로 기본값도 격자 위에 있어야 저장 뒤 바뀌지 않는다.
          const steps = (spec.default - spec.min) / spec.step;
          expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
        }
        if (spec.control === "select") {
          const values = spec.options.map((option) => option.value);
          expect(new Set(values).size).toBe(values.length);
          expect(values).toContain(spec.default);
        }
        if (spec.control === "color") expect(spec.default).toMatch(/^#[0-9a-f]{6}$/u);
      }
    }
  });

  it.each(CASES)("%s 는 같은 입력·시드에서 같은 바이트를 낸다", (_id, effect) => {
    expect(run(effect).data).toEqual(run(effect).data);
  });

  it.each(CASES)("%s 기본값은 눈에 띄게 바꾼다", (_id, effect) => {
    expect(meanAbsDiff(run(effect), fixture())).toBeGreaterThan(1);
  });

  it.each(CASES)("%s 는 1×1·2×3·3×2 이미지에서도 던지지 않는다", (_id, effect) => {
    expect(run(effect, defaults(effect), fixture(1, 1)).data).toHaveLength(4);
    expect(run(effect, defaults(effect), fixture(2, 3)).data).toHaveLength(24);
    expect(run(effect, defaults(effect), fixture(3, 2)).data).toHaveLength(24);
    expect(() => run(effect, extreme(effect, "max"), fixture(1, 1))).not.toThrow();
    expect(() => run(effect, extreme(effect, "min"), fixture(3, 2))).not.toThrow();
    expect(() => run(effect, extreme(effect, "max"), fixture(2, 3))).not.toThrow();
  });

  it.each(CASES)("%s 는 매개변수 양 끝과 모든 선택지에서 던지지 않는다", (_id, effect) => {
    expect(() => run(effect, extreme(effect, "min"))).not.toThrow();
    expect(() => run(effect, extreme(effect, "max"))).not.toThrow();
    for (const spec of effect.params) {
      if (spec.control !== "select") continue;
      for (const option of spec.options) {
        const first = run(effect, { [spec.key]: option.value });
        expect(run(effect, { [spec.key]: option.value }).data).toEqual(first.data);
      }
    }
  });

  it.each(CASES)("%s 는 명세와 같은 최소·최대·기본값으로 매개변수를 읽는다", (_id, effect) => {
    const baseline = run(effect, {}).data;
    expect(run(effect, defaults(effect)).data).toEqual(baseline);
    for (const spec of effect.params) {
      if (spec.control === "slider") {
        expect(run(effect, { [spec.key]: spec.max + 1000 }).data).toEqual(run(effect, { [spec.key]: spec.max }).data);
        expect(run(effect, { [spec.key]: spec.min - 1000 }).data).toEqual(run(effect, { [spec.key]: spec.min }).data);
        expect(run(effect, { [spec.key]: Number.NaN }).data).toEqual(baseline);
      } else {
        expect(run(effect, { [spec.key]: spec.control === "toggle" ? "true" : "목록에 없는 값" }).data).toEqual(baseline);
      }
    }
  });

  it.each(ALPHA_KEEPING)("%s 는 모든 선택지에서 알파를 바꾸지 않는다", (id) => {
    const effect = byId(id);
    const input = fixture();
    const variants: StudioFilterGalleryParams[] = [defaults(effect), extreme(effect, "min"), extreme(effect, "max")];
    for (const spec of effect.params) {
      if (spec.control === "select") for (const option of spec.options) variants.push({ [spec.key]: option.value });
    }
    for (const params of variants) expect(alphaOf(run(effect, params, input))).toEqual(alphaOf(input));
  });

  it("이음매 없는 타일은 섞기 0 이면 그대로이고, 기본값이면 좌우·상하 끝이 이어진다", () => {
    const input = fixture();
    expect(run(byId("map.tile-seamless"), { blend: 0 }, input).data).toEqual(input.data);
    const ramp = paint(32, 24, (x, y) => [x * 8, y * 10, 255 - x * 4, 255]);
    const output = run(byId("map.tile-seamless"), {}, ramp);
    let seamX = 0, seamY = 0, interior = 0;
    for (let y = 0; y < 24; y += 1) {
      for (let channel = 0; channel < 3; channel += 1) seamX = Math.max(seamX, Math.abs((pixel(output, 0, y)[channel] ?? 0) - (pixel(output, 31, y)[channel] ?? 0)));
    }
    for (let x = 0; x < 32; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) seamY = Math.max(seamY, Math.abs((pixel(output, x, 0)[channel] ?? 0) - (pixel(output, x, 23)[channel] ?? 0)));
    }
    for (let y = 0; y < 24; y += 1) {
      for (let x = 1; x < 32; x += 1) {
        for (let channel = 0; channel < 3; channel += 1) interior = Math.max(interior, Math.abs((pixel(output, x, y)[channel] ?? 0) - (pixel(output, x - 1, y)[channel] ?? 0)));
      }
    }
    // 원본은 끝과 끝이 248·230 만큼 다르지만, 결과의 이음매는 안쪽 이웃 차이보다 크지 않다.
    expect(Math.abs((pixel(ramp, 0, 0)[0] ?? 0) - (pixel(ramp, 31, 0)[0] ?? 0))).toBe(248);
    expect(seamX).toBeLessThanOrEqual(Math.max(12, interior));
    expect(seamY).toBeLessThanOrEqual(14);
  });

  it("작은 타일 2 는 정확한 2×2 반복이고 뒤집기는 이웃 타일을 거울로 만든다", () => {
    const input = fixture();
    const repeated = run(byId("map.small-tiles"), { tiles: 2 }, input);
    const flipped = run(byId("map.small-tiles"), { tiles: 2, flip: "both" }, input);
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const here = pixel(repeated, x, y);
        expect(pixel(repeated, x + 16, y)).toEqual(here);
        expect(pixel(repeated, x, y + 12)).toEqual(here);
        expect(pixel(repeated, x + 16, y + 12)).toEqual(here);
        expect(pixel(flipped, 31 - x, y)).toEqual(pixel(flipped, x, y));
        expect(pixel(flipped, x, 23 - y)).toEqual(pixel(flipped, x, y));
      }
    }
    // 2×2 면적 평균이므로 불투명 그림의 첫 칸은 원본 왼쪽 위 2×2 의 평균이다.
    const opaque = fixture(32, 24, true);
    const averaged = run(byId("map.small-tiles"), { tiles: 2 }, opaque);
    const expected = [0, 1, 2].map((channel) => Math.round(([[0, 0], [1, 0], [0, 1], [1, 1]] as const)
      .reduce((sum, [x, y]) => sum + (pixel(opaque, x, y)[channel] ?? 0), 0) / 4));
    pixel(averaged, 0, 0).slice(0, 3).forEach((value, channel) => expect(Math.abs(value - (expected[channel] ?? 0))).toBeLessThanOrEqual(1));
  });

  it("거리 맵은 사각형 안에서 가운데로 갈수록 밝고 바깥은 검다", () => {
    const square = paint(32, 32, (x, y) => (x >= 6 && x < 26 && y >= 6 && y < 26 ? [200, 50, 50, 255] : [0, 0, 0, 0]));
    for (const metric of ["euclidean", "manhattan", "chebyshev"]) {
      const output = run(byId("edge.distance-map"), { metric }, square);
      const row = Array.from({ length: 32 }, (_unused, x) => pixel(output, x, 16)[0] ?? 0);
      for (let x = 6; x < 15; x += 1) expect(row[x + 1] ?? 0).toBeGreaterThan(row[x] ?? 0);
      expect(row[2]).toBe(0);
      expect(row[6]).toBeGreaterThan(0);
      expect(Math.max(...row)).toBe(255);
      expect(alphaOf(output)).toEqual(alphaOf(square));
    }
  });

  it("거리 맵은 세 척도 모두 전수 탐색과 같은 거리를 낸다(그림 밖은 바깥)", () => {
    const width = 23, height = 17;
    const mask = paint(width, height, (x, y) => [0, 0, 0, (x * 7 + y * 13 + x * y) % 11 < 9 ? 255 : 0]);
    const metrics = {
      euclidean: (dx: number, dy: number) => Math.hypot(dx, dy),
      manhattan: (dx: number, dy: number) => Math.abs(dx) + Math.abs(dy),
      chebyshev: (dx: number, dy: number) => Math.max(Math.abs(dx), Math.abs(dy)),
    };
    for (const [metric, distance] of Object.entries(metrics)) {
      const output = run(byId("edge.distance-map"), { metric, normalize: false }, mask);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let expected = 0;
          if (pixel(mask, x, y)[3] === 255) {
            expected = Math.min(x + 1, width - x, y + 1, height - y);
            for (let qy = 0; qy < height; qy += 1) {
              for (let qx = 0; qx < width; qx += 1) if (pixel(mask, qx, qy)[3] === 0) expected = Math.min(expected, distance(qx - x, qy - y));
            }
          }
          expect(pixel(output, x, y)[0]).toBe(Math.min(255, Math.round(expected)));
        }
      }
    }
  });

  it("라플라스·이미지 기울기는 평평한 곳을 검게, 경계를 밝게 그린다", () => {
    const flat = paint(16, 12, () => [120, 80, 40, 255]);
    expect(pixel(run(byId("edge.laplace"), {}, flat), 8, 6).slice(0, 3)).toEqual([0, 0, 0]);
    expect(pixel(run(byId("edge.image-gradient"), {}, flat), 8, 6).slice(0, 3)).toEqual([0, 0, 0]);
    const step = paint(20, 12, (x) => (x < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const crossing = run(byId("edge.laplace"), { mode: "zero-crossing" }, step);
    for (let y = 0; y < 12; y += 1) {
      const row = Array.from({ length: 20 }, (_unused, x) => pixel(crossing, x, y)[0] ?? 0);
      expect(row.slice(8, 12).some((value) => value === 255)).toBe(true);
      expect(row.slice(0, 6).every((value) => value === 0) && row.slice(14).every((value) => value === 0)).toBe(true);
    }
    const ramp = paint(20, 12, (x) => [x * 12, x * 12, x * 12, 255]);
    // 오른쪽으로 밝아지는 경사의 방향 색은 청록(0, 255, 255)이다.
    expect(pixel(run(byId("edge.image-gradient"), { output: "direction" }, ramp), 10, 6).slice(0, 3)).toEqual([0, 255, 255]);
  });

  it("범프 맵은 평평한 면을 보정하면 그대로, 보정하지 않으면 고도만큼 어둡게 한다", () => {
    const flat = paint(16, 12, () => [200, 100, 50, 255]);
    expect(run(byId("map.bump-map"), {}, flat).data).toEqual(flat.data);
    expect(pixel(run(byId("map.bump-map"), { compensate: false, elevation: 30 }, flat), 8, 6)).toEqual([100, 50, 25, 255]);
  });

  it("작은 행성은 가운데에 그림 아래쪽을, 터널은 위쪽을 둔다", () => {
    const sky = paint(32, 24, (_x, y) => [y * 10, 255 - y * 10, 100, 255]);
    const planet = run(byId("map.little-planet"), {}, sky);
    const tunnel = run(byId("map.little-planet"), { inverse: true }, sky);
    expect(pixel(planet, 16, 12)[0]).toBeGreaterThan(180);
    expect(pixel(tunnel, 16, 12)[0]).toBeLessThan(50);
  });

  it("종이 타일의 틈은 고른 배경(투명·색·반전)으로 채워진다", () => {
    const opaque = fixture(32, 24, true);
    const effect = byId("map.paper-tile");
    const common = { tileSize: 5, moveRate: 60 };
    expect(alphaOf(run(effect, { ...common, background: "transparent" }, opaque)).filter((alpha) => alpha === 0).length).toBeGreaterThan(0);
    const colored = run(effect, { ...common, background: "color", backgroundColor: "#00ff00" }, opaque);
    let green = 0, inverted = 0;
    const flipped = run(effect, { ...common, background: "inverted" }, opaque);
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        if (pixel(colored, x, y).join() === "0,255,0,255") green += 1;
        const original = pixel(opaque, x, y), here = pixel(flipped, x, y);
        if (here.slice(0, 3).every((value, channel) => value === 255 - (original[channel] ?? 0))) inverted += 1;
      }
    }
    expect(green).toBeGreaterThan(0);
    expect(inverted).toBeGreaterThan(0);
  });

  it("변위는 배율 0 이면 그대로이고 가장자리 방식을 지킨다", () => {
    const opaque = fixture(32, 24, true);
    const effect = byId("map.displace");
    expect(run(effect, { horizontalScale: 0, verticalScale: 0 }, opaque).data).toEqual(opaque.data);
    expect(alphaOf(run(effect, { horizontalScale: 100, verticalScale: 100, edge: "wrap", source: "luma" }, opaque)).every((alpha) => alpha === 255)).toBe(true);
    expect(alphaOf(run(effect, { horizontalScale: 100, verticalScale: -100, edge: "transparent", noiseScale: 4 }, opaque)).some((alpha) => alpha === 0)).toBe(true);
  });

  it("환영은 방식과 분할 수에 따라 다른 사본을 겹친다", () => {
    const input = fixture(32, 24, true);
    const effect = byId("map.illusion");
    const first = run(effect, { type: "type1" }, input), second = run(effect, { type: "type2" }, input);
    expect(meanAbsDiff(first, second)).toBeGreaterThan(1);
    expect(meanAbsDiff(first, run(effect, { divisions: 3 }, input))).toBeGreaterThan(1);
    expect(alphaOf(first).every((alpha) => alpha === 255)).toBe(true);
  });
});
