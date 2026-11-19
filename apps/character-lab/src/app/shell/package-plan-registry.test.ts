import { describe, expect, it } from "vitest";

import { characterPackageManifestFixture, FIXTURE_GLB_SHA256 } from "../../testing/manifest-fixtures";

import { createPackagePlanRegistry } from "./package-plan-registry";

import type { AuthoredPackagePlan } from "../../contracts";

function planFixture(): AuthoredPackagePlan {
  const manifest = characterPackageManifestFixture();
  return {
    manifest,
    baseUrl: "/assets/characters/mina/",
    glbUrl: "/assets/characters/mina/mina.glb",
    glbSha256: FIXTURE_GLB_SHA256,
    glbBytes: 10,
    shapeKeyMap: {},
    boneMap: {},
    meshRoles: {},
    hairLodPolicy: { preferredLod: 0 },
    capabilities: {} as AuthoredPackagePlan["capabilities"],
    licenseNote: "CC0",
  };
}

describe("app/shell/package-plan-registry", () => {
  it("등록한 플랜을 characterId로 찾고 구독자에게 알린다", () => {
    const registry = createPackagePlanRegistry();
    let notified = 0;
    registry.subscribe(() => {
      notified += 1;
    });
    const plan = planFixture();
    registry.register(plan);
    expect(registry.get(plan.manifest.characterId)).toBe(plan);
    expect(registry.list()).toHaveLength(1);
    expect(notified).toBe(1);
    expect(registry.resolve({ kind: "package", characterId: plan.manifest.characterId, sha256: FIXTURE_GLB_SHA256 }, 0)).toBe(plan);
  });

  it("없는 플랜·SHA 불일치·절차 소스는 LabFailure로 throw한다", () => {
    const registry = createPackagePlanRegistry();
    expect(() => registry.resolve({ kind: "package", characterId: "ghost", sha256: FIXTURE_GLB_SHA256 }, 0)).toThrow(
      expect.objectContaining({ code: "package-plan-missing", reasonKo: expect.stringContaining("ghost") }),
    );
    const plan = planFixture();
    registry.register(plan);
    expect(() => registry.resolve({ kind: "package", characterId: plan.manifest.characterId, sha256: "f".repeat(64) }, 0)).toThrow(
      expect.objectContaining({ code: "package-sha-mismatch" }),
    );
    expect(() => registry.resolve({ kind: "procedural" }, 0)).toThrow(expect.objectContaining({ code: "package-source-kind" }));
  });

  it("한 인물의 두 판을 번갈아 열어도 각 레시피가 원래 모델을 찾는다", () => {
    const registry = createPackagePlanRegistry();
    const original = planFixture();
    const newer = { ...original, glbSha256: "9".repeat(64) };
    registry.register(original);
    registry.register(newer);
    for (const plan of [original, newer, original]) {
      const characterId = plan.manifest.characterId;
      expect(registry.get(characterId, plan.glbSha256)).toBe(plan);
      expect(registry.resolve({ kind: "package", characterId, sha256: plan.glbSha256 })).toBe(plan);
    }
  });
});
