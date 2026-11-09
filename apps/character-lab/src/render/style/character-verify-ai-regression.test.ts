import { describe, expect, it } from "vitest";

import { createDefaultRecipe, shadingProfileSchema } from "../../contracts";
import { computeShaperSelectionOutlineEffect } from "../outline-policy";
import { buildLabShaperGen3dPipelineSpec } from "../shaper-gen3d-bridge";
import {
  applyShaperSymmetricEyeballTransform,
  decompressShaperRadianceRleScanline,
} from "../toon-reference";

import {
  evaluateCharacterLabVerifyAiGate,
  expandCharacterLabFreshLensDraft,
} from "./character-verify-ai-fresh-ideas";

describe("character-verify-ai-regression (입력 경계·실패 상태·5-Lens Mode A/B 회귀 검증)", () => {
  it("PBR·무외곽선·SDF 비활성·Delight OFF 조합에서 overallScore100 < 85로 HOLD 실패 상태를 반환한다", () => {
    const baseShading = createDefaultRecipe().shading;
    const report = evaluateCharacterLabVerifyAiGate({
      shading: {
        ...baseShading,
        mode: "pbr",
        toon: {
          ...baseShading.toon,
          faceSdfShadow: false,
          outline: "none",
          rim: false,
          outlinePressure: false,
        },
      },
      lookId: "shaper-cel",
      delight: false,
      disableHairInline: false,
    });

    expect(report.turnaroundConsistencyScore100).toBe(85.9);
    expect(report.facialSdfCleanScore100).toBe(81);
    expect(report.silhouetteReadabilityScore100).toBe(80);
    expect(report.outlineAnisotropyScore100).toBe(76);
    expect(report.overallScore100).toBe(84.13);
    expect(report.passed).toBe(false);
    expect(report.summaryBadgeKo).toContain("Character Verify AI HOLD");
  });

  it("headUnits 및 ibl.intensity 입력 경계(범위 밖·NaN·Infinity)를 안전하게 클램프해 스키마 유효성을 보장한다", () => {
    const shading = createDefaultRecipe().shading;
    const low = evaluateCharacterLabVerifyAiGate({
      shading: { ...shading, ibl: { ...shading.ibl, intensity: Number.NaN } },
      lookId: "shaper-cel",
      headUnits: 3.2,
    });
    const high = evaluateCharacterLabVerifyAiGate({
      shading: { ...shading, ibl: { ...shading.ibl, intensity: 9.5 } },
      lookId: "shaper-cel",
      headUnits: 12.0,
    });
    const nan = evaluateCharacterLabVerifyAiGate({
      shading,
      lookId: "shaper-cel",
      headUnits: Number.NaN,
    });

    expect(low.remixes[0]?.angleKo).toContain("5.0등신");
    expect(low.recommendedShadingPatch.ibl?.intensity).toBe(1.15);
    expect(high.remixes[0]?.angleKo).toContain("8.5등신");
    expect(high.recommendedShadingPatch.ibl?.intensity).toBe(4);
    expect(nan.remixes[0]?.angleKo).toContain("7.0등신");

    const mergedLow = {
      ...shading,
      ...low.recommendedShadingPatch,
      ibl: { ...shading.ibl, ...low.recommendedShadingPatch.ibl },
      toon: { ...shading.toon, ...low.recommendedShadingPatch.toon },
    };
    expect(shadingProfileSchema.safeParse(mergedLow).success).toBe(true);

    const specInf = buildLabShaperGen3dPipelineSpec({
      lookId: "shaper-cel",
      headUnits: Number.POSITIVE_INFINITY,
    });
    expect(specInf.poseControlSuffix).toBe(", t-pose:1.0:1.0:1.0:1.0:9.0");
  });

  it("5-Lens Mode A(remixHeaderKo·3-Beat 스토리·4단계 Playbook) 및 Mode B(expandCharacterLabFreshLensDraft)를 검증한다", () => {
    const report = evaluateCharacterLabVerifyAiGate({
      shading: createDefaultRecipe().shading,
      lookId: "shaper-romance-soft",
      headUnits: 7.5,
    });

    expect(report.remixHeaderKo).toContain("💡 Remix: Character Labs");
    expect(report.remixHeaderKo).toContain("Sources used:");
    const storyLens = report.remixes.find((r) => r.id === "personal-story-angle");
    expect(storyLens?.angleKo).toContain("(1) Setup:");
    expect(storyLens?.angleKo).toContain("(2) Friction:");
    expect(storyLens?.angleKo).toContain("(3) Lesson:");

    const playbookLens = report.remixes.find((r) => r.id === "practical-playbook");
    expect(playbookLens?.actionableStepsKo).toHaveLength(4);

    for (const remix of report.remixes) {
      const draft = expandCharacterLabFreshLensDraft(report, remix.id);
      expect(draft.id).toBe(remix.id);
      expect(draft.headlineKo).toBe(remix.titleKo);
      expect(draft.bodyParagraphsKo.length).toBeGreaterThanOrEqual(3);
      expect(draft.keyTakeawayKo).toContain("Character Verify AI");
    }
  });

  it("computeShaperSelectionOutlineEffect: NaN·비유한 입력이 들어와도 기본값으로 복구해 유한한 수치를 유지한다", () => {
    const out = computeShaperSelectionOutlineEffect({
      lineThickness: Number.NaN,
      lineIntensity: Number.POSITIVE_INFINITY,
      fillAmount: Number.NEGATIVE_INFINITY,
      viewportHeightPx: Number.NaN,
    });

    expect(Number.isFinite(out.effectiveLineThickness)).toBe(true);
    expect(out.effectiveLineThickness).toBe(1.25);
    expect(out.lineIntensity).toBe(0.5);
    expect(out.fillAmount).toBe(0.2);
  });

  it("decompressShaperRadianceRleScanline: 헤더 손상·폭 불일치·EOF·런 길이 초과 입력을 모두 거부한다", () => {
    expect(() => decompressShaperRadianceRleScanline(new Uint8Array([2, 2, 0, 4]), 4)).toThrow(
      "Invalid Radiance HDR RLE scanline header",
    );
    expect(() => decompressShaperRadianceRleScanline(new Uint8Array([2, 2, 0, 8]), 16)).toThrow(
      "Radiance RLE scanline width mismatch: expected 16, got 8",
    );
    expect(() => decompressShaperRadianceRleScanline(new Uint8Array([2, 2, 0, 8, 136, 100]), 8)).toThrow(
      "Unexpected EOF in Radiance HDR RLE stream",
    );
    expect(() => decompressShaperRadianceRleScanline(new Uint8Array([2, 2, 0, 8, 137, 100]), 8)).toThrow(
      "Invalid run length in Radiance HDR RLE stream",
    );
    expect(() => decompressShaperRadianceRleScanline(new Uint8Array([2, 2, 0, 8, 0, 100]), 8)).toThrow(
      "Invalid literal run in Radiance HDR RLE stream",
    );
  });

  it("applyShaperSymmetricEyeballTransform: selectEyeball=0/2 및 symmetryControl=false 경계를 보존한다", () => {
    const base = {
      leftEyeball: {
        position: [-0.3, 1.5, 0.2] as const,
        eulerDeg: [0, 0, 0] as const,
        localScale: [1, 1, 1] as const,
      },
      rightEyeball: {
        position: [0.3, 1.5, 0.2] as const,
        eulerDeg: [0, 0, 0] as const,
        localScale: [1, 1, 1] as const,
      },
    };

    const noop = applyShaperSymmetricEyeballTransform({
      ...base,
      selectEyeball: 0,
      symmetryControl: true,
      nextTransform: { position: [-0.5, 2.0, 0.5] },
    });
    expect(noop.leftEyeball.position).toEqual([-0.3, 1.5, 0.2]);
    expect(noop.rightEyeball.position).toEqual([0.3, 1.5, 0.2]);

    const rightMirrored = applyShaperSymmetricEyeballTransform({
      ...base,
      selectEyeball: 2,
      symmetryControl: true,
      nextTransform: { position: [0.35, 1.55, 0.25], eulerDeg: [4, 10, -2] },
    });
    expect(rightMirrored.rightEyeball.position).toEqual([0.35, 1.55, 0.25]);
    expect(rightMirrored.leftEyeball.position).toEqual([-0.35, 1.55, 0.25]);
    expect(rightMirrored.leftEyeball.eulerDeg).toEqual([4, -10, -2]);
  });
});
