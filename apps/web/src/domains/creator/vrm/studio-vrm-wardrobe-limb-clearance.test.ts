import { describe, expect, it } from "vitest";

import { buildStudioVrmGarmentFitInputSignature } from "./studio-vrm-garment-fit";
import {
  buildLimbSegmentProfile,
  type LimbProfileSample,
  type LimbProfiles,
  type LimbSegmentId,
} from "./studio-vrm-limb-profile";
import {
  FALLBACK_WARDROBE_METRICS,
  buildGarmentParts,
  createWardrobeEquip,
  measuredLimbClearanceM,
  sanitizeWardrobeMetrics,
  type GarmentPart,
  type WardrobeMetrics,
} from "./studio-vrm-wardrobe";

/** 세그먼트마다 일정 반경으로 잰 합성 체형. 뼈 길이는 폴백과 같고 둘레만 다르다. */
function measuredLimbs(radiusBySegment: Partial<Record<LimbSegmentId, number>>): LimbProfiles {
  const segment = (radiusM: number | undefined) => {
    if (radiusM === undefined) return null;
    const samples: LimbProfileSample[] = [];
    for (let ring = 0; ring < 4; ring += 1) {
      for (let index = 0; index < 8; index += 1) {
        samples.push({ s: (ring + 0.5) / 4, radialM: radiusM });
      }
    }
    const profile = buildLimbSegmentProfile(samples);
    if (!profile) throw new Error("fixture limb profile must measure");
    return profile;
  };
  const side = () => ({
    upperArm: segment(radiusBySegment.upperArm),
    lowerArm: segment(radiusBySegment.lowerArm),
    upperLeg: segment(radiusBySegment.upperLeg),
    lowerLeg: segment(radiusBySegment.lowerLeg),
  });
  return { left: side(), right: side() };
}

function metricsWith(radiusBySegment: Partial<Record<LimbSegmentId, number>>): WardrobeMetrics {
  return sanitizeWardrobeMetrics({
    ...FALLBACK_WARDROBE_METRICS,
    limbs: measuredLimbs(radiusBySegment),
  });
}

function sleeveRadius(parts: readonly GarmentPart[], bone: string): number {
  const part = parts.find((candidate) => candidate.bone === bone && candidate.shape.kind === "cylinder");
  if (!part || part.shape.kind !== "cylinder") throw new Error(`sleeve missing for ${bone}`);
  return Math.min(part.shape.rTop, part.shape.rBottom);
}

describe("워드로브 부위별 실측 클리어런스", () => {
  it("실측이 없으면 기존 뼈 길이 재단과 완전히 같다(폴백 불변)", () => {
    for (const itemId of ["tshirt", "blazer", "jeans", "longboots"]) {
      expect(buildGarmentParts(itemId, FALLBACK_WARDROBE_METRICS))
        .toEqual(buildGarmentParts(itemId, sanitizeWardrobeMetrics({ ...FALLBACK_WARDROBE_METRICS, limbs: null })));
    }
  });

  it("팔 둘레가 굵어지면(체형·모프 변경) 소매 반경이 자동으로 커진다", () => {
    const slim = sleeveRadius(buildGarmentParts("blazer", metricsWith({ upperArm: 0.04 })), "leftUpperArm");
    const bulky = sleeveRadius(buildGarmentParts("blazer", metricsWith({ upperArm: 0.075 })), "leftUpperArm");
    expect(bulky).toBeGreaterThan(slim);
    expect(bulky - slim).toBeCloseTo(0.035, 6);
  });

  it("전완·허벅지·종아리는 자기 세그먼트 실측을 따른다 — 윗팔 실측에 끌려가지 않는다", () => {
    const metrics = metricsWith({ upperArm: 0.04, lowerArm: 0.06, upperLeg: 0.05, lowerLeg: 0.055 });
    const parts = buildGarmentParts("jeans", metrics);
    expect(sleeveRadius(parts, "leftUpperLeg")).toBeGreaterThan(0.05);
    expect(sleeveRadius(parts, "leftLowerLeg")).toBeGreaterThan(0.055);
    const blazer = buildGarmentParts("blazer", metrics);
    expect(sleeveRadius(blazer, "leftLowerArm")).toBeGreaterThan(0.06);
  });

  it("fit을 최소로 줄여도 소매는 실측 표면 바깥에 남는다 — 줄어드는 것은 여유분뿐", () => {
    const metrics = metricsWith({ upperArm: 0.07 });
    const tightest = sleeveRadius(buildGarmentParts("tshirt", metrics, 0.8), "leftUpperArm");
    expect(tightest).toBeGreaterThan(0.07);
  });

  it("실측 클리어런스는 몸이 굵어져도 일정하게 유지된다(여유 = 재단 − 실측 몸)", () => {
    const slim = measuredLimbClearanceM("blazer", metricsWith({ upperArm: 0.04, lowerArm: 0.03 }));
    const bulky = measuredLimbClearanceM("blazer", metricsWith({ upperArm: 0.08, lowerArm: 0.06 }));
    expect(slim).not.toBeNull();
    expect(bulky).not.toBeNull();
    expect(slim!).toBeGreaterThan(0);
    expect(bulky!).toBeCloseTo(slim!, 6);
  });

  it("실측이 없으면 클리어런스도 없다고 정직하게 말한다", () => {
    expect(measuredLimbClearanceM("blazer", FALLBACK_WARDROBE_METRICS)).toBeNull();
  });

  it("부츠 샤프트는 종아리 실측 둘레를 따른다", () => {
    const thin = sleeveRadius(buildGarmentParts("longboots", metricsWith({ lowerLeg: 0.04 })), "leftLowerLeg");
    const thick = sleeveRadius(buildGarmentParts("longboots", metricsWith({ lowerLeg: 0.075 })), "leftLowerLeg");
    expect(thick).toBeGreaterThan(thin);
    expect(thick).toBeGreaterThan(0.075);
  });

  it("둘레 실측이 바뀌면 핏 입력 서명이 바뀐다 — 이전 체형의 핏 리포트가 재사용되지 않는다", () => {
    const equip = createWardrobeEquip("blazer");
    if (!equip) throw new Error("blazer equip must exist");
    const wardrobe = { outer: equip };
    const before = buildStudioVrmGarmentFitInputSignature(wardrobe, metricsWith({ upperArm: 0.04 }));
    const after = buildStudioVrmGarmentFitInputSignature(wardrobe, metricsWith({ upperArm: 0.08 }));
    expect(after).not.toBe(before);
    expect(after.startsWith("garfit4:")).toBe(true);
  });
});
