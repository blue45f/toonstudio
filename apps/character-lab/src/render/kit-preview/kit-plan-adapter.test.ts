import { describe, expect, it } from "vitest";

import { KIT_BASE_MESH_SPECS, KIT_BONE_MAP, KIT_CURRENT_VERSION, KIT_DEFAULT_ID, KIT_SKELETON_JOINTS, isLabFailure, kitMeshSchema } from "../../contracts";

import { buildFixtureGlb, fixtureJointNames } from "./glb-test-fixture";
import { buildKitPlan, decideSourceKind, guessBaseId } from "./kit-plan-adapter";
import { KIT_JOINT_NAMES } from "./kit-roles";
import { buildStaticReport } from "./summary";
import { resolveTintColors } from "./tint";

import type { FixtureMeshSpec } from "./glb-test-fixture";
import type { KitPlanFile, KitPlanOptions } from "./kit-plan-adapter";
import type { PreviewWarning } from "./warnings";

const OPTIONS: KitPlanOptions = { colors: resolveTintColors({}), roleOverrides: {}, hairLod: 0 };
const SHA = (seed: string): string => seed.repeat(64).slice(0, 64);

/** 계약의 베이스 메시 9개(TS_Mouth는 프리미티브 2개)를 가진 키트 베이스 GLB */
function baseMeshes(extra: Partial<Record<string, Partial<FixtureMeshSpec>>> = {}): FixtureMeshSpec[] {
  return KIT_BASE_MESH_SPECS.map((spec) => {
    const materials = spec.primitiveMaterials ?? (spec.material ? [spec.material] : undefined);
    return { node: spec.node, ...(spec.primitiveMaterials ? { primitives: spec.primitiveMaterials.length } : {}), ...(materials ? { materials } : {}), ...(extra[spec.node] ?? {}) };
  });
}

function glb(meshes: FixtureMeshSpec[], joints: readonly string[] | undefined = KIT_JOINT_NAMES): Uint8Array {
  return buildFixtureGlb({ ...(joints ? { joints } : {}), meshes });
}

function file(label: string, meshes: FixtureMeshSpec[], seed = "a", joints: readonly string[] | undefined = KIT_JOINT_NAMES): KitPlanFile {
  const bytes = glb(meshes, joints);
  return { label, url: `http://127.0.0.1:1/${label}`, sha256: SHA(seed), byteLength: bytes.byteLength, bytes };
}

function codes(warnings: readonly PreviewWarning[]): string[] {
  return warnings.map((warning) => warning.code);
}

describe("decideSourceKind", () => {
  it("베이스에 TS_Body 또는 TS_Head가 있으면 kit", () => {
    const decision = decideSourceKind(glb(baseMeshes()), "base_female.glb", false);
    expect(decision.kind).toBe("kit");
    expect(decision.forced).toBe(false);
    expect(decision.reasonKo).toContain("TS_Body");
    expect(decideSourceKind(glb([{ node: "TS_Head" }]), "head.glb", false).kind).toBe("kit");
  });

  it("키트 이름이 없는 GLB(Orion 등)는 package, 키트 헤어 이름이 섞여 있어도 베이스 메시가 없으면 package", () => {
    const orion = glb([{ node: "Avatar_Orion_Body" }, { node: "TS_Orion_Brow_L" }, { node: "TS_AuthoredHair_short-layered_LOD0" }], fixtureJointNames(3));
    const decision = decideSourceKind(orion, "orion.glb", false);
    expect(decision.kind).toBe("package");
    expect(decision.forced).toBe(false);
    expect(decision.reasonKo).toContain("키트 규약 밖");
  });

  it("--legacy-merge는 감지를 건너뛰고 package로 강제한다", () => {
    const decision = decideSourceKind(glb(baseMeshes()), "base_female.glb", true);
    expect(decision).toMatchObject({ kind: "package", forced: true });
    expect(decision.reasonKo).toContain("--legacy-merge");
  });

  it("GLB가 아니면 glb-invalid LabFailure를 던진다(병합 경로도 같은 입력을 거부한다)", () => {
    let thrown: unknown;
    try {
      decideSourceKind(new Uint8Array([1, 2, 3, 4]), "broken.glb", false);
    } catch (error) {
      thrown = error;
    }
    expect(isLabFailure(thrown) && thrown.code).toBe("glb-invalid");
  });
});

