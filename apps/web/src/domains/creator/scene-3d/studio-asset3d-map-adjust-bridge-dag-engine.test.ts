import { describe, expect, it } from "vitest";

import {
  STUDIO_ASSET3D_BRUSH_CONTROLS_BY_TYPE,
  STUDIO_ASSET3D_DCC_BRIDGE_PORTS,
  STUDIO_ASSET3D_FLATTEN_BRUSH_HEX,
  STUDIO_ASSET3D_IDENTITY_MAP_ADJUSTMENT,
  STUDIO_ASSET3D_SLICER_SPECS,
  STUDIO_ASSET3D_VERTEX_COLOR_OVERLAY_CONFIG,
  buildAsset3dSlicerDeepLinkUrl,
  buildAsset3dUnitOctahedralBoneGeometry,
  buildAsset3dVertexColorOverlayBuffer,
  computeAsset3dDagEdgeBezierGeometry,
  evaluateAsset3dAiUnwrapPlan,
  evaluateAsset3dBumpSculptHeightScalar,
  evaluateAsset3dMapAdjustmentTexel,
  evaluateAsset3dMatteJointFlatShade,
  evaluateAsset3dPaintedTextureCompositeTexel,
  evaluateAsset3dRemeshConfig,
  isAsset3dMapAdjustmentIdentity,
  resolveAsset3dPivotToBottom,
  scheduleAsset3dDagTopologicalWave,
  selectAsset3dBestTrackingBone,
  stepAsset3dPbrBrushSizeByKey,
} from "./studio-asset3d-map-adjust-bridge-dag-engine";

