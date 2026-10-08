import { describe, expect, it } from "vitest";

import { DEFAULT_RECIPE_COLORS, isLabFailure } from "../../contracts";
import { hexToLinearRgb } from "../../shared/color";

import { inspectGlb } from "./glb-inspect";
import { arrayField, isJsonObject, parseGlb } from "./glb-io";
import { buildFixtureGlb, fixtureJointNames } from "./glb-test-fixture";
import { KIT_JOINT_NAMES } from "./kit-roles";
import { prepareKitGlbs } from "./prepare";
import { resolveTintColors } from "./tint";

import type { FixtureMeshSpec } from "./glb-test-fixture";
import type { PrepareFile, PrepareOptions, PrepareResult } from "./prepare";

const OPTIONS: PrepareOptions = { colors: resolveTintColors({}), roleOverrides: {} };

function file(label: string, joints: readonly string[] | undefined, meshes: FixtureMeshSpec[], extra: { extensionsUsed?: string[] } = {}): PrepareFile {
  return { label, bytes: buildFixtureGlb({ ...(joints ? { joints } : {}), meshes, ...extra }) };
}

function baseColorFactorOf(result: PrepareResult, materialName: string): number[] | null {
  const doc = parseGlb(result.bytes);
  const material = arrayField(doc.json, "materials").find((value) => isJsonObject(value) && value.name === materialName);
  const pbr = isJsonObject(material) && isJsonObject(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : null;
  return pbr && Array.isArray(pbr.baseColorFactor) ? (pbr.baseColorFactor as number[]) : null;
}

function failureCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (isLabFailure(error)) return error.code;
    throw error;
  }
  throw new Error("실패해야 하는 호출이었습니다.");
}

describe("prepareKitGlbs: 레거시 단일 GLB", () => {
  it("키트 이름이 아니면 원본 바이트를 그대로 쓰고 역할은 추정으로 표시한다", () => {
    const original = file("legacy.glb", fixtureJointNames(3), [{ node: "Avatar_Body", morphTargets: ["a"] }, { node: "Hair_Cap" }]);
    const result = prepareKitGlbs([original], OPTIONS);
    expect(result.passthrough).toBe(true);
    expect(result.bytes).toBe(original.bytes);
    expect(result.meshRoles).toEqual({ Avatar_Body: "skin", Hair_Cap: "hair" });
    expect(result.meshes.every((mesh) => mesh.roleSource === "legacy-name" && mesh.tintMode === "legacy" && mesh.planColorHex === null)).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "roles-guessed")).toBe(true);
    expect(result.skeleton?.kit.looksLikeKit).toBe(false);
    expect(result.warnings.some((warning) => warning.code === "kit-skeleton-legacy")).toBe(true);
  });

  it("--role 덮어쓰기가 추정보다 우선한다", () => {
    const result = prepareKitGlbs([file("legacy.glb", undefined, [{ node: "Mystery" }])], { ...OPTIONS, roleOverrides: { Mystery: "shoes" } });
    expect(result.meshRoles).toEqual({ Mystery: "shoes" });
    expect(result.meshes[0]?.roleSource).toBe("override");
  });

  it("스켈레톤이 없는 GLB도 준비된다(본 매핑 비어 있음)", () => {
    const result = prepareKitGlbs([file("static.glb", undefined, [{ node: "TS_ReferenceHead" }])], OPTIONS);
    expect(result.skeleton).toBeNull();
    expect(result.boneMap).toEqual({});
  });
});

