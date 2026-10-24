import { describe, expect, it } from "vitest";

import {
  STUDIO_VARCO3D_ANIMATION_CATEGORIES,
  STUDIO_VARCO3D_WORKFLOW_NODE_CATALOG,
  STUDIO_VARCO3D_WORKFLOW_PREFLIGHT_METRICS,
  buildVarco3dArExportLinks,
  classifyVarco3dAnimationKey,
  classifyVarco3dWorkflowSaveFailure,
  computeVarco3dMcpReconnectBackoffMs,
  deriveVarco3dMcpNodeOutputStatus,
  evaluateVarco3dGenerate3dNodePreflight,
  filterVarco3dAnimationCatalog,
  findVarco3dWorkflowCatalogEntry,
  parseVarco3dNotRunnableError,
  requestsVarco3dQuadrupedRigging,
  sampleVarco3dEmbedParticleTargets,
  scanVarco3dRgbaTransparency,
  stepVarco3dUvViewerChannelByArrowKey,
  unpackVarco3dOrmChannelToGrayscaleRgba,
  validateVarco3dWorkflowConnection,
} from "./studio-varco3d-workflow-mcp-uv-ar-engine";

describe("studio-varco3d-workflow-mcp-uv-ar-engine", () => {
  it("validates CustomWorkflow V2 13-node catalog and port connection rules (dataType, meshKind, capacity)", () => {
    expect(STUDIO_VARCO3D_WORKFLOW_NODE_CATALOG).toHaveLength(13);
    expect(findVarco3dWorkflowCatalogEntry("Generate3D")?.output).toEqual({
      dataType: "3d",
      meshKind: "mesh",
    });
    expect(findVarco3dWorkflowCatalogEntry("Rig")?.output).toEqual({
      dataType: "3d",
      meshKind: "rigged",
    });

    const nodes = [
      { id: "img1", type: "ImageInput" },
      { id: "gen3d", type: "Generate3D" },
      { id: "rig1", type: "Rig" },
      { id: "anim1", type: "Animate" },
    ];

    // Valid: ImageInput -> Generate3D.image
    expect(
      validateVarco3dWorkflowConnection({
        nodes,
        edges: [],
        candidate: {
          source: "img1",
          target: "gen3d",
          sourceHandle: "out",
          targetHandle: "image",
        },
      }),
    ).toEqual({ ok: true, reason: null });

    // Invalid meshKind: Generate3D (mesh) -> Animate.mesh (requires rigged)
    expect(
      validateVarco3dWorkflowConnection({
        nodes,
        edges: [],
        candidate: {
          source: "gen3d",
          target: "anim1",
          sourceHandle: "out",
          targetHandle: "mesh",
        },
      }),
    ).toEqual({
      ok: false,
      reason: "Animate requires a rigged 3D (Rig output)",
    });

    // Invalid meshKind: Rig (rigged) -> Remesh.mesh (requires plain mesh)
    expect(
      validateVarco3dWorkflowConnection({
        nodes: [...nodes, { id: "remesh1", type: "Remesh" }],
        edges: [],
        candidate: {
          source: "rig1",
          target: "remesh1",
          sourceHandle: "out",
          targetHandle: "mesh",
        },
      }),
    ).toEqual({
      ok: false,
      reason: "This port requires a regular 3D mesh (not a rigged output)",
    });

    // Invalid port full (max 1)
    expect(
      validateVarco3dWorkflowConnection({
        nodes,
        edges: [{ source: "img1", target: "gen3d", targetHandle: "image" }],
        candidate: {
          source: "img1",
          target: "gen3d",
          sourceHandle: "out",
          targetHandle: "image",
        },
      }),
    ).toEqual({
      ok: false,
      reason: 'Port "image" is full (max 1)',
    });
  });

  it("scans RGBA transparency at 512px max dimension, evaluates Generate3D preflight, and parses not-runnable errors", () => {
    const opaqueScan = scanVarco3dRgbaTransparency({
      naturalWidth: 1024,
      naturalHeight: 512,
      rgbaBytes: [255, 0, 0, 255, 0, 255, 0, 255],
      checkTransparency: true,
    });
    expect(opaqueScan.maxDimension).toBe(1024);
    expect(opaqueScan.scanWidth).toBe(512);
    expect(opaqueScan.scanHeight).toBe(256);
    expect(opaqueScan.hasTransparency).toBe(false);

    const transparentScan = scanVarco3dRgbaTransparency({
      naturalWidth: 256,
      naturalHeight: 256,
      rgbaBytes: [255, 0, 0, 255, 0, 255, 0, 128],
      checkTransparency: true,
    });
    expect(transparentScan.hasTransparency).toBe(true);

    // Generated image source -> forces skipInputUpscale = true and forceUseAlphaOff = true
    const preflightFromGenImg = evaluateVarco3dGenerate3dNodePreflight({
      nodeId: "gen3d_1",
      useAlpha: true,
      hasLicense: false,
      isPlusAuthorized: true,
      sourceNodeType: "GenerateImage",
      imageMaxDimensionPx: 512,
      imageHasTransparency: false,
    });
    expect(preflightFromGenImg.ok).toBe(true);
    expect(preflightFromGenImg.skipInputUpscale).toBe(true);
    expect(preflightFromGenImg.forceUseAlphaOff).toBe(true);
    expect(preflightFromGenImg.assignedDefaultLicense).toBe("PRIVATE");

    // Uploaded opaque image with useAlpha = true -> blocks with error.transparentImageRequired
    const preflightBlocked = evaluateVarco3dGenerate3dNodePreflight({
      nodeId: "gen3d_2",
      useAlpha: true,
      hasLicense: false,
      isPlusAuthorized: false,
      sourceNodeType: "ImageInput",
      imageMaxDimensionPx: 1024,
      imageHasTransparency: false,
    });
    expect(preflightBlocked.ok).toBe(false);
    expect(preflightBlocked.errorKey).toBe("error.transparentImageRequired");
    expect(preflightBlocked.assignedDefaultLicense).toBe("CC_BY_4_0");

    const parsed = parseVarco3dNotRunnableError(
      "Flow not runnable: Node nodeA not runnable; nodeB is busy in another Run",
    );
    expect(parsed).toEqual({
      blockedNodeIds: ["nodeA"],
      waitingNodeIds: ["nodeB"],
    });
  });

  it("evaluates MCP Editor Bridge v2 exponential backoff, status derivation, quadruped guard, and save failure classification", () => {
    expect(STUDIO_VARCO3D_WORKFLOW_PREFLIGHT_METRICS.mcpProtocolVersion).toBe(2);
    expect([0, 1, 2, 3, 4, 5].map((i) => computeVarco3dMcpReconnectBackoffMs(i))).toEqual([
      2_000,
      4_000,
      8_000,
      16_000,
      30_000,
      30_000,
    ]);

    expect(deriveVarco3dMcpNodeOutputStatus([])).toBe("empty");
    expect(deriveVarco3dMcpNodeOutputStatus(["success", "running"])).toBe("running");
    expect(deriveVarco3dMcpNodeOutputStatus(["success", "failure"])).toBe("mixed");
    expect(deriveVarco3dMcpNodeOutputStatus(["success", "success"])).toBe("success");

    expect(
      requestsVarco3dQuadrupedRigging([{ type: "string", value: "quadruped" }]),
    ).toBe(true);
    expect(
      requestsVarco3dQuadrupedRigging([{ type: "string", value: "humanoid" }]),
    ).toBe(false);

    expect(classifyVarco3dWorkflowSaveFailure("CONFLICT")).toBe("editor-lost");
    expect(classifyVarco3dWorkflowSaveFailure("UNAUTHORIZED")).toBe("unreachable");
    expect(classifyVarco3dWorkflowSaveFailure("FORBIDDEN")).toBe("access-denied");
    expect(classifyVarco3dWorkflowSaveFailure("BAD_REQUEST")).toBe("rejected");
  });

  it("unpacks ORM channels to grayscale RGBA, steps UV viewer modes by ArrowLeft/Right, builds AR links, and samples 10K embed particles", () => {
    const orm = new Uint8ClampedArray([10, 128, 240, 255]);
    const rough = unpackVarco3dOrmChannelToGrayscaleRgba(orm, "roughness");
    expect(Array.from(rough.grayscaleRgba)).toEqual([128, 128, 128, 255]);
    expect(rough.channelMask).toEqual([0, 1, 0]);

    const metal = unpackVarco3dOrmChannelToGrayscaleRgba(orm, "metallic");
    expect(Array.from(metal.grayscaleRgba)).toEqual([240, 240, 240, 255]);
    expect(metal.channelMask).toEqual([0, 0, 1]);

    const modes = ["baseColor", "normal", "roughness", "metallic"] as const;
    expect(stepVarco3dUvViewerChannelByArrowKey(modes, "baseColor", "ArrowRight")).toEqual({
      nextMode: "normal",
      shortLabel: "N",
    });
    expect(stepVarco3dUvViewerChannelByArrowKey(modes, "metallic", "ArrowLeft")).toEqual({
      nextMode: "roughness",
      shortLabel: "R",
    });

    const ar = buildVarco3dArExportLinks({
      taskId: "cd1e75d3-5efa-4f46-afb6-59920e080fb7",
      glbOrUsdzUrl: "https://3d.varco.ai/assets/model.glb",
    });
    expect(ar.iosUsdzApiUrl).toBe(
      "/api/usdz?taskId=cd1e75d3-5efa-4f46-afb6-59920e080fb7&format=usdz",
    );
    expect(ar.androidSceneViewerIntentUrl).toContain(
      "intent://arvr.google.com/scene-viewer/1.0?file=",
    );

    const particles = sampleVarco3dEmbedParticleTargets({
      sourcePositions3N: [1.5, 2.5, 3.5],
      particleCount: 2,
      randomFn: () => 0,
    });
    // [x, -z, y] coordinate swap from EmbedSceneManager.onObjectLoaded
    expect(Array.from(particles)).toEqual([1.5, -3.5, 2.5, 1.5, -3.5, 2.5]);
  });

  it("classifies 17-category animations across humanoid/quadruped/equine and filters by trilingual loop keywords", () => {
    expect(STUDIO_VARCO3D_ANIMATION_CATEGORIES).toHaveLength(17);

    expect(classifyVarco3dAnimationKey("dog_gallop_left_lead_looping")).toEqual({
      sourceKey: "dog_gallop_left_lead",
      isLooping: true,
      clipFamily: "quadruped",
    });
    expect(classifyVarco3dAnimationKey("horse_rear_up")).toEqual({
      sourceKey: "horse_rear_up",
      isLooping: false,
      clipFamily: "equine",
    });
    expect(classifyVarco3dAnimationKey("sword_slash_combo")).toEqual({
      sourceKey: "sword_slash_combo",
      isLooping: false,
      clipFamily: "humanoid",
    });

    const sampleClips = [
      { key: "run_sprint_looping", titleKo: "질주 루프", category: "LOCOMOTION" },
      { key: "sword_slash", titleKo: "검술 베기", category: "COMBAT" },
    ];
    expect(filterVarco3dAnimationCatalog(sampleClips, "루핑", false)).toEqual([
      sampleClips[0],
    ]);
    expect(filterVarco3dAnimationCatalog(sampleClips, "검술", false, "COMBAT")).toEqual([
      sampleClips[1],
    ]);
  });
});