describe("studio-asset3d-map-adjust-bridge-dag-engine", () => {
  it("evaluates bump sculpt height scalar (0.5 ± depth * 0.5) and [ / ] ±1px brush size steps", () => {
    expect(STUDIO_ASSET3D_FLATTEN_BRUSH_HEX).toBe("#808080");
    expect(STUDIO_ASSET3D_BRUSH_CONTROLS_BY_TYPE.paint).toEqual([
      "size",
      "strength",
      "hardness",
      "color",
    ]);
    expect(STUDIO_ASSET3D_BRUSH_CONTROLS_BY_TYPE.adjust).toEqual([]);

    const raised = evaluateAsset3dBumpSculptHeightScalar("raise", 1.0);
    expect(raised.heightScalar).toBe(1.0);
    expect(raised.swatchHex).toBe("#ffffff");

    const carved = evaluateAsset3dBumpSculptHeightScalar("carve", 1.0);
    expect(carved.heightScalar).toBe(0.0);
    expect(carved.swatchHex).toBe("#000000");

    const neutral = evaluateAsset3dBumpSculptHeightScalar("raise", 0);
    expect(neutral.heightScalar).toBe(0.5);
    expect(neutral.swatchHex).toBe("#808080");

    expect(stepAsset3dPbrBrushSizeByKey(12, "]")).toBe(13);
    expect(stepAsset3dPbrBrushSizeByKey(12, "[")).toBe(11);
    expect(stepAsset3dPbrBrushSizeByKey(1, "[")).toBe(1);
    expect(stepAsset3dPbrBrushSizeByKey(45, "]")).toBe(45);
  });

  it("evaluates MapAdjustMaterial GLSL shader for baseColor (perceptual gamma 2.2), ORM channel mask, and normal green-Y flip", () => {
    expect(
      isAsset3dMapAdjustmentIdentity(STUDIO_ASSET3D_IDENTITY_MAP_ADJUSTMENT, "baseColor"),
    ).toBe(true);
    expect(
      isAsset3dMapAdjustmentIdentity(STUDIO_ASSET3D_IDENTITY_MAP_ADJUSTMENT, "normal"),
    ).toBe(true);

    // Normal mode with green-channel Y flip (DirectX <-> OpenGL)
    const srcNormal: readonly [number, number, number, number] = [0.5, 0.75, 1.0, 1.0];
    const flippedNormal = evaluateAsset3dMapAdjustmentTexel({
      srcRgba: srcNormal,
      adjustment: {
        ...STUDIO_ASSET3D_IDENTITY_MAP_ADJUSTMENT,
        normalStrength: 0,
        invert: true,
      },
      channelGroup: "normal",
    });
    expect(flippedNormal[0]).toBeCloseTo(0.5, 5);
    expect(flippedNormal[1]).toBeLessThan(0.5); // positive Y became negative Y (< 0.5)
    expect(flippedNormal[2]).toBeGreaterThan(0.5);

    // ORM channel mask: only modify G (roughness), preserve R and B
    const ormAdjusted = evaluateAsset3dMapAdjustmentTexel({
      srcRgba: [0.2, 0.5, 0.8, 1.0],
      adjustment: {
        ...STUDIO_ASSET3D_IDENTITY_MAP_ADJUSTMENT,
        brightness: 20,
      },
      channelGroup: "orm",
      channelMask: [0, 1, 0],
    });
    expect(ormAdjusted[0]).toBeCloseTo(0.2, 5);
    expect(ormAdjusted[1]).toBeCloseTo(0.7, 5);
    expect(ormAdjusted[2]).toBeCloseTo(0.8, 5);

    // BaseColor perceptual saturation = -100 (desaturate to Rec.601 luma)
    const desaturated = evaluateAsset3dMapAdjustmentTexel({
      srcRgba: [0.8, 0.2, 0.1, 1.0],
      adjustment: {
        ...STUDIO_ASSET3D_IDENTITY_MAP_ADJUSTMENT,
        saturation: -100,
      },
      channelGroup: "baseColor",
    });
    expect(desaturated[0]).toBeCloseTo(desaturated[1], 5);
    expect(desaturated[1]).toBeCloseTo(desaturated[2], 5);
  });

  it("evaluates exportPaintedTextures coverage & diff composite shader across multiple submeshes", () => {
    // Submesh 1 painted pixel (maskR = 1.0, diff > 0.0001)
    const pass1 = evaluateAsset3dPaintedTextureCompositeTexel({
      originalRgba: [0.1, 0.1, 0.1, 0.0],
      sourceRgb: [0.1, 0.1, 0.1],
      paintedRgb: [0.9, 0.2, 0.3],
      maskR: 1.0,
      accumulateCoverage: false,
    });
    expect(pass1).toEqual([0.9, 0.2, 0.3, 1]);

    // Submesh 2 untouched pixel at the same UV (maskR = 0.0, accumulateCoverage = true)
    const pass2 = evaluateAsset3dPaintedTextureCompositeTexel({
      originalRgba: pass1,
      sourceRgb: [0.1, 0.1, 0.1],
      paintedRgb: [0.1, 0.1, 0.1],
      maskR: 0.0,
      accumulateCoverage: true,
    });
    expect(pass2).toEqual([0.9, 0.2, 0.3, 1]);
  });

  it("selects best animation camera tracking bone and builds Blender-style octahedral bone geometry", () => {
    const tracking = selectAsset3dBestTrackingBone([
      {
        boneName: "mixamorig:LeftHand",
        hierarchyDepth: 4,
        values: [0, 0, 0, 10, 0, 0], // Excluded by /Finger|Toe|Hand|Foot|Head|End|Eye|Jaw/i
      },
      {
        boneName: "mixamorig:Hips",
        hierarchyDepth: 1,
        values: [0, 1, 0, 0, 1, 1.5, 0, 1, 3.0], // Distance = 3.0, depth = 1 -> score = 3.0
      },
      {
        boneName: "mixamorig:Spine2",
        hierarchyDepth: 3,
        values: [0, 1.2, 0, 0, 1.2, 3.0], // Distance = 3.0, depth = 3 -> score = 1.0
      },
    ]);
    expect(tracking.bestBoneName).toBe("mixamorig:Hips");
    expect(tracking.bestScore).toBeCloseTo(3.0, 5);

    const oct = buildAsset3dUnitOctahedralBoneGeometry(1);
    expect(oct.positions.length).toBe(18); // 6 vertices * 3
    expect(oct.triangleIndices.length).toBe(24); // 8 faces * 3
    expect(oct.edgeIndices.length).toBe(24); // 12 edges * 2

    const shade = evaluateAsset3dMatteJointFlatShade({ x: 0.35, y: 0.5, z: 1.0 }, [1, 0.5, 0.25]);
    expect(shade.shade).toBeCloseTo(1.0, 5);
    expect(shade.shadedRgb[0]).toBeCloseTo(1.0, 5);
  });

  it("extracts non-indexed vertex color overlay buffers and validates triangle counts", () => {
    expect(STUDIO_ASSET3D_VERTEX_COLOR_OVERLAY_CONFIG.baseColorHex).toBe("#e0e0e0");
    expect(STUDIO_ASSET3D_VERTEX_COLOR_OVERLAY_CONFIG.polygonOffsetFactor).toBe(-1);

    const colors = new Float32Array([
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
      1, 1, 0,
    ]);
    const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
    const overlay = buildAsset3dVertexColorOverlayBuffer({
      targetTriangleCount: 2,
      sourceColors3N: colors,
      sourceIndices: indices,
    });
    expect(overlay.length).toBe(18);
    expect(Array.from(overlay.slice(0, 3))).toEqual([1, 0, 0]);
    expect(Array.from(overlay.slice(15, 18))).toEqual([1, 1, 0]);

    expect(() =>
      buildAsset3dVertexColorOverlayBuffer({
        targetTriangleCount: 3,
        sourceColors3N: colors,
        sourceIndices: indices,
      }),
    ).toThrow(/Vertex color face count mismatch/);
  });

  it("evaluates DCC Bridge ports (5324..5328), 3D Slicer URIs, PivotToBottom, Remesh, and AI Unwrap 50K->20K reduction", () => {
    expect(STUDIO_ASSET3D_DCC_BRIDGE_PORTS.map((p) => p.port)).toEqual([
      5324, 5325, 5326, 5327, 5328,
    ]);
    expect(STUDIO_ASSET3D_SLICER_SPECS.map((s) => s.name)).toEqual([
      "Bambu Studio",
      "OrcaSlicer",
      "UltiMaker Cura",
    ]);

    expect(
      buildAsset3dSlicerDeepLinkUrl("Bambu Studio", "https://cdn.varco.ai/model.3mf", true),
    ).toBe("bambustudioopen://https%3A%2F%2Fcdn.varco.ai%2Fmodel.3mf");
    expect(
      buildAsset3dSlicerDeepLinkUrl("Bambu Studio", "https://cdn.varco.ai/model.3mf", false),
    ).toBe("bambustudio://open?file=https%3A%2F%2Fcdn.varco.ai%2Fmodel.3mf");
    expect(buildAsset3dSlicerDeepLinkUrl("OrcaSlicer", "https://cdn.varco.ai/model.stl")).toBe(
      "orcaslicer://open?file=https%3A%2F%2Fcdn.varco.ai%2Fmodel.stl",
    );

    expect(resolveAsset3dPivotToBottom("mesh")).toBe(false);
    expect(resolveAsset3dPivotToBottom("rigged-mesh")).toBe(true);
    expect(resolveAsset3dPivotToBottom("animated-mesh")).toBe(true);
    expect(resolveAsset3dPivotToBottom("mesh", "true")).toBe(true);

    const blockedRemesh = evaluateAsset3dRemeshConfig({
      requestedPolygonCount: 10_000,
      topology: "quad",
      customMode: false,
      sourceTaskType: "TEXTURE_PAINTING",
    });
    expect(blockedRemesh.supported).toBe(false);
    expect(blockedRemesh.unsupportedReason).toBe("studio.texturePaintingNotSupported");

    const unwrapHighPoly = evaluateAsset3dAiUnwrapPlan(85_000);
    expect(unwrapHighPoly.autoReducedTo20k).toBe(true);
    expect(unwrapHighPoly.effectiveUnwrapFaceCount).toBe(20_000);

    const unwrapLowPoly = evaluateAsset3dAiUnwrapPlan(32_000);
    expect(unwrapLowPoly.autoReducedTo20k).toBe(false);
    expect(unwrapLowPoly.effectiveUnwrapFaceCount).toBe(32_000);
  });

  it("computes DAG node cubic Bezier edges and schedules topological wave appearance timestamps", () => {
    const geom = computeAsset3dDagEdgeBezierGeometry(
      { id: "prompt", x: 0, y: 0, width: 120, height: 60 },
      { id: "mesh", x: 220, y: 20, width: 120, height: 60 },
    );
    expect(geom.portDirection).toEqual([1, 0]);
    expect(geom.startPoint).toEqual([124, 30]);
    expect(geom.endPoint).toEqual([216, 50]);
    expect(geom.pathSvg).toContain("M124,30 C");
    expect(geom.arrowSvg).toContain("Z");

    const wave = scheduleAsset3dDagTopologicalWave({
      nodes: [{ id: "image_in" }, { id: "mesh_gen" }, { id: "auto_rig" }],
      edges: [
        { from: "image_in", to: "mesh_gen" },
        { from: "mesh_gen", to: "auto_rig" },
      ],
      startTimestampMs: 0,
    });
    expect(wave.errors).toEqual([]);
    expect(wave.scheduledNodes.map((n) => n.id)).toEqual(["image_in", "mesh_gen", "auto_rig"]);
    expect(wave.scheduledNodes[0]?.appearAtMs).toBe(0);
    expect(wave.scheduledEdges[0]?.appearAtMs).toBe(600); // 0 + 4 * 150ms
    expect(wave.scheduledNodes[1]?.appearAtMs).toBe(1020); // max(600 + 420, 600 + 420 * 0.85) = 1020
    expect(wave.scheduledNodes[2]?.appearAtMs).toBeGreaterThan(wave.scheduledNodes[1]!.appearAtMs);
  });
});