describe("prepareKitGlbs: 키트 베이스 + 파츠", () => {
  const base = file("base.glb", KIT_JOINT_NAMES, [
    { node: "TS_Body", materials: ["ts_skin_body"], texture: { width: 64, height: 64 }, baseColorFactor: [1, 1, 1, 1] },
    { node: "TS_Eye_L", materials: ["ts_eye"], texture: { width: 32, height: 32 } },
    { node: "TS_Eye_R", materials: ["ts_eye"] },
    { node: "TS_Mouth", primitives: 2, materials: ["ts_teeth", "ts_tongue"], baseColorFactor: [1, 1, 1, 1] },
    { node: "TS_Underwear", materials: ["ts_underwear"], baseColorFactor: [0.2, 0.2, 0.3, 1] },
  ]);
  const hair = file("hair.glb", KIT_JOINT_NAMES, [{ node: "TS_AuthoredHair_soft-bob_LOD0", materials: ["ts_hair_soft-bob"], texture: { width: 32, height: 32 }, baseColorFactor: [1, 1, 1, 1] }]);

  it("역할·틴트 규칙: recolor는 굽고 fixed는 건드리지 않고 플랜 색만 정한다", () => {
    const result = prepareKitGlbs([base, hair], OPTIONS);
    expect(result.passthrough).toBe(false);
    const byNode = new Map(result.meshes.map((mesh) => [mesh.node, mesh]));
    expect(byNode.get("TS_Body")).toMatchObject({ role: "skin", tintMode: "recolor", colorKey: "skin", planColorHex: DEFAULT_RECIPE_COLORS.skin, roleSource: "kit-name" });
    expect(byNode.get("TS_AuthoredHair_soft-bob_LOD0")).toMatchObject({ role: "hair", tintMode: "recolor", planColorHex: DEFAULT_RECIPE_COLORS.hair, origin: "hair.glb" });
    expect(byNode.get("TS_Eye_L")).toMatchObject({ role: "eyeball", tintMode: "fixed", planColorHex: "#ffffff" });
    expect(byNode.get("TS_Mouth_teeth")).toMatchObject({ role: "teeth", tintMode: "fixed", origin: "base.glb", material: "ts_teeth" });
    expect(byNode.get("TS_Mouth_tongue")).toMatchObject({ role: "tongue", tintMode: "fixed", material: "ts_tongue" });
    expect(byNode.get("TS_Underwear")?.tintMode).toBe("fixed");
    // 고정 재질 TS_Underwear의 authored 색([0.2,0.2,0.3])이 플랜 색이 된다
    expect(byNode.get("TS_Underwear")?.planColorHex).toMatch(/^#[0-9a-f]{6}$/u);
    expect(byNode.get("TS_Underwear")?.planColorHex).not.toBe("#ffffff");
    expect(result.merge.splits).toEqual([{ node: "TS_Mouth", into: ["TS_Mouth_teeth", "TS_Mouth_tongue"] }]);
    // 굽기: recolor 재질의 baseColorFactor = 틴트(선형), fixed 재질은 원본 유지
    const skin = hexToLinearRgb(DEFAULT_RECIPE_COLORS.skin) ?? [0, 0, 0];
    const skinFactor = baseColorFactorOf(result, "ts_skin_body");
    expect(skinFactor?.slice(0, 3).map((value) => Number(value.toFixed(5)))).toEqual(skin.map((value) => Number(value.toFixed(5))));
    expect(skinFactor?.[3]).toBe(1);
    expect(baseColorFactorOf(result, "ts_underwear")).toEqual([0.2, 0.2, 0.3, 1]);
    expect(baseColorFactorOf(result, "ts_hair_soft-bob")?.slice(0, 3)).toEqual((hexToLinearRgb(DEFAULT_RECIPE_COLORS.hair) ?? []).map((value) => value));
  });

  it("--color 덮어쓰기는 굽는 값과 플랜 색에 같이 반영된다", () => {
    const result = prepareKitGlbs([base, hair], { ...OPTIONS, colors: resolveTintColors({ hair: "#ff0000", skin: "#00ff00" }) });
    expect(result.meshes.find((mesh) => mesh.node === "TS_Body")?.planColorHex).toBe("#00ff00");
    expect(baseColorFactorOf(result, "ts_hair_soft-bob")?.slice(0, 3)).toEqual([1, 0, 0]);
    expect(baseColorFactorOf(result, "ts_skin_body")?.slice(0, 3)).toEqual([0, 1, 0]);
  });

  it("본 매핑은 키트 55개, 스켈레톤은 정확히 키트와 같다", () => {
    const result = prepareKitGlbs([base], OPTIONS);
    expect(Object.keys(result.boneMap)).toHaveLength(55);
    expect(result.skeleton?.mappedBones).toBe(55);
    expect(result.skeleton?.unmapped).toHaveLength(13);
    expect(result.skeleton?.kit.exact).toBe(true);
    expect(result.warnings.filter((warning) => warning.code.startsWith("kit-skeleton") || warning.code === "kit-bone-map")).toEqual([]);
  });

  it("병합 결과 GLB는 유효하고 파츠가 베이스 스킨을 쓴다", () => {
    const result = prepareKitGlbs([base, hair], OPTIONS);
    const summary = inspectGlb(parseGlb(result.bytes), "result", result.bytes.byteLength);
    expect(summary.meshNodes.map((mesh) => mesh.node).sort()).toEqual(["TS_AuthoredHair_soft-bob_LOD0", "TS_Body", "TS_Eye_L", "TS_Eye_R", "TS_Mouth_teeth", "TS_Mouth_tongue", "TS_Underwear"].sort());
    expect(summary.skins).toHaveLength(1);
    expect(summary.meshNodes.every((mesh) => mesh.skinIndex === 0)).toBe(true);
    expect(summary.warnings.filter((warning) => warning.severity === "error")).toEqual([]);
  });

  it("recolor 재질의 baseColorFactor가 흰색이 아니면 경고하고 덮어쓴다", () => {
    const tinted = file("base.glb", KIT_JOINT_NAMES, [{ node: "TS_Body", materials: ["ts_skin_body"], baseColorFactor: [0.5, 0.5, 0.5, 1] }]);
    const result = prepareKitGlbs([tinted], OPTIONS);
    expect(result.warnings.some((warning) => warning.code === "kit-factor-not-white")).toBe(true);
    expect(baseColorFactorOf(result, "ts_skin_body")?.[0]).not.toBe(0.5);
  });

  it("관절 불일치는 병합 단계에서 실패한다", () => {
    const wrong = file("hair.glb", KIT_JOINT_NAMES.slice(0, 60), [{ node: "TS_AuthoredHair_a_LOD0" }]);
    expect(failureCode(() => prepareKitGlbs([base, wrong], OPTIONS))).toBe("kit-joint-mismatch");
  });

  it("GLB가 아닌 입력은 glb-invalid로 실패한다", () => {
    expect(failureCode(() => prepareKitGlbs([{ label: "x.glb", bytes: new Uint8Array(64) }], OPTIONS))).toBe("glb-invalid");
  });

  it("키트 점검 경고가 합쳐진다: 스킨 아닌 키트 메시·_Outline 셸", () => {
    const bad = file("base.glb", KIT_JOINT_NAMES, [{ node: "TS_Body" }, { node: "TS_Top_tee", skinned: false }, { node: "TS_Top_tee_Outline" }]);
    const codes = prepareKitGlbs([bad], OPTIONS).warnings.map((warning) => warning.code);
    expect(codes).toEqual(expect.arrayContaining(["kit-skin-invalid", "kit-outline-shell-forbidden"]));
  });
});
