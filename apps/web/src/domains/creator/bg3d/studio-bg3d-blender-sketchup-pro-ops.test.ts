import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyBooleanMeshOperation,
  applyMicroBevelChamfer,
  applySymmetricMirrorGeometry,
  buildComponentArrayTransforms,
  extrudeFaceAlongNormal,
  inspectGeometryTopologyAndManifold,
  instantiateComponentArrayMesh,
  sliceGeometryWithSectionPlane,
  subdivideGeometrySmooth,
  sweepProfileAlongPath,
} from "./studio-bg3d-blender-sketchup-pro-ops";
import { groundBufferGeometryToY0 } from "./studio-bg3d-geometry-manifold-utils";

function makeGroundedBox(w = 1, h = 2, d = 1): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  groundBufferGeometryToY0(geo);
  return geo;
}

describe("studio-bg3d-blender-sketchup-pro-ops (Blender + SketchUp 고급 3D 모델링 8종)", () => {
  it("1. SketchUp Push/Pull: extrudes outward and recesses inward pocket as watertight 2-manifold solids", () => {
    const base = makeGroundedBox(1, 2, 1);
    const pulled = extrudeFaceAlongNormal(base, [0, 1, 0], 0.6);
    const pushed = extrudeFaceAlongNormal(base, [0, 1, 0], -0.25, { insetRatio: 0.22 });

    try {
      expect(pulled.manifold.isWatertightSolid).toBe(true);
      expect(pulled.manifold.nonManifoldEdgeCount).toBe(0);
      expect(pulled.manifold.boundaryEdgeCount).toBe(0);
      expect(pulled.manifold.degenerateTriangleCount).toBe(0);
      expect(pulled.manifold.isGroundedAtY0).toBe(true);
      expect(pulled.manifold.sizeMeters[1]).toBeCloseTo(2.6, 3);
      expect(pulled.manifold.triangleCount).toBeGreaterThan(12);

      expect(pushed.manifold.isWatertightSolid).toBe(true);
      expect(pushed.manifold.nonManifoldEdgeCount).toBe(0);
      expect(pushed.manifold.boundaryEdgeCount).toBe(0);
      expect(pushed.manifold.degenerateTriangleCount).toBe(0);
      expect(pushed.manifold.signedVolumeCubicMeters).toBeLessThan(2.0);
    } finally {
      base.dispose();
      pulled.dispose();
      pushed.dispose();
    }
  });

  it("2. SketchUp Follow-Me: sweeps 2D profile along open capped and closed 3D paths cleanly", () => {
    const profile: readonly (readonly [number, number])[] = [
      [-0.08, -0.05],
      [0.08, -0.05],
      [0.08, 0.05],
      [-0.08, 0.05],
    ];
    const openPath: readonly (readonly [number, number, number])[] = [
      [0, 0, 0],
      [1.2, 0, 0],
      [1.2, 0, -1.2],
      [1.2, 0.8, -1.2],
    ];
    const closedLoopPath: readonly (readonly [number, number, number])[] = [
      [-0.8, 0, -0.8],
      [0.8, 0, -0.8],
      [0.8, 0, 0.8],
      [-0.8, 0, 0.8],
    ];

    const openSweep = sweepProfileAlongPath(profile, openPath, { closedPath: false, groundAtY0: true });
    const closedSweep = sweepProfileAlongPath(profile, closedLoopPath, { closedPath: true, groundAtY0: true });

    try {
      expect(openSweep.manifold.isWatertightSolid).toBe(true);
      expect(openSweep.manifold.nonManifoldEdgeCount).toBe(0);
      expect(openSweep.manifold.boundaryEdgeCount).toBe(0);
      expect(openSweep.manifold.degenerateTriangleCount).toBe(0);
      expect(openSweep.manifold.isGroundedAtY0).toBe(true);

      expect(closedSweep.manifold.isWatertightSolid).toBe(true);
      expect(closedSweep.manifold.nonManifoldEdgeCount).toBe(0);
      expect(closedSweep.manifold.boundaryEdgeCount).toBe(0);
      expect(closedSweep.manifold.isGroundedAtY0).toBe(true);
    } finally {
      openSweep.dispose();
      closedSweep.dispose();
    }
  });

  it("3. SketchUp Section Plane: slices solid and seals cut cross-section with a watertight cap", () => {
    const base = makeGroundedBox(1.2, 2.0, 1.0);
    // y <= 1.0 보존 => dot([0, 1, 0], p) - 1.0 <= 0
    const sliced = sliceGeometryWithSectionPlane(
      base,
      { normal: [0, 1, 0], constant: -1.0 },
      { generateCap: true, groundAtY0: true },
    );

    try {
      expect(sliced.clippedTriangleCount).toBeGreaterThan(0);
      expect(sliced.capLoopCount).toBe(1);
      expect(sliced.capAreaSqMeters).toBeCloseTo(1.2, 2);
      expect(sliced.manifold.sizeMeters[1]).toBeCloseTo(1.0, 3);
      expect(sliced.manifold.isWatertightSolid).toBe(true);
      expect(sliced.manifold.nonManifoldEdgeCount).toBe(0);
      expect(sliced.manifold.boundaryEdgeCount).toBe(0);
      expect(sliced.manifold.degenerateTriangleCount).toBe(0);
      expect(sliced.manifold.isGroundedAtY0).toBe(true);
    } finally {
      base.dispose();
      sliced.dispose();
    }
  });

  it("4. SketchUp Component Array: builds linear (*N / /N) & radial matrices and disposes InstancedMesh", () => {
    const linearStep = buildComponentArrayTransforms({
      mode: "linear",
      count: 4,
      offsetM: [1.5, 0, 0],
      distribution: "step",
    });
    expect(linearStep.count).toBe(4);
    expect(linearStep.transforms[3]!.positionM).toEqual([4.5, 0, 0]);

    const linearDivide = buildComponentArrayTransforms({
      mode: "linear",
      count: 5,
      offsetM: [4.0, 0, 0],
      distribution: "divide",
    });
    expect(linearDivide.transforms[4]!.positionM).toEqual([4, 0, 0]);
    expect(linearDivide.transforms[2]!.positionM).toEqual([2, 0, 0]);

    const radial = buildComponentArrayTransforms({
      mode: "radial",
      count: 6,
      centerM: [0, 0, 0],
      axis: "y",
      radiusM: 2.0,
      totalAngleDeg: 360,
      alignTangent: true,
    });
    expect(radial.count).toBe(6);
    expect(radial.transforms[0]!.positionM).toEqual([2, 0, 0]);
    expect(radial.transforms[3]!.positionM[0]).toBeCloseTo(-2, 3);

    const base = makeGroundedBox(0.3, 1.0, 0.3);
    const mat = new THREE.MeshStandardMaterial();
    const inst = instantiateComponentArrayMesh(base, mat, radial);
    try {
      expect(inst.mesh.count).toBe(6);
    } finally {
      base.dispose();
      const disposed = inst.dispose();
      expect(disposed.disposedGeometries).toBe(1);
      expect(disposed.disposedMaterials).toBe(1);
    }
  });

  it("5. Blender Micro-Bevel: chamfers 1-segment and rounds 2-segment edges as watertight 2-manifold solids", () => {
    const base = makeGroundedBox(1.0, 1.5, 1.0);
    const chamfer1 = applyMicroBevelChamfer(base, 0.06, 1);
    const round2 = applyMicroBevelChamfer(base, 0.06, 2);

    try {
      expect(chamfer1.manifold.isWatertightSolid).toBe(true);
      expect(chamfer1.manifold.nonManifoldEdgeCount).toBe(0);
      expect(chamfer1.manifold.boundaryEdgeCount).toBe(0);
      expect(chamfer1.manifold.degenerateTriangleCount).toBe(0);
      expect(chamfer1.manifold.isGroundedAtY0).toBe(true);
      expect(chamfer1.manifold.triangleCount).toBeGreaterThan(12);
      expect(chamfer1.manifold.signedVolumeCubicMeters).toBeLessThan(1.5);

      expect(round2.manifold.isWatertightSolid).toBe(true);
      expect(round2.manifold.nonManifoldEdgeCount).toBe(0);
      expect(round2.manifold.boundaryEdgeCount).toBe(0);
      expect(round2.manifold.degenerateTriangleCount).toBe(0);
      expect(round2.manifold.triangleCount).toBeGreaterThan(chamfer1.manifold.triangleCount);
    } finally {
      base.dispose();
      chamfer1.dispose();
      round2.dispose();
    }
  });

  it("6. Blender Symmetric Mirror: clips & welds across axis plane with inverted winding and manifold integrity", () => {
    const halfMesh = makeGroundedBox(0.8, 1.4, 0.6);
    halfMesh.translate(0.25, 0, 0); // X=[-0.15, +0.65] -> X=0 클리핑 후 대칭 미러 => X=[-0.65, +0.65]
    const mirrored = applySymmetricMirrorGeometry(halfMesh, "x", { pivot: 0, clipAcrossPlane: true, groundAtY0: true });

    try {
      expect(mirrored.manifold.isWatertightSolid).toBe(true);
      expect(mirrored.manifold.nonManifoldEdgeCount).toBe(0);
      expect(mirrored.manifold.boundaryEdgeCount).toBe(0);
      expect(mirrored.manifold.degenerateTriangleCount).toBe(0);
      expect(mirrored.manifold.isGroundedAtY0).toBe(true);
      expect(mirrored.manifold.boundsMin[0]).toBeCloseTo(-0.65, 2);
      expect(mirrored.manifold.boundsMax[0]).toBeCloseTo(0.65, 2);
    } finally {
      halfMesh.dispose();
      mirrored.dispose();
    }
  });

  it("7. Blender Smooth Subdivision: supports both Loop (4x tris/pass) and Catmull-Clark with watertight output", () => {
    const base = makeGroundedBox(1.0, 1.0, 1.0);
    const loop1 = subdivideGeometrySmooth(base, 1, "loop");
    const loop2 = subdivideGeometrySmooth(base, 2, "loop");
    const cc1 = subdivideGeometrySmooth(base, 1, "catmull-clark");

    try {
      expect(loop1.manifold.triangleCount).toBe(48);
      expect(loop1.manifold.isWatertightSolid).toBe(true);
      expect(loop1.manifold.nonManifoldEdgeCount).toBe(0);
      expect(loop1.manifold.isGroundedAtY0).toBe(true);

      expect(loop2.manifold.triangleCount).toBe(192);
      expect(loop2.manifold.isWatertightSolid).toBe(true);
      expect(loop2.manifold.nonManifoldEdgeCount).toBe(0);

      expect(cc1.manifold.triangleCount).toBe(72);
      expect(cc1.manifold.isWatertightSolid).toBe(true);
      expect(cc1.manifold.nonManifoldEdgeCount).toBe(0);
      expect(cc1.manifold.isGroundedAtY0).toBe(true);
    } finally {
      base.dispose();
      loop1.dispose();
      loop2.dispose();
      cc1.dispose();
    }
  });

  it("8. CSG Voxel Boolean (subtract / union / intersect) & real-time manifold topology inspector", () => {
    const target = makeGroundedBox(1.2, 1.2, 1.2);
    const cutter = makeGroundedBox(0.7, 0.7, 1.6);
    cutter.translate(0.25, 0.25, 0);

    const sub = applyBooleanMeshOperation(target, cutter, "subtract", { resolution: 12, groundAtY0: true });
    const uni = applyBooleanMeshOperation(target, cutter, "union", { resolution: 12, groundAtY0: true });
    const inter = applyBooleanMeshOperation(target, cutter, "intersect", { resolution: 12, groundAtY0: true });
    const openPlane = new THREE.PlaneGeometry(1, 1);

    try {
      for (const res of [sub, uni, inter]) {
        expect(res.manifold.isWatertightSolid).toBe(true);
        expect(res.manifold.nonManifoldEdgeCount).toBe(0);
        expect(res.manifold.boundaryEdgeCount).toBe(0);
        expect(res.manifold.degenerateTriangleCount).toBe(0);
        expect(res.manifold.isGroundedAtY0).toBe(true);
      }

      // 볼륨 정합성 검증: intersect < subtract < union
      expect(inter.manifold.signedVolumeCubicMeters).toBeGreaterThan(0.1);
      expect(sub.manifold.signedVolumeCubicMeters).toBeLessThan(uni.manifold.signedVolumeCubicMeters);
      expect(sub.manifold.signedVolumeCubicMeters).toBeLessThan(1.728);
      expect(uni.manifold.signedVolumeCubicMeters).toBeGreaterThan(1.5);

      const cleanInspection = inspectGeometryTopologyAndManifold(sub.geometry);
      expect(cleanInspection.issuesKo).toHaveLength(0);
      expect(cleanInspection.statusKo).toContain("매니폴드 정상");

      const openInspection = inspectGeometryTopologyAndManifold(openPlane);
      expect(openInspection.issuesKo.length).toBeGreaterThan(0);
    } finally {
      target.dispose();
      cutter.dispose();
      sub.dispose();
      uni.dispose();
      inter.dispose();
      openPlane.dispose();
    }
  });
});