describe("guessBaseId", () => {
  it("파일 이름의 male/female로 베이스를 추정한다(기본 여성)", () => {
    expect(guessBaseId("base_female.glb")).toBe("female");
    expect(guessBaseId("base_male.glb")).toBe("male");
    expect(guessBaseId("male-base.glb")).toBe("male");
    expect(guessBaseId("base.glb")).toBe("female");
    expect(guessBaseId("Femalemale.glb")).toBe("female");
  });
});

describe("buildKitPlan: 베이스 + 파츠", () => {
  const base = file("base_female.glb", baseMeshes({ TS_Body: { morphTargets: ["param:height:+", "param:height:-"] }, TS_Head: { morphTargets: ["facs:jawOpen", "param:height:+"] } }), "b");
  const irises = file(
    "irises_round-large.female.glb",
    [
      { node: "TS_Iris_L", materials: ["ts_iris"] },
      { node: "TS_Iris_R", materials: ["ts_iris"] },
      { node: "TS_Highlight_L", materials: ["ts_highlight"] },
      { node: "TS_Highlight_R", materials: ["ts_highlight"] },
    ],
    "c",
  );
  const build = buildKitPlan([base, irises], { ...OPTIONS, hairLod: 1 });
  const { plan } = build;

  it("플랜 머리말·스켈레톤은 계약 상수를 쓰고, 파일 SHA-256·바이트 수는 입력 그대로 담는다", () => {
    expect(plan.kitId).toBe(KIT_DEFAULT_ID);
    expect(plan.kitVersion).toBe(KIT_CURRENT_VERSION);
    expect(plan.baseId).toBe("female");
    expect(plan.skeleton.joints).toEqual([...KIT_SKELETON_JOINTS]);
    expect(Object.keys(plan.skeleton.boneMap)).toHaveLength(Object.keys(KIT_BONE_MAP).length);
    expect(plan.hairLodPolicy).toEqual({ preferredLod: 1 });
    expect(plan.parts.map((part) => [part.id, part.kind, part.slot])).toEqual([
      ["base/female", "base", null],
      ["irises/irises_round-large.female", "part", "irises"],
    ]);
    expect(plan.parts[0]).toMatchObject({ url: base.url, sha256: SHA("b"), bytes: base.byteLength, hides: [] });
    expect(plan.parts[1]).toMatchObject({ url: irises.url, sha256: SHA("c"), bytes: irises.byteLength });
    expect(plan.bodyRegions).toEqual([]);
    expect(plan.jointOffsets).toEqual({});
  });

  it("베이스 메시는 계약 베이스 메시 명세와 같은 역할·재질로 선언되고 TS_Mouth는 프리미티브 역할을 가진다", () => {
    const declared = new Map((plan.parts[0]?.meshes ?? []).map((mesh) => [mesh.node, mesh] as const));
    for (const spec of KIT_BASE_MESH_SPECS) {
      const mesh = declared.get(spec.node);
      expect(mesh, spec.node).toBeDefined();
      expect(mesh?.role, spec.node).toBe(spec.role);
      expect(mesh?.material, spec.node).toBe(spec.material);
      expect(mesh?.primitiveRoles, spec.node).toEqual(spec.primitiveRoles);
      expect(mesh?.primitiveMaterials, spec.node).toEqual(spec.primitiveMaterials);
      expect(mesh?.skinned).toBe(true);
    }
  });

  it("morph 이름을 메시마다 선언하고 플랜 morphNames는 정렬된 합집합이다", () => {
    const body = plan.parts[0]?.meshes.find((mesh) => mesh.node === "TS_Body");
    expect(body?.morphs).toEqual(["param:height:+", "param:height:-"]);
    expect(plan.morphNames).toEqual(["facs:jawOpen", "param:height:+", "param:height:-"]);
  });

  it("재질 틴트는 계약 KIT_ROLE_TINT_RULES를 따른다(recolor 키·fixed 흰색)", () => {
    expect(plan.materials.ts_skin_body).toEqual({ role: "skin", tint: { mode: "recolor", colorKey: "skin" }, doubleSided: false });
    expect(plan.materials.ts_skin_head?.tint).toEqual({ mode: "recolor", colorKey: "skin" });
    expect(plan.materials.ts_brow?.tint).toEqual({ mode: "recolor", colorKey: "brow" });
    expect(plan.materials.ts_lashes?.tint).toEqual({ mode: "recolor", colorKey: "brow" });
    expect(plan.materials.ts_iris?.tint).toEqual({ mode: "recolor", colorKey: "iris" });
    for (const name of ["ts_eye", "ts_teeth", "ts_tongue", "ts_underwear", "ts_highlight"]) expect(plan.materials[name]?.tint, name).toEqual({ mode: "fixed", hex: "#ffffff" });
    expect(plan.materials.ts_teeth?.role).toBe("teeth");
    expect(plan.materials.ts_tongue?.role).toBe("tongue");
  });

  it("선언은 계약 스키마를 통과하고 정상 입력에는 오류 경고가 없다", () => {
    for (const part of plan.parts) for (const mesh of part.meshes) expect(kitMeshSchema.safeParse(mesh).success, mesh.node).toBe(true);
    const bad = build.warnings.filter((warning) => warning.severity === "error");
    expect(bad.map((warning) => `${warning.code}:${warning.messageKo}`)).toEqual([]);
    expect(codes(build.warnings)).not.toContain("kit-declaration-invalid");
    expect(codes(build.warnings)).not.toContain("kit-base-mesh-missing");
    expect(codes(build.warnings)).toContain("kit-plan-synthesized");
  });

  it("정적 요약은 병합 없이(passthrough) 베이스 원본 바이트를 가리키고 sourceKind·플랜 요약을 싣는다", () => {
    expect(build.prepared.passthrough).toBe(true);
    expect(build.prepared.bytes).toBe(base.bytes);
    expect(build.prepared.merge.splits).toEqual([]);
    const report = buildStaticReport(build.prepared, "kit", plan);
    expect(report.sourceKind).toBe("kit");
    expect(report.kitPlan).toMatchObject({ kitId: KIT_DEFAULT_ID, baseId: "female", materials: Object.keys(plan.materials).length, morphNames: 3 });
    expect(report.kitPlan?.parts.map((part) => part.id)).toEqual(["base/female", "irises/irises_round-large.female"]);
    expect(report.inputs).toHaveLength(2);
    expect(report.totals.meshes).toBe(report.meshes.length);
    expect(report.meshes.find((mesh) => mesh.name === "TS_Eye_L")).toMatchObject({ role: "eyeball", roleSource: "kit-name", tint: "fixed", planColor: "#ffffff", origin: "base_female.glb" });
    expect(report.meshes.find((mesh) => mesh.name === "TS_Body")).toMatchObject({ role: "skin", tint: "recolor", planColor: OPTIONS.colors.skin });
    expect(report.skeleton?.matchesKit68).toBe(true);
    expect(report.merge.passthrough).toBe(true);
  });
});

