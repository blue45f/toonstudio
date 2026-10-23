import { describe, expect, it } from "vitest";

import { ADVANCED_WEBTOON_POSES } from "./studio-3d-advanced-poses-library";
import {
  STUDIO_MANNEQUIN_BODY_PRESETS,
  buildStudioMannequinSpec,
  type StudioMannequinBodyPresetId,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  groundStudioMannequinPresetPoseForBody,
  listStudioMannequinFloorContacts,
  measureStudioMannequinBodyFloor,
  type StudioMannequinPoseGroundSpec,
} from "./studio-mannequin-pose-ground-contact";
import { auditStudioMannequinPose } from "./studio-mannequin-pose-quality";
import {
  STUDIO_MANNEQUIN_POSE_PRESETS,
  normalizeStudioMannequinPose,
  studioMannequinPosePresetScope,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  convertWebtoonPresetToMannequinPose,
  resolveWebtoonPresetGroundSpec,
} from "./studio-webtoon-pose-mannequin-adapter";
import { STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES } from "./studio-webtoon-pose-mannequin-overrides";

const DEG = Math.PI / 180;

interface PoseCase {
  readonly id: string;
  readonly pose: StudioMannequinPose;
  readonly ground: StudioMannequinPoseGroundSpec | undefined;
  readonly symmetric: boolean;
  readonly authoredJoints: Readonly<Record<string, StudioMannequinVec3 | undefined>>;
}

/** 전신 프리셋 전부(데생 인형 라이브러리 + 웹툰 프리셋). 손 전용은 몸 포즈를 바꾸지 않아 제외한다. */
function allFullBodyCases(): PoseCase[] {
  const library = STUDIO_MANNEQUIN_POSE_PRESETS
    .filter((preset) => studioMannequinPosePresetScope(preset) === "full-body")
    .map((preset) => ({
      id: `library:${preset.id}`,
      pose: preset.pose,
      ground: preset.ground,
      symmetric: preset.symmetric === true,
      authoredJoints: preset.pose.joints,
    }));
  const webtoon = ADVANCED_WEBTOON_POSES.map((preset) => {
    const override = STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES[preset.id];
    const authoredJoints: Record<string, StudioMannequinVec3> = {};
    for (const [jointId, degrees] of Object.entries(override?.joints ?? {})) {
      if (degrees) authoredJoints[jointId] = [degrees[0] * DEG, degrees[1] * DEG, degrees[2] * DEG];
    }
    return {
      id: `webtoon:${preset.id}`,
      pose: convertWebtoonPresetToMannequinPose(preset),
      ground: resolveWebtoonPresetGroundSpec(preset),
      symmetric: override?.symmetric === true,
      authoredJoints,
    };
  });
  return [...library, ...webtoon];
}

const CASES = allFullBodyCases();
const DEFAULT_SPEC = buildStudioMannequinSpec(undefined);
/** 극단 체형까지 덮는 대표 체형(SD 3등신·어린이·여성·모델·거인·보디빌더). */
const BODY_IDS: readonly StudioMannequinBodyPresetId[] = [
  "chibi3",
  "child",
  "female",
  "model",
  "fantasyGiant",
  "bodybuilder",
];

describe("포즈 품질 — 전 프리셋 FK 감사(기본 체형)", () => {
  it("검사 대상이 라이브러리 전신 프리셋과 웹툰 23종을 모두 덮는다", () => {
    expect(CASES.filter((entry) => entry.id.startsWith("webtoon:"))).toHaveLength(
      ADVANCED_WEBTOON_POSES.length,
    );
    expect(CASES.filter((entry) => entry.id.startsWith("library:")).length).toBeGreaterThanOrEqual(51);
  });

  it("웹툰 프리셋은 전부 데생 인형 정본 포즈를 가진다(휴머노이드 원본을 그대로 쓰지 않는다)", () => {
    for (const preset of ADVANCED_WEBTOON_POSES) {
      expect(STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES[preset.id], preset.id).toBeDefined();
    }
  });

  for (const entry of CASES) {
    it(`${entry.id}: 관절 한계·접지·접촉·발 방향·대칭 결함이 없다`, () => {
      const applied = groundStudioMannequinPresetPoseForBody(entry.pose, undefined, entry.ground);
      const issues = auditStudioMannequinPose({
        spec: DEFAULT_SPEC,
        pose: applied,
        ground: entry.ground,
        symmetric: entry.symmetric,
        authoredJoints: entry.authoredJoints,
      });
      expect(issues, JSON.stringify(issues)).toEqual([]);
    });
  }
});

