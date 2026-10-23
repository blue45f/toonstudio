import { describe, expect, it } from "vitest";

import { legacyRecipeV1Fixture, legacyRecipeV2Fixture } from "../testing/recipe-fixtures";

import { LOOK_V2_IDENTITY } from "./art-style";
import { RECIPE_COLOR_KEYS } from "./mesh-data";
import {
  KIT_DEFAULT_TOON,
  RECIPE_SUPPORTED_VERSIONS,
  RECIPE_V3_ONLY_FIELDS,
  RECIPE_VERSION,
  applyKitToonDefaults,
  characterRecipeSchema,
  characterRecipeSchemaV1,
  characterRecipeSchemaV2,
  createDefaultRecipe,
  createKitDefaultRecipe,
  describeRecipeIssues,
  migrateRecipeV1ToV2,
  migrateRecipeV2ToV3,
  parseRecipe,
  recipeColorsSchema,
  recipeDigest,
  recipePatchSchema,
} from "./recipe";
import { DEFAULT_SHADING } from "./shading";

import type { CharacterRecipe } from "./recipe";

describe("contracts/recipe", () => {
  it("기본 레시피가 스키마를 통과하고 직렬화 round-trip이 동일하다", () => {
    const recipe = createDefaultRecipe();
    expect(characterRecipeSchema.safeParse(recipe).success).toBe(true);
    const parsed = parseRecipe(JSON.parse(JSON.stringify(recipe)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe).toEqual(recipe);
  });

  it("strict: 알 수 없는 키를 거부한다", () => {
    const recipe = { ...createDefaultRecipe(), extra: 1 };
    const result = parseRecipe(recipe);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("recipe-invalid");
      expect(result.failure.reasonKo).toMatch(/[가-힣]/u);
    }
  });

  it("범위 밖 값·잘못된 색·잘못된 프리셋 id를 거부한다", () => {
    const base = createDefaultRecipe();
    expect(parseRecipe({ ...base, body: { height: 2 } }).ok).toBe(false);
    expect(parseRecipe({ ...base, expression: { jawOpen: -0.1 } }).ok).toBe(false);
    expect(parseRecipe({ ...base, colors: { ...base.colors, skin: "#FFF" } }).ok).toBe(false);
    expect(parseRecipe({ ...base, slots: { ...base.slots, hair: "nope/x" } }).ok).toBe(false);
    expect(parseRecipe({ ...base, pose: { notABone: [0, 0, 0, 1] } }).ok).toBe(false);
    expect(parseRecipe({ ...base, pose: { head: [0, 0, 0, 1] } }).ok).toBe(true);
  });

  it("미래·알 수 없는 버전은 지원 버전 목록과 함께 한글 사유로 거부한다", () => {
    // 2026-10-23 v3 도입으로 3은 지원 버전이 됐다(미래 버전 예시를 4로 올림, 지원 목록 문구에 3 추가).
    for (const version of [4, 0, "3", null, undefined]) {
      const result = parseRecipe({ ...createDefaultRecipe(), version });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe("recipe-unsupported-version");
        expect(result.failure.reasonKo).toContain("지원하지 않는 레시피 버전");
        expect(result.failure.reasonKo).toContain("(지원: 1, 2, 3)");
      }
    }
    expect(parseRecipe(null).ok).toBe(false);
    expect(parseRecipe("x").ok).toBe(false);
  });

  it("현재 레시피 버전은 3이고 기본 레시피(절차)도 v3다", () => {
    expect(RECIPE_VERSION).toBe(3);
    expect(RECIPE_SUPPORTED_VERSIONS).toEqual([1, 2, 3]);
    expect(createDefaultRecipe().version).toBe(3);
    expect(createDefaultRecipe().source).toEqual({ kind: "procedural" });
    const parsed = parseRecipe(JSON.parse(JSON.stringify(createDefaultRecipe())));
    expect(parsed.ok && parsed.migratedFrom).toBeUndefined();
  });

  it("키트 소스 형식을 검증한다(키트 기본 레시피 round-trip 포함)", () => {
    const kit = createKitDefaultRecipe();
    expect(kit.source).toEqual({ kind: "kit", kitId: "toonstudio-kit-v1", baseId: "female", kitVersion: 1 });
    const parsed = parseRecipe(JSON.parse(JSON.stringify(kit)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe).toEqual(kit);
    const withSha = { ...kit, source: { ...kit.source, manifestSha256: "b".repeat(64) } };
    expect(parseRecipe(withSha).ok).toBe(true);
    expect(parseRecipe({ ...kit, source: { kind: "kit", kitId: "toonstudio-kit-v1", baseId: "child", kitVersion: 1 } }).ok).toBe(false);
    expect(parseRecipe({ ...kit, source: { kind: "kit", kitId: "Bad!", baseId: "male", kitVersion: 1 } }).ok).toBe(false);
    expect(parseRecipe({ ...kit, source: { kind: "kit", kitId: "toonstudio-kit-v1", baseId: "male", kitVersion: 0 } }).ok).toBe(false);
    expect(parseRecipe({ ...kit, source: { kind: "kit", kitId: "toonstudio-kit-v1", baseId: "male", kitVersion: 1, extra: 1 } }).ok).toBe(false);
    expect(parseRecipe({ ...kit, source: { ...kit.source, manifestSha256: "zz" } }).ok).toBe(false);
    expect(recipeDigest(kit)).not.toBe(recipeDigest(createDefaultRecipe()));
  });

  it("키트 기본 레시피의 툰 셰이딩은 램프 2단·림 끔이고, 절차 기본 레시피와 DEFAULT_SHADING은 그대로다(A-10)", () => {
    const kit = createKitDefaultRecipe();
    expect(kit.shading.toon).toEqual({ ...DEFAULT_SHADING.toon, rampSteps: 2, rim: false });
    expect(KIT_DEFAULT_TOON).toEqual({ rampSteps: 2, rim: false });
    // 툰 외 셰이딩은 절차 기본과 같다
    expect({ ...kit.shading, toon: DEFAULT_SHADING.toon }).toEqual(DEFAULT_SHADING);
    expect(characterRecipeSchema.safeParse(kit).success).toBe(true);
    expect(createDefaultRecipe().shading).toEqual(DEFAULT_SHADING);
    expect(DEFAULT_SHADING.toon).toMatchObject({ rampSteps: 3, rim: true });
    // 키트 베이스가 달라도 같은 기본값이다
    expect(createKitDefaultRecipe("male").shading).toEqual(kit.shading);
    // 팩토리가 돌려주는 셰이딩은 서로 공유되지 않는다(DEFAULT_SHADING을 변조하지 않는다)
    expect(kit.shading).not.toBe(DEFAULT_SHADING);
    expect(createKitDefaultRecipe().shading).not.toBe(kit.shading);
  });

  it("applyKitToonDefaults는 아직 절차 기본값인 램프·림만 키트 기본값으로 바꾸고 바꿀 것이 없으면 같은 참조를 돌려준다", () => {
    const procedural = createDefaultRecipe().shading;
    expect(applyKitToonDefaults(procedural).toon).toMatchObject({ rampSteps: 2, rim: false });
    const custom = { ...procedural, toon: { ...procedural.toon, rampSteps: 4 as const, rim: false } };
    expect(applyKitToonDefaults(custom)).toBe(custom);
    const half = { ...procedural, toon: { ...procedural.toon, rampSteps: 4 as const } };
    expect(applyKitToonDefaults(half).toon).toMatchObject({ rampSteps: 4, rim: false });
    expect(procedural.toon).toMatchObject({ rampSteps: 3, rim: true });
  });

  it("v1 레시피는 명시 마이그레이션 사슬(v1 → v2 → v3)로 열리고 migratedFrom을 남긴다", () => {
    // v3 도입(2026-10-23): v1 파일 모양은 v3 기본 레시피를 펼쳐서는 만들 수 없으므로 시험 fixture로 만든다. 결과는 v3다.
    const v1 = { ...legacyRecipeV1Fixture(), body: { height: 0.25 } };
    const procedural = parseRecipe(JSON.parse(JSON.stringify(v1)));
    expect(procedural.ok).toBe(true);
    if (procedural.ok) {
      expect(procedural.migratedFrom).toBe(1);
      expect(procedural.recipe.version).toBe(3);
      // 소스를 키트로 바꿔치기하지 않는다(절차는 절차로 열린다)
      expect(procedural.recipe.source).toEqual({ kind: "procedural" });
      expect(procedural.recipe.body).toEqual({ height: 0.25 });
      expect(procedural.recipe).toEqual(migrateRecipeV2ToV3(migrateRecipeV1ToV2(characterRecipeSchemaV1.parse(v1))));
    }
    const pkg = parseRecipe({ ...v1, source: { kind: "package", characterId: "orion", sha256: "c".repeat(64) } });
    expect(pkg.ok && pkg.recipe.source).toEqual({ kind: "package", characterId: "orion", sha256: "c".repeat(64) });
    expect(pkg.ok && pkg.migratedFrom).toBe(1);
  });

  it("v1 파일에는 키트 소스를 허용하지 않고 v1 형식 오류는 recipe-invalid다", () => {
    const kit = createKitDefaultRecipe();
    const v1Kit = parseRecipe({ ...legacyRecipeV2Fixture(kit), version: 1 });
    expect(v1Kit.ok).toBe(false);
    if (!v1Kit.ok) {
      expect(v1Kit.failure.code).toBe("recipe-invalid");
      expect(v1Kit.failure.reasonKo).toContain("source");
    }
    const broken = parseRecipe({ ...createDefaultRecipe(), version: 1, extra: true });
    expect(!broken.ok && broken.failure.code).toBe("recipe-invalid");
    expect(characterRecipeSchemaV1.safeParse({ ...createDefaultRecipe(), version: 2 }).success).toBe(false);
    expect(characterRecipeSchema.safeParse({ ...createDefaultRecipe(), version: 1 }).success).toBe(false);
  });

  it("underwear 역할은 페인트 레이어 레코드에서도 값 집합이 넓어질 뿐 기존 레코드는 그대로 유효하다", () => {
    const base = createDefaultRecipe();
    const layer = { part: "skin", width: 4, height: 4, pngBase64: "AAAA" };
    expect(parseRecipe({ ...base, paint: { layers: [layer] } }).ok).toBe(true);
    expect(parseRecipe({ ...base, paint: { layers: [{ ...layer, part: "underwear" }] } }).ok).toBe(true);
    expect(parseRecipe({ ...base, paint: { layers: [{ ...layer, part: "cape" }] } }).ok).toBe(false);
  });

  it("digest는 키 순서와 무관하고 값 변경에 민감하다", () => {
    const a = createDefaultRecipe();
    const b = JSON.parse(JSON.stringify({ ...a, colors: Object.fromEntries(Object.entries(a.colors).reverse()) }));
    expect(recipeDigest(a)).toBe(recipeDigest(b));
    expect(recipeDigest(a)).toMatch(/^[0-9a-f]{16}$/u);
    expect(recipeDigest({ ...a, body: { height: 0.1 } })).not.toBe(recipeDigest(a));
  });

  it("패키지 소스 형식을 검증한다", () => {
    const base = createDefaultRecipe();
    expect(parseRecipe({ ...base, source: { kind: "package", characterId: "mina", sha256: "a".repeat(64) } }).ok).toBe(true);
    expect(parseRecipe({ ...base, source: { kind: "package", characterId: "Mina!", sha256: "a".repeat(64) } }).ok).toBe(false);
    expect(parseRecipe({ ...base, source: { kind: "package", characterId: "mina", sha256: "zz" } }).ok).toBe(false);
  });

  it("색 스키마 키와 RECIPE_COLOR_KEYS가 같다", () => {
    expect(Object.keys(recipeColorsSchema.shape).sort()).toEqual([...RECIPE_COLOR_KEYS].sort());
  });

  it("recipePatchSchema는 부분 색·파츠를 허용하고 모르는 키는 거부한다", () => {
    expect(recipePatchSchema.safeParse({ colors: { hair: "#112233" }, parts: { hair: "soft-bob" } }).success).toBe(true);
    expect(recipePatchSchema.safeParse({ slots: {} }).success).toBe(false);
    expect(recipePatchSchema.safeParse({ handPose: { left: { leftIndexDistal: [0, 0, 0, 1] }, right: {} } }).success).toBe(true);
  });
});

