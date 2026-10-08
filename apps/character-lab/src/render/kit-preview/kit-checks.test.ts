import { describe, expect, it } from "vitest";

import { BODY_PARAM_KEYS, FACE_PARAM_KEYS, FACS_UNITS } from "../../contracts";

import { inspectGlb } from "./glb-inspect";
import { parseGlb } from "./glb-io";
import { buildFixtureGlb, fixtureJointNames } from "./glb-test-fixture";
import { KIT_BUDGETS, morphCoverageFor, runKitChecks } from "./kit-checks";
import { KIT_JOINT_NAMES, resolveMeshRole } from "./kit-roles";

import type { FixtureMeshSpec } from "./glb-test-fixture";
import type { PreviewWarning } from "./warnings";

const BODY18 = BODY_PARAM_KEYS.flatMap((key) => [`param:${key}:+`, `param:${key}:-`]);
const HEAD8 = ["height", "legLength", "neckLength", "headSize"].flatMap((key) => [`param:${key}:+`, `param:${key}:-`]);
const FACE30 = FACE_PARAM_KEYS.flatMap((key) => [`param:${key}:+`, `param:${key}:-`]);
const FACS16 = FACS_UNITS.map((unit) => `facs:${unit}`);

function check(joints: readonly string[] | undefined, meshes: FixtureMeshSpec[], files = [{ label: "base.glb", bytes: 1000 }]): PreviewWarning[] {
  const bytes = buildFixtureGlb({ ...(joints ? { joints } : {}), meshes });
  const merged = inspectGlb(parseGlb(bytes), "merged", bytes.byteLength);
  const roles = new Map(merged.meshNodes.map((mesh) => [mesh.node, resolveMeshRole(mesh.node)] as const));
  const skin = merged.skins[0];
  return runKitChecks({ files, merged, roles, skeletonJoints: skin ? skin.joints : null });
}

function codes(warnings: readonly PreviewWarning[]): string[] {
  return warnings.map((warning) => warning.code);
}

describe("morphCoverageFor", () => {
  it("계약 §4.4 표: 몸·의상은 체형 18, 머리는 54, 눈·입·속눈썹·헤어는 머리 체형 8 + α", () => {
    expect(morphCoverageFor("TS_Body")?.required).toHaveLength(18);
    expect(morphCoverageFor("TS_Underwear")?.required).toHaveLength(18);
    expect(morphCoverageFor("TS_Top_tee")?.required).toHaveLength(18);
    expect(morphCoverageFor("TS_Shoes_sneakers")?.required).toHaveLength(18);
    const head = morphCoverageFor("TS_Head")?.required ?? [];
    expect(head).toHaveLength(54);
    expect(new Set(head).size).toBe(54);
    expect(morphCoverageFor("TS_Eye_L")?.required).toHaveLength(16);
    expect(morphCoverageFor("TS_Iris_R")?.required).toHaveLength(16);
    expect(morphCoverageFor("TS_Highlight_L")?.required).toHaveLength(16);
    expect(morphCoverageFor("TS_Lashes")?.required).toHaveLength(8 + 10 + 7);
    expect(morphCoverageFor("TS_Mouth_teeth")?.required).toHaveLength(8 + 4 + 8);
    expect(morphCoverageFor("TS_AuthoredHair_soft-bob_LOD1")?.required).toHaveLength(8);
    expect(morphCoverageFor("TS_Accessory_headphones")?.required).toHaveLength(8);
    expect(morphCoverageFor("Avatar_Orion_Body")).toBeNull();
  });
});

describe("runKitChecks", () => {
  it("완전한 morph 세트를 가진 몸·머리는 morph 경고가 없다", () => {
    const warnings = check(KIT_JOINT_NAMES, [
      { node: "TS_Body", morphTargets: BODY18 },
      { node: "TS_Head", morphTargets: [...HEAD8, ...FACE30, ...FACS16] },
    ]);
    expect(codes(warnings)).not.toContain("kit-morph-missing");
    expect(codes(warnings).filter((code) => code.startsWith("kit-skeleton"))).toEqual([]);
  });

  it("누락된 morph를 개수와 이름으로 알린다", () => {
    const warnings = check(KIT_JOINT_NAMES, [{ node: "TS_Body", morphTargets: BODY18.slice(0, 16) }, { node: "TS_Head" }]);
    const body = warnings.find((warning) => warning.code === "kit-morph-missing" && warning.source === "TS_Body");
    expect(body?.messageKo).toContain("2/18");
    expect(body?.messageKo).toContain("param:neckLength:+");
    expect(warnings.find((warning) => warning.code === "kit-morph-missing" && warning.source === "TS_Head")?.messageKo).toContain("54/54");
  });

  it("스켈레톤: 키트와 다르면 경고, 레거시면 정보", () => {
    expect(codes(check(KIT_JOINT_NAMES.slice(1), [{ node: "TS_Body" }]))).toContain("kit-skeleton-mismatch");
    const legacy = check(fixtureJointNames(5), [{ node: "Body" }]);
    expect(legacy.find((warning) => warning.code === "kit-skeleton-legacy")?.severity).toBe("info");
  });

  it("헤어 LOD는 삼각형이 단조 감소해야 한다", () => {
    const warnings = check(KIT_JOINT_NAMES, [
      { node: "TS_AuthoredHair_a_LOD0", primitives: 1 },
      { node: "TS_AuthoredHair_a_LOD1", primitives: 2 },
    ]);
    expect(codes(warnings)).toContain("kit-hair-lod");
    expect(codes(check(KIT_JOINT_NAMES, [{ node: "TS_AuthoredHair_b_LOD1" }]))).toContain("kit-hair-lod");
  });

  it("텍스처 슬롯·크기 예산: ORM·emissive 금지, 몸·머리 외 1024 초과 경고", () => {
    const warnings = check(KIT_JOINT_NAMES, [
      { node: "TS_Top_tee", materials: ["ts_top_tee"], texture: { width: 2048, height: 2048 } },
      { node: "TS_Body", materials: ["ts_skin_body"], texture: { width: 2048, height: 2048 } },
    ]);
    const budget = warnings.filter((warning) => warning.code === "kit-texture-budget");
    expect(budget.map((warning) => warning.source)).toEqual(["ts_top_tee"]);
  });

  it("파일 크기 예산: 베이스 16 MiB, 파츠 1.5 MiB(계약 KIT_BUDGET과 같은 값)", () => {
    const warnings = check(KIT_JOINT_NAMES, [{ node: "TS_Body" }], [
      { label: "base.glb", bytes: KIT_BUDGETS.baseBytes + 1 },
      { label: "hair.glb", bytes: KIT_BUDGETS.partBytes + 1 },
      { label: "top.glb", bytes: 1000 },
    ]);
    expect(warnings.filter((warning) => warning.code === "kit-budget-bytes").map((warning) => warning.source)).toEqual(["base.glb", "hair.glb"]);
  });

  it("키트 이름과 레거시 이름이 섞이면 역할 추정을 경고(warn)로 알린다", () => {
    const warnings = check(KIT_JOINT_NAMES, [{ node: "TS_Body" }, { node: "Mystery" }]);
    expect(warnings.find((warning) => warning.code === "kit-mesh-undeclared")?.severity).toBe("warn");
  });
});
