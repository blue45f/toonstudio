import { describe, expect, it } from "vitest";

import {
  ACCESSORY_ANCHORS,
  ALL_AVAILABLE_CAPABILITIES,
  CHANNEL_KEYS,
  LOOK_LOCK_GROUPS,
  LOOK_V2_IDENTITY,
  artStylePackSchema,
  characterLookSchema,
  characterRecipeSchema,
  createDefaultRecipe,
  createPresetCatalog,
  isBaseChannelKey,
  mergeLook,
} from "../contracts";
import { stableStringify } from "../shared/stable-json";
import { presetEntryFixture, vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { LOOK_MIXER_VERSION, mixLook, nextMixSeed, oklchHex } from "./look-mixer";

import type { LookMixerInput, LookMixResult } from "./look-mixer";
import type { AccessoryAnchor, ArtStyleId, ArtStylePack, CharacterRecipe, CustomCapabilities, LookLockGroup, PresetId } from "../contracts";

// ---------------------------------------------------------------- fixture

const CATALOG = createPresetCatalog(
  vocabularyCatalogEntries().map((entry) => {
    if (entry.id === "eyes/round") return presetEntryFixture(entry.id, { patch: { face: { eyeSize: 0.4, eyeSpacing: 0.1 } } });
    if (entry.id === "body/petite") return presetEntryFixture(entry.id, { patch: { body: { height: -0.6, headSize: 0.3 } } });
    if (entry.id === "hair/twin-tail") return presetEntryFixture(entry.id, { conflictsWith: ["accessory/cap"] });
    if (entry.id === "accessory/cap") return presetEntryFixture(entry.id, { conflictsWith: ["hair/twin-tail"] });
    return entry;
  }),
);

function pack(id: ArtStyleId, headsTall: number, widthMm: number, skin: readonly string[], hair: readonly string[]): ArtStylePack {
  const figure = { headsTall, legRatio: 0.48, armRatio: 0.43, shoulderHeads: 1.6, headWidthRatio: 0.8, handScale: 1 };
  return {
    id,
    revision: 2,
    labelKo: `시험 화풍 ${id}`,
    labelEn: "Test style",
    proportion: { feminine: figure, masculine: { ...figure, headsTall: headsTall + 0.5 } },
    face: { eyeFamily: "anime-round", eyeWidthToFace: 0.25, eyeOpenRatio: 0.7, irisToEye: 0.6, eyeLine: 0.55, lash: "liner" },
    toon: { rampSteps: 3, rim: true, outline: "hull" },
    look: mergeLook(LOOK_V2_IDENTITY, { line: { widthMm }, ramp: { secondShade: { kind: "oklab", dL: -0.3, dHueDeg: 0, chroma: 1 }, softness: 0.3 } }),
    palette: { skin: [...skin], hair: [...hair], saturation: 1 },
  };
}

const PACKS: readonly ArtStylePack[] = [pack("jp-anime-cel", 7, 3, ["#ffe6d8", "#d9a07c"], ["#2b1d16", "#4a5fa8"]), pack("sd-chibi", 3, 5, ["#fbd9c4"], ["#ff9fb8"]), pack("ink-wash", 7.2, 2, ["#e6dfd2"], [])];

const BINDING = { face: { face: { eyeSize: 0.5 }, slots: { eyes: "eyes/round" as PresetId, irises: "irises/cat" as PresetId }, neutralFacs: { mouthSmile: 0.2 } }, body: { waist: -0.2 } };
const ANCHORS: Readonly<Record<string, readonly AccessoryAnchor[]>> = { "accessory/glasses": ["face"], "accessory/earrings": ["ear-l", "ear-r"], "accessory/cap": ["head-top"] };
const accessoryAnchors = (id: PresetId): readonly AccessoryAnchor[] => ANCHORS[id] ?? ["neck", "waist"];

const FULL_CUSTOM: CustomCapabilities = {
  channels: [...CHANNEL_KEYS],
  shapes: { hair: ["length", "volume"], top: ["hem"], outer: ["length"], accessory: ["size"] },
  layers: ["inner", "outer", "legwear"],
  anchors: [...ACCESSORY_ANCHORS],
  patternUv: true,
  hairFlow: true,
  proportion: "available",
  reasonsKo: {},
};

/** v3 값이 들어 있는 레시피(잠금 보존을 의미 있게 시험한다) */
function richRecipe(): CharacterRecipe {
  const base = createDefaultRecipe();
  return {
    ...base,
    slots: { ...base.slots, hair: "hair/soft-bob", top: "top/hoodie", accessory: "accessory/glasses", "face-shape": "face-shape/heart" },
    body: { height: 0.2 },
    face: { jawWidth: -0.3 },
    colors: { ...base.colors, lip: "#aa3344", outer: "#123456" },
    style: { packId: "jp-anime-cel", packRevision: 2, proportion: { headsTall: 7.1, legRatio: 0.48, armRatio: 0.43, shoulderHeads: 1.6, headWidthRatio: 0.8, handScale: 1 }, neutralFacs: { browDown: 0.1 } },
    wardrobe: { inner: null, outer: "top/blazer", legwear: null, accessories: [{ id: "acc-1", presetId: "accessory/earrings", anchor: "ear-l", offset: { tMm: [1, 0, 0], rDeg: [0, 0, 0], scale: 1 } }] },
    partParams: { hair: { length: 0.3 }, top: { hem: -0.2 }, "acc-1": { size: 0.4 } },
    surfaces: {
      top: { material: "cloth-knit", pattern: null },
      bottom: { material: "cloth-cotton", pattern: { kind: "check", scaleCm: 2, angleDeg: 0, ratio: 0.3, inkChannel: "bottom-trim" } },
      accessory: { material: "metal", pattern: null },
      hair: { material: "hair-aniso", pattern: null },
    },
    hairColor: { gradient: [0.5, 1], tipMix: 0.4, accent: "streak" },
  };
}

function input(overrides: Partial<LookMixerInput> = {}): LookMixerInput {
  return {
    recipe: richRecipe(),
    catalog: CATALOG,
    capabilities: ALL_AVAILABLE_CAPABILITIES,
    custom: FULL_CUSTOM,
    packs: PACKS,
    styleBinding: () => BINDING,
    accessoryAnchors,
    figure: "feminine",
    locks: [],
    seed: 12345,
    ...overrides,
  };
}

function mix(overrides: Partial<LookMixerInput> = {}): LookMixResult {
  const outcome = mixLook(input(overrides));
  if (!outcome.ok) throw new Error(`${outcome.failure.code}: ${outcome.failure.reasonKo}`);
  return outcome.result;
}

const OUTFIT_SCOPES = ["top", "bottom", "shoes", "inner", "outer", "legwear"];
const ACCESSORY_CHANNELS = ["accessory", "accessory-accent", "hair-accessory", "hair-accessory-accent"];

function pick<T extends object>(record: T, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, (record as Record<string, unknown>)[key]]));
}

