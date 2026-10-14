import { describe, expect, it } from "vitest";

import {
  createCharacterCanonicalPartPlan,
  resolveCharacterCanonicalPoseCorrectiveMorphs,
  CHARACTER_CANONICAL_POSE_CORRECTIVE_RULES,
} from "./character-canonical-part-plan";
import { parseCharacterCanonicalManifestV2 } from "./character-canonical-manifest";

describe("포즈 연동 교정 모프", () => {
  it("휴지 포즈에서는 기본 모프 그대로이고 기여가 없다", () => {
    const base = { "hair-temple-clearance": 0.25 };
    const result = resolveCharacterCanonicalPoseCorrectiveMorphs(base, {});
    expect(result.morphs).toEqual(base);
    expect(result.contributions).toEqual([]);
    const belowStart = resolveCharacterCanonicalPoseCorrectiveMorphs(base, { leftShoulder: 30 });
    expect(belowStart.contributions).toEqual([]);
  });

  it("어깨를 끝까지 올리면 겨드랑이 클리어런스 모프가 최대 기여까지 램프한다", () => {
    const result = resolveCharacterCanonicalPoseCorrectiveMorphs({}, { leftShoulder: 120 });
    expect(result.morphs["shoulder-left-clearance"]).toBeCloseTo(0.65, 6);
    expect(result.contributions).toEqual([
      { ruleId: "shoulder-left-clearance", morphKey: "shoulder-left-clearance", weight: 0.65 },
    ]);
    const halfway = resolveCharacterCanonicalPoseCorrectiveMorphs({}, { leftShoulder: 75 });
    expect(halfway.morphs["shoulder-left-clearance"]).toBeCloseTo(0.325, 6);
  });

  it("기본 모프와 합산하되 [-1, 1] 범위로 클램프한다", () => {
    const result = resolveCharacterCanonicalPoseCorrectiveMorphs(
      { "shoulder-left-clearance": 0.6 },
      { leftShoulder: 200 },
    );
    expect(result.morphs["shoulder-left-clearance"]).toBe(1);
  });

  it("유효하지 않은 각도는 휴지로 취급해 발동하지 않는다", () => {
    const result = resolveCharacterCanonicalPoseCorrectiveMorphs({}, {
      leftElbow: Number.NaN,
      rightHip: -50,
      spine: Number.POSITIVE_INFINITY,
    });
    expect(result.contributions).toEqual([]);
    expect(result.morphs).toEqual({});
  });

  it("규칙표는 좌우 대칭이고 시작<최대 각도 순서를 지킨다", () => {
    for (const rule of CHARACTER_CANONICAL_POSE_CORRECTIVE_RULES) {
      expect(rule.fullDeg).toBeGreaterThan(rule.startDeg);
      expect(rule.peakWeight).toBeGreaterThan(0);
      expect(rule.peakWeight).toBeLessThanOrEqual(1);
    }
    const joints = CHARACTER_CANONICAL_POSE_CORRECTIVE_RULES.map((rule) => rule.joint).sort();
    expect(joints).toEqual([
      "leftElbow", "leftHip", "leftKnee", "leftShoulder",
      "rightElbow", "rightHip", "rightKnee", "rightShoulder", "spine",
    ]);
  });
});

function fixture() {
  return parseCharacterCanonicalManifestV2({
    schemaVersion: 2,
    identity: {
      assetId: "character:lumi", version: "1", topologyFamily: "toon-standard",
      topologyRevision: "topology-3", rigRevision: "rig-7", morphRevision: "morph-5",
      rendererRevision: "toon-4",
    },
    runtime: { format: "vrm-1.0", modelFile: "/vrm/sample.vrm", unitScale: 1, upAxis: "Y", forwardAxis: "-Z" },
    semantics: { nodes: {}, materials: {}, renderIds: {} },
    morphs: {},
    fitting: {
      bodyMeasurements: { headWidth: 0.18 },
      sockets: [{ id: "head", node: "head", position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], tags: ["hair"] }],
      colliders: [],
    },
    parts: [{
      id: "top:donor-tee", label: "티셔츠", slot: "top",
      source: {
        format: "glb-part", file: "/parts/tee.glb",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        selector: { kind: "semantic", semantic: "tops" },
      },
      binding: { kind: "skinned-transplant", requiredRigRevisions: ["rig-7"], requiredTopologyFamilies: ["toon-standard"] },
      fitting: {
        drivers: [], clearanceMeters: 0.01, hideTargetPart: false,
        correctiveMorphs: { "shoulder-left-clearance": 0.1 },
      },
      lods: [], semanticLayers: ["top"],
      quality: { minimumScore: 96, accepted: true, reportFile: "/quality/tee.json", goldenPoseIds: [], goldenCameraIds: [] },
      provenance: { creatorId: "toonstudio-assets", sourceLicense: "CC0-1.0", commercialUse: true, redistribution: true, derivativeUse: true },
    }],
    exports: { supportedPasses: [], psdLayerMap: {} },
    quality: {
      reportFile: "quality-report.json", minimumScore: 94,
      acceptedAt: "2026-09-09T00:00:00.000Z", acceptedBy: "character-quality-gate",
      goldenPoseIds: ["standing"], goldenCameraIds: ["front"],
    },
    provenance: {
      creatorId: "toonstudio", sourceLicense: "CC0-1.0", commercialUse: true,
      redistribution: true,
      contentSha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    },
  });
}

describe("계획 생성의 포즈 연동", () => {
  it("poseFlexion이 없으면 계획 형태가 종전과 같다(기여 필드 없음)", () => {
    const manifest = fixture();
    const plan = createCharacterCanonicalPartPlan({ manifest, part: manifest.parts![0]!, projectedHeightPx: 300 });
    expect(plan.correctiveMorphs).toEqual({ "shoulder-left-clearance": 0.1 });
    expect("poseCorrectiveContributions" in plan).toBe(false);
  });

  it("poseFlexion을 넘기면 교정 모프가 합성되고 기여 영수증이 붙는다", () => {
    const manifest = fixture();
    const plan = createCharacterCanonicalPartPlan({
      manifest, part: manifest.parts![0]!, projectedHeightPx: 300,
      poseFlexion: { leftShoulder: 120, leftHip: 120 },
    });
    expect(plan.correctiveMorphs["shoulder-left-clearance"]).toBeCloseTo(0.75, 6);
    expect(plan.correctiveMorphs["hip-left-clearance"]).toBeCloseTo(0.6, 6);
    expect(plan.poseCorrectiveContributions?.map((entry) => entry.ruleId)).toEqual([
      "shoulder-left-clearance", "hip-left-clearance",
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
  });
});
