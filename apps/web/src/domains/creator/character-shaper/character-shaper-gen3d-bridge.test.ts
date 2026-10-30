import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCharacterSemanticPsd } from "./character-shaper-psd-assembly";
import { isCharacterPsdWorkerRequest } from "./character-shaper-psd-worker-protocol";
import {
  buildShaperGen3dPoseControlSuffix,
  buildShaperGen3dSlotGenerationPlan,
  computeShaperMaterialDataUniforms,
  diagnoseGen3dCreditWalletStatus,
  evaluateVrmGen3dShaperPreflight,
  getShaperGen3dVisualProfile,
  resolveShaperPresetClickModifiers,
  resolveShaperGen3dGeneratedGlbForSlot,
  SHAPER_GEN3D_GENERATED_GLB_CATALOG,
  SHAPER_GEN3D_VISUAL_PROFILES,
} from "./character-shaper-gen3d-bridge";

describe("character-shaper-gen3d-bridge — SHAPER REA × Tripo 3D V3 MCP 리얼 툰 & 파이프라인 브리지", () => {
  it("4종 SHAPER × Tripo 비주얼 프로파일이 MToon·MatCap·주선·Delight 파라미터를 제공한다", () => {
    expect(SHAPER_GEN3D_VISUAL_PROFILES).toHaveLength(4);
    const cel = getShaperGen3dVisualProfile("shaper-cel");
    expect(cel.shadeToonyFactor).toBeGreaterThan(0.9);
    expect(cel.tripoDelight).toBe(true);

    const semiReal = getShaperGen3dVisualProfile("shaper-semi-real");
    expect(semiReal.matcapIntensity).toBeGreaterThan(cel.matcapIntensity);

    const noir = getShaperGen3dVisualProfile("shaper-noir-ink");
    expect(noir.outlineWidthWorld).toBeGreaterThan(cel.outlineWidthWorld);
    expect(noir.rimLightingMix).toBeGreaterThan(0.8);
  });

  it("SHAPER 등신비(5~8등신)를 Tripo V3 5-Ratio T-Pose/A-Pose 제어 접미어로 변환한다", () => {
    const standard7Heads = buildShaperGen3dPoseControlSuffix({
      poseType: "T-Pose",
      headHeads: 7.0,
    });
    expect(standard7Heads.promptSuffix).toBe(", t-pose:1.0:1.0:1.0:1.0:9.0");

    const chibi5Heads = buildShaperGen3dPoseControlSuffix({
      poseType: "A-Pose",
      headHeads: 5.0,
    });
    expect(chibi5Heads.prefix).toBe("a-pose");
    expect(chibi5Heads.headHeightRatio).toBe(1.4);
    expect(chibi5Heads.promptSuffix).toBe(", a-pose:1.4:1.0:1.0:1.0:6.5");
  });

  it("슬롯 성격(전신·의상·소품)에 따라 Tripo V3 모델·SmartSegment·Auto-Rig·Delight 파이프라인을 분기한다", () => {
    const bodyPlan = buildShaperGen3dSlotGenerationPlan({
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

    const outfitPlan = buildShaperGen3dSlotGenerationPlan({
      slot: "outfit",
      prompt: "pleated school blazer",
      visualStyleId: "shaper-romance-soft",
    });
    expect(outfitPlan.scenario).toBe("smart-segment-wearable");
    expect(outfitPlan.smartSegmentVersion).toBe("v2.0-20260430");
    expect(outfitPlan.quadTopology).toBe(true);
    expect(outfitPlan.mcpToolName).toBe("tripo_segment_wearable_parts");

    const propPlan = buildShaperGen3dSlotGenerationPlan({
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
        // 0a708efc 부터 헤어 그룹은 실제 밑색(flat) 위에서만 나누고, Hair Shadow 는 독립 음영 패스가 있을 때만 만든다.
        { id: "flat" as const, width: 4, height: 1, rgba: new Uint8ClampedArray(rgba) },
        { id: "shadow" as const, width: 4, height: 1, rgba: new Uint8ClampedArray(rgba) },
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

  it("SHAPER MaterialData::ApplyShadeLine (0x06000236) 3차 MatCap 램프·반사광·비등방 외곽선(1.5×0.3)·hID*1 헤어 내선 억제를 계산한다", () => {
    const crisp = computeShaperMaterialDataUniforms({
      shadePos: 0.5,
      shadeWidth: 0,
      rLightPos: 0.8,
      rLightWidth: 0.2,
      outlinePressure: true,
      disableHairInline: true,
    });
    expect(crisp.shadeScaleU).toBe(125);
    expect(crisp.shadeOffsetU).toBe(0.5);
    expect(crisp.rLightScaleU).toBeCloseTo(64, 1);
    expect(crisp.outlineWidthScale).toBe(1.5);
    expect(crisp.outlineHeightScale).toBe(0.3);
    expect(crisp.outlineAspectRatio).toBe(5);
    expect(crisp.hairShaderVariant).toBe("simpleDisableInlineMatCapShader");
    expect(crisp.summaryLabel).toContain("hID*1 무내선");

    const soft = computeShaperMaterialDataUniforms({
      shadePos: 0.3,
      shadeWidth: 0.6,
      outlinePressure: false,
      disableHairInline: false,
    });
    expect(soft.shadeScaleU).toBeCloseTo(8, 1);
    expect(soft.outlineWidthScale).toBe(1);
    expect(soft.outlineHeightScale).toBe(1);
    expect(soft.hairShaderVariant).toBe("simpleMatCapShader");
    expect(soft.summaryLabel).toContain("헤어 내선 활성");
  });

  it("vrm-toolkit (vrm_validate) 예산(70k tris · 16 mats · 4096px · 53 humanoid bones)과 Tripo v3.5 Delight 프리플라이트를 진단한다", () => {
    const sReport = evaluateVrmGen3dShaperPreflight({
      humanoidReady: true,
      mappedBoneCount: 53,
      hasEyeGazeBones: true,
      triangleCount: 38_400,
      materialCount: 8,
      maxTextureDimension: 2048,
      tripoDelightApplied: true,
    });
    expect(sReport.passed).toBe(true);
    expect(sReport.grade).toBe("S");
    expect(sReport.checks).toHaveLength(6);

    const overBudget = evaluateVrmGen3dShaperPreflight({
      humanoidReady: false,
      mappedBoneCount: 0,
      triangleCount: 95_000,
      materialCount: 22,
    });
    expect(overBudget.passed).toBe(false);
    expect(overBudget.grade).toBe("C");
  });

  it("Tripo Studio H3.1/P2.0 (브라우저 CDP 제어 · 무료 체험 전량 소진) + tripo3d MCP (Blender 5.2) + glbforge MCP로 생성·최적화·검증된 실물 3D GLB 에셋 8종이 디스크에 존재하고 glTF 2.0 헤더·SHA256·watertight 예산을 만족한다", () => {
    expect(SHAPER_GEN3D_GENERATED_GLB_CATALOG).toHaveLength(8);
    const repoRoot = resolve(__dirname, "../../../../../..");
    for (const asset of SHAPER_GEN3D_GENERATED_GLB_CATALOG) {
      const fullPath = resolve(repoRoot, asset.relativeDiskPath);
      const buf = readFileSync(fullPath);
      expect(buf.byteLength).toBe(asset.byteLength);
      expect(buf.subarray(0, 4).toString("ascii")).toBe("glTF");
      expect(buf.readUInt32LE(4)).toBe(2);
      const sha256 = createHash("sha256").update(buf).digest("hex");
      expect(sha256).toBe(asset.sha256);
      expect(asset.watertight).toBe(true);
      expect(asset.originAt).toBe("base-center");
      expect(asset.triangles).toBeGreaterThan(1000);
    }

    expect(resolveShaperGen3dGeneratedGlbForSlot("body").id).toBe("tripo-studio-h31-webtoon-character");
    expect(resolveShaperGen3dGeneratedGlbForSlot("pose").id).toBe("tripo-studio-h31-rigged-character");
    expect(resolveShaperGen3dGeneratedGlbForSlot("outfit").id).toBe("tripo-studio-h31-segmented-outfit");
    expect(resolveShaperGen3dGeneratedGlbForSlot("face").id).toBe("tripo-studio-p2-quad-head-bust");
    expect(resolveShaperGen3dGeneratedGlbForSlot("hair").id).toBe("shaper-cel-head-bust");
    expect(resolveShaperGen3dGeneratedGlbForSlot("prop").id).toBe("tripo-studio-h31-knight-crest");
    expect(resolveShaperGen3dGeneratedGlbForSlot("accessory").id).toBe("shaper-academy-crest-shield");
  });

  it("Tripo OpenAPI 지갑(platform.tripo3d.ai/billing) 잔액 0(code 2010)과 웹 스튜디오(studio.tripo3d.ai) 무료 체험 전량 소진(remaining: 0 · 25,200 → 24,375 cr) 상태를 진단하고 실물 GLB 에셋을 반환한다", () => {
    const emptyWallet = diagnoseGen3dCreditWalletStatus({
      openApiBalance: 0,
      openApiFrozen: 0,
      slot: "prop",
    });
    expect(emptyWallet.status).toBe("openapi_wallet_empty_fallback_blender_mcp");
    expect(emptyWallet.errorCode).toBe(2010);
    expect(emptyWallet.webStudioBalance).toBe(24_375);
    expect(emptyWallet.freeTrialRemaining).toBe(0);
    expect(emptyWallet.freeTrialPoolsExhausted).toBe(true);
    expect(emptyWallet.badgeKo).toContain("무료 체험 전량 소진");
    expect(emptyWallet.badgeKo).toContain("24,375 cr");
    expect(emptyWallet.reasonKo).toContain("studio.tripo3d.ai");
    expect(emptyWallet.reasonKo).toContain("platform.tripo3d.ai/billing");
    expect(emptyWallet.fallbackAsset.id).toBe("tripo-studio-h31-knight-crest");

    const activeWallet = diagnoseGen3dCreditWalletStatus({
      openApiBalance: 2400,
      openApiFrozen: 0,
      slot: "hair",
    });
    expect(activeWallet.status).toBe("openapi_ready");
    expect(activeWallet.errorCode).toBeNull();
    expect(activeWallet.badgeKo).toContain("2,400 cr");
  });
});
