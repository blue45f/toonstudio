import { describe, expect, it } from "vitest";

import { CHARACTER_LOOK_FORMAT, LOOK_V2_IDENTITY, createDefaultRecipe, createKitDefaultRecipe, createPresetCatalog, extractCharacterLook, mergeLook } from "../contracts";
import { presetEntryFixture, vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { createLabStore } from "./lab-store";
import { RecipeCommandError, describeCommandKo, reduceRecipe } from "./recipe-reducer";

import type { ArtStylePack, CharacterRecipe, LabCommand, PresetCatalog, RecipeCommand } from "../contracts";

function catalogWithPatches(): PresetCatalog {
  return createPresetCatalog(
    vocabularyCatalogEntries().map((entry) => {
      if (entry.id === "eyes/wide") return presetEntryFixture(entry.id, { patch: { face: { eyeSize: 0.5, eyeSpacing: 0.2 } } });
      if (entry.id === "top/blazer") return presetEntryFixture(entry.id, { patch: { colors: { top: "#1f2a44" } } });
      return entry;
    }),
  );
}

const catalog = catalogWithPatches();

function reduce(recipe: CharacterRecipe, command: RecipeCommand): CharacterRecipe {
  return reduceRecipe(recipe, command, catalog);
}

function errorOf(recipe: CharacterRecipe, command: RecipeCommand): RecipeCommandError {
  try {
    reduce(recipe, command);
  } catch (error) {
    if (error instanceof RecipeCommandError) {
      expect(error.message).toMatch(/[가-힣]/u);
      return error;
    }
    throw error;
  }
  throw new Error(`명령이 거부되지 않았습니다: ${command.type}`);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

const PROPORTION = { headsTall: 7.8, legRatio: 0.52, armRatio: 0.42, shoulderHeads: 1.6, headWidthRatio: 0.82, handScale: 1 };

function pack(overrides: Partial<ArtStylePack> = {}): ArtStylePack {
  return {
    id: "kr-webtoon-romance",
    revision: 3,
    labelKo: "웹툰 로맨스",
    labelEn: "Webtoon romance",
    proportion: { feminine: PROPORTION, masculine: { ...PROPORTION, headsTall: 9 } },
    face: { eyeFamily: "webtoon-almond", eyeWidthToFace: 0.22, eyeOpenRatio: 0.55, irisToEye: 0.5, eyeLine: 0.5, lash: "liner" },
    toon: { rampSteps: 2, rim: false, outline: "hull" },
    look: mergeLook(LOOK_V2_IDENTITY, { ramp: { softness: 0.2 }, rim: { strength: 0 } }),
    palette: { skin: ["#f3d3bd", "#e8bfa5"], hair: ["#2b1d16", "#4a2f24"], saturation: 0.9 },
    ...overrides,
  };
}

const ALL_SCOPES = { look: true, proportion: true, face: true, palette: true } as const;
const NO_SCOPES = { look: false, proportion: false, face: false, palette: false } as const;

describe("state/customize-reducer(레시피 v3 명령)", () => {
  it("모든 v3 명령은 입력 레시피를 바꾸지 않는다(불변성)", () => {
    const recipe = deepFreeze(createDefaultRecipe());
    const commands: RecipeCommand[] = [
      { type: "channel/set", key: "top-trim", value: "#112233" },
      { type: "surface/set", channel: "top", surface: { material: "cloth-knit", pattern: null } },
      { type: "part-param/set", scope: "hair", shape: "length", value: 0.4 },
      { type: "wardrobe/set", layer: "outer", presetId: "top/blazer" },
      { type: "accessory/add", presetId: "accessory/glasses", anchor: "face" },
      { type: "look/set", patch: { line: { widthMm: 3 } } },
      { type: "proportion/set", proportion: PROPORTION },
      { type: "hair-color/set", patch: { tipMix: 0.5 } },
      { type: "style/apply", pack: pack(), scope: { ...ALL_SCOPES, face: false }, figure: "feminine" },
    ];
    for (const command of commands) expect(() => reduce(recipe, command), command.type).not.toThrow();
  });

  describe("channel/set", () => {
    it("상속 채널을 지정·해제하고(해제하면 상속으로), 같은 값·없는 해제는 같은 참조", () => {
      const base = createDefaultRecipe();
      const set = reduce(base, { type: "channel/set", key: "top-trim", value: "#AABBCC" });
      expect(set.colors["top-trim"]).toBe("#aabbcc");
      expect(reduce(set, { type: "channel/set", key: "top-trim", value: "#aabbcc" })).toBe(set);
      const cleared = reduce(set, { type: "channel/set", key: "top-trim", value: null });
      expect(cleared.colors["top-trim"]).toBeUndefined();
      expect(cleared.colors).toEqual(base.colors);
      expect(reduce(base, { type: "channel/set", key: "lip", value: null })).toBe(base);
      expect(reduce(base, { type: "channel/set", key: "top", value: "#010203" }).colors.top).toBe("#010203");
    });

    it("기본 채널 해제·모르는 채널·형식 틀린 색은 한글 사유로 거부", () => {
      const base = createDefaultRecipe();
      expect(errorOf(base, { type: "channel/set", key: "skin", value: null }).code).toBe("command-channel-required");
      expect(errorOf(base, { type: "channel/set", key: "cape" as never, value: "#000000" }).code).toBe("command-channel-key");
      expect(errorOf(base, { type: "channel/set", key: "lip", value: "red" }).code).toBe("command-color-invalid");
    });
  });

  describe("surface/set·part-param/set·hair-color/set", () => {
    it("표면을 지정·해제하고 패턴 두 번째 색이 바탕 채널과 같으면 거부", () => {
      const base = createDefaultRecipe();
      const surface = { material: "cloth-cotton" as const, pattern: { kind: "stripe" as const, scaleCm: 1, angleDeg: 0, ratio: 0.3, inkChannel: "top-trim" as const } };
      const set = reduce(base, { type: "surface/set", channel: "top", surface });
      expect(set.surfaces.top).toEqual(surface);
      expect(reduce(set, { type: "surface/set", channel: "top", surface: structuredClone(surface) })).toBe(set);
      expect(reduce(set, { type: "surface/set", channel: "top", surface: null }).surfaces).toEqual({});
      expect(reduce(base, { type: "surface/set", channel: "top", surface: null })).toBe(base);
      expect(errorOf(base, { type: "surface/set", channel: "top", surface: { ...surface, pattern: { ...surface.pattern, inkChannel: "top" } } }).code).toBe("command-surface-ink");
      expect(errorOf(base, { type: "surface/set", channel: "top", surface: { material: "velvet" as never, pattern: null } }).code).toBe("command-surface-invalid");
    });

    it("형태 값은 −1..1로 자르고 0이면 지우며(빈 범위도 지움) 범위당 8개까지", () => {
      const base = createDefaultRecipe();
      const one = reduce(base, { type: "part-param/set", scope: "hair", shape: "length", value: 1.7, coalesceKey: "hair-length" });
      expect(one.partParams).toEqual({ hair: { length: 1 } });
      expect(reduce(one, { type: "part-param/set", scope: "hair", shape: "length", value: 1 })).toBe(one);
      expect(reduce(one, { type: "part-param/set", scope: "hair", shape: "length", value: 0 }).partParams).toEqual({});
      let full = base;
      for (let i = 0; i < 8; i += 1) full = reduce(full, { type: "part-param/set", scope: "top", shape: `s${i}`, value: 0.1 });
      expect(errorOf(full, { type: "part-param/set", scope: "top", shape: "s8", value: 0.1 }).code).toBe("command-part-param-limit");
      expect(errorOf(base, { type: "part-param/set", scope: "skin" as never, shape: "length", value: 0.1 }).code).toBe("command-part-scope");
      expect(errorOf(base, { type: "part-param/set", scope: "acc-1", shape: "fit", value: 0.1 }).code).toBe("command-accessory-unknown");
      expect(errorOf(base, { type: "part-param/set", scope: "hair", shape: "Bad Name", value: 0.1 }).code).toBe("command-shape-name");
      expect(errorOf(base, { type: "part-param/set", scope: "hair", shape: "length", value: Number.NaN }).code).toBe("command-param-value");
    });

    it("헤어 색 흐름 부분 변경·같은 값은 같은 참조·구간 역전 거부", () => {
      const base = createDefaultRecipe();
      const next = reduce(base, { type: "hair-color/set", patch: { tipMix: 0.4, accent: "streak" } });
      expect(next.hairColor).toEqual({ gradient: [0.6, 1], tipMix: 0.4, accent: "streak" });
      expect(reduce(next, { type: "hair-color/set", patch: { tipMix: 0.4 } })).toBe(next);
      expect(errorOf(base, { type: "hair-color/set", patch: { gradient: [0.9, 0.1] } }).code).toBe("command-hair-color-invalid");
    });
  });

  describe("wardrobe/set·accessory/*", () => {
    it("층은 슬롯 계열 프리셋만 입히고 카탈로그 patch(색)는 적용하지 않는다", () => {
      const base = createDefaultRecipe();
      const outer = reduce(base, { type: "wardrobe/set", layer: "outer", presetId: "top/blazer" });
      expect(outer.wardrobe.outer).toBe("top/blazer");
      expect(outer.colors).toEqual(base.colors);
      expect(reduce(outer, { type: "wardrobe/set", layer: "outer", presetId: "top/blazer" })).toBe(outer);
      expect(reduce(outer, { type: "wardrobe/set", layer: "outer", presetId: null }).wardrobe.outer).toBeNull();
      expect(reduce(base, { type: "wardrobe/set", layer: "inner", presetId: null })).toBe(base);
      expect(errorOf(base, { type: "wardrobe/set", layer: "legwear", presetId: "top/tee" }).code).toBe("command-slot-mismatch");
      expect(errorOf(base, { type: "wardrobe/set", layer: "inner", presetId: "top/kimono" }).code).toBe("command-preset-unknown");
      expect(errorOf(base, { type: "wardrobe/set", layer: "cape" as never, presetId: null }).code).toBe("command-wardrobe-layer");
    });

    it("소품은 가장 작은 빈 id를 받고 11개까지, 제거하면 그 형태 값도 지우며, 변경은 부분 오프셋", () => {
      let recipe = createDefaultRecipe();
      recipe = reduce(recipe, { type: "accessory/add", presetId: "accessory/glasses", anchor: "face" });
      recipe = reduce(recipe, { type: "accessory/add", presetId: "accessory/ribbon", anchor: "hair", offset: { tMm: [0, 10, 0], rDeg: [0, 0, 15], scale: 1.2 } });
      expect(recipe.wardrobe.accessories.map((instance) => instance.id)).toEqual(["acc-1", "acc-2"]);
      expect(recipe.wardrobe.accessories[0]?.offset).toEqual({ tMm: [0, 0, 0], rDeg: [0, 0, 0], scale: 1 });
      recipe = reduce(recipe, { type: "part-param/set", scope: "acc-1", shape: "fit", value: 0.3 });
      const removed = reduce(recipe, { type: "accessory/remove", id: "acc-1" });
      expect(removed.wardrobe.accessories.map((instance) => instance.id)).toEqual(["acc-2"]);
      expect(removed.partParams).toEqual({});
      expect(reduce(removed, { type: "accessory/add", presetId: "accessory/cap", anchor: "head-top" }).wardrobe.accessories.map((instance) => instance.id)).toEqual(["acc-2", "acc-1"]);
      const moved = reduce(removed, { type: "accessory/set", id: "acc-2", offset: { scale: 0.8 }, anchor: "ear-l" });
      expect(moved.wardrobe.accessories[0]).toMatchObject({ anchor: "ear-l", offset: { tMm: [0, 10, 0], rDeg: [0, 0, 15], scale: 0.8 } });
      expect(reduce(moved, { type: "accessory/set", id: "acc-2", offset: { scale: 0.8 } })).toBe(moved);
      let full = createDefaultRecipe();
      for (let i = 0; i < 11; i += 1) full = reduce(full, { type: "accessory/add", presetId: "accessory/earrings", anchor: "ear-r" });
      expect(errorOf(full, { type: "accessory/add", presetId: "accessory/earrings", anchor: "ear-l" }).code).toBe("command-accessory-limit");
      const base = createDefaultRecipe();
      expect(errorOf(base, { type: "accessory/add", presetId: "top/tee", anchor: "face" }).code).toBe("command-slot-mismatch");
      expect(errorOf(base, { type: "accessory/add", presetId: "accessory/glasses", anchor: "tail" as never }).code).toBe("command-accessory-invalid");
      expect(errorOf(base, { type: "accessory/add", presetId: "accessory/glasses", anchor: "face", offset: { tMm: [99, 0, 0], rDeg: [0, 0, 0], scale: 1 } }).code).toBe("command-accessory-invalid");
      expect(errorOf(base, { type: "accessory/remove", id: "acc-5" }).code).toBe("command-accessory-unknown");
      expect(errorOf(moved, { type: "accessory/set", id: "acc-2", offset: { scale: 3 } }).code).toBe("command-accessory-invalid");
    });
  });

  describe("look/set·proportion/set", () => {
    it("look 오버라이드는 그룹별로 병합되고 화풍 출처는 바꾸지 않으며 범위 밖은 거부", () => {
      const base = createDefaultRecipe();
      const next = reduce(base, { type: "look/set", patch: { tone: { kind: "halftone", cellPerHead: 22 } }, coalesceKey: "tone" });
      expect(next.shading.look.tone).toEqual({ ...LOOK_V2_IDENTITY.tone, kind: "halftone", cellPerHead: 22 });
      expect(next.style).toEqual(base.style);
      expect(reduce(next, { type: "look/set", patch: { tone: { cellPerHead: 22 } } })).toBe(next);
      expect(errorOf(base, { type: "look/set", patch: { line: { widthMm: 40 } } }).code).toBe("command-look-invalid");
      expect(errorOf(base, { type: "look/set", patch: { grade: { accentChannels: ["cape"] } } }).code).toBe("command-look-invalid");
    });

    it("비례는 처음엔 6축 전부, 이후엔 부분 변경, null이면 소스 비례로 되돌린다", () => {
      const base = createDefaultRecipe();
      expect(errorOf(base, { type: "proportion/set", proportion: { headsTall: 3 } }).code).toBe("command-proportion-incomplete");
      const set = reduce(base, { type: "proportion/set", proportion: PROPORTION });
      expect(set.style.proportion).toEqual(PROPORTION);
      const sd = reduce(set, { type: "proportion/set", proportion: { headsTall: 3, legRatio: 0.3 }, coalesceKey: "heads" });
      expect(sd.style.proportion).toEqual({ ...PROPORTION, headsTall: 3, legRatio: 0.3 });
      expect(reduce(sd, { type: "proportion/set", proportion: { headsTall: 3 } })).toBe(sd);
      expect(errorOf(sd, { type: "proportion/set", proportion: { headsTall: 12 } }).code).toBe("command-proportion-invalid");
      expect(reduce(sd, { type: "proportion/set", proportion: null }).style.proportion).toBeNull();
      expect(reduce(base, { type: "proportion/set", proportion: null })).toBe(base);
    });
  });

  describe("style/apply(copy-on-apply)", () => {
    it("룩 범위: 툰 모드·램프·림·외곽선·look을 팩 값으로 복사하고 출처를 기록한다", () => {
      const base = createDefaultRecipe();
      const next = reduce(base, { type: "style/apply", pack: pack(), scope: { ...NO_SCOPES, look: true }, figure: "feminine" });
      expect(next.shading.mode).toBe("toon");
      expect(next.shading.toon).toEqual({ ...base.shading.toon, rampSteps: 2, rim: false, outline: "hull" });
      expect(next.shading.look).toEqual(pack().look);
      expect(next.style).toEqual({ ...base.style, packId: "kr-webtoon-romance", packRevision: 3 });
      expect([next.colors, next.face, next.slots]).toEqual([base.colors, base.face, base.slots]);
      // 팩 정의가 바뀌어도 저장본은 그대로다(복사본)
      const mutated = pack();
      const applied = reduce(base, { type: "style/apply", pack: mutated, scope: { ...NO_SCOPES, look: true }, figure: "feminine" });
      mutated.look.rim.strength = 2;
      expect(applied.shading.look.rim.strength).toBe(0);
    });

    it("비례·얼굴·팔레트 범위: 체형 계열 비례, 눈 프리셋 patch 뒤 바인딩 값, 중립 표정, 팔레트 색", () => {
      const base = createKitDefaultRecipe("male");
      const face = { face: { eyeSize: 0.3, eyeTilt: 0.15 }, slots: { eyes: "eyes/wide" as const }, neutralFacs: { browDown: 0.2 } };
      const next = reduce(base, { type: "style/apply", pack: pack(), scope: { ...NO_SCOPES, proportion: true, face: true, palette: true }, figure: "masculine", face, paletteIndex: { skin: 1, hair: 1 } });
      expect(next.style.proportion).toEqual({ ...PROPORTION, headsTall: 9 });
      expect(next.slots.eyes).toBe("eyes/wide");
      // eyes/wide patch(eyeSize 0.5·eyeSpacing 0.2)를 먼저 적용하고 바인딩이 나열한 키만 덮는다
      expect(next.face).toEqual({ eyeSize: 0.3, eyeSpacing: 0.2, eyeTilt: 0.15 });
      expect(next.style.neutralFacs).toEqual({ browDown: 0.2 });
      expect(next.colors.skin).toBe("#e8bfa5");
      expect([next.colors.hair, next.colors.brow]).toEqual(["#4a2f24", "#4a2f24"]);
      expect(next.shading).toEqual(base.shading);
      expect(next.style.packId).toBe("kr-webtoon-romance");
    });

    it("범위 없음·팩 형식 오류·얼굴 바인딩 없음·팔레트 번호 밖은 거부한다", () => {
      const base = createDefaultRecipe();
      expect(errorOf(base, { type: "style/apply", pack: pack(), scope: NO_SCOPES, figure: "feminine" }).code).toBe("command-style-scope-empty");
      expect(errorOf(base, { type: "style/apply", pack: pack({ revision: 0 }), scope: ALL_SCOPES, figure: "feminine" }).code).toBe("command-style-pack-invalid");
      expect(errorOf(base, { type: "style/apply", pack: pack(), scope: { ...NO_SCOPES, face: true }, figure: "feminine" }).code).toBe("command-style-face-binding");
      expect(errorOf(base, { type: "style/apply", pack: pack(), scope: { ...NO_SCOPES, palette: true }, figure: "feminine", paletteIndex: { skin: 5 } }).code).toBe("command-style-palette-index");
      expect(errorOf(base, { type: "style/apply", pack: pack({ palette: { skin: ["#ffffff"], hair: [], saturation: 1 } }), scope: { ...NO_SCOPES, palette: true }, figure: "feminine", paletteIndex: { hair: 0 } }).code).toBe("command-style-palette-index");
      expect(errorOf(base, { type: "style/apply", pack: pack(), scope: { ...NO_SCOPES, look: true }, figure: "child" as never }).code).toBe("command-style-figure");
      expect(errorOf(base, { type: "style/apply", pack: pack({ look: { ...pack().look, grade: { saturation: 1, lightness: 0, accentChannels: ["cape"] } } }), scope: { ...NO_SCOPES, look: true }, figure: "feminine" }).code).toBe("command-style-look-invalid");
    });
  });

  describe("look-preset/apply", () => {
    it("look/1 문서를 적용하고(범위 안 키 교체) 형식이 틀리면 거부한다", () => {
      const source = reduce(reduce(createDefaultRecipe(), { type: "channel/set", key: "top", value: "#cc2244" }), { type: "wardrobe/set", layer: "outer", presetId: "top/blazer" });
      const look = extractCharacterLook(source, "outfit", { id: "office", nameKo: "출근룩" });
      const applied = reduce(createDefaultRecipe(), { type: "look-preset/apply", look });
      expect(applied.colors.top).toBe("#cc2244");
      expect(applied.wardrobe.outer).toBe("top/blazer");
      expect(errorOf(createDefaultRecipe(), { type: "look-preset/apply", look: { ...look, format: "bad" as typeof CHARACTER_LOOK_FORMAT } }).code).toBe("command-look-invalid");
    });
  });

  it("history 라벨은 한글이고 명령마다 다르다", () => {
    const labels: Array<[RecipeCommand, string]> = [
      [{ type: "style/apply", pack: pack(), scope: { ...NO_SCOPES, look: true, palette: true }, figure: "feminine" }, "화풍 적용: 웹툰 로맨스(룩·팔레트)"],
      [{ type: "look/set", patch: {} }, "화풍 값 조정"],
      [{ type: "proportion/set", proportion: null }, "비례: 소스 기본으로"],
      [{ type: "channel/set", key: "shoes-sole", value: "#ffffff" }, "색 신발 밑창"],
      [{ type: "channel/set", key: "lip", value: null }, "색 입술: 상속으로"],
      [{ type: "surface/set", channel: "top", surface: null }, "표면 상의: 기본으로"],
      [{ type: "part-param/set", scope: "hair", shape: "length", value: 1 }, "형태 헤어 length"],
      [{ type: "wardrobe/set", layer: "outer", presetId: "top/blazer" }, "아우터: 상의 blazer"],
      [{ type: "accessory/add", presetId: "accessory/cap", anchor: "head-top" }, "소품 추가: 액세서리 cap"],
      [{ type: "accessory/remove", id: "acc-3" }, "소품 제거: acc-3"],
      [{ type: "hair-color/set", patch: {} }, "헤어 색 흐름"],
    ];
    for (const [command, label] of labels) expect(describeCommandKo(command, catalog)).toBe(label);
  });
});

describe("state/lab-store: v3 슬라이더 명령의 history 병합", () => {
  it("coalesceKey가 같은 연속 명령은 한 단계로 병합되고 undo 한 번에 되돌아간다", () => {
    let clock = 1_000;
    const store = createLabStore({ catalog, now: () => clock });
    const dispatch = (command: LabCommand): void => {
      clock += 10;
      store.dispatch(command);
    };
    dispatch({ type: "look/set", patch: { line: { widthMm: 3 } }, coalesceKey: "line-width" });
    dispatch({ type: "look/set", patch: { line: { widthMm: 3.5 } }, coalesceKey: "line-width" });
    dispatch({ type: "look/set", patch: { line: { widthMm: 4.5 } }, coalesceKey: "line-width" });
    expect(store.getState().history.depth).toBe(1);
    dispatch({ type: "part-param/set", scope: "hair", shape: "length", value: 0.2, coalesceKey: "hair-length" });
    dispatch({ type: "part-param/set", scope: "hair", shape: "length", value: 0.4, coalesceKey: "hair-length" });
    dispatch({ type: "channel/set", key: "lip", value: "#aa3344" });
    expect(store.getState().history.depth).toBe(3);
    expect(store.getState().recipe.shading.look.line.widthMm).toBe(4.5);
    store.dispatch({ type: "history/undo" });
    store.dispatch({ type: "history/undo" });
    expect(store.getState().recipe.partParams).toEqual({});
    store.dispatch({ type: "history/undo" });
    expect(store.getState().recipe.shading.look.line.widthMm).toBe(4);
  });

  it("거부된 v3 명령은 상태를 바꾸지 않고 한글 failure로 남는다", () => {
    const store = createLabStore({ catalog, now: () => 5 });
    const before = store.getState().recipe;
    store.dispatch({ type: "channel/set", key: "skin", value: null });
    expect(store.getState().recipe).toBe(before);
    expect(store.getState().failures.at(-1)).toMatchObject({ code: "command-channel-required", at: 5 });
  });
});
