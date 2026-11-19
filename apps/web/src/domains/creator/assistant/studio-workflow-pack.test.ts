import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  evaluateWorkflowPackRightsClearance,
  parseStudioWorkflowPack,
  serializeStudioWorkflowPack,
  type StudioWorkflowPack,
} from "./studio-workflow-pack";

describe("StudioWorkflowPack", () => {
  it("clears all built-in starter packs for commercial export", () => {
    expect(BUILTIN_STUDIO_WORKFLOW_PACKS.length).toBeGreaterThanOrEqual(4);
    for (const pack of BUILTIN_STUDIO_WORKFLOW_PACKS) {
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

  it("round-trips a workflow pack cleanly through JSON serialization", () => {
    const original = BUILTIN_STUDIO_WORKFLOW_PACKS[1];
    const json = serializeStudioWorkflowPack(original);
    const restored = parseStudioWorkflowPack(json);
    expect(restored).toEqual(original);
  });

  it("rejects malformed or unknown-schema workflow pack payloads", () => {
    expect(parseStudioWorkflowPack("not-json")).toBeNull();
    expect(parseStudioWorkflowPack(JSON.stringify({ schemaVersion: 2, id: "x" }))).toBeNull();
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