describe("contracts/recipe v3(2026-10-23 CORE-1)", () => {
  const base = (): CharacterRecipe => createDefaultRecipe();
  const invalidReason = (json: unknown): string => {
    const result = parseRecipe(json);
    if (result.ok) throw new Error("성공하면 안 되는 입력입니다");
    expect(result.failure.code).toBe("recipe-invalid");
    return result.failure.reasonKo;
  };

  it("v2 기본 레시피를 올리면 v3 기본 레시피와 같다(절차·키트 여·남)", () => {
    for (const recipe of [createDefaultRecipe(), createKitDefaultRecipe(), createKitDefaultRecipe("male")]) {
      const v2 = characterRecipeSchemaV2.parse(JSON.parse(JSON.stringify(legacyRecipeV2Fixture(recipe))));
      expect(migrateRecipeV2ToV3(v2)).toEqual(recipe);
      expect(recipeDigest(migrateRecipeV2ToV3(v2))).toBe(recipeDigest(recipe));
    }
  });

  it("v2 파일은 v3로 명시 변환되고 migratedFrom=2, 시각 필드(색 8키·셰이딩·슬롯·파라미터)는 그대로다", () => {
    const v2 = { ...legacyRecipeV2Fixture(createKitDefaultRecipe()), body: { height: -0.3 }, face: { eyeSize: 0.4 }, colors: { ...legacyRecipeV2Fixture().colors, top: "#cc2244" } };
    const parsed = parseRecipe(JSON.parse(JSON.stringify(v2)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.migratedFrom).toBe(2);
    const recipe = parsed.recipe;
    expect(recipe.version).toBe(3);
    expect(recipe.colors).toEqual(v2.colors);
    const { look, ...shadingWithoutLook } = recipe.shading;
    expect(shadingWithoutLook).toEqual(v2.shading);
    expect(look).toEqual(LOOK_V2_IDENTITY);
    expect([recipe.slots, recipe.body, recipe.face, recipe.source]).toEqual([v2.slots, v2.body, v2.face, v2.source]);
    expect(recipe.style).toEqual({ packId: null, packRevision: 0, proportion: null, neutralFacs: {} });
    expect(recipe.wardrobe).toEqual({ inner: null, outer: null, legwear: null, accessories: [] });
    expect([recipe.partParams, recipe.surfaces]).toEqual([{}, {}]);
    expect(recipe.hairColor).toEqual({ gradient: [0.6, 1], tipMix: 0, accent: "none" });
    expect(recipe).toEqual(migrateRecipeV2ToV3(characterRecipeSchemaV2.parse(v2)));
  });

  it("무음 마이그레이션 금지: v2라고 쓴 파일에 v3 필드가 있으면 거부하고, v3 파일에 v3 필드가 없으면 거부한다", () => {
    const v2WithStyle = { ...legacyRecipeV2Fixture(), style: base().style };
    expect(invalidReason(v2WithStyle)).toContain("style");
    const { style: _style, ...withoutStyle } = base();
    void _style;
    expect(invalidReason(withoutStyle)).toContain("style");
    const noLook = { ...base(), shading: legacyRecipeV2Fixture().shading };
    expect(invalidReason(noLook)).toContain("shading.look");
  });

  it("RECIPE_V3_ONLY_FIELDS는 v3 스키마에만 있는 최상위 필드다", () => {
    const v3Keys = Object.keys(characterRecipeSchema.shape).sort();
    const v2Keys = Object.keys(characterRecipeSchemaV2.shape).sort();
    expect(v3Keys.filter((key) => !v2Keys.includes(key))).toEqual([...RECIPE_V3_ONLY_FIELDS].sort());
  });

  it("colors: 기본 8키는 필수, 상속 채널은 선택, 모르는 채널·형식 틀린 색은 거부", () => {
    const recipe = base();
    expect(parseRecipe({ ...recipe, colors: { ...recipe.colors, "top-trim": "#112233", lip: "#aa3344" } }).ok).toBe(true);
    const { skin: _skin, ...missingSkin } = recipe.colors;
    void _skin;
    expect(invalidReason({ ...recipe, colors: missingSkin })).toContain("colors.skin");
    expect(invalidReason({ ...recipe, colors: { ...recipe.colors, "cape-trim": "#112233" } })).toContain("colors");
    expect(invalidReason({ ...recipe, colors: { ...recipe.colors, "hair-tip": "#ABCDEF" } })).toContain("colors.hair-tip");
  });

  it("style: 팩 출처와 revision이 서로 맞아야 하고 비례는 범위 안이어야 한다", () => {
    const recipe = base();
    const proportion = { headsTall: 7.8, legRatio: 0.52, armRatio: 0.42, shoulderHeads: 1.6, headWidthRatio: 0.8, handScale: 1 };
    expect(parseRecipe({ ...recipe, style: { packId: "kr-webtoon-romance", packRevision: 1, proportion, neutralFacs: { browDown: 0.2 } } }).ok).toBe(true);
    expect(invalidReason({ ...recipe, style: { ...recipe.style, packRevision: 1 } })).toContain("packRevision");
    expect(invalidReason({ ...recipe, style: { ...recipe.style, packId: "sd-chibi" } })).toContain("packRevision");
    expect(invalidReason({ ...recipe, style: { ...recipe.style, packId: "watercolor-tale", packRevision: 1 } })).toContain("style.packId");
    expect(invalidReason({ ...recipe, style: { ...recipe.style, proportion: { ...proportion, headsTall: 11 } } })).toContain("style.proportion.headsTall");
    expect(invalidReason({ ...recipe, style: { ...recipe.style, neutralFacs: { browDown: 1.5 } } })).toContain("style.neutralFacs");
  });

  it("wardrobe: 층은 슬롯 계열 프리셋만, 소품은 accessory/* 11개까지·id 중복 금지·앵커 14 어휘", () => {
    const recipe = base();
    const instance = { id: "acc-1", presetId: "accessory/glasses", anchor: "face", offset: { tMm: [0, 0, 0], rDeg: [0, 0, 0], scale: 1 } };
    expect(parseRecipe({ ...recipe, wardrobe: { inner: "top/shirt", outer: "top/blazer", legwear: "bottom/jeans", accessories: [instance] } }).ok).toBe(true);
    expect(invalidReason({ ...recipe, wardrobe: { ...recipe.wardrobe, inner: "bottom/jeans" } })).toContain("wardrobe.inner");
    expect(invalidReason({ ...recipe, wardrobe: { ...recipe.wardrobe, legwear: "top/tee" } })).toContain("wardrobe.legwear");
    expect(invalidReason({ ...recipe, wardrobe: { ...recipe.wardrobe, accessories: [{ ...instance, presetId: "hair/soft-bob" }] } })).toContain("presetId");
    expect(invalidReason({ ...recipe, wardrobe: { ...recipe.wardrobe, accessories: [instance, instance] } })).toContain("중복");
    expect(invalidReason({ ...recipe, wardrobe: { ...recipe.wardrobe, accessories: [{ ...instance, anchor: "tail" }] } })).toContain("anchor");
    expect(invalidReason({ ...recipe, wardrobe: { ...recipe.wardrobe, accessories: [{ ...instance, id: "acc-0" }] } })).toContain("acc-<1~99>");
    expect(invalidReason({ ...recipe, wardrobe: { ...recipe.wardrobe, accessories: [{ ...instance, offset: { ...instance.offset, tMm: [61, 0, 0] } }] } })).toContain("tMm");
    const twelve = Array.from({ length: 12 }, (_, index) => ({ ...instance, id: `acc-${index + 1}` }));
    expect(invalidReason({ ...recipe, wardrobe: { ...recipe.wardrobe, accessories: twelve } })).toContain("최대 11개");
  });

  it("partParams: 범위·형태 이름·값 범위·범위당 8개, 소품 범위는 그 인스턴스가 있어야 한다", () => {
    const recipe = base();
    expect(parseRecipe({ ...recipe, partParams: { hair: { length: 0.5, sideLength: -0.2 }, top: { "sleeve-length": 0.3 } } }).ok).toBe(true);
    expect(invalidReason({ ...recipe, partParams: { cape: { length: 0.5 } } })).toContain("파츠 범위");
    expect(invalidReason({ ...recipe, partParams: { hair: { Length: 0.5 } } })).toContain("형태 이름");
    expect(invalidReason({ ...recipe, partParams: { hair: { length: 1.5 } } })).toContain("partParams.hair.length");
    const nine = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`shape${index}`, 0.1]));
    expect(invalidReason({ ...recipe, partParams: { hair: nine } })).toContain("최대 8개");
    expect(invalidReason({ ...recipe, partParams: { "acc-2": { fit: 0.2 } } })).toContain("acc-2");
    const withInstance = { ...recipe, wardrobe: { ...recipe.wardrobe, accessories: [{ id: "acc-2", presetId: "accessory/ribbon", anchor: "hair", offset: { tMm: [0, 0, 0], rDeg: [0, 0, 0], scale: 1 } }] }, partParams: { "acc-2": { fit: 0.2 } } };
    expect(parseRecipe(withInstance).ok).toBe(true);
  });

  it("surfaces: 재질 어휘(cloth-knit 포함)·패턴 범위, 패턴 두 번째 색은 바탕 채널과 달라야 한다", () => {
    const recipe = base();
    const pattern = { kind: "check", scaleCm: 2, angleDeg: 0, ratio: 0.5, inkChannel: "top-accent" };
    expect(parseRecipe({ ...recipe, surfaces: { top: { material: "cloth-knit", pattern }, legwear: { material: "cloth-knit", pattern: null } } }).ok).toBe(true);
    expect(invalidReason({ ...recipe, surfaces: { top: { material: "cloth-knit", pattern: { ...pattern, inkChannel: "top" } } } })).toContain("바탕 채널");
    expect(invalidReason({ ...recipe, surfaces: { top: { material: "velvet", pattern: null } } })).toContain("surfaces.top.material");
    expect(invalidReason({ ...recipe, surfaces: { top: { material: "cloth-cotton", pattern: { ...pattern, scaleCm: 0.1 } } } })).toContain("scaleCm");
    expect(invalidReason({ ...recipe, surfaces: { cape: { material: "cloth-cotton", pattern: null } } })).toContain("surfaces");
  });

  it("hairColor: 그라데이션 구간은 시작 ≤ 끝, 포인트 어휘", () => {
    const recipe = base();
    expect(parseRecipe({ ...recipe, hairColor: { gradient: [0.2, 0.9], tipMix: 0.7, accent: "streak" } }).ok).toBe(true);
    expect(invalidReason({ ...recipe, hairColor: { gradient: [0.9, 0.2], tipMix: 0, accent: "none" } })).toContain("시작 ≤ 끝");
    expect(invalidReason({ ...recipe, hairColor: { ...recipe.hairColor, accent: "rainbow" } })).toContain("hairColor.accent");
  });

  it("shading.look: 필수이고 강조 채널은 색 채널 어휘 안이어야 한다", () => {
    const recipe = base();
    const look = { ...recipe.shading.look, grade: { ...recipe.shading.look.grade, accentChannels: ["accessory"] } };
    expect(parseRecipe({ ...recipe, shading: { ...recipe.shading, look } }).ok).toBe(true);
    const bad = { ...recipe.shading.look, grade: { ...recipe.shading.look.grade, accentChannels: ["cape"] } };
    expect(invalidReason({ ...recipe, shading: { ...recipe.shading, look: bad } })).toContain("강조 채널");
  });

  it("레코드 키 오류는 중첩된 한글 사유를 보인다(describeRecipeIssues)", () => {
    const summary = describeRecipeIssues([{ code: "invalid_key", path: ["partParams", "cape"], message: "Invalid key in record", issues: [{ message: "파츠 범위는 … 중 하나여야 합니다." }] }]);
    expect(summary).toBe("partParams.cape: 파츠 범위는 … 중 하나여야 합니다.");
    expect(describeRecipeIssues([{ path: [], message: "x" }])).toBe("(root): x");
  });

  it("digest는 v3 필드 변경에도 민감하다", () => {
    const recipe = base();
    const digest = recipeDigest(recipe);
    expect(recipeDigest({ ...recipe, partParams: { hair: { length: 0.1 } } })).not.toBe(digest);
    expect(recipeDigest({ ...recipe, hairColor: { ...recipe.hairColor, tipMix: 0.1 } })).not.toBe(digest);
    expect(recipeDigest({ ...recipe, colors: { ...recipe.colors, lip: "#aa3344" } })).not.toBe(digest);
  });
});
