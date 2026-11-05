import { describe, expect, it } from "vitest";

import { createBrushStudioV6ExactEditorProgram, migrateBrushStudioV6LegacyMixboxAuthoring, migrateBrushStudioV6LegacyMixboxMaterial, serializeBrushStudioV6Authoring } from "./brush-studio-v6-authoring-document";
import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program, normalizeBrushStudioV6Program } from "./brush-studio-v6-engine";
import { parseBrushStudioV6Import } from "./brush-studio-v6-experiments";
import { createBrushStudioV6MaterialStroke } from "./brush-studio-v6-material-engine";
import { createBrushStudioV6MaterialReceipt } from "./brush-studio-v6-material-receipt";
import { createBrushStudioV6ProductBrush } from "./brush-studio-v6-product-bridge";
import type { BrushStudioV6MaterialConfig } from "./brush-studio-v6-material-engine";

const legacyRecipes = BRUSH_STUDIO_V6_RECIPES.filter((recipe) => recipe.id.startsWith("mixbox-"));
const samples = Array.from({ length: 17 }, (_, index) => ({
  x: 20 + index * 5,
  y: 40 + Math.sin(index / 3) * 12,
  pressure: 0.2 + index / 20,
  tilt: index / 32,
  twist: index * 7,
}));

function legacySource() {
  const program = { ...createBrushStudioV6Program("mixbox-oil-bristle"), licenseProfile: "noncommercial-full" as const };
  const document = JSON.parse(serializeBrushStudioV6Authoring(program));
  const material = document.materialReceipt as Extract<BrushStudioV6MaterialConfig, { version: 2 }>;
  document.materialReceipt = { ...material, runtime: { ...material.runtime, bindings: material.runtime.bindings.map((binding) =>
    binding.nodeIds.includes("pigment-mixbox") ? {
      providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial",
      execution: "native", nodeIds: ["pigment-mixbox"],
    } : binding) } };
  return document;
}

