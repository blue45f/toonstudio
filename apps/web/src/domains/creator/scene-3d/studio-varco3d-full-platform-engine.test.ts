import { describe, expect, it } from "vitest";

import {
  STUDIO_VARCO3D_EXTERNAL_API_ENDPOINTS,
  STUDIO_VARCO3D_FLOW_AGENT_SUGGESTIONS,
  STUDIO_VARCO3D_FORMAT_BADGE_STYLES,
  STUDIO_VARCO3D_OFFICIAL_DCC_PLUGINS,
  STUDIO_VARCO3D_TRPC_ROUTER_SUMMARY,
  STUDIO_VARCO3D_UNIVERSAL_AGENT_TOOLS,
  VARCO3D_DECAL_FALLOFF_FULL_DOT,
  VARCO3D_DECAL_FALLOFF_ZERO_DOT,
  VARCO3D_TIDY_LAYOUT_CONSTANTS,
  buildVarco3dWeightRampCssGradient,
  canonicalizeVarco3dBoneName,
  clipVarco3dPolygonToUnitUvSquare,
  computeVarco3dDecalFalloffAlpha,
  computeVarco3dMagneticNodeSnap,
  computeVarco3dProjectedRestBend,
  computeVarco3dTidyUpLayeredLayout,
  detectVarco3dLimbIkChains,
  formatVarco3dFlowAgentToolPhrase,
  validateVarco3dUniversalAgentGenerate3dCall,
} from "./studio-varco3d-full-platform-engine";

