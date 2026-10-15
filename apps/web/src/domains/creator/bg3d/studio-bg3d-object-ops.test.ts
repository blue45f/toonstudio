import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyStudioBg3dSnapToTransform,
  centerAndGroundWorldBoundsPosition,
  filterStudioBg3dLayerItems,
  groundModelTransform,
  groundPrimitiveTransform,
  isBgObjectLocked,
  isBgObjectTransformBlocked,
  isBgObjectVisible,
  localHalfExtentsForPrimitiveKind,
  normalizeStudioBg3dObjectFlags,
  normalizeStudioBg3dSnapSettings,
  rotateVectorEulerXyz,
  snapEulerRadians,
  snapScalar,
  snapVec3,
  studioBg3dSnapSettingsSummary,
  worldAabbHalfExtents,
} from "./studio-bg3d-object-ops";

describe("studio-bg3d-object-ops", () => {
  it("snaps scalars and vectors to step grids", () => {
    expect(snapScalar(0.24, 0.25)).toBeCloseTo(0.25);
    expect(snapScalar(0.12, 0)).toBe(0.12);
    expect(snapVec3([0.24, 0.51, -0.49], 0.25)).toEqual([0.25, 0.5, -0.5]);
    expect(snapVec3([0.24, 0.51, -0.49], 0.25, "xz")).toEqual([0.25, 0.51, -0.5]);
  });

  it("snaps euler rotations by degree steps", () => {
    const step15 = (15 * Math.PI) / 180;
    const result = snapEulerRadians([step15 * 0.4, step15 * 1.6, 0], 15);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(step15 * 2);
  });

  it("grounds an unrotated unit box on y=0", () => {
    const position = groundPrimitiveTransform(
      "box",
      [1, 3, -2],
      [0, 0, 0],
      [1, 1, 1]
    );
    expect(position[0]).toBe(1);
    expect(position[1]).toBeCloseTo(0.5);
    expect(position[2]).toBe(-2);
  });

  it("grounds a tall scaled box higher", () => {
    const position = groundPrimitiveTransform("box", [0, 0, 0], [0, 0, 0], [1, 4, 1]);
    expect(position[1]).toBeCloseTo(2);
  });

  it("grounds custom models from full bounding size", () => {
    const position = groundModelTransform([2, 4, 2], [0, 10, 0], [0, 0, 0], [1, 1, 1]);
    expect(position[1]).toBeCloseTo(2);
  });

  it("centers off-pivot geometry on XZ origin and grounds its lowest point", () => {
    const worldPosition: [number, number, number] = [10, 1, 20];
    const bounds = {
      min: [8, -3, 18] as const,
      max: [12, 5, 22] as const,
    };

    const position = centerAndGroundWorldBoundsPosition(worldPosition, bounds);

    expect(position).toEqual([0, 4, 0]);
    expect(worldPosition).toEqual([10, 1, 20]);
    expect(bounds).toEqual({ min: [8, -3, 18], max: [12, 5, 22] });
  });

  it("supports a custom world target and is idempotent once aligned", () => {
    expect(centerAndGroundWorldBoundsPosition(
      [100, 2, -50],
      { min: [99, 1, -55], max: [103, 9, -45] },
      [2, 3, -4]
    )).toEqual([1, 4, -4]);

    expect(centerAndGroundWorldBoundsPosition(
      [7, 2, -3],
      { min: [-2, 0, -4], max: [2, 8, 4] }
    )).toEqual([7, 2, -3]);
  });

  it("rejects non-finite or inverted measured bounds", () => {
    expect(centerAndGroundWorldBoundsPosition(
      [0, 0, 0],
      { min: [2, 0, 0], max: [1, 1, 1] }
    )).toBeNull();
    expect(centerAndGroundWorldBoundsPosition(
      [0, 0, 0],
      { min: [0, 0, 0], max: [Number.POSITIVE_INFINITY, 1, 1] }
    )).toBeNull();
  });

  it("world AABB half extents grow under 45° yaw for a square footprint", () => {
    const upright = worldAabbHalfExtents([1, 1, 1], [0, 0, 0], [1, 1, 1]);
    const yaw45 = worldAabbHalfExtents([1, 1, 1], [0, Math.PI / 4, 0], [1, 1, 1]);
    expect(yaw45[0]).toBeGreaterThan(upright[0]);
    expect(yaw45[2]).toBeGreaterThan(upright[2]);
  });

  it("normalizes flags and transform blocks", () => {
    expect(normalizeStudioBg3dObjectFlags({})).toEqual({ visible: true, locked: false });
    expect(normalizeStudioBg3dObjectFlags({ visible: false, locked: true })).toEqual({
      visible: false,
      locked: true,
    });
    expect(isBgObjectVisible({ visible: false })).toBe(false);
    expect(isBgObjectLocked({ locked: true })).toBe(true);
    expect(isBgObjectTransformBlocked({ locked: true })).toBe(true);
    expect(isBgObjectTransformBlocked({ visible: false })).toBe(false);
  });

  it("filters layer list by query", () => {
    const items = [
      { id: "a", label: "상자 1", kind: "primitive" as const, visible: true, locked: false },
      { id: "b", label: "학교 책상", kind: "model" as const, visible: true, locked: true },
    ];
    expect(filterStudioBg3dLayerItems(items, "책상").map((x) => x.id)).toEqual(["b"]);
    expect(filterStudioBg3dLayerItems(items, "").length).toBe(2);
  });

  it("summarizes snap settings", () => {
    expect(studioBg3dSnapSettingsSummary({ ...normalizeStudioBg3dSnapSettings({}), enabled: false })).toBe(
      "스냅 끔"
    );
    expect(
      studioBg3dSnapSettingsSummary({
        enabled: true,
        translateStep: 0.25,
        rotateStepDegrees: 15,
        translateAxes: "xz",
      })
    ).toContain("XZ");
  });

  it("applies combined transform snap only when enabled", () => {
    const off = applyStudioBg3dSnapToTransform(
      { position: [0.24, 0.5, 0.26], rotation: [0.1, 0.2, 0.3] },
      normalizeStudioBg3dSnapSettings({ enabled: false })
    );
    expect(off.position[0]).toBeCloseTo(0.24);
    const on = applyStudioBg3dSnapToTransform(
      { position: [0.24, 0.5, 0.26], rotation: [0, 0, 0] },
      {
        enabled: true,
        translateStep: 0.25,
        rotateStepDegrees: 15,
        translateAxes: "xyz",
      }
    );
    expect(on.position[0]).toBeCloseTo(0.25);
    expect(on.position[2]).toBeCloseTo(0.25);
  });

  it("exposes half extents for every known primitive kind", () => {
    const kinds = [
      "box",
      "cylinder",
      "plane",
      "sphere",
      "hemisphere",
      "cone",
      "pyramid",
      "triangularPrism",
      "hexPrism",
      "torus",
      "tube",
      "ring",
      "capsule",
    ] as const;
    for (const kind of kinds) {
      const half = localHalfExtentsForPrimitiveKind(kind);
      expect(half.every((n) => n > 0)).toBe(true);
    }
  });
});

