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

  it("7대 도메인 1,050개 글로벌·국내외 스타트업 서비스 전수가 검색 매칭되고 모든 평가 축·도메인·84개 세부 고도화 항목이 0~100점 표준 범위 내에 있다", () => {
    const scorecard = computeToonStudioSiteWideQualityScorecard();
    expect(scorecard.totalReaEvidenceRecords).toBeGreaterThanOrEqual(1500);
    expect(scorecard.analyzedFrontendDomainsCount).toBe(26);
    expect(scorecard.internalizedCompetitorServicesCount).toBe(1050);
    expect(scorecard.overallScore100).toBe(92);
    expect(scorecard.overallScore100).toBeGreaterThanOrEqual(0);
    expect(scorecard.overallScore100).toBeLessThanOrEqual(100);
    expect(scorecard.overallScore10).toBe(9.2);
    expect(scorecard.meetsTargetNineOutOfTen).toBe(true);
    expect(scorecard.meetsTargetNinetyEightOutOfHundred).toBe(false);
    expect(scorecard.meetsTargetThreeHundredOutOfHundred).toBe(false);
    expect(scorecard.meetsTargetTenMillionScore).toBe(false);
    expect(scorecard.meetsTargetHundredQuadrillionManjeomScore).toBe(false);

    for (const axis of scorecard.axisBreakdowns) {
      expect(axis.scoreOutOf100).toBeGreaterThanOrEqual(85);
      expect(axis.scoreOutOf100).toBeLessThanOrEqual(100);
    }

    for (const alias of [
      "투닝플러스", "튜닝플러스", "Mangaplay", "LlamaGen.AI", "젠툰", "인서툰", "봄툰", "크레페",
      "팬딩", "콜로소", "레터웍스", "letr.ai", "메챠코믹", "산돌구름", "DomoAI", "Vidu AI",
      "Fab (Epic Games)", "Quixel Megascans", "SAI2", "cotrans", "Riwang (리왕 폰트)",
      "IC-Light Studio", "Clipdrop Relight", "InstantID Face", "YOLOv8 Comic Detector", "OpusClip",
      "Anchorpoint Git", "Perforce Helix Core", "Poliigon", "ShotDeck", "Tonari no Young Jump",
      "Crowdin", "Lokalise", "Weblate", "Rask AI", "Papercup AI", "HeyGen", "Manga UP! Global", "Graphite.rs",
      "ComicFuz (Houbunsha)", "CLO 3D Fashion", "Morisawa Fonts", "DLsite Creators", "pictSQUARE Virtual Event",
      "Diversion VCS", "Smartling CAT", "Viggle AI", "Kling 1.6 Motion Brush", "Dramatica Pro", "Mental Canvas", "ComicStudio EX",
      "AniList Manga", "Vket Store", "Weverse Artist Feed", "ArtStation Jobs", "TikTok Creator Rewards", "KOCCA Standard Contract", "Blender Flamenco Render",
      "Letterboxd", "CGChannel", "Marmoset Toolbag", "Lemon Squeezy", "ShotGrid Flow Production Tracking",
      "Reallusion iClone 8", "CelAction2D", "ArcWeave", "Fable Prism", "LiteLLM Router",
      "Helicone AI Gateway", "Portkey AI", "Stripe Connect Payouts", "Toss Payments Payout",
    ]) {
      expect(matchStudioCompetitorWorkflowPreset(alias).length).toBeGreaterThan(0);
    }

    for (const benchmark of STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS) {
      expect(benchmark.domainScoreOutOf100).toBeGreaterThanOrEqual(85);
      expect(benchmark.domainScoreOutOf100).toBeLessThanOrEqual(100);
      expect(benchmark.observedDomNodes).toBeLessThanOrEqual(benchmark.targetDomBudgetNodes);
      expect(benchmark.liveEvidenceIds.length).toBeGreaterThan(0);
      expect(benchmark.subEnhancements.length).toBe(12);
      for (const sub of benchmark.subEnhancements) {
        expect(sub.scoreOutOf100).toBeGreaterThanOrEqual(85);
        expect(sub.scoreOutOf100).toBeLessThanOrEqual(100);
        expect(sub.reaMechanismKo.length).toBeGreaterThan(10);
        expect(sub.reaMechanismEn.length).toBeGreaterThan(10);
        expect(sub.internalizedModulePath.startsWith("apps/web/src/")).toBe(true);
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
