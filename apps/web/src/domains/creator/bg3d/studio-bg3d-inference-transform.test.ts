import { describe, expect, it } from "vitest";

import { createStudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import { buildStudioBg3dInferenceSourceSet } from "./studio-bg3d-inference-sources";
import {
  STUDIO_BG3D_INFERENCE_TRANSFORM_BUDGET,
  STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_SNAP_BASES,
  closestPointOnStudioBg3dInferenceVolume,
  planStudioBg3dInferenceTransformSnap,
} from "./studio-bg3d-inference-transform";

import type { StudioBg3dInferenceSceneEntity } from "./studio-bg3d-inference-sources";
import type { StudioBg3dInferenceTransformSnapInput } from "./studio-bg3d-inference-transform";

type Vec = readonly [number, number, number];

const WPP = 1 / 64;

function box(id: string, position: Vec, scale = 1, rotation: Vec = [0, 0, 0]): StudioBg3dInferenceSceneEntity {
  return { id, kind: "box", position, rotation, scale: [scale, scale, scale] };
}

function indexOf(entities: StudioBg3dInferenceSceneEntity[]) {
  return createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities }));
}

function input(overrides: Partial<StudioBg3dInferenceTransformSnapInput> & Pick<StudioBg3dInferenceTransformSnapInput, "index">): StudioBg3dInferenceTransformSnapInput {
  return {
    startWorldPosition: [0, 0.5, 0],
    proposedWorldPosition: [0, 0.5, 0],
    snapBases: [[0, 0, 0]],
    orientation: { space: "global" },
    constraint: { kind: "free" },
    snap: { enabled: true, modes: ["vertex", "surface"] },
    worldPerPixel: WPP,
    ...overrides,
  };
}

function near(actual: readonly number[], expected: readonly number[], digits = 6) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i] ?? Number.NaN, digits));
}

function expectOk(outcome: ReturnType<typeof planStudioBg3dInferenceTransformSnap>) {
  if (!outcome.ok) throw new Error(`${outcome.reason}: ${outcome.message}`);
  return outcome;
}

