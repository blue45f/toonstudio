import { describe, expect, it } from "vitest";

import {
  ARKIT_52_BLENDSHAPE_NAMES,
  compositeSkinSurfaceStack,
  evaluateEffectiveLayerOpacities,
  generateKoreanEnglishLipSyncTrack,
  remapArkit52ToVrmAndArtMesh,
  sampleLipSyncTrackAtTime,
  VRM_PROCEDURAL_SKIN_SCHEMA_VERSION,
  type ProceduralSkinSurfaceStack,
} from "./studio-vrm-procedural-skin-stack";

function createTestSkinStack(): ProceduralSkinSurfaceStack {
  return {
    version: VRM_PROCEDURAL_SKIN_SCHEMA_VERSION,
    characterId: "char-hana",
    layers: [
      {
        id: "base",
        name: "기본 피부 톤",
        kind: "base-skin",
        visible: true,
        opacity: 1,
        blendMode: "normal",
        colorRgb: [0.96, 0.85, 0.78],
      },
      {
        id: "blush-shy",
        name: "수줍음 볼 홍조",
        kind: "decal",
        decalSubkind: "blush",
        visible: true,
        opacity: 0.05,
        blendMode: "multiply",
        colorRgb: [0.95, 0.42, 0.46],
        uvRect: [0.25, 0.35, 0.75, 0.65],
        expressionLinks: [{ expressionKey: "shy", minWeight: 0.1, maxWeight: 0.9, gain: 0.85 }],
      },
      {
        id: "grain",
        name: "미세 하프톤 입자",
        kind: "micro-grain",
        visible: true,
        opacity: 0.12,
        blendMode: "soft-light",
        colorRgb: [0.7, 0.6, 0.55],
        density: 0.4,
        seed: 42,
      },
    ],
  };
}

describe("studio-vrm-procedural-skin-stack", () => {
  it("표정 가중치(shy) 상승 시 홍조 데칼 불투명도와 합성 버퍼 적색 채도가 비파괴 연동 증가한다", () => {
    const stack = createTestSkinStack();
    const calmOpacities = evaluateEffectiveLayerOpacities(stack, { shy: 0 });
    const shyOpacities = evaluateEffectiveLayerOpacities(stack, { shy: 0.85 });

    expect(calmOpacities["blush-shy"]).toBeCloseTo(0.05, 4);
    expect(shyOpacities["blush-shy"]!).toBeGreaterThan(0.75);

    const calmTex = compositeSkinSurfaceStack(stack, { shy: 0 }, 32, 32);
    const shyTex = compositeSkinSurfaceStack(stack, { shy: 0.85 }, 32, 32);

    // 볼 중앙(16, 16)에서 multiply 홍조가 적용되어 녹색/청색 채널이 뚜렷하게 낮아짐(붉은기 강화)
    const centerOff = (16 * 32 + 16) * 4;
    expect(shyTex[centerOff + 1]!).toBeLessThan(calmTex[centerOff + 1]! - 20);
    expect(shyTex[centerOff + 2]!).toBeLessThan(calmTex[centerOff + 2]! - 20);
  });

  it("정확히 52개 공식 ARKit 채널을 보정해 VRM 1.0과 2D ArtMesh 표정으로 동시 리매핑한다", () => {
    expect(ARKIT_52_BLENDSHAPE_NAMES.length).toBe(52);
    expect(new Set(ARKIT_52_BLENDSHAPE_NAMES).size).toBe(52);

    const frame = remapArkit52ToVrmAndArtMesh(
      {
        mouthSmileLeft: 0.9,
        mouthSmileRight: 0.85,
        cheekSquintLeft: 0.6,
        cheekSquintRight: 0.6,
        jawOpen: 0.75,
        eyeBlinkLeft: 0.95,
        eyeBlinkRight: 0.01, // 데드존(0.02) 이하 -> 0 억제
      },
      { jawOpen: { sensitivity: 1.2, gamma: 0.9 } },
    );

    expect(Object.keys(frame.arkit52).length).toBe(52);
    expect(frame.vrm10.happy).toBeGreaterThan(0.7);
    expect(frame.vrm10.aa).toBeGreaterThan(0.7);
    expect(frame.vrm10.blinkLeft).toBeGreaterThan(0.9);
    expect(frame.vrm10.blinkRight).toBe(0);
    expect(frame.artMesh2d.mouthOpenY).toBeGreaterThan(0.7);
    expect(frame.artMesh2d.eyeOpenL).toBeLessThan(0.15);
    expect(frame.artMesh2d.eyeOpenR).toBeCloseTo(1, 3);
  });

  it("한국어 자모·영문 음소 분해 립싱크가 양순음(ㅁ/ㅂ/M/P) 닫힘과 선행 조음 스무딩을 재현한다", () => {
    // "바보 mama" -> 양순음(ㅂ/ㅁ)과 모음(ㅏ/ㅗ/a)이 교차
    const track = generateKoreanEnglishLipSyncTrack("바보 mama", 1.4, {
      audioRmsEnvelope: [0.8, 0.9, 0.7, 0.85, 0.9, 0.8],
      coArticulationLeadSec: 0.05,
      coArticulationTrailSec: 0.05,
    });

    const mbpKeys = track.keyframes.filter((k) => k.viseme === "mbp");
    const aaKeys = track.keyframes.filter((k) => k.viseme === "aa");
    const ohKeys = track.keyframes.filter((k) => k.viseme === "oh");

    expect(mbpKeys.length).toBeGreaterThanOrEqual(4);
    expect(aaKeys.length).toBeGreaterThanOrEqual(3);
    expect(ohKeys.length).toBeGreaterThanOrEqual(1);

    // 양순음 정중앙 시점에서는 입술 닫힘(mouthClose)이 높고 입 벌림(mouthOpenY)은 낮아야 함
    const firstMbp = mbpKeys[0]!;
    const atMbp = sampleLipSyncTrackAtTime(track, firstMbp.timeSec + firstMbp.durationSec * 0.5);
    expect(atMbp.mouthClose).toBeGreaterThan(0.7);
    expect(atMbp.mouthOpenY).toBeLessThan(0.25);

    // 모음 정중앙 시점에서는 모음 비젬(aa)과 mouthOpenY가 크게 열려야 함
    const firstAa = aaKeys[0]!;
    const atAa = sampleLipSyncTrackAtTime(track, firstAa.timeSec + firstAa.durationSec * 0.5);
    expect(atAa.aa).toBeGreaterThan(0.5);
    expect(atAa.mouthOpenY).toBeGreaterThan(0.5);
  });
});