/**
 * 명시적 예외: SD 3등신(정강이 약 9cm·발 길이 약 37cm)에서는 웹툰 히어로 3점 착지의 무릎·손·
 * 앞발을 동시에 바닥에 대는 것이 기하학적으로 불가능하다(앞다리가 접히지 않는다). 이 조합만
 * 대표 접촉 대신 "뜨거나 관통하지 않음"만 검사한다.
 */
const EXTREME_BODY_CONTACT_EXCEPTIONS: Readonly<Partial<Record<StudioMannequinBodyPresetId, readonly string[]>>> = {
  chibi3: ["webtoon:action-hero-landing"],
};

describe("포즈 품질 — 극단 체형에서도 지지 방식이 유지된다", () => {
  for (const bodyId of BODY_IDS) {
    it(`${bodyId}: 모든 전신 프리셋이 뜨거나 관통하지 않고 대표 접촉을 유지한다`, () => {
      const params = STUDIO_MANNEQUIN_BODY_PRESETS[bodyId].params;
      const spec = buildStudioMannequinSpec(params);
      const exceptions = new Set(EXTREME_BODY_CONTACT_EXCEPTIONS[bodyId] ?? []);
      const failures: string[] = [];
      for (const entry of CASES) {
        const applied = groundStudioMannequinPresetPoseForBody(entry.pose, params, entry.ground);
        const issues = auditStudioMannequinPose({
          spec,
          pose: applied,
          ground: entry.ground,
          strictContacts: false,
          contactToleranceM: 0.03,
        }).filter((issue) => !(exceptions.has(entry.id) && issue.kind === "contact-missing"));
        if (issues.length > 0) failures.push(`${entry.id}: ${issues.map((issue) => issue.detail).join(", ")}`);
      }
      expect(failures).toEqual([]);
    });
  }
});

