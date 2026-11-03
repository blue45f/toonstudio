import { describe, expect, it } from "vitest";

import {
  STUDIO_CLIP_WORKSPACE_RECOMMENDATION,
  STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES,
  STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION,
  matchStudioCompetitorWorkflowPreset,
  resolveStudioWorkspaceRecommendation,
  studioWorkspaceSearchAliases,
} from "../studio-workspace-recommendation";
import { STUDIO_DEFAULT_WORKSPACES } from "../studio-workspaces";

describe("Studio workspace recommendation model", () => {
  it("recommends the lowest-complexity built-in while keeping migration aliases searchable", () => {
    const recommendation = resolveStudioWorkspaceRecommendation(
      STUDIO_DEFAULT_WORKSPACES,
      "storyboard",
    );

    expect(recommendation?.workspace.id).toBe("quick-sketch");
    expect(recommendation?.workspace.name).toBe("빠른 스케치");
    expect(recommendation?.actionLabel).toBe("간편 화면으로 시작");
    expect(
      studioWorkspaceSearchAliases(STUDIO_CLIP_WORKSPACE_RECOMMENDATION.workspaceId),
    ).toEqual(expect.arrayContaining(["CSP", "Clip Studio", "클튜"]));
    expect(studioWorkspaceSearchAliases("pose-3d")).toEqual(
      expect.arrayContaining(["SketchUp", "ACON3D", "Blender"]),
    );
    expect(studioWorkspaceSearchAliases("photo-edit")).toEqual(
      expect.arrayContaining(["Photoshop", "Krita"]),
    );
    expect(studioWorkspaceSearchAliases("storyboard")).toEqual(
      expect.arrayContaining(["Celtx", "Campfire", "Obsidian"]),
    );
  });

  it("matches familiar competitor workflows to built-in ToonStudio workspaces", () => {
    expect(STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES.length).toBeGreaterThanOrEqual(8);
    const sketchupMatches = matchStudioCompetitorWorkflowPreset("SketchUp");
    expect(sketchupMatches.map((item) => item.workspaceId)).toContain("pose-3d");

    const kitsuMatches = matchStudioCompetitorWorkflowPreset("Kitsu");
    expect(kitsuMatches.map((item) => item.workspaceId)).toContain("review");
  });

  it("does not compete with the current-workspace summary after activation", () => {
    expect(
      resolveStudioWorkspaceRecommendation(
        STUDIO_DEFAULT_WORKSPACES,
        STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION.workspaceId,
      ),
    ).toBeNull();
  });

  it.each(["toString", "constructor", "__proto__", "unknown"])(
    "알 수 없거나 상속된 작업공간 ID %s는 빈 별칭을 반환한다",
    (workspaceId) => {
      expect(studioWorkspaceSearchAliases(workspaceId)).toEqual([]);
    },
  );

  it("fails closed if the referenced built-in is unavailable", () => {
    expect(resolveStudioWorkspaceRecommendation([], "storyboard")).toBeNull();
    expect(studioWorkspaceSearchAliases("unknown")).toEqual([]);
  });
});