describe("buildKitPlan: 규약 위반은 무음 대체 없이 경고로 드러난다", () => {
  it("베이스에 필수 키트 메시가 없으면 kit-base-mesh-missing(error)", () => {
    const partial = file("base_female.glb", baseMeshes().filter((mesh) => mesh.node !== "TS_Eye_L" && mesh.node !== "TS_Underwear"));
    const { warnings } = buildKitPlan([partial], OPTIONS);
    const missing = warnings.find((warning) => warning.code === "kit-base-mesh-missing");
    expect(missing?.severity).toBe("error");
    expect(missing?.messageKo).toContain("TS_Eye_L");
    expect(missing?.messageKo).toContain("TS_Underwear");
  });

  it("파츠 슬롯의 필수 역할이 없으면 kit-part-role-missing, 허용 밖 역할이면 kit-part-role-invalid", () => {
    const base = file("base_female.glb", baseMeshes());
    const onlyIris = file("irises_only.glb", [{ node: "TS_Iris_L", materials: ["ts_iris"] }, { node: "TS_Iris_R", materials: ["ts_iris"] }]);
    const missing = buildKitPlan([base, onlyIris], OPTIONS).warnings.find((warning) => warning.code === "kit-part-role-missing");
    expect(missing?.messageKo).toContain("eye-highlight");

    const wrongRole = file("hair_with_shoes.glb", [{ node: "TS_AuthoredHair_soft-bob_LOD0", materials: ["ts_hair"] }, { node: "Mystery", materials: ["ts_mystery"] }]);
    const result = buildKitPlan([base, wrongRole], { ...OPTIONS, roleOverrides: { Mystery: "shoes" } });
    expect(result.warnings.find((warning) => warning.code === "kit-part-role-invalid")?.messageKo).toContain("shoes");
    expect(codes(result.warnings)).toContain("kit-part-mixed-slots");
  });

  it("키트 이름이 아닌 메시는 --role 덮어쓰기 또는 이름 추정으로 역할을 정하고 추정했다고 알린다", () => {
    const base = file("base_female.glb", baseMeshes());
    const odd = file("odd.glb", [{ node: "Boots_Custom", materials: ["ts_boots"] }]);
    const guessed = buildKitPlan([base, odd], OPTIONS);
    expect(guessed.plan.parts[1]?.slot).toBe("shoes");
    expect(guessed.prepared.meshes.find((mesh) => mesh.node === "Boots_Custom")?.roleSource).toBe("legacy-name");
    expect(codes(guessed.warnings)).toContain("kit-mesh-undeclared");
    const forced = buildKitPlan([base, odd], { ...OPTIONS, roleOverrides: { Boots_Custom: "accessory" } });
    expect(forced.plan.parts[1]?.slot).toBe("accessory");
    expect(forced.plan.materials.ts_boots?.role).toBe("accessory");
  });

  it("한 재질을 여러 역할이 쓰면 kit-material-shared-roles로 알린다", () => {
    const base = file("base_female.glb", baseMeshes({ TS_Lashes: { materials: ["ts_brow"] } }));
    const { warnings } = buildKitPlan([base], OPTIONS);
    expect(warnings.find((warning) => warning.code === "kit-material-shared-roles")?.messageKo).toContain("ts_brow");
  });

  it("스켈레톤이 키트 68관절이 아니면 정적 경고(kit-skeleton-*)가 나오고 플랜 스켈레톤은 계약 상수라 엔진이 joint 불일치로 거부한다", () => {
    const legacySkeleton = file("base_female.glb", baseMeshes(), "a", fixtureJointNames(10));
    const { plan, warnings } = buildKitPlan([legacySkeleton], OPTIONS);
    expect(warnings.some((warning) => warning.code.startsWith("kit-skeleton"))).toBe(true);
    expect(plan.skeleton.joints).toEqual([...KIT_SKELETON_JOINTS]);
  });

  it("키트 어휘 밖 morph 이름은 선언하지 않고 구동되지 않는다고 경고한다(무음 폐기 금지)", () => {
    const base = file("base_female.glb", baseMeshes({ TS_Body: { morphTargets: ["param:height:+", "Key 1", "blendShape1.vrc_v_aa"] } }));
    const { plan, warnings } = buildKitPlan([base], OPTIONS);
    expect(plan.parts[0]?.meshes.find((mesh) => mesh.node === "TS_Body")?.morphs).toEqual(["param:height:+"]);
    expect(plan.morphNames).toEqual(["param:height:+"]);
    const warning = warnings.find((entry) => entry.code === "kit-morph-unknown-name");
    expect(warning?.source).toBe("TS_Body");
    expect(warning?.messageKo).toContain("Key 1");
    expect(warning?.messageKo).toContain("--legacy-merge");
  });

  it("기존 정적 검사 경고(예: 스키닝 없음)도 그대로 모은다", () => {
    const unskinned = file("base_female.glb", baseMeshes({ TS_Body: { skinned: false } }));
    const { warnings, plan } = buildKitPlan([unskinned], OPTIONS);
    expect(codes(warnings)).toContain("kit-skin-invalid");
    expect(plan.parts[0]?.meshes.find((mesh) => mesh.node === "TS_Body")?.skinned).toBeUndefined();
  });
});
