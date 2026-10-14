import { describe, expect, it } from "vitest";

import { createProductionDemoProject, PRODUCTION_DEMO_ANCHOR_AT } from "./production-demo";
import {
  deriveProductionDashboard,
  productionPlanningIsEmpty,
  resolveProductionSurfaceTarget,
} from "./production-project-dashboard-model";

const NOW = new Date(PRODUCTION_DEMO_ANCHOR_AT);

/** 기획 문서 묶음을 전부 비운 aggregate. 나머지(작업·질문 등)는 데모 그대로 둔다. */
function withoutPlanningDocuments() {
  const aggregate = createProductionDemoProject();
  return {
    ...aggregate,
    charters: [],
    projectBriefs: [],
    seriesMasters: [],
    seasonPlans: [],
    episodePlans: [],
    scenePlans: [],
    cutPlans: [],
  };
}

describe("planning stage reachability", () => {
  it("treats the demo project as planned and an all-empty planning bundle as empty", () => {
    expect(productionPlanningIsEmpty(createProductionDemoProject())).toBe(false);
    expect(productionPlanningIsEmpty(withoutPlanningDocuments())).toBe(true);
  });

  it("counts any single planning document as started planning", () => {
    const aggregate = createProductionDemoProject();
    const onlyBrief = { ...withoutPlanningDocuments(), projectBriefs: aggregate.projectBriefs };
    expect(productionPlanningIsEmpty(onlyBrief)).toBe(false);
    const onlyEpisodePlan = { ...withoutPlanningDocuments(), episodePlans: aggregate.episodePlans };
    expect(productionPlanningIsEmpty(onlyEpisodePlan)).toBe(false);
  });

  it("sends the overview next step to planning while planning documents are empty", () => {
    const dashboard = deriveProductionDashboard(withoutPlanningDocuments(), {
      now: NOW,
      viewerAssignmentIds: [],
      roleLens: "producer",
    });
    expect(dashboard.nextStep).toEqual({ kind: "planning" });
    expect(
      resolveProductionSurfaceTarget(withoutPlanningDocuments(), { kind: "surface", surface: "planning" }, NOW),
    ).toBe("/production/projects/sample-project/planning");
  });

  it("keeps the urgent next step for projects whose planning is not empty", () => {
    const dashboard = deriveProductionDashboard(createProductionDemoProject(), {
      now: NOW,
      viewerAssignmentIds: [],
      roleLens: "producer",
    });
    expect(dashboard.nextStep).toMatchObject({ kind: "answer-question", episodeId: "episode-12" });
  });
});
