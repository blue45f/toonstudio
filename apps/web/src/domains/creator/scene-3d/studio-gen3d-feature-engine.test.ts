import { describe, expect, it } from "vitest";

import {
  buildMultiStageLodLadder,
  buildSmartSegmentTransformMatrix,
  buildGen3dPoseControlSpec,
  buildWebtoon3dBackgroundCluster,
  computeAlbedoDelightingMetrics,
  computeGen3dPlatformWalletSummary,
  detectGen3dLowPolyIntent,
  PRO3D_GEN25_GRADIENT,
  normalizeGen3dP2BBoxEditRegion,
  planPro3dGen25Session,
  planGen3dV3Pipeline,
  STUDIO_3D_COMPETITOR_REA_BENCHMARKS,
} from "./studio-gen3d-feature-engine";
import {
  BLEND_AI_SCALE_GUIDES,
  buildGen3dCustomizationRecipe,
  evaluateGen3dStudioWorkspaceGuard,
  GLBFORGE_EXTRUDE_PRESETS,
  GLBFORGE_PROFILES,
  MESHY_CREATIVE_PRODUCTS,
  MESHY_SLICERS,
  planWebtoonSignageReliefExtrusion,
  simulateGlbForgeAuditAndOptimization,
  GEN3D_STUDIO_12_WORKSPACES,
  GEN3D_STUDIO_FREE_TRIAL_LEDGER,
  GEN3D_TEXT_TO_MOTION_PRESETS,
  GEN3D_MCP_GENERATED_MODELS,
  VRM_FRAMING_PRESETS,
  VRM_TOOLKIT_MCP_INSPECTED_AVATARS,
} from "./studio-gen3d-ecosystem-engine";

