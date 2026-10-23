import { describe, expect, it } from "vitest";

import { getWebtoonPosePresetById } from "./studio-3d-advanced-poses-library";
import {
  STUDIO_MANNEQUIN_BODY_PRESETS,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  buildStudioMannequinSpec,
} from "./studio-mannequin-model";
import {
  STUDIO_MANNEQUIN_FLOOR_CONTACT_TOLERANCE_M,
  measureStudioMannequinBodyFloor,
} from "./studio-mannequin-pose-ground-contact";
import {
  STUDIO_MANNEQUIN_POSE_PRESETS,
  findStudioMannequinPosePreset,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  isStudioMannequinDuoPreset,
  resolveStudioMannequinLibraryPresetPose,
  resolveStudioMannequinWebtoonPresetPose,
} from "./studio-mannequin-preset-application";
import { resolveWebtoonPresetGroundSpec } from "./studio-webtoon-pose-mannequin-adapter";

const BODIES = ["neutral", "chibi3", "fantasyGiant"] as const;

function lowestOn(bodyId: (typeof BODIES)[number], pose: StudioMannequinPose): number {
  return measureStudioMannequinBodyFloor(
    buildStudioMannequinSpec(STUDIO_MANNEQUIN_BODY_PRESETS[bodyId].params),
    pose,
  ).lowestY;
}

describe("포즈 프리셋 적용 계산(B-03 적용 시점 접지)", () => {
  it("2인 프리셋을 구분한다", () => {
    expect(isStudioMannequinDuoPreset({ id: "couple-hug-front", figures: 2 })).toBe(true);
    // 구도 표에 있는 웹툰 2인 포즈는 figures 가 없어도 2인이다.
    expect(isStudioMannequinDuoPreset({ id: "dramatic-wall-slam-kabe-don" })).toBe(true);
    expect(isStudioMannequinDuoPreset({ id: "run" })).toBe(false);
  });

  it("발로 선 프리셋은 어느 체형에서든 최저점이 바닥(y=0)에 정확히 닿는다", () => {
    const run = findStudioMannequinPosePreset("run");
    if (!run) throw new Error("run 프리셋이 없다");
    // 저작 골반 높이 그대로면 기본 체형에서도 바닥에서 크게 뜬다(회귀 기준).
    expect(lowestOn("neutral", normalizeStudioMannequinPose(run.pose))).toBeGreaterThan(0.1);
    for (const body of BODIES) {
      const params = STUDIO_MANNEQUIN_BODY_PRESETS[body].params;
      const pose = resolveStudioMannequinLibraryPresetPose(run, params, normalizeStudioMannequinPose({}));
      expect(Math.abs(lowestOn(body, pose)), body).toBeLessThan(1e-5);
    }
  });

  it("공중 프리셋은 체형의 두신 단위 간격만큼 띄운다", () => {
    const jump = findStudioMannequinPosePreset("jump");
    if (!jump?.ground) throw new Error("jump 프리셋의 지지 정보가 없다");
    const clearanceHeads = jump.ground.clearanceHeads ?? 0;
    expect(clearanceHeads).toBeGreaterThan(0);
    for (const body of BODIES) {
      const params = STUDIO_MANNEQUIN_BODY_PRESETS[body].params;
      const pose = resolveStudioMannequinLibraryPresetPose(jump, params, normalizeStudioMannequinPose({}));
      const expected = clearanceHeads * buildStudioMannequinSpec(params).headUnit;
      expect(lowestOn(body, pose), body).toBeCloseTo(expected, 4);
    }
  });

  it("손 전용 프리셋은 몸 포즈·골반 높이를 그대로 두고 손만 바꾼다", () => {
    const hand = STUDIO_MANNEQUIN_POSE_PRESETS.find((preset) => preset.id === "hand-thumbs-up");
    const kneel = findStudioMannequinPosePreset("kneel");
    if (!hand || !kneel) throw new Error("프리셋이 없다");
    const body = resolveStudioMannequinLibraryPresetPose(kneel, STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS, normalizeStudioMannequinPose({}));
    const withHand = resolveStudioMannequinLibraryPresetPose(hand, STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS, body);
    expect(withHand.pelvisOffset).toEqual(body.pelvisOffset);
    for (const jointId of ["spine", "leftUpperLeg", "rightLowerLeg", "leftUpperArm"] as const) {
      expect(withHand.joints[jointId]).toEqual(body.joints[jointId]);
    }
    expect(withHand).not.toEqual(body);
  });

  it("웹툰 프리셋은 정본 지지 방식대로 선언한 접촉이 SD 체형에서도 바닥에 닿는다", () => {
    const preset = getWebtoonPosePresetById("dramatic-kneeling-despair");
    if (!preset) throw new Error("웹툰 무릎 프리셋이 없다");
    const ground = resolveWebtoonPresetGroundSpec(preset);
    expect(ground.support).toBe("kneeling");
    for (const body of ["neutral", "chibi4"] as const) {
      const params = STUDIO_MANNEQUIN_BODY_PRESETS[body].params;
      const pose = resolveStudioMannequinWebtoonPresetPose(preset, params);
      const report = measureStudioMannequinBodyFloor(buildStudioMannequinSpec(params), pose);
      expect(Math.abs(report.lowestY), body).toBeLessThan(1e-5);
      for (const region of ground.contacts ?? []) {
        expect(report.regionLowestY[region], `${body}:${region}`).toBeLessThanOrEqual(
          STUDIO_MANNEQUIN_FLOOR_CONTACT_TOLERANCE_M,
        );
      }
    }
  });
});