describe("포즈 품질 — 감사가 실제 결함을 잡는다(거짓 통과 방지)", () => {
  const brokenHeroLanding: StudioMannequinPose = normalizeStudioMannequinPose({
    // 수정 전 '히어로 착지 포즈' — 골반을 기본 체형 기준 미터로 내려 손·무릎이 바닥에 닿지 않았다.
    joints: {
      spine: [44 * DEG, 0, 0],
      chest: [24 * DEG, 0, 0],
      head: [-32 * DEG, 0, 0],
      rightUpperArm: [12 * DEG, 0, -18 * DEG],
      rightLowerArm: [-120 * DEG, 0, 0],
      rightUpperLeg: [-78 * DEG, 0, -12 * DEG],
      rightLowerLeg: [105 * DEG, 0, 0],
      leftUpperLeg: [-62 * DEG, 0, 14 * DEG],
      leftLowerLeg: [88 * DEG, 0, 0],
    },
    pelvisOffset: [0, -0.52, 0],
  });
  const heroGround: StudioMannequinPoseGroundSpec = {
    support: "kneeling",
    contacts: ["rightKnee", "rightHand", "leftFoot"],
  };

  it("저작 높이 그대로면 관통을, 접지 후에는 손·무릎 접촉 누락을 보고한다", () => {
    const raw = auditStudioMannequinPose({ spec: DEFAULT_SPEC, pose: brokenHeroLanding, ground: heroGround });
    expect(raw.some((issue) => issue.kind === "penetration")).toBe(true);
    const grounded = auditStudioMannequinPose({
      spec: DEFAULT_SPEC,
      pose: groundStudioMannequinPresetPoseForBody(brokenHeroLanding, undefined, heroGround),
      ground: heroGround,
    });
    expect(grounded.filter((issue) => issue.kind === "contact-missing").length).toBeGreaterThan(0);
  });

  it("골반 오프셋이 없는 웹툰 원본은 공중부양으로 잡힌다", () => {
    const floating: StudioMannequinPose = normalizeStudioMannequinPose({
      joints: {
        leftUpperLeg: [-90 * DEG, 0, 0],
        leftLowerLeg: [140 * DEG, 0, 0],
        rightUpperLeg: [-90 * DEG, 0, 0],
        rightLowerLeg: [140 * DEG, 0, 0],
      },
      pelvisOffset: [0, 0, 0],
    });
    const issues = auditStudioMannequinPose({
      spec: DEFAULT_SPEC,
      pose: floating,
      ground: { support: "kneeling", contacts: ["leftKnee", "rightKnee"] },
    });
    expect(issues.some((issue) => issue.kind === "floating")).toBe(true);
  });

  it("관절 한계 밖 저작값(팔꿈치 +80°)과 대칭 깨짐, 옆날로 선 발을 잡는다", () => {
    const authored: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {
      rightLowerArm: [80 * DEG, 0, 0],
    };
    const limitIssues = auditStudioMannequinPose({
      spec: DEFAULT_SPEC,
      pose: normalizeStudioMannequinPose({ joints: authored, pelvisOffset: [0, 0, 0] }),
      authoredJoints: authored,
      symmetric: true,
    });
    expect(limitIssues.some((issue) => issue.kind === "joint-limit")).toBe(true);
    expect(limitIssues.some((issue) => issue.kind === "asymmetric")).toBe(true);

    const rolledFoot = groundStudioMannequinPresetPoseForBody(
      normalizeStudioMannequinPose({ joints: { leftFoot: [0, 0, 30 * DEG] }, pelvisOffset: [0, 0, 0] }),
      undefined,
      undefined,
    );
    const footIssues = auditStudioMannequinPose({
      spec: DEFAULT_SPEC,
      pose: rolledFoot,
      ground: { support: "standing", soleFeet: ["left", "right"] },
    });
    expect(footIssues.some((issue) => issue.kind === "foot-orientation")).toBe(true);
  });
});

describe("포즈 품질 — 적용 시점 접지 계약", () => {
  it("접지는 멱등이고 관절 회전·골반 수평 오프셋을 바꾸지 않는다", () => {
    for (const entry of CASES) {
      const once = groundStudioMannequinPresetPoseForBody(entry.pose, undefined, entry.ground);
      const twice = groundStudioMannequinPresetPoseForBody(once, undefined, entry.ground);
      expect(twice.pelvisOffset[1], entry.id).toBeCloseTo(once.pelvisOffset[1], 5);
      expect(once.joints, entry.id).toEqual(normalizeStudioMannequinPose(entry.pose).joints);
      expect(once.pelvisOffset[0], entry.id).toBeCloseTo(entry.pose.pelvisOffset[0], 6);
    }
  });

  it("B-03 히어로 3점 착지: 손·무릎·발이 바닥에 닿고 공중에 뜬 발이 없다(모든 체형)", () => {
    const hero = CASES.find((entry) => entry.id === "webtoon:action-hero-landing");
    expect(hero).toBeDefined();
    // SD 3등신은 위 예외 표의 이유로 제외한다.
    const bodies = BODY_IDS.filter((id) => !(EXTREME_BODY_CONTACT_EXCEPTIONS[id] ?? []).includes("webtoon:action-hero-landing"));
    for (const params of [undefined, ...bodies.map((id) => STUDIO_MANNEQUIN_BODY_PRESETS[id].params)]) {
      const spec = buildStudioMannequinSpec(params);
      const applied = groundStudioMannequinPresetPoseForBody(hero!.pose, params, hero!.ground);
      const contacts = listStudioMannequinFloorContacts(measureStudioMannequinBodyFloor(spec, applied), {
        toleranceM: 0.035,
      });
      expect(contacts).toEqual(expect.arrayContaining(["leftKnee", "leftHand", "rightFoot"]));
    }
  });
});