describe("이전 Mixbox 브러시의 자체 안료 실행", () => {
  it("레시피의 저장 ID와 안료 노드를 보존한다", () => {
    expect(legacyRecipes).toHaveLength(23);
    for (const recipe of legacyRecipes) {
      const program = recipe.create();
      expect(program.id).toBe(recipe.id);
      expect(program.slots.pigment).toBe("pigment-mixbox");
      expect(normalizeBrushStudioV6Program(program)).toEqual(program);
      expect(recipe.label).not.toContain("Mixbox");
    }
  });

  it.each(legacyRecipes.map((recipe) => [recipe.id, recipe] as const))(
    "%s의 팁·입력·도포 설정과 자체 엔진 영수증을 저장·재열기에서 보존한다", (_id, recipe) => {
      const program = { ...recipe.create(), licenseProfile: "noncommercial-full" as const };
      // 다른 제한 어댑터의 허용 프로필은 유지한다. 안료 제공자 자체는 internal이다.
      const receipt = createBrushStudioV6MaterialReceipt(program);
      const binding = receipt.runtime.bindings.find((entry) => entry.nodeIds.includes("pigment-mixbox"));
      expect(binding).toMatchObject({ providerId: "toonstudio-latent-pigment-v1", rights: "internal", version: "1" });
      expect(receipt.runtime.bindings.some((entry) => entry.providerId === "mixbox-js-v2")).toBe(false);
      const saved = createBrushStudioV6ProductBrush(program);
      const reopened = createBrushStudioV6ExactEditorProgram(saved.enginePrograms?.material, program.id, program.name);
      const restored = parseBrushStudioV6Import(serializeBrushStudioV6Authoring(reopened));
      expect(restored.id).toBe(program.id);
      expect(restored.slots).toEqual(program.slots);
      expect(restored.input).toEqual(program.input);
      expect(restored.tuning).toEqual(program.tuning);
      expect(createBrushStudioV6MaterialReceipt(restored)).toEqual(receipt);
    },
  );

  it.each(legacyRecipes.map((recipe) => [recipe.id, recipe] as const))(
    "%s의 이전 노드와 직접 자체 안료 노드가 동일한 획을 만든다", (_id, recipe) => {
      const legacy = recipe.create();
      const direct = { ...legacy, slots: { ...legacy.slots, pigment: "pigment-latent" } };
      const legacyStroke = createBrushStudioV6MaterialStroke(legacy);
      const directStroke = createBrushStudioV6MaterialStroke(direct);
      const actual = samples.flatMap((sample) => legacyStroke.push(sample));
      const expected = samples.flatMap((sample) => directStroke.push(sample));
      expect(actual.length).toBeGreaterThan(0);
      expect(actual).toEqual(expected);
    },
  );

  it("기본 권리 프로필에서도 이전 안료 노드를 자체 제공자로 저장한다", () => {
    const base = createBrushStudioV6Program();
    const receipt = createBrushStudioV6MaterialReceipt({ ...base, slots: { ...base.slots, pigment: "pigment-mixbox" } });
    expect(receipt.runtime.licenseProfile).toBe("permissive-only");
    expect(receipt.runtime.bindings.find((binding) => binding.nodeIds.includes("pigment-mixbox")))
      .toMatchObject({ providerId: "toonstudio-latent-pigment-v1", rights: "internal" });
  });

  it("기존 정확 복원 검사는 유지하고 명시 이주에서 원본과 자체 영수증을 분리한다", () => {
    const source = legacySource();
    const serialized = JSON.stringify(source, null, 2);
    const before = structuredClone(source);
    expect(() => parseBrushStudioV6Import(serialized)).toThrow(/실행 정보/u);
    const result = migrateBrushStudioV6LegacyMixboxAuthoring(serialized);
    expect(result).not.toBeNull();
    expect(result?.sourceAuthoring).toBe(serialized);
    expect(result?.sourceMaterial).toEqual(before.materialReceipt);
    expect(result?.sourceProviderId).toBe("mixbox-js-v2");
    expect(result?.targetProviderId).toBe("toonstudio-latent-pigment-v1");
    expect(source).toEqual(before);
    if (!result || result.sourceKind !== "execution-receipt") throw new Error("실행 영수증 이주 결과가 없습니다.");
    expect(parseBrushStudioV6Import(serializeBrushStudioV6Authoring(result.program))).toEqual(result.program);
    expect(createBrushStudioV6MaterialReceipt(result.program)).toEqual(result.material);
    expect(result.material.slots).toEqual(result.sourceMaterial.slots);
    expect(result.material.tuning).toEqual(result.sourceMaterial.tuning);
    expect(result.material.input).toEqual(result.sourceMaterial.input);
  });

  it("안료 이외의 제공자나 편집 설정이 다르면 이주하지 않는다", () => {
    const source = legacySource();
    source.materialReceipt.runtime.bindings[0].version = "unsupported";
    expect(() => migrateBrushStudioV6LegacyMixboxMaterial(source.materialReceipt)).toThrow(/안료 이외/u);
    const changed = legacySource();
    changed.tuning.flow = 0.37;
    expect(() => migrateBrushStudioV6LegacyMixboxAuthoring(JSON.stringify(changed))).toThrow(/편집 설정/u);
    const changedMixbox = legacySource();
    const binding = changedMixbox.materialReceipt.runtime.bindings.find((entry: { providerId: string }) => entry.providerId === "mixbox-js-v2");
    binding.version = "future";
    expect(() => migrateBrushStudioV6LegacyMixboxMaterial(changedMixbox.materialReceipt)).toThrow(/정확하게/u);
  });

  it.each(["permissive-only", "source-available"] as const)(
    "당시 %s 권리 검사로 실행되지 못한 Mixbox 초안도 원본을 보존해 명시적으로 이주한다", (licenseProfile) => {
      const base = createBrushStudioV6Program();
      const program = { ...base, licenseProfile, slots: { ...base.slots, pigment: "pigment-mixbox" } };
      const source = { ...JSON.parse(serializeBrushStudioV6Authoring(program)), materialReceipt: null };
      const serialized = JSON.stringify(source, null, 2);
      const before = structuredClone(source);
      expect(() => parseBrushStudioV6Import(serialized)).toThrow(/실행 정보/u);
      const migration = migrateBrushStudioV6LegacyMixboxAuthoring(serialized);
      expect(migration?.sourceKind).toBe("authoring-draft");
      expect(migration?.sourceMaterial).toBeNull();
      expect(migration?.sourceAuthoring).toBe(serialized);
      expect(migration?.program).toEqual(program);
      expect(migration?.material.runtime.bindings.some((binding) => binding.providerId === "mixbox-js-v2")).toBe(false);
      expect(source).toEqual(before);
      if (!migration) throw new Error("초안 이주 결과가 없습니다.");
      expect(parseBrushStudioV6Import(serializeBrushStudioV6Authoring(migration.program))).toEqual(program);
    },
  );

  it("실행 가능한 원본의 누락 영수증이나 다른 제한 노드를 초안 이주로 우회하지 않는다", () => {
    const base = createBrushStudioV6Program();
    const source = { ...JSON.parse(serializeBrushStudioV6Authoring(base)), materialReceipt: null };
    expect(migrateBrushStudioV6LegacyMixboxAuthoring(JSON.stringify(source))).toBeNull();
    source.slots.pigment = "pigment-mixbox";
    source.licenseProfile = "noncommercial-full";
    expect(migrateBrushStudioV6LegacyMixboxAuthoring(JSON.stringify(source))).toBeNull();
    source.licenseProfile = "permissive-only";
    source.slots.carrier = "carrier-krita-hairy";
    expect(() => migrateBrushStudioV6LegacyMixboxAuthoring(JSON.stringify(source))).toThrow(/무폴백/u);
    source.slots.carrier = base.slots.carrier;
    source.tuning.unknownSetting = 1;
    expect(() => migrateBrushStudioV6LegacyMixboxAuthoring(JSON.stringify(source))).toThrow(/변경 없이/u);
  });

  it.each(["execution-receipt", "authoring-draft"] as const)(
    "program wrapper 안의 %s도 같은 검증을 적용하고 입력 원문을 보존한다", (kind) => {
      const source = kind === "execution-receipt" ? legacySource() : (() => {
        const base = createBrushStudioV6Program();
        return { ...JSON.parse(serializeBrushStudioV6Authoring({ ...base, slots: { ...base.slots, pigment: "pigment-mixbox" } })),
          materialReceipt: null };
      })();
      const serialized = JSON.stringify({ program: source }, null, 2);
      const migration = migrateBrushStudioV6LegacyMixboxAuthoring(serialized);
      expect(migration?.sourceKind).toBe(kind);
      expect(migration?.sourceAuthoring).toBe(serialized);
      const invalidRoot = JSON.stringify({ authoringVersion: "future", program: source });
      expect(() => migrateBrushStudioV6LegacyMixboxAuthoring(invalidRoot)).toThrow(/지원하지 않는/u);
    },
  );

  it.each(["permissive-only", "source-available", "noncommercial-full"] as const)(
    "실행 기록 없는 %s raw 설정은 원문과 출처 미확인을 보존하고 명시적으로만 가져온다", (licenseProfile) => {
      const base = createBrushStudioV6Program();
      const program = { ...base, licenseProfile, slots: { ...base.slots, pigment: "pigment-mixbox" } };
      for (const source of [program, { program }]) {
        const serialized = JSON.stringify(source, null, 2);
        expect(() => parseBrushStudioV6Import(serialized)).toThrow(/명시적으로/u);
        const migration = migrateBrushStudioV6LegacyMixboxAuthoring(serialized);
        expect(migration?.sourceKind).toBe("program-settings");
        expect(migration?.sourceProviderId).toBeNull();
        expect(migration?.sourceMaterial).toBeNull();
        expect(migration?.sourceAuthoring).toBe(serialized);
        expect(migration?.program).toEqual(program);
        expect(JSON.stringify(source, null, 2)).toBe(serialized);
        if (!migration) throw new Error("설정 이주 결과가 없습니다.");
        expect(parseBrushStudioV6Import(serializeBrushStudioV6Authoring(migration.program))).toEqual(program);
      }
    },
  );

  it("raw 설정 이주도 미지원 값과 다른 제한 제공자를 우회하지 않는다", () => {
    const base = createBrushStudioV6Program();
    const program = { ...base, slots: { ...base.slots, pigment: "pigment-mixbox", carrier: "carrier-krita-hairy" } };
    expect(() => migrateBrushStudioV6LegacyMixboxAuthoring(JSON.stringify(program))).toThrow(/무폴백/u);
    const invalid = { ...program, slots: { ...program.slots, carrier: base.slots.carrier }, unexpected: true };
    expect(() => migrateBrushStudioV6LegacyMixboxAuthoring(JSON.stringify(invalid))).toThrow(/변경 없이/u);
    expect(migrateBrushStudioV6LegacyMixboxAuthoring(JSON.stringify(base))).toBeNull();
  });
});
