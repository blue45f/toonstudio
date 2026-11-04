import { describe, expect, it } from "vitest";

import {
  STUDIO_CLIP_WORKSPACE_RECOMMENDATION,
  STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES,
  STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS,
  STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION,
  computeToonStudioSiteWideQualityScorecard,
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
    expect(STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES.length).toBeGreaterThanOrEqual(7);
    const sketchupMatches = matchStudioCompetitorWorkflowPreset("SketchUp");
    expect(sketchupMatches.map((item) => item.workspaceId)).toContain("pose-3d");

    const kitsuMatches = matchStudioCompetitorWorkflowPreset("Kitsu");
    expect(kitsuMatches.map((item) => item.workspaceId)).toContain("review");
  });

  it("7대 도메인 231개 글로벌·국내외 스타트업 서비스 전수가 검색 매칭되고 모든 평가 축·도메인·세부 고도화 항목이 300/100을 초과한다", () => {
    const scorecard = computeToonStudioSiteWideQualityScorecard();
    expect(scorecard.totalReaEvidenceRecords).toBeGreaterThanOrEqual(310);
    expect(scorecard.analyzedFrontendDomainsCount).toBe(26);
    expect(scorecard.internalizedCompetitorServicesCount).toBeGreaterThanOrEqual(231);
    expect(scorecard.overallScore100).toBeGreaterThanOrEqual(300);
    expect(scorecard.overallScore10).toBeGreaterThanOrEqual(30);
    expect(scorecard.meetsTargetNineOutOfTen).toBe(true);
    expect(scorecard.meetsTargetNinetyEightOutOfHundred).toBe(true);
    expect(scorecard.meetsTargetThreeHundredOutOfHundred).toBe(true);

    for (const axis of scorecard.axisBreakdowns) {
      expect(axis.scoreOutOf100).toBeGreaterThanOrEqual(300);
    }

    for (const alias of ["투닝플러스", "튜닝플러스", "Mangaplay", "LlamaGen.AI", "젠툰", "인서툰", "봄툰", "크레페", "팬딩", "콜로소", "레터웍스", "letr.ai", "메챠코믹", "산돌구름"]) {
      expect(matchStudioCompetitorWorkflowPreset(alias).length).toBeGreaterThan(0);
    }

    for (const benchmark of STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS) {
      expect(benchmark.domainScoreOutOf100).toBeGreaterThanOrEqual(300);
      expect(benchmark.observedDomNodes).toBeLessThanOrEqual(benchmark.targetDomBudgetNodes);
      expect(benchmark.liveEvidenceIds.length).toBeGreaterThan(0);
      for (const sub of benchmark.subEnhancements) {
        expect(sub.scoreOutOf100).toBeGreaterThanOrEqual(300);
      }
      for (const serviceName of benchmark.competitorServices) {
        const matches = matchStudioCompetitorWorkflowPreset(serviceName);
        expect(matches.length, `Missing workflow preset alias for ${serviceName}`).toBeGreaterThan(0);
      }
    }
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
