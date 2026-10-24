import { describe, expect, it } from "vitest";

import {
  applyVarco3dCanvasShiftRightLightingDrag,
  computeVarco3dUvSeamLineIndices,
  computeVarco3dUvSeamLineIndicesBatchAsync,
  computeVarco3dWireframeLineIndices,
  createVarco3dUnifiedRigHistory,
  evaluateVarco3dEnvironmentMatcapTint,
  evaluateVarco3dRigMeshDimColor,
  evaluateVarco3dStudioTransitionEffects,
  pushVarco3dUnifiedRigHistory,
  redoVarco3dUnifiedRigHistory,
  resolveVarco3dBrushAndDecalPolicy,
  stepVarco3dCameraTracker,
  undoVarco3dUnifiedRigHistory,
} from "./studio-varco3d-geometry-rig-engine";
import {
  createStudioVarco3dViewportHudState,
  lightingDialDegToRad,
  lightingRadToDialDeg,
} from "./studio-varco3d-preview-inspector";

describe("studio-varco3d-geometry-rig-engine", () => {
  it("detects UV seam edges across welded 3D vertices with discontinuous UVs (uvSeamWorker port)", () => {
    // Two triangles sharing the 3D edge (0,0,0) -> (1,0,0):
    // Triangle 0 uses vertices 0, 1, 2 with UVs (0,0)-(1,0)-(0,1)
    // Triangle 1 uses vertices 3, 4, 5 where v3==(0,0,0), v4==(1,0,0) in 3D,
    // but UVs on v3/v4 are (0, 0.5)-(1, 0.5) (discontinuous seam!)
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 1, 0, 0, 0, -1, 0,
    ]);
    const seamUvs = new Float32Array([
      0, 0, 1, 0, 0, 1,
      0, 0.5, 1, 0.5, 0, 0.9,
    ]);
    const seamLines = computeVarco3dUvSeamLineIndices(positions, seamUvs);
    expect(Array.from(seamLines)).toEqual([0, 1]);

    // When UVs match along the shared edge, 0 seam lines are emitted
    const continuousUvs = new Float32Array([
      0, 0, 1, 0, 0, 1,
      0, 0, 1, 0, 0, -1,
    ]);
    const noSeams = computeVarco3dUvSeamLineIndices(positions, continuousUvs);
    expect(noSeams).toHaveLength(0);
  });

  it("batches multi-mesh UV seam detection and yields when 50ms budget is exceeded", async () => {
    let fakeNow = 0;
    const nowFn = () => {
      fakeNow += 30;
      return fakeNow;
    };
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 1, 0, 0, 0, -1, 0,
    ]);
    const uvs = new Float32Array([
      0, 0, 1, 0, 0, 1,
      0, 0.5, 1, 0.5, 0, 0.9,
    ]);
    const map = await computeVarco3dUvSeamLineIndicesBatchAsync(
      [
        { meshId: "head", positions, uvs },
        { meshId: "outfit", positions, uvs },
      ],
      nowFn,
    );
    expect(map.get("head")).toEqual(new Uint32Array([0, 1]));
    expect(map.get("outfit")).toEqual(new Uint32Array([0, 1]));
  });

  it("extracts triangle (6 indices/tri) and quad (8 perimeter indices/pair) wireframe topologies", () => {
    const quadIndices = [0, 1, 2, 0, 2, 3, 4, 5, 6];
    const triWire = computeVarco3dWireframeLineIndices({
      vertexCount: 7,
      index: quadIndices,
      faceTopology: "triangle",
    });
    // 3 triangles * 6 line indices = 18
    expect(triWire).toHaveLength(18);

    const quadWire = computeVarco3dWireframeLineIndices({
      vertexCount: 7,
      index: quadIndices,
      faceTopology: "quad",
    });
    // First 6 indices form quad perimeter (0-1, 1-2, 2-3, 3-0 => 8 indices) + trailing 1 triangle (6 indices) = 14
    expect(Array.from(quadWire)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 0,
      4, 5, 5, 6, 6, 4,
    ]);
  });

  it("evaluates HDRI environment-tinted clay Matcap color and BoneVisualizer 88% luma desaturation", () => {
    const tinted = evaluateVarco3dEnvironmentMatcapTint([0.8, 0.8, 0.8], [0.9, 0.7, 0.5], 0.6);
    expect(tinted[0]).toBeGreaterThan(tinted[2]);

    const dimmed = evaluateVarco3dRigMeshDimColor([1.0, 0.2, 0.1]);
    // Desaturated 88% toward Rec.601 luma
    expect(dimmed[0]).toBeLessThan(0.55);
    expect(dimmed[1]).toBeGreaterThan(0.35);
  });

  it("rotates lighting on Shift + Right-Click canvas drag and maps bump/flatten brush to normal preview", () => {
    const state = createStudioVarco3dViewportHudState({
      lightingRotationRad: lightingDialDegToRad(10),
      isLightingAutoRotateOn: true,
    });
    const afterDrag = applyVarco3dCanvasShiftRightLightingDrag(state, {
      shiftKey: true,
      buttons: 2,
      deltaClientX: 35,
    });
    expect(lightingRadToDialDeg(afterDrag.lightingRotationRad)).toBe(45);
    expect(afterDrag.isLightingAutoRotateOn).toBe(false);

    const bumpPolicy = resolveVarco3dBrushAndDecalPolicy(afterDrag, "bump");
    expect(bumpPolicy.preferredMapPreviewMode).toBe("normal");
    expect(bumpPolicy.decalVisible).toBe(true);

    const roughnessState = createStudioVarco3dViewportHudState({
      mapPreviewMode: "roughness",
    });
    expect(resolveVarco3dBrushAndDecalPolicy(roughnessState, "roughness").decalVisible).toBe(false);
  });

  it("clamps CameraTracker vertical follow to ±0.3m and supports unified pose/skeleton/paint undo-redo", () => {
    const tracker = stepVarco3dCameraTracker(
      {
        followEnabled: true,
        isUserInteracting: false,
        initialTargetY: 1.0,
        cameraPosition: { x: 0, y: 0.5, z: 3 },
        controlsTarget: { x: 0, y: 0.5, z: 0 },
        defaultCameraOffset: { x: 0, y: 0.5, z: 3 },
      },
      { x: 2.0, y: 2.5, z: 0 },
    );
    // Delta Y is +1.5m, clamped to +0.3m => target Y goal is 0.5 + 0.3 = 0.8, lerped by 0.1 from 0.5 => 0.53
    expect(tracker.controlsTarget.y).toBeCloseTo(0.53, 4);
    expect(tracker.cameraPosition.x).toBeCloseTo(0.2, 4);

    let history = createVarco3dUnifiedRigHistory<string>();
    history = pushVarco3dUnifiedRigHistory(history, "skeleton", "add-bone-joint.001");
    history = pushVarco3dUnifiedRigHistory(history, "pose", "rotate-arm-30deg");

    // In "skeleton" tool mode, unified undo skips "pose" entries and undoes the "skeleton" entry!
    const undone = undoVarco3dUnifiedRigHistory(history, "skeleton");
    expect(undone.applied?.domain).toBe("skeleton");
    expect(undone.applied?.payload).toBe("add-bone-joint.001");

    const redone = redoVarco3dUnifiedRigHistory(undone.history, "skeleton");
    expect(redone.applied?.payload).toBe("add-bone-joint.001");
  });

  it("evaluates VoxelGridPreview sweep and WaveRevealEffect curves", () => {
    const effects = evaluateVarco3dStudioTransitionEffects({
      elapsedMs: 2400,
      normalizedPos: { x: 0.25, y: 0.5, z: -0.25 },
      revealProgress: 0.6,
    });
    expect(effects.voxelFade).toBe(1);
    expect(effects.voxelSweep).toBeGreaterThan(0);
    expect(effects.waveRevealEdge).toBeGreaterThan(0.5);
  });
});
