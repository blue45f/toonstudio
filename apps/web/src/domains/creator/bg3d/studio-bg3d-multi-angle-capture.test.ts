import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_MULTI_ANGLES,
  STUDIO_BG3D_MULTI_ANGLE_SETS,
  buildStudioBg3dMultiAngleCamera,
  captureStudioBg3dMultiAngleSet,
  getStudioBg3dMultiAngle,
  insertStudioBg3dMultiAngleCandidate,
  listStudioBg3dMultiAngleCandidates,
  planStudioBg3dMultiAngleCapture,
  studioBg3dMultiAngleShotId,
} from "./studio-bg3d-multi-angle-capture";
import {
  captureStudioBg3dShot,
  createDefaultStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

function baseDocument(): StudioBg3dSceneDocument {
  return createDefaultStudioBg3dSceneDocument();
}

describe("studio-bg3d-multi-angle-capture", () => {
  it("defines frozen angle sets whose angles all exist in the catalog", () => {
    expect(Object.isFrozen(STUDIO_BG3D_MULTI_ANGLE_SETS)).toBe(true);
    expect(Object.isFrozen(STUDIO_BG3D_MULTI_ANGLES)).toBe(true);
    expect(STUDIO_BG3D_MULTI_ANGLE_SETS.map((set) => set.id)).toEqual([
      "basic-4",
      "orbit-8",
      "drama-6",
    ]);
    for (const set of STUDIO_BG3D_MULTI_ANGLE_SETS) {
      expect(set.labelKo.length).toBeGreaterThan(0);
      expect(set.labelEn.length).toBeGreaterThan(0);
      expect(set.angleIds.length).toBeGreaterThanOrEqual(4);
      expect(new Set(set.angleIds).size).toBe(set.angleIds.length);
      for (const angleId of set.angleIds) {
        expect(getStudioBg3dMultiAngle(angleId)).not.toBeNull();
      }
    }
    // 기본 세트는 완료 기준의 정면·측면·하이·로우를 모두 포함한다.
    const basic = STUDIO_BG3D_MULTI_ANGLE_SETS[0]!;
    expect(basic.angleIds).toEqual(["front", "right", "high", "low"]);
  });

  it("keeps the front angle camera identical to the base camera position", () => {
    const document = baseDocument();
    const front = getStudioBg3dMultiAngle("front")!;
    const camera = buildStudioBg3dMultiAngleCamera(document.camera, front);
    expect(camera).not.toBeNull();
    // 구면 왕복+반올림(소수 3자리) 범위 안에서 원래 위치와 같아야 한다.
    for (let axis = 0; axis < 3; axis += 1) {
      expect(camera!.position[axis]).toBeCloseTo(document.camera.position[axis], 2);
    }
    expect(camera!.target).toEqual(document.camera.target);
    expect(camera!.fovDegrees).toBe(document.camera.fovDegrees);
  });

  it("rotates the side angle 90 degrees around the target at the same distance", () => {
    const document = baseDocument();
    const right = getStudioBg3dMultiAngle("right")!;
    const camera = buildStudioBg3dMultiAngleCamera(document.camera, right)!;
    const baseDistance = Math.hypot(
      document.camera.position[0] - document.camera.target[0],
      document.camera.position[1] - document.camera.target[1],
      document.camera.position[2] - document.camera.target[2],
    );
    const distance = Math.hypot(
      camera.position[0] - camera.target[0],
      camera.position[1] - camera.target[1],
      camera.position[2] - camera.target[2],
    );
    expect(distance).toBeCloseTo(baseDistance, 2);
    // 타깃 기준 상대 벡터가 방위 +90° 회전: (x, y, z) → (z, y, -x).
    const baseRel = [
      document.camera.position[0] - document.camera.target[0],
      document.camera.position[1] - document.camera.target[1],
      document.camera.position[2] - document.camera.target[2],
    ];
    const rel = [
      camera.position[0] - camera.target[0],
      camera.position[1] - camera.target[1],
      camera.position[2] - camera.target[2],
    ];
    expect(rel[0]).toBeCloseTo(baseRel[2], 2);
    expect(rel[1]).toBeCloseTo(baseRel[1], 2);
    expect(rel[2]).toBeCloseTo(-baseRel[0], 2);
  });

  it("plans a batch without mutating the document", () => {
    const document = baseDocument();
    const plan = planStudioBg3dMultiAngleCapture(document, "basic-4", "batch-a");
    expect(plan).not.toBeNull();
    expect(plan!.candidates).toHaveLength(4);
    expect(plan!.candidates.map((candidate) => candidate.shotId)).toEqual([
      "batch-a-front",
      "batch-a-right",
      "batch-a-high",
      "batch-a-low",
    ]);
    expect(document.shots ?? []).toHaveLength(0);
    const high = plan!.candidates.find((candidate) => candidate.angleId === "high")!;
    expect(high.elevationDeg).toBeCloseTo(55, 1);
    const low = plan!.candidates.find((candidate) => candidate.angleId === "low")!;
    expect(low.elevationDeg).toBeCloseTo(-22, 1);
  });

  it("captures the whole set as shots and restores the working camera", () => {
    const document = baseDocument();
    const result = captureStudioBg3dMultiAngleSet(document, "orbit-8", "orbit-a");
    expect(result).not.toBeNull();
    const next = result!.document;
    expect(next.shots).toHaveLength(8);
    expect(next.camera).toEqual(document.camera);
    expect(next.activeShotId).toBe(document.activeShotId);
    for (const candidate of result!.plan.candidates) {
      const shot = next.shots!.find((entry) => entry.id === candidate.shotId);
      expect(shot).toBeDefined();
      expect(shot!.name).toBe(candidate.name);
      expect(shot!.camera?.position).toEqual(candidate.camera.position);
    }
    // 원본 문서는 불변이다.
    expect(document.shots ?? []).toHaveLength(0);
  });

  it("fails closed on duplicate batches, unknown sets, and invalid batch ids", () => {
    const document = baseDocument();
    const first = captureStudioBg3dMultiAngleSet(document, "basic-4", "dup")!;
    expect(
      captureStudioBg3dMultiAngleSet(first.document, "basic-4", "dup"),
    ).toBeNull();
    expect(captureStudioBg3dMultiAngleSet(document, "nope", "x")).toBeNull();
    expect(captureStudioBg3dMultiAngleSet(document, "basic-4", "bad id!")).toBeNull();
    expect(captureStudioBg3dMultiAngleSet(null, "basic-4", "x")).toBeNull();
    expect(captureStudioBg3dMultiAngleSet({ broken: true }, "basic-4", "x")).toBeNull();
  });

  it("fails closed when the batch would exceed the 64-shot cap", () => {
    let document = baseDocument();
    for (let index = 0; index < 61; index += 1) {
      const next = captureStudioBg3dShot(document, {
        id: `seed-${index}`,
        name: `씨드 ${index}`,
      });
      expect(next).not.toBeNull();
      document = next!;
    }
    expect(document.shots).toHaveLength(61);
    // 61 + 4 = 65 > 64 이므로 전체가 거부되고 부분 캡처가 남지 않는다.
    expect(captureStudioBg3dMultiAngleSet(document, "basic-4", "over")).toBeNull();
    expect(document.shots).toHaveLength(61);
    // 60개에서 시작하면 60 + 4 = 64로 정확히 들어간다.
    let roomy = baseDocument();
    for (let index = 0; index < 60; index += 1) {
      roomy = captureStudioBg3dShot(roomy, {
        id: `seed-${index}`,
        name: `씨드 ${index}`,
      })!;
    }
    const fits = captureStudioBg3dMultiAngleSet(roomy, "basic-4", "fits");
    expect(fits).not.toBeNull();
    expect(fits!.document.shots).toHaveLength(64);
  });

  it("lists captured candidates back from the document for the grid", () => {
    const document = baseDocument();
    const result = captureStudioBg3dMultiAngleSet(document, "drama-6", "drama-a")!;
    const candidates = listStudioBg3dMultiAngleCandidates(result.document, "drama-a");
    expect(candidates.map((candidate) => candidate.angleId)).toEqual([
      "front",
      "high",
      "low",
      "top",
      "dutch-right",
      "dutch-left",
    ]);
    const top = candidates.find((candidate) => candidate.angleId === "top")!;
    expect(top.elevationDeg).toBeCloseTo(80, 1);
    const dutch = candidates.find((candidate) => candidate.angleId === "dutch-right")!;
    // 더치 후보의 up은 기본 up과 달라야 한다(기울어진 카메라).
    expect(dutch.camera.up).not.toEqual([0, 1, 0]);
    expect(listStudioBg3dMultiAngleCandidates(result.document, "other")).toHaveLength(0);
  });

  it("inserts a selected candidate by applying its shot", () => {
    const document = baseDocument();
    const result = captureStudioBg3dMultiAngleSet(document, "basic-4", "pick")!;
    const shotId = studioBg3dMultiAngleShotId("pick", "low");
    const applied = insertStudioBg3dMultiAngleCandidate(result.document, shotId);
    expect(applied).not.toBeNull();
    expect(applied!.activeShotId).toBe(shotId);
    const candidate = result.plan.candidates.find((entry) => entry.shotId === shotId)!;
    expect(applied!.camera.position).toEqual(candidate.camera.position);
    expect(
      insertStudioBg3dMultiAngleCandidate(result.document, "pick-missing"),
    ).toBeNull();
  });
});