describe("studio-gen3d-feature-engine", () => {
  it("Tripo V3 3원 모델 라우팅(v3.1 / P1 / P2), 파라미터 제거 및 체인 검증을 수행한다", () => {
    expect(detectGen3dLowPolyIntent("low-poly street lamp")).toBe(true);
    expect(detectGen3dLowPolyIntent("저폴리곤 웹툰 편의점 진열대")).toBe(true);
    expect(detectGen3dLowPolyIntent("ultra detailed palace throne")).toBe(false);

    const p1Plan = planGen3dV3Pipeline({
      mode: "text-to-model",
      prompt: "low-poly classroom chair",
      smartLowPoly: true,
      generateParts: true,
      geometryQuality: "detailed",
      faceLimit: 3500,
    });
    expect(p1Plan.valid).toBe(true);
    expect(p1Plan.selectedModel).toBe("P1-20260311");
    expect(p1Plan.autoRoutedLowPoly).toBe(true);
    expect(p1Plan.strippedParams).toEqual([
      "smart_low_poly",
      "generate_parts",
      "geometry_quality",
    ]);

    const p2Plan = planGen3dV3Pipeline({
      mode: "text-to-model",
      prompt: "low-poly temple pillar",
      quad: true,
      faceLimit: 8000,
    });
    expect(p2Plan.valid).toBe(true);
    expect(p2Plan.selectedModel).toBe("P2-20260801");

    const invalidChain = planGen3dV3Pipeline({
      mode: "text-to-model",
      prompt: "stone statue",
      chainSteps: ["complete", "retarget"],
    });
    expect(invalidChain.valid).toBe(false);
    expect(invalidChain.hardErrors.length).toBeGreaterThanOrEqual(2);

    const quadrupedRig = planGen3dV3Pipeline({
      mode: "text-to-model",
      prompt: "guardian wolf",
      poseControl: { poseType: "T-Pose", headBodyHeightRatio: 1.2, spanOfLegs: 12 },
      chainSteps: ["rig-check", "rig", "retarget"],
      rigType: "quadruped",
      animations: ["preset:idle", "preset:walk"],
    });
    expect(quadrupedRig.valid).toBe(true);
    expect(quadrupedRig.swappedAnimations).toEqual([
      "preset:quadruped:idle",
      "preset:quadruped:walk",
    ]);
    expect(quadrupedRig.effectivePrompt).toContain("t-pose:1.2:1.0:1.0:1.0:12.0");

    const avianRig = planGen3dV3Pipeline({
      mode: "text-to-model",
      prompt: "messenger hawk",
      chainSteps: ["rig", "retarget"],
      rigType: "avian",
      animations: ["preset:idle"],
    });
    expect(avianRig.valid).toBe(true);
    expect(avianRig.skippedRetarget).toBe(true);
  });

  it("포즈 비율 Shaper 슬라이더 변환, P2 BBox 정규화, SmartSegment 4x4 행렬 및 지갑 요약을 계산한다", () => {
    const pose = buildGen3dPoseControlSpec({
      poseType: "A-Pose",
      headBodyHeightRatio: 1.3,
      legsBodyHeightRatio: 1.2,
      armsBodyLengthRatio: 1.1,
      spanOfLegs: 15,
    });
    expect(pose.promptSuffix).toBe(", a-pose:1.3:1.0:1.2:1.1:15.0");
    expect(pose.shaperSliders.headCount).toBeGreaterThan(7.5);
    expect(pose.shaperSliders.heightCm).toBeGreaterThan(170);

    const bbox = normalizeGen3dP2BBoxEditRegion({
      taskId: "task_123",
      minCorner: [1.2, -0.5, 0.8],
      maxCorner: [-0.4, 1.5, -0.2],
      editPrompt: "add ornate carving",
    });
    expect(bbox.modelVersion).toBe("P2-20260801");
    expect(bbox.normalizedMin).toEqual([-0.4, -0.5, -0.2]);
    expect(bbox.normalizedMax).toEqual([1.2, 1.5, 0.8]);
    expect(bbox.volumeCubicUnits).toBeCloseTo(3.2, 3);

    const mat = buildSmartSegmentTransformMatrix({
      translate: [2, 3, -1],
      scale: [1, 2, 1],
      yawDeg: 0,
    });
    expect(mat).toHaveLength(16);
    expect(mat.slice(12, 16)).toEqual([2, 3, -1, 1]);

    const wallet = computeGen3dPlatformWalletSummary({
      defaultBalance: 150,
      defaultFrozen: 50,
      freeBalance: 20,
      alertThreshold: 200,
    });
    expect(wallet.totalAvailableCredits).toBe(170);
    expect(wallet.usdEquivalent).toBe(1.5);
    expect(wallet.thresholdAlertTriggered).toBe(true);
  });

  it("Hyper3D Rodin Gen-2.5 Thinking Effort·ControlNet·Deemos Bang Parts 및 Meshy/Sloyd/CSM 기능을 계획한다", () => {
    expect(STUDIO_3D_COMPETITOR_REA_BENCHMARKS).toHaveLength(5);

    const gen25 = planPro3dGen25Session({
      cardMode: "Generation",
      requestedVersion: "Gen-2.5",
      controlNetMode: "voxel",
      voxelResolution: 64,
      thinkingEffort: "Extreme-High",
    });
    expect(gen25.effectiveVersion).toBe("Gen-2.5");
    expect(gen25.badgeStyle).toBe(PRO3D_GEN25_GRADIENT);
    expect(gen25.thinkingEffort?.durationSeconds).toBe(80);
    expect(gen25.controlNetSummaryKo).toContain("64³");

    const editCard = planPro3dGen25Session({
      cardMode: "3D Editing",
      requestedVersion: "Gen-1.5",
      editOperation: "Parts",
    });
    expect(editCard.effectiveVersion).toBe("Gen-2.5");
    expect(editCard.versionLockedByEditingCard).toBe(true);
    expect(editCard.deemosBangPartsEnabled).toBe(true);

    const lods = buildMultiStageLodLadder(40_000, true);
    expect(lods).toHaveLength(4);
    expect(lods[0]?.targetFaces).toBe(40_000);
    expect(lods[3]?.targetFaces).toBe(4_000);

    const delight = computeAlbedoDelightingMetrics({
      delightEnabled: true,
      shadowIntensity: 90,
      toonShadingTarget: true,
    });
    expect(delight.toonShaderReady).toBe(true);
    expect(delight.shadowRemovalPercent).toBeGreaterThan(90);

    const cluster = buildWebtoon3dBackgroundCluster({
      presetId: "korean-alley-commercial",
      floorCount: 4,
      roofPitchDeg: 20,
      windowBayCount: 5,
      alleyWidthMeters: 4.5,
      cameraPlane: "street-low",
    });
    expect(cluster.proceduralModuleCount).toBe(24);
    expect(cluster.aiHeroPropCount).toBe(6);
    expect(cluster.cameraFovDeg).toBe(28);
  });

  it("H3.1-20260901 모델, Tripo Studio 12개 워크스페이스, GLBForge 감사·돌출, Meshy 7종 제품, VRM 검증 및 Blend-AI 스케일을 계산한다", () => {
    const h31Plan = planGen3dV3Pipeline({
      mode: "text-to-model",
      prompt: "anime protagonist character",
      requestedModel: "H3.1-20260901",
      smartLowPoly: false,
      generateParts: true,
      geometryQuality: "detailed",
      faceLimit: 24000,
    });
    expect(h31Plan.valid).toBe(true);
    expect(h31Plan.selectedModel).toBe("H3.1-20260901");

    expect(GEN3D_STUDIO_12_WORKSPACES).toHaveLength(12);
    expect(GEN3D_TEXT_TO_MOTION_PRESETS).toHaveLength(6);
    expect(GLBFORGE_PROFILES).toHaveLength(4);
    expect(GLBFORGE_EXTRUDE_PRESETS).toHaveLength(5);
    expect(MESHY_CREATIVE_PRODUCTS).toHaveLength(7);
    expect(MESHY_SLICERS).toHaveLength(8);
    expect(VRM_FRAMING_PRESETS).toHaveLength(4);
    expect(BLEND_AI_SCALE_GUIDES).toHaveLength(6);

    const uvGuard = evaluateGen3dStudioWorkspaceGuard({
      workspaceId: "smart-uv",
      faceCount: 50_000,
      quad: true,
    });
    expect(uvGuard.allowed).toBe(false);
    expect(uvGuard.blockersKo[0]).toContain("40,000");

    const glbAudit = simulateGlbForgeAuditAndOptimization({
      profileId: "mobile-hero",
      triangles: 8104,
      drawCalls: 8,
      materials: 5,
      textureSizePx: 2048,
    });
    expect(glbAudit.profile.id).toBe("mobile-hero");
    expect(glbAudit.passed).toBe(false);
    expect(glbAudit.score).toBe(65);
    expect(glbAudit.optimizedDrawCalls).toBe(4);

    const relief = planWebtoonSignageReliefExtrusion({
      presetId: "neon",
      layers: 3,
      depthCm: 1.5,
      pillowCm: 0.3,
    });
    expect(relief.preset.id).toBe("neon");
    expect(relief.watertightStlReady).toBe(true);
    expect(relief.summaryKo).toContain("야경 네온사인 간판");

    expect(GEN3D_MCP_GENERATED_MODELS).toHaveLength(44);
    expect(GEN3D_MCP_GENERATED_MODELS.filter((m) => m.domain === "bg3d")).toHaveLength(17);
    expect(GEN3D_MCP_GENERATED_MODELS.filter((m) => m.domain === "mannequin")).toHaveLength(12);
    expect(GEN3D_MCP_GENERATED_MODELS.filter((m) => m.domain === "character-lab")).toHaveLength(15);
    expect(VRM_TOOLKIT_MCP_INSPECTED_AVATARS).toHaveLength(2);

    expect(GEN3D_STUDIO_FREE_TRIAL_LEDGER).toHaveLength(4);
    for (const item of GEN3D_STUDIO_FREE_TRIAL_LEDGER) {
      expect(item.remainingCount).toBe(0);
      expect(item.usedCount).toBe(item.totalCount);
    }

    const recipe = buildGen3dCustomizationRecipe({
      modelId: "tripo3d-seg-character-lab-knight-outfit",
      enabledPartIds: ["crown-helm", "royal-cape", "tunic-armor"],
      paletteId: "romance-gold-palace",
      toonRampSteps: 4,
      outlineWidthMm: 1.4,
      scaleMultiplier: 1.25,
      mannequinHeadRatio: 8.5,
      handPoseVariantId: "sword-grip",
      customGlbUrl: "/models/tripo3d-mcp/custom_knight.glb",
    });
    expect(recipe.isCustomUrlOverride).toBe(true);
    expect(recipe.effectiveGlbUrl).toBe("/models/tripo3d-mcp/custom_knight.glb");
    expect(recipe.activePartCount).toBe(3);
    expect(recipe.totalPartCount).toBe(6);
    expect(recipe.estimatedActiveTriangles).toBe(11_994);
    expect(recipe.mannequinBodySliders.height).toBeGreaterThan(75);
    expect(recipe.shaderSummaryKo).toContain("로판 황실 화이트·골드");
    expect(recipe.exportableJson).toContain("toonstudio.tripo3d-customization-recipe.v1");
  });
});