/** 잠금 그룹이 지키는 레시피 값 */
function groupView(recipe: CharacterRecipe, group: LookLockGroup): string {
  const surfaces = (owned: (key: string) => boolean) => Object.fromEntries(Object.entries(recipe.surfaces).filter(([key]) => owned(key)));
  const shapes = (owned: (key: string) => boolean) => Object.fromEntries(Object.entries(recipe.partParams).filter(([key]) => owned(key)));
  const view = {
    face: { slots: pick(recipe.slots, ["face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair"]), face: recipe.face, neutral: recipe.style.neutralFacs, shapes: shapes((key) => key === "hair") },
    body: { slot: recipe.slots.body, body: recipe.body, proportion: recipe.style.proportion },
    colors: { colors: recipe.colors, hairColor: recipe.hairColor },
    outfit: {
      slots: pick(recipe.slots, ["top", "bottom", "shoes"]),
      layers: pick(recipe.wardrobe, ["inner", "outer", "legwear"]),
      surfaces: surfaces((key) => !ACCESSORY_CHANNELS.includes(key) && key !== "hair"),
      shapes: shapes((key) => OUTFIT_SCOPES.includes(key)),
    },
    accessories: { slot: recipe.slots.accessory, list: recipe.wardrobe.accessories, surfaces: surfaces((key) => ACCESSORY_CHANNELS.includes(key)), shapes: shapes((key) => key === "accessory" || key.startsWith("acc-")) },
    style: { packId: recipe.style.packId, packRevision: recipe.style.packRevision, look: recipe.shading.look, toon: pick(recipe.shading.toon, ["rampSteps", "rim", "outline"]) },
  };
  return stableStringify(view[group]);
}

