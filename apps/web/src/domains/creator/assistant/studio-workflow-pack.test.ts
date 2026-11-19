import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  evaluateWorkflowPackRightsClearance,
  parseStudioWorkflowPack,
  serializeStudioWorkflowPack,
  type StudioWorkflowPack,
} from "./studio-workflow-pack";

describe("StudioWorkflowPack", () => {
  it("clears all built-in starter packs for commercial export and provides v2 3D/brush bindings", () => {
    expect(BUILTIN_STUDIO_WORKFLOW_PACKS.length).toBeGreaterThanOrEqual(4);
    for (const pack of BUILTIN_STUDIO_WORKFLOW_PACKS) {
      expect(pack.schemaVersion).toBe(2);
      expect(pack.bg3dLightingPresetId).toBeTruthy();
      expect(pack.primaryBrushSlotId).toBeTruthy();
      const clearance = evaluateWorkflowPackRightsClearance(pack);
      expect(clearance.clearedForCommercialExport).toBe(true);
      expect(clearance.blockedLicenses).toEqual([]);
    }
  });

  it("flags NC and GPL licenses in Rights BOM clearance", () => {
    const restrictedPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      id: "restricted-test-pack",
      rightsBom: [
        { assetLabel: "비상업 테스트 텍스처", license: "CC-BY-NC" },
        { assetLabel: "GPL 외부 셰이더", license: "GPL-3.0" },
      ],
    };

    const clearance = evaluateWorkflowPackRightsClearance(restrictedPack);
    expect(clearance.clearedForCommercialExport).toBe(false);
    expect(clearance.blockedLicenses).toEqual(["CC-BY-NC", "GPL-3.0"]);
    expect(clearance.summary).toContain("CC-BY-NC");
  });

  it("round-trips both v1 and v2 workflow packs cleanly through JSON serialization", () => {
    const v2Pack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[1],
      teamPolicyLock: {
        teamLabel: "스튜디오 테스트팀",
        lockedFields: ["platformId", "skinToneId"],
        requireCommercialClearance: true,
      },
    };
    expect(parseStudioWorkflowPack(serializeStudioWorkflowPack(v2Pack))).toEqual(v2Pack);

    const v1Pack: StudioWorkflowPack = {
      schemaVersion: 1,
      id: "legacy-v1-pack",
      name: "레거시 v1 팩",
      genre: "일상",
      summary: "v1 하위 호환 검증",
      platformId: "naver-webtoon",
      skinToneId: "warm-fair",
      perspectivePreset: "eye-level",
      focusStage: "storyboard",
      focusPreset: "standard-25",
      readerSpeed: "casual",
      rightsBom: [{ assetLabel: "기본 프리셋", license: "MIT" }],
    };
    expect(parseStudioWorkflowPack(serializeStudioWorkflowPack(v1Pack))).toEqual(v1Pack);
  });

  it("rejects malformed or unknown-schema workflow pack payloads", () => {
    expect(parseStudioWorkflowPack("not-json")).toBeNull();
    expect(parseStudioWorkflowPack(JSON.stringify({ schemaVersion: 3, id: "x" }))).toBeNull();
    expect(
      parseStudioWorkflowPack(
        JSON.stringify({
          ...BUILTIN_STUDIO_WORKFLOW_PACKS[0],
          platformId: "invalid-platform",
        }),
      ),
    ).toBeNull();
  });
});
