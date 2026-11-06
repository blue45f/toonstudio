import { createHash } from "node:crypto";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";

import "../src/render/babylon/babylon-side-effects";
import { diagnoseSkeletonData, safeComputeWorldTransforms } from "../src/app/shell/panels/skeleton-boundary-guard";
import { loadAuthoredPackageFlow, loadPackageIndexFlow } from "../src/domains/authored/package-load-flow";
import { rigPoseSkeleton } from "../src/render/babylon/character-rig";
import { loadPackageRig } from "../src/render/babylon/package-loader";

import {
  buildOfficialFixturePackageCatalog,
  createCorruptedSkeletonFixtures,
  evaluateCorruptedSkeletonProbeReport,
  runBrowserDirectApiProbe,
  runNegativeControlSuite,
} from "./corrupted-skeleton-fixtures.mjs";

function createCatalogPort(catalog) {
  return {
    async fetchJson(url) {
      const pathname = new URL(url, "http://127.0.0.1:5173").pathname;
      const hit = catalog.resolveRoute(pathname);
      if (!hit) return { ok: false, status: 404, message: `404: ${pathname}` };
      const json = JSON.parse(typeof hit.body === "string" ? hit.body : Buffer.from(hit.body).toString("utf8"));
      return { ok: true, json };
    },
    async fetchBytes(url) {
      const pathname = new URL(url, "http://127.0.0.1:5173").pathname;
      const hit = catalog.resolveRoute(pathname);
      if (!hit) return { ok: false, status: 404, message: `404: ${pathname}` };
      const bytes = typeof hit.body === "string" ? new Uint8Array(Buffer.from(hit.body, "utf8")) : new Uint8Array(hit.body);
      return { ok: true, bytes };
    },
  };
}

describe("createCorruptedSkeletonFixtures", () => {
  it("모든 손상 스켈레톤 픽스처가 기대 진단 코드로 정확히 분류되고 정상 빈 스켈레톤은 null을 반환한다", () => {
    const fixtures = createCorruptedSkeletonFixtures();

    expect(diagnoseSkeletonData(fixtures.nanRestSkeleton)?.code).toBe("skeleton-non-finite-rest");
    expect(diagnoseSkeletonData(fixtures.infRestSkeleton)?.code).toBe("skeleton-non-finite-rest");
    expect(diagnoseSkeletonData(fixtures.parentCycleHumanoidSkeleton)?.code).toBe("skeleton-cycle");
    expect(diagnoseSkeletonData(fixtures.parentCycleSelfSkeleton)?.code).toBe("skeleton-cycle");
    expect(diagnoseSkeletonData(fixtures.parentCycleAuxSkeleton)?.code).toBe("skeleton-cycle");

    expect(diagnoseSkeletonData(fixtures.malformedShapeFixtures.nullBones)?.code).toBe("skeleton-invalid-input");
    expect(diagnoseSkeletonData(fixtures.malformedShapeFixtures.shortRestTranslation)?.code).toBe("skeleton-invalid-input");
    expect(diagnoseSkeletonData(fixtures.malformedShapeFixtures.invalidParentType)?.code).toBe("skeleton-invalid-input");
    expect(diagnoseSkeletonData(fixtures.malformedShapeFixtures.nonFiniteRestRotation)?.code).toBe("skeleton-invalid-input");
    expect(diagnoseSkeletonData(fixtures.malformedShapeFixtures.duplicateBoneMaskingCycle)?.code).toBe("skeleton-invalid-input");

    const emptyFailures = [];
    expect(diagnoseSkeletonData(fixtures.normalEmptySkeleton)).toBeNull();
    const emptyFk = safeComputeWorldTransforms(fixtures.normalEmptySkeleton, {}, { onFailure: (f) => emptyFailures.push(f) });
    expect(emptyFk.ok).toBe(true);
    expect(emptyFailures).toHaveLength(0);

    expect(diagnoseSkeletonData(fixtures.validHumanoidSkeleton)).toBeNull();
  });
});