function subsets<T>(items: readonly T[]): T[][] {
  return Array.from({ length: 2 ** items.length }, (_, mask) => items.filter((_, index) => (mask >> index) & 1));
}

// ---------------------------------------------------------------- 시험

describe("state/look-mixer: 결정성", () => {
  it("fixture 팩은 계약 스키마를 통과한다", () => {
    for (const item of PACKS) expect(artStylePackSchema.safeParse(item).success).toBe(true);
  });

  it("같은 시드·잠금 → 같은 문서·같은 레시피, 입력 레시피는 바뀌지 않는다", () => {
    const recipe = richRecipe();
    const before = stableStringify(recipe);
    const first = mix({ recipe, locks: ["face"], seed: 777 });
    const second = mix({ recipe: richRecipe(), locks: ["face"], seed: 777 });
    expect(stableStringify(first.look)).toBe(stableStringify(second.look));
    expect(stableStringify(first.recipe)).toBe(stableStringify(second.recipe));
    expect(first.descriptionKo).toBe(second.descriptionKo);
    expect(stableStringify(recipe)).toBe(before);
    expect(first.look).toMatchObject({ id: `mix-${(777).toString(36)}`, nameKo: "섞기 #777", scope: "full", locks: ["face"], seed: 777 });
    expect(LOOK_MIXER_VERSION).toBe(1);
  });

  it("시드가 다르면 대부분 다른 결과다(40개 중 38개 이상 서로 다름)", () => {
    const looks = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) looks.add(stableStringify(mix({ seed: seed * 7919 }).look.payload));
    expect(looks.size).toBeGreaterThanOrEqual(38);
  });

  it("그룹마다 PRNG가 따로라 다른 그룹을 잠가도 이 그룹 결과가 같다", () => {
    for (const seed of [3, 99, 4242]) {
      const free = mix({ seed }).look.payload;
      const faceLocked = mix({ seed, locks: ["face"] }).look.payload;
      const outfitLocked = mix({ seed, locks: ["outfit", "accessories"] }).look.payload;
      for (const other of [faceLocked, outfitLocked]) {
        expect(other.colors).toEqual(free.colors);
        expect(other.body).toEqual(free.body);
        expect(other.look).toEqual(free.look);
        expect(other.style?.packId).toBe(free.style?.packId);
      }
      expect(outfitLocked.face).toEqual(free.face);
    }
  });

  it("다음 시드는 결정적인 uint32이고 이전 시드와 다르다", () => {
    expect(nextMixSeed(5)).toBe(nextMixSeed(5));
    expect(nextMixSeed(5)).not.toBe(5);
    expect(Number.isInteger(nextMixSeed(0xffffffff))).toBe(true);
    expect(nextMixSeed(0xffffffff)).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("state/look-mixer: 잠금·유효성", () => {
  it("모든 잠금 조합(63) × 시드 2 × 능력 2: 계약상 유효하고, 잠근 그룹의 레시피 값은 그대로다", () => {
    const groups = [...LOOK_LOCK_GROUPS];
    for (const custom of [FULL_CUSTOM, undefined]) {
      for (const locks of subsets(groups)) {
        if (locks.length === groups.length) continue;
        for (const seed of [11, 90210]) {
          const recipe = richRecipe();
          const outcome = mixLook(input({ recipe, locks, seed, ...(custom ? { custom } : { custom: undefined }) }));
          expect(outcome.ok, `${locks.join(",")}/${seed}`).toBe(true);
          if (!outcome.ok) continue;
          const result = outcome.result;
          expect(characterLookSchema.safeParse(result.look).success).toBe(true);
          expect(characterRecipeSchema.safeParse(result.recipe).success).toBe(true);
          for (const group of locks) expect(groupView(result.recipe, group), `${group} 잠금(${locks.join(",")}/${seed})`).toBe(groupView(recipe, group));
          expect(result.lines.filter((line) => line.locked).map((line) => line.group)).toEqual(LOOK_LOCK_GROUPS.filter((group) => locks.includes(group)));
        }
      }
    }
  });

  it("거부: 전부 잠금·시드 형식·모르는 잠금 그룹(한글 사유, throw 없음)", () => {
    const all = mixLook(input({ locks: [...LOOK_LOCK_GROUPS] }));
    expect(all).toMatchObject({ ok: false, failure: { code: "look-mix-all-locked" } });
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) expect(mixLook(input({ seed })), String(seed)).toMatchObject({ ok: false, failure: { code: "look-mix-seed" } });
    expect(mixLook(input({ locks: ["hair" as LookLockGroup] }))).toMatchObject({ ok: false, failure: { code: "look-mix-lock" } });
    if (!all.ok) expect(all.failure.reasonKo).toMatch(/잠금/u);
  });
});

describe("state/look-mixer: 소스 능력 존중", () => {
  it("슬롯 unavailable·프리셋 단위 미제공 프리셋은 고르지 않는다", () => {
    const capabilities = { ...ALL_AVAILABLE_CAPABILITIES, top: { status: "unavailable" as const, reasonKo: "없음" }, hair: { status: "available" as const, unavailablePresets: { "hair/romance-long": "없음" } } };
    for (let seed = 1; seed <= 30; seed += 1) {
      const result = mix({ seed, capabilities });
      expect(result.recipe.slots.top).toBe("top/hoodie");
      expect(result.recipe.slots.hair).not.toBe("hair/romance-long");
    }
  });

  it("카탈로그 충돌(트윈테일 ↔ 캡)을 만들지 않는다 — 소품을 잠가도, 둘 다 풀어도", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const free = mix({ seed }).recipe;
      expect(free.slots.hair === "hair/twin-tail" && free.slots.accessory === "accessory/cap", `seed ${seed}`).toBe(false);
      const capped = { ...richRecipe(), slots: { ...richRecipe().slots, accessory: "accessory/cap" as PresetId } };
      expect(mix({ seed, recipe: capped, locks: ["accessories"] }).recipe.slots.hair).not.toBe("hair/twin-tail");
    }
  });

  it("커스터마이즈 능력이 없으면 층·추가 소품·무늬·헤어 흐름·상속 채널 색을 만들지 않고 지금 층·소품·형태 값을 지우지 않는다", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const result = mix({ seed, custom: undefined });
      const recipe = result.recipe;
      expect(recipe.wardrobe.accessories).toEqual(richRecipe().wardrobe.accessories);
      expect(recipe.partParams["acc-1"]).toEqual({ size: 0.4 });
      expect(pick(recipe.wardrobe, ["inner", "outer", "legwear"])).toEqual({ inner: null, outer: "top/blazer", legwear: null });
      // 새 무늬는 만들지 않고, 지금 무늬(하의 체크)는 그대로 둔다
      for (const [channel, surface] of Object.entries(recipe.surfaces)) if (surface?.pattern) expect(channel).toBe("bottom");
      expect(recipe.surfaces.bottom).toEqual(richRecipe().surfaces.bottom);
      expect(recipe.hairColor).toEqual(richRecipe().hairColor);
      expect(Object.keys(recipe.colors).filter((key) => !isBaseChannelKey(key))).toEqual([]);
      if (recipe.slots.hair === "hair/soft-bob") expect(recipe.partParams.hair).toEqual({ length: 0.3 });
      else expect(recipe.partParams.hair).toBeUndefined();
      expect(result.noticesKo.some((notice) => notice.includes("커스터마이즈 능력"))).toBe(true);
    }
  });

  it("층 궁합(주입)을 주면 그 표 안의 프리셋만 층으로 고른다(표가 비면 그 층은 입히지 않는다)", () => {
    const layerOptions = (layer: string): readonly PresetId[] => (layer === "outer" ? ["top/blazer"] : []);
    let outers = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const recipe = mix({ seed: seed * 31, recipe: createDefaultRecipe(), layerOptions }).recipe;
      expect(recipe.wardrobe.inner).toBeNull();
      expect(recipe.wardrobe.legwear).toBeNull();
      expect([null, "top/blazer"]).toContain(recipe.wardrobe.outer);
      if (recipe.wardrobe.outer !== null) {
        outers += 1;
        expect(recipe.slots.top).not.toBe("top/blazer");
      }
    }
    expect(outers).toBeGreaterThan(0);
  });

  it("능력이 있으면 층·앵커가 맞는 추가 소품·무늬(단 채널 잉크)·헤어 흐름·선언된 형태 값이 나온다", () => {
    let layers = 0;
    let extras = 0;
    let patterns = 0;
    let flows = 0;
    for (let seed = 1; seed <= 80; seed += 1) {
      const result = mix({ seed: seed * 104729, recipe: createDefaultRecipe() });
      const recipe = result.recipe;
      if (recipe.wardrobe.inner || recipe.wardrobe.outer || recipe.wardrobe.legwear) layers += 1;
      for (const instance of recipe.wardrobe.accessories) {
        extras += 1;
        expect(accessoryAnchors(instance.presetId)).toContain(instance.anchor);
        expect(instance.presetId).not.toBe(recipe.slots.accessory);
      }
      for (const [channel, surface] of Object.entries(recipe.surfaces)) {
        if (!surface?.pattern) continue;
        patterns += 1;
        expect(surface.pattern.inkChannel).toBe(`${channel}-trim`);
      }
      if (recipe.hairColor.tipMix > 0) flows += 1;
      for (const [scope, values] of Object.entries(recipe.partParams)) {
        const declared = FULL_CUSTOM.shapes[scope as keyof typeof FULL_CUSTOM.shapes] ?? [];
        for (const name of Object.keys(values ?? {})) expect(declared, `${scope}.${name}`).toContain(name);
      }
    }
    expect(layers).toBeGreaterThan(0);
    expect(extras).toBeGreaterThan(0);
    expect(patterns).toBeGreaterThan(0);
    expect(flows).toBeGreaterThan(0);
  });
});

