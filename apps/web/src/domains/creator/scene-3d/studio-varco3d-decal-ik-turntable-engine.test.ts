import { describe, expect, it } from "vitest";

import {
  buildVarco3dExpMapGraph,
  computeVarco3dTransparentCameraFit,
  evaluateVarco3dDecalNormalFalloff,
  evaluateVarco3dMultiViewFramePlan,
  evaluateVarco3dScanBandAndFadeEffect,
  projectVarco3dExpMapDecalTriangles,
  remapVarco3dDraftSkinAttributes,
  solveVarco3dTwoBoneIk,
  StudioVarco3dNodeMinHeap,
} from "./studio-varco3d-decal-ik-turntable-engine";

describe("studio-varco3d-decal-ik-turntable-engine", () => {
  it("orders node distances in ascending order via StudioVarco3dNodeMinHeap", () => {
    const heap = new StudioVarco3dNodeMinHeap();
    heap.push(10, 0.9);
    heap.push(20, 0.2);
    heap.push(30, 0.5);
    heap.push(40, 0.1);
    expect(heap.size).toBe(4);
    expect(heap.pop()).toEqual({ node: 40, dist: 0.1 });
    expect(heap.pop()).toEqual({ node: 20, dist: 0.2 });
    expect(heap.pop()).toEqual({ node: 30, dist: 0.5 });
    expect(heap.pop()).toEqual({ node: 10, dist: 0.9 });
    expect(heap.pop()).toBeNull();
  });

  it("builds CSR ExpMap graph and projects clipped geodesic decal UVs onto a curved quad", () => {
    // 2 triangles forming a 2x2 quad in XY plane at z=0
    const positions = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
       1,  1, 0,
      -1, -1, 0,
       1,  1, 0,
      -1,  1, 0,
    ]);
    const normals = new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]);
    const uvs = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 0,
      1, 1,
      0, 1,
    ]);

    const graph = buildVarco3dExpMapGraph({ positions, normals, uvs });
    expect(graph).not.toBeNull();
    expect(graph!.nodeCount).toBe(4);
    expect(graph!.triangleCount).toBe(2);

    const projected = projectVarco3dExpMapDecalTriangles({
      graph: graph!,
      hitTriangleIndex: 0,
      hitPoint: { x: 0, y: 0, z: 0 },
      projectorNormal: { x: 0, y: 0, z: 1 },
      projectorTangent: { x: 1, y: 0, z: 0 },
      decalSize: { width: 1, height: 1 },
    });

    expect(projected).not.toBeNull();
    expect(projected!.clippedVertexCount).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < projected!.decalUvs.length; i += 1) {
      expect(projected!.decalUvs[i]).toBeGreaterThanOrEqual(-1e-4);
      expect(projected!.decalUvs[i]).toBeLessThanOrEqual(1 + 1e-4);
    }
    expect(evaluateVarco3dDecalNormalFalloff(0.2)).toBe(1);
    expect(evaluateVarco3dDecalNormalFalloff(-0.5)).toBe(0);
    expect(evaluateVarco3dDecalNormalFalloff(-0.15)).toBeCloseTo(0.5, 5);
  });

  it("solves analytical two-bone IK and computes rest bend pole position", () => {
    const solved = solveVarco3dTwoBoneIk({
      rootPos: { x: 0, y: 1, z: 0 },
      midPos: { x: 0, y: 0.5, z: 0.1 },
      endPos: { x: 0, y: 0, z: 0 },
      targetPos: { x: 0, y: 0.4, z: 0 },
    });

    expect(solved.reachState).toBe("reachable");
    expect(solved.solvedDistance).toBeCloseTo(0.6, 3);
    expect(solved.desiredMidPosition.z).toBeGreaterThan(0.2);
    expect(solved.defaultPolePosition.z).toBeGreaterThan(0.5);
    expect(solved.controlScale).toBeGreaterThanOrEqual(0.06);

    const farSolved = solveVarco3dTwoBoneIk({
      rootPos: { x: 0, y: 1, z: 0 },
      midPos: { x: 0, y: 0.5, z: 0.1 },
      endPos: { x: 0, y: 0, z: 0 },
      targetPos: { x: 0, y: -3, z: 0 },
    });
    expect(farSolved.reachState).toBe("clamped-far");
    expect(farSolved.solvedDistance).toBeCloseTo(farSolved.maxReach, 4);
  });

  it("remaps and normalizes 4-influence skin weights when draft bones are merged", () => {
    // Vertex 0 has weights on bone 1 (0.4), bone 2 (0.4), bone 3 (0.2); bone 1 and 2 both map to bone 0
    const remapped = remapVarco3dDraftSkinAttributes({
      skinIndices: new Uint16Array([1, 2, 3, 0]),
      skinWeights: new Float32Array([0.4, 0.4, 0.2, 0]),
      boneIndexRemap: [0, 0, 0, 1],
    });

    expect(Array.from(remapped.remappedIndices)).toEqual([0, 1, 0, 0]);
    expect(remapped.remappedWeights[0]).toBeCloseTo(0.8, 5);
    expect(remapped.remappedWeights[1]).toBeCloseTo(0.2, 5);
    expect(remapped.remappedWeights[2]).toBe(0);
    expect(remapped.remappedWeights[3]).toBe(0);
  });

  it("computes transparent turntable camera fit, multiview lazy release, and scan-band glow", () => {
    const fit = computeVarco3dTransparentCameraFit({
      modelSize: { x: 1.2, y: 1.8, z: 1.0 },
      aspect: 16 / 9,
      modelScale: 1,
    });
    expect(fit.fitDistance).toBeGreaterThan(2);
    expect(fit.near).toBeCloseTo(fit.scaledDistance / 100, 6);
    expect(fit.far).toBeCloseTo(fit.scaledDistance * 100, 3);

    const framePlan = evaluateVarco3dMultiViewFramePlan({
      entries: [
        {
          id: "card-visible",
          visible: true,
          released: false,
          lastInvisibleMs: 0,
          cssWidth: 320,
          cssHeight: 240,
        },
        {
          id: "card-stale-hidden",
          visible: false,
          released: false,
          lastInvisibleMs: 1000,
          cssWidth: 320,
          cssHeight: 240,
        },
      ],
      nowMs: 35000,
      lastLazyCheckMs: 0,
      currentWebglCssWidth: 200,
      currentWebglCssHeight: 200,
      pixelRatio: 2,
    });

    expect(framePlan.shouldRunLazyCheck).toBe(true);
    expect(framePlan.toReleaseIds).toEqual(["card-stale-hidden"]);
    expect(framePlan.webglCssWidth).toBe(320);
    expect(framePlan.webglCssHeight).toBe(240);
    expect(framePlan.scissorPasses).toHaveLength(1);
    expect(framePlan.scissorPasses[0]).toMatchObject({
      id: "card-visible",
      viewportX: 0,
      viewportY: 0,
      pixelWidth: 640,
      pixelHeight: 480,
    });

    const scan = evaluateVarco3dScanBandAndFadeEffect({
      elapsedMs: 1250,
      normalizedHeight: 0.5,
    });
    expect(scan.scanCenter).toBeCloseTo(0.5, 5);
    expect(scan.scanBandWeight).toBeCloseTo(1, 5);
    expect(scan.meshFadeOpacity).toBe(1);
  });
});
