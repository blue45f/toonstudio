import { describe, expect, it } from "vitest";

import { buildCharacterSemanticPsd } from "./character-shaper-psd-assembly";
import { isCharacterPsdWorkerRequest } from "./character-shaper-psd-worker-protocol";
import {
  buildShaperTripoPoseControlSuffix,
  buildShaperTripoSlotGenerationPlan,
  getShaperTripoVisualProfile,
  resolveShaperPresetClickModifiers,
  SHAPER_TRIPO_VISUAL_PROFILES,
} from "./character-shaper-tripo-mcp";

describe("character-shaper-tripo-mcp — SHAPER REA × Tripo 3D V3 MCP 리얼 툰 & 파이프라인 브리지", () => {
  it("4종 SHAPER × Tripo 비주얼 프로파일이 MToon·MatCap·주선·Delight 파라미터를 제공한다", () => {
    expect(SHAPER_TRIPO_VISUAL_PROFILES).toHaveLength(4);
    const cel = getShaperTripoVisualProfile("shaper-cel");
    expect(cel.shadeToonyFactor).toBeGreaterThan(0.9);
    expect(cel.tripoDelight).toBe(true);

    const semiReal = getShaperTripoVisualProfile("shaper-semi-real");
    expect(semiReal.matcapIntensity).toBeGreaterThan(cel.matcapIntensity);

    const noir = getShaperTripoVisualProfile("shaper-noir-ink");
    expect(noir.outlineWidthWorld).toBeGreaterThan(cel.outlineWidthWorld);
    expect(noir.rimLightingMix).toBeGreaterThan(0.8);
  });

  it("SHAPER 등신비(5~8등신)를 Tripo V3 5-Ratio T-Pose/A-Pose 제어 접미어로 변환한다", () => {
    const standard7Heads = buildShaperTripoPoseControlSuffix({
      poseType: "T-Pose",
      headHeads: 7.0,
    });
    expect(standard7Heads.promptSuffix).toBe(", t-pose:1.0:1.0:1.0:1.0:9.0");

    const chibi5Heads = buildShaperTripoPoseControlSuffix({
      poseType: "A-Pose",
      headHeads: 5.0,
    });
    expect(chibi5Heads.prefix).toBe("a-pose");
    expect(chibi5Heads.headHeightRatio).toBe(1.4);
    expect(chibi5Heads.promptSuffix).toBe(", a-pose:1.4:1.0:1.0:1.0:6.5");
  });

  it("슬롯 성격(전신·의상·소품)에 따라 Tripo V3 모델·SmartSegment·Auto-Rig·Delight 파이프라인을 분기한다", () => {
    const bodyPlan = buildShaperTripoSlotGenerationPlan({
      slot: "body",
      prompt: "academy protagonist",
      visualStyleId: "shaper-cel",
    });
    expect(bodyPlan.scenario).toBe("webtoon-character");
    expect(bodyPlan.modelVersion).toBe("v3.1-20260211");
    expect(bodyPlan.textureModelVersion).toBe("v3.5-20260815");
    expect(bodyPlan.textureDelight).toBe(true);
    expect(bodyPlan.autoRigVersion).toBe("v3.0-20260909");
    expect(bodyPlan.rigSpec).toBe("vrm");
    expect(bodyPlan.mcpToolName).toBe("tripo_generate_character_vrm");

    const outfitPlan = buildShaperTripoSlotGenerationPlan({
      slot: "outfit",
      prompt: "pleated school blazer",
      visualStyleId: "shaper-romance-soft",
    });
    expect(outfitPlan.scenario).toBe("smart-segment-wearable");
    expect(outfitPlan.smartSegmentVersion).toBe("v2.0-20260430");
    expect(outfitPlan.quadTopology).toBe(true);
    expect(outfitPlan.mcpToolName).toBe("tripo_segment_wearable_parts");

    const propPlan = buildShaperTripoSlotGenerationPlan({
      slot: "prop",
      prompt: "ornate rapier sword",
      visualStyleId: "shaper-noir-ink",
    });
    expect(propPlan.scenario).toBe("webtoon-prop");
    expect(propPlan.modelVersion).toBe("P2-20260801");
    expect(propPlan.autoRigVersion).toBeNull();
    expect(propPlan.quadTopology).toBe(true);
    expect(propPlan.smartLowPoly).toBe(true);
    expect(propPlan.mcpToolName).toBe("tripo_generate_prop_glb");
  });

  it("SHAPER UIItemSlot 수정자 클릭(Ctrl+클릭 색상 유지 / Alt+클릭 포즈 좌우 반전)을 판별한다", () => {
    expect(resolveShaperPresetClickModifiers({})).toEqual({
      preserveColor: false,
      mirrorPose: false,
      badgeLabel: null,
    });
    expect(resolveShaperPresetClickModifiers({ ctrlKey: true })).toEqual({
      preserveColor: true,
      mirrorPose: false,
      badgeLabel: "Ctrl+클릭: 현재 색상 유지",
    });
    expect(resolveShaperPresetClickModifiers({ altKey: true })).toEqual({
      preserveColor: false,
      mirrorPose: true,
      badgeLabel: "Alt+클릭: 포즈 좌우 반전",
    });
  });

  it("PSD Worker 프로토콜이 createHairLayer 및 extractLuminanceOutline 옵션을 검증하고 레이어에 반영한다", () => {
    const rgba = new Uint8ClampedArray([
      40, 60, 80, 255,
      100, 120, 140, 255,
      200, 210, 220, 255,
      0, 0, 0, 0,
    ]);
    const validRequest = {
      version: 1 as const,
      kind: "assemble" as const,
      requestId: 7,
      title: "shaper-psd",
      createHairLayer: true,
      extractLuminanceOutline: true,
      passes: [
        { id: "beauty" as const, width: 4, height: 1, rgba: new Uint8ClampedArray(rgba) },
        { id: "mask-hair" as const, width: 4, height: 1, rgba: new Uint8ClampedArray(rgba) },
        { id: "line" as const, width: 4, height: 1, rgba: new Uint8ClampedArray(rgba) },
      ],
      skipped: [],
    };
    expect(isCharacterPsdWorkerRequest(validRequest)).toBe(true);
    expect(
      isCharacterPsdWorkerRequest({
        ...validRequest,
        createHairLayer: "invalid" as unknown as boolean,
      }),
    ).toBe(false);

    const assembled = buildCharacterSemanticPsd(validRequest.passes, [], {
      title: validRequest.title,
      createHairLayer: validRequest.createHairLayer,
      extractLuminanceOutline: validRequest.extractLuminanceOutline,
    });
    expect(assembled.receipt.layerNames).toContain("헤어 (SHAPER 3-Layer)");
    expect(assembled.receipt.layerNames).toContain("Hair Base");
    expect(assembled.receipt.layerNames).toContain("Hair Shadow");
    expect(assembled.receipt.layerNames).toContain("Hair Line");
  });
});