describe("state/look-mixer: 화풍·얼굴·몸·색", () => {
  it("화풍을 섞으면 지금과 다른 팩을 고르고 팩 값(툰·비례·선 굵기 ±15 %)을 싣는다. PBR이면 툰 모드 안내", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = mix({ seed });
      const style = result.recipe.style;
      expect(style.packId).not.toBe("jp-anime-cel");
      const chosen = PACKS.find((item) => item.id === style.packId);
      if (!chosen) throw new Error("팩 없음");
      expect(style.packRevision).toBe(2);
      expect(result.recipe.shading.toon).toMatchObject(chosen.toon);
      expect(result.recipe.shading.look.line.widthMm).toBeGreaterThanOrEqual(chosen.look.line.widthMm * 0.85 - 0.05);
      expect(result.recipe.shading.look.line.widthMm).toBeLessThanOrEqual(chosen.look.line.widthMm * 1.15 + 0.05);
      expect(Math.abs((style.proportion?.headsTall ?? 0) - chosen.proportion.feminine.headsTall)).toBeLessThanOrEqual(0.15 + 1e-9);
      expect(result.needsToonMode).toBe(true);
      expect(result.descriptionKo).toContain(chosen.labelKo);
    }
    const toonRecipe = { ...richRecipe(), shading: { ...richRecipe().shading, mode: "toon" as const } };
    expect(mix({ recipe: toonRecipe }).needsToonMode).toBe(false);
    // 몸을 잠그면 비례는 지금 값
    expect(mix({ locks: ["body"] }).recipe.style.proportion).toEqual(richRecipe().style.proportion);
  });

  it("얼굴은 화풍 얼굴 매핑(눈·눈동자·얼굴 값·중립 표정)을 따르고, 몸은 체형 오프셋을 더한다", () => {
    for (let seed = 1; seed <= 15; seed += 1) {
      const recipe = mix({ seed }).recipe;
      expect(recipe.slots.eyes).toBe("eyes/round");
      expect(recipe.slots.irises).toBe("irises/cat");
      expect(Math.abs((recipe.face.eyeSize ?? 0) - 0.5)).toBeLessThanOrEqual(0.12 + 1e-9);
      expect(recipe.style.neutralFacs).toEqual({ mouthSmile: 0.2 });
      expect(Math.abs((recipe.body.waist ?? 0) - -0.2 - (CATALOG.get(recipe.slots.body ?? "body/standard")?.patch.body?.waist ?? 0))).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    // 매핑이 없으면(제작 패키지 등) 눈은 무작위
    const eyes = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) eyes.add(String(mix({ seed, styleBinding: () => null }).recipe.slots.eyes));
    expect(eyes.size).toBeGreaterThan(2);
  });

  it("색: 기본 8채널은 소문자 hex, 피부·헤어는 고른 화풍 팔레트 견본, 눈썹 = 헤어", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const recipe = mix({ seed }).recipe;
      const chosen = PACKS.find((item) => item.id === recipe.style.packId);
      for (const value of Object.values(recipe.colors)) expect(value).toMatch(/^#[0-9a-f]{6}$/u);
      expect(chosen?.palette.skin).toContain(recipe.colors.skin);
      const hairPool = chosen && chosen.palette.hair.length > 0 ? chosen.palette.hair : PACKS.flatMap((item) => item.palette.hair);
      expect(hairPool).toContain(recipe.colors.hair);
      expect(recipe.colors.brow).toBe(recipe.colors.hair);
    }
    expect(oklchHex(0.5, 0, 0)).toMatch(/^#([0-9a-f]{2})\1\1$/u);
  });

  it("팩이 없으면 화풍은 그대로 두고 알린다", () => {
    const result = mix({ packs: [] });
    expect(result.recipe.style.packId).toBe("jp-anime-cel");
    expect(result.recipe.shading.look).toEqual(richRecipe().shading.look);
    expect(result.noticesKo.some((notice) => notice.includes("화풍 팩이 없어"))).toBe(true);
  });

  it("한글 설명: 시드·섞은 그룹·잠금 그룹을 담는다", () => {
    const result = mix({ seed: 2024, locks: ["colors", "style"] });
    expect(result.descriptionKo.startsWith("섞기 #2024: ")).toBe(true);
    expect(result.descriptionKo).toContain("(잠금: 색·화풍)");
    expect(result.descriptionKo).toMatch(/얼굴: .+, 헤어 /u);
    expect(result.descriptionKo).toMatch(/옷: .+ \+ .+ \+ /u);
    expect(result.lines.find((line) => line.group === "style")).toMatchObject({ locked: true, textKo: "화풍: 잠금" });
  });
});