// ── Euler XYZ(Three.js 기본) 회전 순서 ─────────────────────────────────────
// Three.js 의 XYZ Euler 는 R = Rx·Ry·Rz 이므로 벡터에는 Z → Y → X 순서로 적용된다.
// 한 축만 도는 경우(요 전용 등)에는 어떤 순서든 결과가 같아서 예전 테스트가 이를 잡지 못했다.
// 아래 기준값은 모두 Three.js 자체 계산으로 만든다.
type Triple = readonly [number, number, number];

const MULTI_AXIS_ROTATIONS: readonly Triple[] = [
  [0.1, 0.2, 0.3],
  [0.4, -0.7, 0.9],
  [Math.PI / 6, Math.PI / 4, Math.PI / 3],
  [-1.2, 0.5, 2.4],
  [1.5, 1.1, -0.8],
  [0.6, 0, 0.6],
  [0, 0.8, 0.5],
  [2.9, -2.1, 1.7],
];

const SAMPLE_VECTORS: readonly Triple[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0.5, -1.25, 2],
  [-3, 0.4, 0.7],
];

function threeRotate(vector: Triple, rotation: Triple): Triple {
  const out = new THREE.Vector3(vector[0], vector[1], vector[2]).applyEuler(
    new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"),
  );
  return [out.x, out.y, out.z];
}

/** 예전 구현: 벡터에 X → Y → Z 순서로 적용(= Euler ZYX). 회귀 확인용으로만 쓴다. */
function legacySequentialXyzRotate(vector: Triple, rotation: Triple): Triple {
  let [x, y, z] = vector;
  const [rx, ry, rz] = rotation;
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return [x, y, z];
}