describe("studio-varco3d-full-platform-engine", () => {
  it("computes Geodesic ExpMap decal Hermite smoothstep falloff and clips UV polygons to [0,1]^2", () => {
    expect(computeVarco3dDecalFalloffAlpha(VARCO3D_DECAL_FALLOFF_ZERO_DOT - 0.1)).toBe(0);
    expect(computeVarco3dDecalFalloffAlpha(VARCO3D_DECAL_FALLOFF_FULL_DOT + 0.1)).toBe(1);
    const mid = (VARCO3D_DECAL_FALLOFF_FULL_DOT + VARCO3D_DECAL_FALLOFF_ZERO_DOT) / 2;
    expect(computeVarco3dDecalFalloffAlpha(mid)).toBeCloseTo(0.5, 5);

    const clipped = clipVarco3dPolygonToUnitUvSquare([
      { u: -0.2, v: 0.1 },
      { u: 0.9, v: 0.1 },
      { u: 0.9, v: 1.2 },
      { u: -0.2, v: 1.2 },
    ]);
    expect(clipped.length).toBe(4);
    for (const pt of clipped) {
      expect(pt.u).toBeGreaterThanOrEqual(0);
      expect(pt.u).toBeLessThanOrEqual(1);
      expect(pt.v).toBeGreaterThanOrEqual(0);
      expect(pt.v).toBeLessThanOrEqual(1);
    }
  });

  it("canonicalizes Mixamo/Blender bone names, detects 4 limb IK chains, computes rest-bend pole vector, and builds 9-stop weight ramp CSS gradient", () => {
    expect(canonicalizeVarco3dBoneName("mixamorig:LeftForeArm")).toBe("leftforearm");
    expect(canonicalizeVarco3dBoneName("Armature_UpperArm.L")).toBe("upperarml");

    const chains = detectVarco3dLimbIkChains([
      { name: "mixamorig:Hips", parentName: null },
      { name: "mixamorig:LeftArm", parentName: "mixamorig:Hips" },
      { name: "mixamorig:LeftForeArm", parentName: "mixamorig:LeftArm" },
      { name: "mixamorig:LeftHand", parentName: "mixamorig:LeftForeArm" },
      { name: "RightUpperArm", parentName: "mixamorig:Hips" },
      { name: "RightLowerArm", parentName: "RightUpperArm" },
      { name: "RightHand", parentName: "RightLowerArm" },
      { name: "Thigh.L", parentName: "mixamorig:Hips" },
      { name: "Shin.L", parentName: "Thigh.L" },
      { name: "Foot.L", parentName: "Shin.L" },
      { name: "RThigh", parentName: "mixamorig:Hips" },
      { name: "RLeg", parentName: "RThigh" },
      { name: "RFoot", parentName: "RLeg" },
    ]);
    expect(chains.map((c) => c.id)).toEqual(["left-arm", "right-arm", "left-leg", "right-leg"]);

    const pole = computeVarco3dProjectedRestBend(
      { x: 0, y: 100, z: 0 },
      { x: 0, y: 60, z: 20 },
      { x: 0, y: 20, z: 0 },
    );
    expect(pole).toEqual({ x: 0, y: 0, z: 1 });

    const gradient = buildVarco3dWeightRampCssGradient();
    expect(gradient).toContain("linear-gradient(to right,");
    expect(gradient).toContain("0%");
    expect(gradient).toContain("100%");
  });

  it("computes CustomWorkflow V2 magnetic alignment snap and ELK layered Tidy-Up layout", () => {
    const snap = computeVarco3dMagneticNodeSnap(
      { id: "drag", x: 103, y: 58, width: 200, height: 100 },
      [{ id: "target", x: 100, y: 60, width: 200, height: 100 }],
      6,
    );
    expect(snap.snappedX).toBe(100);
    expect(snap.snappedY).toBe(60);
    expect(snap.guides.length).toBe(2);

    const layout = computeVarco3dTidyUpLayeredLayout(
      [
        { id: "a", x: 10, y: 20, width: 200, height: 100 },
        { id: "b", x: 30, y: 40, width: 200, height: 100 },
      ],
      [{ source: "a", target: "b" }],
    );
    expect(layout.get("a")).toEqual({ x: 10, y: 20 });
    expect(layout.get("b")).toEqual({
      x: 10 + 200 + VARCO3D_TIDY_LAYOUT_CONSTANTS.TIDY_RANK_SEP,
      y: 20,
    });
  });

  it("formats Flow AI Composer tool phrases and validates Universal 3D Agent 30-tool constraints", () => {
    expect(formatVarco3dFlowAgentToolPhrase("create_node", 1, false)).toBe("Created 1 node");
    expect(formatVarco3dFlowAgentToolPhrase("connect_edge", 3, true)).toBe("Connecting edges…");
    expect(formatVarco3dFlowAgentToolPhrase("estimate_run", 1, false)).toBe("Estimated run cost");
    expect(formatVarco3dFlowAgentToolPhrase("get_workflow_state", 1, true)).toBe(
      "Reading workflow state",
    );
    expect(STUDIO_VARCO3D_FLOW_AGENT_SUGGESTIONS).toHaveLength(4);
    expect(STUDIO_VARCO3D_UNIVERSAL_AGENT_TOOLS).toHaveLength(30);

    expect(
      validateVarco3dUniversalAgentGenerate3dCall({
        frontImageId: "img1",
        backImageId: "img2",
        polygonCount: 10_000,
        tPose: true,
        pbr: false,
      }),
    ).toEqual({
      ok: false,
      error: "t_pose and pbr are available for single-image 3D generation only",
    });

    expect(
      validateVarco3dUniversalAgentGenerate3dCall({
        frontImageId: "img1",
        polygonCount: 500,
        tPose: false,
        pbr: true,
      }),
    ).toEqual({
      ok: false,
      error: "polygon_count must be 0 or 1000-1000000",
    });

    expect(
      validateVarco3dUniversalAgentGenerate3dCall({
        frontImageId: "img1",
        polygonCount: 50_000,
        tPose: true,
        pbr: true,
      }),
    ).toEqual({ ok: true, error: null });
  });

  it("exposes AFS format badge styles, 7 External API v1/v2 endpoints, 5 official DCC/Engine plugins, and 141 tRPC procedures", () => {
    expect(STUDIO_VARCO3D_FORMAT_BADGE_STYLES["3D"]).toContain("rgba(72,22,155,0.62)");
    expect(STUDIO_VARCO3D_EXTERNAL_API_ENDPOINTS).toHaveLength(7);
    expect(STUDIO_VARCO3D_OFFICIAL_DCC_PLUGINS).toHaveLength(5);
    expect(STUDIO_VARCO3D_TRPC_ROUTER_SUMMARY.totalProcedures).toBe(141);
    expect(STUDIO_VARCO3D_TRPC_ROUTER_SUMMARY.totalRouters).toBe(28);
  });
});
