import { describe, expect, it } from "vitest";

import { RECIPE_COLOR_KEYS } from "./mesh-data";
import {
  KIT_DEFAULT_TOON,
  RECIPE_VERSION,
  applyKitToonDefaults,
  characterRecipeSchema,
  characterRecipeSchemaV1,
  createDefaultRecipe,
  createKitDefaultRecipe,
  migrateRecipeV1ToV2,
  parseRecipe,
  recipeColorsSchema,
  recipeDigest,
  recipePatchSchema,
} from "./recipe";
import { DEFAULT_SHADING } from "./shading";

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
    for (const version of [3, 0, "2", null, undefined]) {
      const result = parseRecipe({ ...createDefaultRecipe(), version });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe("recipe-unsupported-version");
        expect(result.failure.reasonKo).toContain("지원하지 않는 레시피 버전");
        expect(result.failure.reasonKo).toContain("(지원: 1, 2)");
      }
    }
    expect(parseRecipe(null).ok).toBe(false);
    expect(parseRecipe("x").ok).toBe(false);
  });

  it("현재 레시피 버전은 2이고 기본 레시피(절차)도 v2다", () => {
    expect(RECIPE_VERSION).toBe(2);
    expect(createDefaultRecipe().version).toBe(2);
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

  it("v1 레시피는 명시 마이그레이션으로 v2가 되고 migratedFrom을 남긴다", () => {
    const v1 = { ...createDefaultRecipe(), version: 1, body: { height: 0.25 } };
    const procedural = parseRecipe(JSON.parse(JSON.stringify(v1)));
    expect(procedural.ok).toBe(true);
    if (procedural.ok) {
      expect(procedural.migratedFrom).toBe(1);
      expect(procedural.recipe.version).toBe(2);
      // 소스를 키트로 바꿔치기하지 않는다(절차는 절차로 열린다)
      expect(procedural.recipe.source).toEqual({ kind: "procedural" });
      expect(procedural.recipe.body).toEqual({ height: 0.25 });
      expect(procedural.recipe).toEqual(migrateRecipeV1ToV2(characterRecipeSchemaV1.parse(v1)));
    }
    const pkg = parseRecipe({ ...v1, source: { kind: "package", characterId: "orion", sha256: "c".repeat(64) } });
    expect(pkg.ok && pkg.recipe.source).toEqual({ kind: "package", characterId: "orion", sha256: "c".repeat(64) });
    expect(pkg.ok && pkg.migratedFrom).toBe(1);
  });

  it("v1 파일에는 키트 소스를 허용하지 않고 v1 형식 오류는 recipe-invalid다", () => {
    const kit = createKitDefaultRecipe();
    const v1Kit = parseRecipe({ ...kit, version: 1 });
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