function threeWorldHalfExtents(local: Triple, rotation: Triple, scale: Triple): Triple {
  const half: Triple = [
    Math.abs(local[0] * scale[0]),
    Math.abs(local[1] * scale[1]),
    Math.abs(local[2] * scale[2]),
  ];
  const max = [0, 0, 0];
  for (const ox of [-1, 1]) {
    for (const oy of [-1, 1]) {
      for (const oz of [-1, 1]) {
        const world = threeRotate([half[0] * ox, half[1] * oy, half[2] * oz], rotation);
        for (let axis = 0; axis < 3; axis += 1) max[axis] = Math.max(max[axis], Math.abs(world[axis]));
      }
    }
  }
  return [max[0], max[1], max[2]];
}

describe("studio-bg3d-object-ops — Three.js XYZ Euler 회전 순서", () => {
  it("rotateVectorEulerXyz 는 Three.js applyEuler(XYZ) 와 모든 다축 회전에서 일치한다", () => {
    for (const rotation of MULTI_AXIS_ROTATIONS) {
      for (const vector of SAMPLE_VECTORS) {
        const actual = rotateVectorEulerXyz(vector, rotation);
        const expected = threeRotate(vector, rotation);
        expect(actual[0]).toBeCloseTo(expected[0], 10);
        expect(actual[1]).toBeCloseTo(expected[1], 10);
        expect(actual[2]).toBeCloseTo(expected[2], 10);
      }
    }
  });

  it("예전 X→Y→Z 합성은 다축에서 Three.js 와 달랐다 — 이 테스트 데이터가 순서를 구분한다", () => {
    const rotation: Triple = [0.1, 0.2, 0.3];
    const vector: Triple = [1, 2, 3];
    const legacy = legacySequentialXyzRotate(vector, rotation);
    const expected = threeRotate(vector, rotation);
    const distance = Math.hypot(legacy[0] - expected[0], legacy[1] - expected[1], legacy[2] - expected[2]);
    expect(distance).toBeGreaterThan(0.1);
  });

  it("한 축 회전은 순서와 무관하게 같은 결과를 낸다", () => {
    for (const rotation of [[0.7, 0, 0], [0, -1.1, 0], [0, 0, 2.3]] as const) {
      for (const vector of SAMPLE_VECTORS) {
        const actual = rotateVectorEulerXyz(vector, rotation);
        const expected = threeRotate(vector, rotation);
        expect(actual[0]).toBeCloseTo(expected[0], 10);
        expect(actual[1]).toBeCloseTo(expected[1], 10);
        expect(actual[2]).toBeCloseTo(expected[2], 10);
      }
    }
  });

  it("유한하지 않은 회전·벡터 성분은 0 으로 취급한다", () => {
    expect(rotateVectorEulerXyz([1, 2, 3], [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]))
      .toEqual([1, 2, 3]);
    const result = rotateVectorEulerXyz([Number.NaN, 2, Number.POSITIVE_INFINITY], [0, 0, 0]);
    expect(result).toEqual([0, 2, 0]);
  });

  it("worldAabbHalfExtents 는 다축 회전·비균일 스케일에서도 Three.js 계산과 같다", () => {
    const local: Triple = [0.5, 1.5, 0.75];
    const scale: Triple = [1.2, 0.8, 2.5];
    for (const rotation of MULTI_AXIS_ROTATIONS) {
      const actual = worldAabbHalfExtents(local, rotation, scale);
      const expected = threeWorldHalfExtents(local, rotation, scale);
      expect(actual[0]).toBeCloseTo(expected[0], 10);
      expect(actual[1]).toBeCloseTo(expected[1], 10);
      expect(actual[2]).toBeCloseTo(expected[2], 10);
    }
  });

  it("다축 회전한 도형을 접지하면 가장 낮은 모서리가 정확히 y=0 에 닿는다", () => {
    const scale: Triple = [1.4, 0.6, 2.2];
    for (const rotation of MULTI_AXIS_ROTATIONS) {
      const position = groundPrimitiveTransform("box", [3, 10, -2], rotation, scale);
      const half = localHalfExtentsForPrimitiveKind("box");
      let lowest = Number.POSITIVE_INFINITY;
      for (const ox of [-1, 1]) {
        for (const oy of [-1, 1]) {
          for (const oz of [-1, 1]) {
            const corner = threeRotate(
              [half[0] * scale[0] * ox, half[1] * scale[1] * oy, half[2] * scale[2] * oz],
              rotation,
            );
            lowest = Math.min(lowest, position[1] + corner[1]);
          }
        }
      }
      expect(lowest).toBeCloseTo(0, 9);
      expect(position[0]).toBe(3);
      expect(position[2]).toBe(-2);
    }
  });
});