describe("상자 표면 최근접점", () => {
  const index = indexOf([box("B", [0, 1, 0], 2)]);
  const volume = index.source.volumes[0];
  if (!volume) throw new Error("volume 없음");

  it("바깥 점은 가장 가까운 면 위의 점과 바깥 법선을 돌려준다", () => {
    const top = closestPointOnStudioBg3dInferenceVolume(volume, [0.3, 3.4, -0.2]);
    expect(top).not.toBeNull();
    if (top) {
      near(top.point, [0.3, 2, -0.2]);
      near(top.normal, [0, 1, 0]);
    }
    const side = closestPointOnStudioBg3dInferenceVolume(volume, [-5, 1, 0.5]);
    if (side) {
      near(side.point, [-1, 1, 0.5]);
      near(side.normal, [-1, 0, 0]);
    }
  });

  it("모서리 바깥은 모서리 위의 점으로, 가장 많이 벗어난 면의 법선을 쓴다", () => {
    const corner = closestPointOnStudioBg3dInferenceVolume(volume, [1.5, 2.1, 1.2]);
    expect(corner).not.toBeNull();
    if (corner) {
      near(corner.point, [1, 2, 1]);
      near(corner.normal, [1, 0, 0]);
    }
  });

  it("안쪽 점은 가장 가까운 면으로 밀어내고 그 면의 바깥 법선을 쓴다", () => {
    const inside = closestPointOnStudioBg3dInferenceVolume(volume, [0.1, 1.9, 0]);
    expect(inside).not.toBeNull();
    if (inside) {
      near(inside.point, [0.1, 2, 0]);
      near(inside.normal, [0, 1, 0]);
    }
  });

  it("회전한 상자에서도 면 법선이 월드 방향으로 맞는다", () => {
    const rotated = indexOf([box("R", [0, 0, 0], 2, [0, Math.PI / 4, 0])]).source.volumes[0];
    if (!rotated) throw new Error("volume 없음");
    const hit = closestPointOnStudioBg3dInferenceVolume(rotated, [3, 0, 0]);
    expect(hit).not.toBeNull();
    if (hit) {
      near(hit.normal, [Math.SQRT1_2, 0, -Math.SQRT1_2]);
      expect(hit.point[0]).toBeGreaterThan(0.9);
    }
  });

  it("평면 조각과 역행렬이 없는 볼륨은 null이다", () => {
    const plane = buildStudioBg3dInferenceSourceSet({
      entities: [{ id: "P", kind: "plane", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
    }).volumes[0];
    if (!plane) throw new Error("volume 없음");
    expect(closestPointOnStudioBg3dInferenceVolume(plane, [0, 1, 0])).toBeNull();
  });
});

describe("변형 스냅 합류", () => {
  const target = indexOf([box("T", [4, 0.5, 0])]);

  it("끌고 있는 기준점이 근처 꼭짓점 12px 안이면 그 꼭짓점에 붙고 마커용 요약을 돌려준다", () => {
    // 기준점 (0,0,0)을 (3.45,0,0)까지 끌면 T의 바닥 모서리 (3.5,0,±0.5) 근처다.
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      startWorldPosition: [0, 0, 0],
      proposedWorldPosition: [3.45, 0, 0.45],
      snapBases: [[0, 0, 0]],
    })));
    expect(outcome.geometrySnapped).toBe(true);
    expect(outcome.plan.snap.kind).toBe("vertex");
    near(outcome.plan.positionWorld, [3.5, 0, 0.5]);
    expect(outcome.inference?.kind).toBe("endpoint");
    expect(outcome.inference?.label).toBe("끝점");
    expect(outcome.inference?.detail).toBe("상자 · 꼭짓점");
    near(outcome.inference?.point ?? [], [3.5, 0, 0.5]);
  });

  it("활성 반경(12px) 밖이면 기하 스냅 없이 제안 위치를 그대로 쓴다", () => {
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      startWorldPosition: [0, 0, 0],
      proposedWorldPosition: [3.1, 0, 0],
      snapBases: [[0, 0, 0]],
    })));
    expect(outcome.geometrySnapped).toBe(false);
    expect(outcome.inference).toBeNull();
    near(outcome.plan.positionWorld, [3.1, 0, 0]);
  });

  it("여러 기준점 중 가장 가까이 맞는 기준점이 이긴다", () => {
    const bases: Vec[] = [[-0.5, 0, 0], [0.5, 0, 0], [0, 0, 0.5]];
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      startWorldPosition: [0, 0, 0],
      proposedWorldPosition: [3.02, 0, 0.02],
      snapBases: bases,
    })));
    expect(outcome.geometrySnapped).toBe(true);
    // 두 번째 기준점 (0.5,0,0)이 (3.52,0,0.02)로 가며 꼭짓점 (3.5,0,0.5)... 가 아니라 면/모서리 후보에 가장 가깝다.
    expect(outcome.baseIndex).toBeGreaterThanOrEqual(0);
    expect(outcome.stats.bases).toBe(3);
    expect(outcome.stats.candidatesPlanned).toBeGreaterThan(0);
  });

  it("축 제약이 있으면 결과가 제약된 축 위에만 있고 투영 여부를 알린다", () => {
    const pinned = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({
      entities: [],
      points: [{ id: "pin", point: [3.5, 0, 0.1], label: "핀", kind: "endpoint" }],
    }));
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: pinned,
      startWorldPosition: [0, 0, 0],
      proposedWorldPosition: [3.46, 0, 0],
      snapBases: [[0, 0, 0]],
      constraint: { kind: "axis", axis: "x" },
    })));
    expect(outcome.plan.constraint).toEqual({ kind: "axis", axis: "x" });
    // y, z 성분은 변하지 않고 x만 후보 쪽으로 이동한다. 후보와 축 사이 0.1m는 투영 잔차다.
    near(outcome.plan.worldDelta.slice(1), [0, 0]);
    expect(outcome.plan.worldDelta[0]).toBeCloseTo(3.5, 6);
    expect(outcome.plan.snap.constraintResidualWorld).toBeCloseTo(0.1, 6);
    expect(outcome.inference?.projected).toBe(true);
    expect(outcome.inference?.detail).toBe("핀");
  });

  it("점 후보가 활성 반경 안에 있으면 더 가까운 면보다 점이 먼저다", () => {
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      startWorldPosition: [0, 0, 0],
      proposedWorldPosition: [3.45, 0, 0.45],
      snapBases: [[0, 0, 0]],
    })));
    // 같은 자리에서 면 후보(3.2px)가 꼭짓점(4.5px)보다 가깝지만 점이 이긴다.
    expect(outcome.plan.snap.kind).toBe("vertex");
    expect(outcome.inference?.kind).toBe("endpoint");
  });

  it("면 스냅: 기준점이 상자 윗면 근처에 오면 면 위로 올라탄다", () => {
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      startWorldPosition: [4, 3, 0],
      proposedWorldPosition: [4, 1.1, 0],
      snapBases: [[4, 2.95, 0]],
      constraint: { kind: "axis", axis: "y" },
      snap: { enabled: true, modes: ["surface"] },
    })));
    expect(outcome.geometrySnapped).toBe(true);
    expect(outcome.plan.snap.kind).toBe("surface");
    expect(outcome.inference?.kind).toBe("on-face");
    near(outcome.plan.positionWorld, [4, 1.05, 0], 2);
  });

  it("Alt(반전)로 스냅을 일시 해제하면 제안 위치를 그대로 쓴다", () => {
    const base = input({
      index: target,
      startWorldPosition: [0, 0, 0],
      proposedWorldPosition: [3.45, 0, 0.45],
      snapBases: [[0, 0, 0]],
    });
    expect(expectOk(planStudioBg3dInferenceTransformSnap(base)).geometrySnapped).toBe(true);
    const inverted = expectOk(planStudioBg3dInferenceTransformSnap({ ...base, modifiers: { invertSnapping: true } }));
    expect(inverted.geometrySnapped).toBe(false);
    near(inverted.plan.positionWorld, [3.45, 0, 0.45]);
    const disabled = expectOk(planStudioBg3dInferenceTransformSnap({ ...base, snap: { enabled: false, modes: ["vertex"] } }));
    expect(disabled.geometrySnapped).toBe(false);
  });

  it("기하 스냅을 억제해도 증분(격자) 스냅은 유지한다", () => {
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      startWorldPosition: [0, 0, 0],
      proposedWorldPosition: [3.45, 0, 0.45],
      snapBases: [[0, 0, 0]],
      snap: { enabled: true, modes: ["vertex", "increment"], increment: { mode: "relative", step: 0.25 } },
      modifiers: { suppressGeometrySnaps: true },
    })));
    expect(outcome.geometrySnapped).toBe(false);
    expect(outcome.plan.snap.kind).toBe("increment");
    near(outcome.plan.positionWorld, [3.5, 0, 0.5]);
  });

  it("끌고 있는 객체 자신(제외 ID)에게는 붙지 않는다", () => {
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      startWorldPosition: [0, 0, 0],
      proposedWorldPosition: [3.45, 0, 0.45],
      snapBases: [[0, 0, 0]],
      excludeSourceIds: new Set(["T"]),
    })));
    expect(outcome.geometrySnapped).toBe(false);
  });

  it("기준점이 상한(9)을 넘으면 앞쪽 9개만 평가하고 비용을 기준점 수에 비례로 묶는다", () => {
    const many: Vec[] = Array.from({ length: 30 }, (_, i) => [i * 0.1, 0, 0] as Vec);
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      snapBases: many,
      proposedWorldPosition: [1, 0.5, 0],
    })));
    expect(outcome.stats.bases).toBe(STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_SNAP_BASES);
    expect(outcome.stats.featuresScanned).toBeLessThanOrEqual(
      STUDIO_BG3D_INFERENCE_TRANSFORM_BUDGET.maxBases * STUDIO_BG3D_INFERENCE_TRANSFORM_BUDGET.maxFeaturesScannedPerBase,
    );
    expect(STUDIO_BG3D_INFERENCE_TRANSFORM_BUDGET.maxCandidatesPerBase).toBe(24);
  });

  it("기준점 목록이 비면 시작 위치를 기준점으로 쓴다", () => {
    const outcome = expectOk(planStudioBg3dInferenceTransformSnap(input({
      index: target,
      startWorldPosition: [3.5, 0, 0.5],
      proposedWorldPosition: [3.52, 0, 0.5],
      snapBases: [],
    })));
    expect(outcome.stats.bases).toBe(1);
    expect(outcome.geometrySnapped).toBe(true);
  });

  it("비정상 입력은 한국어 사유와 함께 실패한다", () => {
    const bad = planStudioBg3dInferenceTransformSnap(input({
      index: target,
      proposedWorldPosition: [Number.NaN, 0, 0],
    }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("invalid-input");
      expect(bad.message).toContain("스냅");
    }
    const noScale = planStudioBg3dInferenceTransformSnap(input({ index: target, worldPerPixel: 0 }));
    expect(noScale.ok).toBe(false);
    const orientation = planStudioBg3dInferenceTransformSnap(input({
      index: target,
      orientation: { space: "local", axes: { x: [2, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } },
    }));
    expect(orientation.ok).toBe(false);
    if (!orientation.ok) expect(orientation.reason).toBe("planner-rejected");
  });
});
