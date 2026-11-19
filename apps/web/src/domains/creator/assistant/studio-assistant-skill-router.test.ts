import { describe, expect, it } from "vitest";

import { routeStudioAssistantSkills } from "./studio-assistant-skill-router";

describe("routeStudioAssistantSkills", () => {
  it("routes Korean 3D/camera queries to croquis-pose first", () => {
    const matches = routeStudioAssistantSkills({
      query: "3D 배경 로우앵글 카메라 투시 구도",
      focusStage: "background-3d",
      panelsCount: 4,
      protectedRegionsCount: 4,
      canvasHeight: 12_000,
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].tabId).toBe("croquis-pose");
    expect(matches[0].score).toBeGreaterThan(0);
  });

  it("routes export and slice queries to spec-slicer", () => {
    const matches = routeStudioAssistantSkills({
      query: "네이버 웹툰 규격 슬라이스 분할",
      focusStage: "finishing-sfx",
      panelsCount: 10,
      protectedRegionsCount: 10,
      canvasHeight: 18_000,
    });

    expect(matches[0].tabId).toBe("spec-slicer");
    expect(matches[0].reason).toContain("매칭");
  });

  it("routes workflow pack and license queries to workflow-packs", () => {
    const matches = routeStudioAssistantSkills({
      query: "로판 장르 워크플로우 팩 저작권 프리셋",
      focusStage: "storyboard",
      panelsCount: 0,
      protectedRegionsCount: 0,
      canvasHeight: 10_000,
    });

    expect(matches[0].tabId).toBe("workflow-packs");
  });

  it("recommends stage-appropriate tools when query is empty", () => {
    const matches = routeStudioAssistantSkills(
      {
        query: "",
        focusStage: "flat-color",
        panelsCount: 6,
        protectedRegionsCount: 6,
        canvasHeight: 15_000,
      },
      3,
    );

    expect(matches).toHaveLength(3);
    expect(matches[0].tabId).toBe("color-harmony");
    expect(matches[0].reason).toContain("현재 작업 공정 기준 추천");
  });
});
