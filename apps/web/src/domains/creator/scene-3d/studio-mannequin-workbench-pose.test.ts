import { describe, expect, it } from "vitest";

import { STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS } from "./studio-mannequin-model";
import { createStudioMannequinRestPose } from "./studio-mannequin-poses";
import { resolveStudioMannequinWorkbenchPose } from "./studio-mannequin-workbench-pose";

describe("워크벤치 모션을 데생 인형에 적용", () => {
  it("동작 여덟 종류가 모두 실제 관절 자세를 만든다", () => {
    const motions = ["standing", "walking", "running", "sitting", "action", "dramatic", "contrapposto", "webtoon-lookback"] as const;
    const rest = createStudioMannequinRestPose();
    const poses = motions.map((motion) => resolveStudioMannequinWorkbenchPose(motion, STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS, rest));
    expect(new Set(poses.map((pose) => JSON.stringify(pose.joints))).size).toBe(motions.length);
    for (const pose of poses) expect(pose.joints).not.toEqual(rest.joints);
    expect(poses[7]?.joints.head?.[1]).toBeCloseTo(0.48, 2);
  });
});
