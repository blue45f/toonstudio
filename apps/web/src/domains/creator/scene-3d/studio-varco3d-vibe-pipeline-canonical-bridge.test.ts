import { describe, expect, it } from "vitest";

import { STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS } from "./studio-varco3d-character-lab-diorama-catalog";
import {
  STUDIO_VARCO3D_12VIEW_CAMERA_RING,
  STUDIO_VARCO3D_ANIMATION_LIBRARY_SUMMARY,
  STUDIO_VARCO3D_POINT_POLICIES,
  buildVarco3dCanonicalPartDescriptor,
  evaluateVarco3dPointPolicyReservation,
  inspectVarco3d12ViewReconstructionBundle,
  planVarco3dRetargetAnimationTask,
} from "./studio-varco3d-vibe-pipeline-canonical-bridge";

describe("studio-varco3d-vibe-pipeline-canonical-bridge", () => {
  it("converts Character Labs modular items into schema-valid CharacterCanonicalPartDescriptor objects", () => {
    const wigItem = STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS.find(
      (item) => item.id === "charlab_wig_rofan_hime_wave",
    )!;
    const swordItem = STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS.find(
      (item) => item.id === "charlab_weapon_paladin_greatsword",
    )!;
    const wingsItem = STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS.find(
      (item) => item.id === "charlab_wings_archangel_six",
    )!;

    const wigDesc = buildVarco3dCanonicalPartDescriptor(wigItem);
    expect(wigDesc.slot).toBe("hair");
    expect(wigDesc.binding.kind).toBe("skinned-transplant");
    expect(wigDesc.binding.targetBone).toBe("head");
    expect(wigDesc.fitting.hideTargetPart).toBe(true);
    expect(wigDesc.source.sha256).toHaveLength(64);
    expect(wigDesc.lods).toHaveLength(2);

    const swordDesc = buildVarco3dCanonicalPartDescriptor(swordItem);
    expect(swordDesc.slot).toBe("accessory");
    expect(swordDesc.binding.kind).toBe("socket");
    expect(swordDesc.binding.targetSocket).toBe("rightHandGrip");
    expect(swordDesc.fitting.hideTargetPart).toBe(false);

    const wingsDesc = buildVarco3dCanonicalPartDescriptor(wingsItem);
    expect(wingsDesc.binding.kind).toBe("rigid-follow");
    expect(wingsDesc.binding.targetBone).toBe("upperChest");
  });

  it("inspects 12-view PBR reconstruction rings across mvImages, mvAlbedo, and mvOrm", () => {
    expect(STUDIO_VARCO3D_12VIEW_CAMERA_RING).toHaveLength(12);

    const albedoFront = inspectVarco3d12ViewReconstructionBundle({
      angle: "front",
      mapFamily: "mvAlbedo",
    });
    expect(albedoFront.ringIndex).toBe(0);
    expect(albedoFront.isSecondaryElevationRing).toBe(false);
    expect(albedoFront.pipelineStageKey).toBe("pipeline:diffuse-to-albedo");
    expect(albedoFront.objectUrl).toBe(
      "https://3d.varco.ai/api/objects/a3f904c1d8824e719c11482055913b00.png",
    );

    const ormBack2 = inspectVarco3d12ViewReconstructionBundle({
      angle: "back2",
      mapFamily: "mvOrm",
    });
    expect(ormBack2.ringIndex).toBe(8);
    expect(ormBack2.isSecondaryElevationRing).toBe(true);
    expect(ormBack2.pipelineStageKey).toBe("pipeline:orm-multiview-generator");
  });

  it("evaluates point policies across task:*, instant:VIBE_WORLD_*, and 16 pipeline:* stages with 30-worker queue limits", () => {
    expect(STUDIO_VARCO3D_POINT_POLICIES).toHaveLength(33);

    const zeroPointRig = evaluateVarco3dPointPolicyReservation({
      targetKey: "task:AI_RIG",
      quantity: 54,
      remainingPoints: 0,
      runningStudioTaskCount: 6,
    });
    expect(zeroPointRig.totalPointCost).toBe(0);
    expect(zeroPointRig.hasSufficientPoints).toBe(true);
    expect(zeroPointRig.errorCode).toBe("OK");
    expect(zeroPointRig.availableParallelSlots).toBe(24);
    expect(zeroPointRig.immediateBatchSize).toBe(24);

    const queueSaturated = evaluateVarco3dPointPolicyReservation({
      targetKey: "task:ANIMATE",
      quantity: 5,
      remainingPoints: 0,
      runningStudioTaskCount: 30,
    });
    expect(queueSaturated.errorCode).toBe("QUEUE_CAPACITY_EXCEEDED");
    expect(queueSaturated.immediateBatchSize).toBe(0);

    const insufficientMesh = evaluateVarco3dPointPolicyReservation({
      targetKey: "task:GENERATE_TEXTURED_MESH",
      quantity: 1,
      remainingPoints: 0,
      runningStudioTaskCount: 0,
    });
    expect(insufficientMesh.errorCode).toBe("INSUFFICIENT_POINT");

    const vibeWorldUnconstrained = evaluateVarco3dPointPolicyReservation({
      targetKey: "instant:VIBE_WORLD_COARSE_MESH",
      quantity: 40,
      remainingPoints: 1000,
      runningStudioTaskCount: 30,
    });
    expect(vibeWorldUnconstrained.errorCode).toBe("OK");
    expect(vibeWorldUnconstrained.immediateBatchSize).toBe(40);
  });

  it("summarizes all 598 baseAnimationList clips across 17 categories and builds mixamo52 retargeting payloads", () => {
    const categorySum = Object.values(STUDIO_VARCO3D_ANIMATION_LIBRARY_SUMMARY.categoryCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(categorySum).toBe(598);
    expect(
      STUDIO_VARCO3D_ANIMATION_LIBRARY_SUMMARY.plusClips +
        STUDIO_VARCO3D_ANIMATION_LIBRARY_SUMMARY.freeClips,
    ).toBe(598);

    const payload = planVarco3dRetargetAnimationTask({
      projectId: "70a90b59-8678-4d35-a5f1-4d1ea39195a7",
      sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24",
      animationFbx: "standing_idle_1",
    });
    expect(payload).toEqual({
      endpoint: "task.animateTask",
      projectId: "70a90b59-8678-4d35-a5f1-4d1ea39195a7",
      sourceTaskId: "58923776-91f0-4b60-a985-835d204f9a24",
      animationFbx: "standing_idle_1",
      inPlaceAnimation: true,
      skeleton: "mixamo52",
      humanoidClass: "HUMANOID_FINGERS",
      pointCost: 0,
    });
  });
});