describe("buildOfficialFixturePackageCatalog", () => {
  it("공식 index.json 및 4종의 패키지(manifest.json + slot-mapping.json + GLB)가 SHA-256 검증과 Babylon 로더를 통과한다", async () => {
    const catalog = buildOfficialFixturePackageCatalog("/assets/characters/");
    const port = createCatalogPort(catalog);
    const sha256 = async (bytes) => createHash("sha256").update(bytes).digest("hex");

    const indexResult = await loadPackageIndexFlow(port, "/assets/characters/index.json");
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;
    expect(indexResult.entries.map((e) => e.characterId)).toEqual([
      "valid-humanoid-rig",
      "normal-empty-rig",
      "corrupt-cycle-rig",
      "corrupt-nan-rest-rig",
    ]);

    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const deps = {
      scene,
      adaptMaterial: (_role, mesh) => new PBRMaterial(`mat:${mesh.name}`, scene),
      materials: { applyPreset: () => undefined, applyColor: () => undefined },
    };

    try {
      const loadRigFor = async (characterId) => {
        const entry = indexResult.entries.find((e) => e.characterId === characterId);
        expect(entry).toBeDefined();
        const pkgRes = await loadAuthoredPackageFlow(port, entry, { sha256 });
        expect(pkgRes.ok).toBe(true);
        if (!pkgRes.ok) throw new Error(pkgRes.failure.reasonKo);
        const rig = await loadPackageRig(pkgRes.plan, pkgRes.detail.glbBytes, deps);
        return { rig, poseSkeleton: rigPoseSkeleton(rig) };
      };

      const valid = await loadRigFor("valid-humanoid-rig");
      expect(valid.poseSkeleton).not.toBeNull();
      expect(diagnoseSkeletonData(valid.poseSkeleton)).toBeNull();
      expect(valid.poseSkeleton.bones.length).toBeGreaterThanOrEqual(15);
      valid.rig.dispose();

      const empty = await loadRigFor("normal-empty-rig");
      expect(empty.poseSkeleton).toBeNull();
      empty.rig.dispose();

      const cycle = await loadRigFor("corrupt-cycle-rig");
      expect(cycle.poseSkeleton).not.toBeNull();
      const hips = cycle.poseSkeleton.bones.find((b) => b.name === "hips");
      const spine = cycle.poseSkeleton.bones.find((b) => b.name === "spine");
      expect(hips?.parent).toBe("spine");
      expect(spine?.parent).toBe("hips");
      expect(diagnoseSkeletonData(cycle.poseSkeleton)?.code).toBe("skeleton-cycle");
      cycle.rig.dispose();

      const nanRig = await loadRigFor("corrupt-nan-rest-rig");
      expect(nanRig.poseSkeleton).not.toBeNull();
      const nanSpine = nanRig.poseSkeleton.bones.find((b) => b.name === "spine");
      expect(nanSpine?.restTranslation.some((v) => Number.isNaN(v))).toBe(true);
      expect(diagnoseSkeletonData(nanRig.poseSkeleton)?.code).toBe("skeleton-non-finite-rest");
      nanRig.rig.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});

describe("runBrowserDirectApiProbe, evaluateCorruptedSkeletonProbeReport & runNegativeControlSuite", () => {
  it("runBrowserDirectApiProbe가 모든 경계 가드·원자성·복구·Undo/Redo 계약을 통과한다", async () => {
    const result = await runBrowserDirectApiProbe();
    expect(result.passed).toBe(true);
    expect(result.cases).toHaveLength(10);
    expect(result.cases.every((c) => c.passed && c.everyCallbackFiredOnce)).toBe(true);
    expect(result.nonFiniteDirectGuards.passed).toBe(true);
    expect(result.normalEmpty.passed).toBe(true);
    expect(result.normalEmpty.failureCount).toBe(0);
    expect(result.unexpectedProgrammingError.passed).toBe(true);
    expect(result.unexpectedProgrammingError.rethrew).toBe(true);
    expect(result.atomicityAndRecovery.passed).toBe(true);
  });

  it("runNegativeControlSuite가 기준선 리포트(exitCode=0)와 6개 변이 리포트(모두 exitCode=1)를 검증한다", async () => {
    const suite = await runNegativeControlSuite();
    expect(suite.baselinePassed).toBe(true);
    expect(suite.allRejected).toBe(true);
    expect(suite.exitCode).toBe(1);
    expect(suite.cases).toHaveLength(6);
    for (const entry of suite.cases) {
      expect(entry.rejected).toBe(true);
      expect(entry.observedExitCode).toBe(1);
      expect(entry.reasons.length).toBeGreaterThan(0);
    }

    // 라이브 결함을 pass나 expected_failure로 은폐한 경우에도 거부하는지 확인
    const directApiCall = await runBrowserDirectApiProbe();
    const disguisedReport = {
      directApiCall,
      syntheticInjection: {
        passed: true,
        normalEmptyRig: { passed: true },
        corruptCycleRig: { passed: true },
        corruptNanRestRig: { passed: true },
      },
      realDomPointer: {
        passed: true,
        baselineProceduralDrag: { depthIncremented: true },
        corruptedPointerAttempts: { cycleDepthUnchanged: true, nanDepthUnchanged: true },
        recoveryValidHumanoidDrag: { passed: true },
      },
      liveAppCallerDefectAudit: {
        officialEntryOnly: true,
        defects: [{ id: "pose-panel-direct-fk-cycle-crash", reproduced: true, classification: "expected_failure" }],
      },
    };
    const disguisedEval = evaluateCorruptedSkeletonProbeReport(disguisedReport);
    expect(disguisedEval.ok).toBe(false);
    expect(disguisedEval.exitCode).toBe(1);
  });
});
