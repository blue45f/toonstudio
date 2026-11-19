import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS, type StudioWorkflowPack } from "./studio-workflow-pack";
import { evaluateWorkflowPackTeamPolicy } from "./studio-workflow-pack-policy";

describe("studio-workflow-pack-policy", () => {
  it("passes cleanly when no teamPolicyLock is configured", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const audit = evaluateWorkflowPackTeamPolicy(pack, {
      platformId: "kakao-page",
      skinToneId: "cool-pale",
      perspectivePreset: "low-angle",
      readerSpeed: "skimmer",
    });

    expect(audit.enforced).toBe(false);
    expect(audit.compliant).toBe(true);
    expect(audit.violations).toEqual([]);
  });

  it("detects locked-field drift and commercial license violations under teamPolicyLock", () => {
    const lockedPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      id: "team-locked-pack",
      rightsBom: [{ assetLabel: "비상업 소품", license: "CC-BY-NC" }],
      teamPolicyLock: {
        teamLabel: "스튜디오 A 로판팀",
        lockedFields: ["platformId", "skinToneId"],
        requireCommercialClearance: true,
      },
    };

    const audit = evaluateWorkflowPackTeamPolicy(lockedPack, {
      platformId: "kakao-page",
      skinToneId: lockedPack.skinToneId,
      perspectivePreset: "low-angle",
      readerSpeed: "skimmer",
    });

    expect(audit.enforced).toBe(true);
    expect(audit.compliant).toBe(false);
    expect(audit.teamLabel).toBe("스튜디오 A 로판팀");
    expect(audit.violations).toHaveLength(2);
    expect(audit.violations[0]).toContain("플랫폼 규격");
    expect(audit.violations[1]).toContain("상업 라이선스 필수 정책 위반");
  });
});
