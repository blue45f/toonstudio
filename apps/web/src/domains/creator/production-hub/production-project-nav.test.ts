import { describe, expect, it } from "vitest";

import {
  EPISODE_STAGE_ORDER,
  PRODUCTION_NAV_MODEL,
  PRODUCTION_SURFACES,
  productionNavGroupIdForSurface,
  productionNavInitialOpenGroup,
} from "./production-project-surfaces";

describe("production project nav groups (S2-2)", () => {
  it("shows seven stage groups in journey order, plus management below", () => {
    expect(PRODUCTION_NAV_MODEL.stageGroups.map((group) => group.stage.id)).toEqual(
      EPISODE_STAGE_ORDER,
    );
    expect(PRODUCTION_NAV_MODEL.stageGroups.map((group) => group.stage.label.ko)).toEqual([
      "기획",
      "콘티",
      "작화",
      "식자·연출",
      "검수",
      "게시",
      "운영",
    ]);
    expect(PRODUCTION_NAV_MODEL.managementLabel.ko).toBe("관리");
  });

  it("places every surface exactly once: stage group, management, or pinned overview", () => {
    const grouped = PRODUCTION_NAV_MODEL.stageGroups.flatMap((group) =>
      group.surfaces.map((surface) => surface.id),
    );
    expect(grouped).toEqual([
      "planning",
      "production",
      "manuscripts",
      "review",
      "handoff",
      "episodes",
      "control",
      "activity",
      "schedule",
    ]);
    expect(PRODUCTION_NAV_MODEL.managementSurfaces.map((surface) => surface.id)).toEqual([
      "procurement",
      "rights",
      "settings",
    ]);
    expect(PRODUCTION_NAV_MODEL.overview.id).toBe("overview");
    const all = [PRODUCTION_NAV_MODEL.overview.id, ...grouped, ...PRODUCTION_NAV_MODEL.managementSurfaces.map((surface) => surface.id)];
    expect([...all].sort()).toEqual(PRODUCTION_SURFACES.map((surface) => surface.id).sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps stages without a dedicated surface reachable through their primary action", () => {
    const byId = new Map(PRODUCTION_NAV_MODEL.stageGroups.map((group) => [group.stage.id, group]));
    expect(byId.get("lettering")?.surfaces).toEqual([]);
    expect(byId.get("lettering")?.stage.primaryAction.target).toEqual({
      kind: "surface",
      surface: "manuscripts",
    });
    expect(byId.get("publish")?.surfaces).toEqual([]);
    expect(byId.get("publish")?.stage.primaryAction.target).toEqual({
      kind: "path",
      path: "/studio/publish",
    });
  });

  it("maps a surface to its nav group; overview is pinned, not grouped", () => {
    expect(productionNavGroupIdForSurface("planning")).toBe("plan");
    expect(productionNavGroupIdForSurface("production")).toBe("storyboard");
    expect(productionNavGroupIdForSurface("manuscripts")).toBe("art");
    expect(productionNavGroupIdForSurface("review")).toBe("review");
    expect(productionNavGroupIdForSurface("handoff")).toBe("review");
    expect(productionNavGroupIdForSurface("episodes")).toBe("operate");
    expect(productionNavGroupIdForSurface("schedule")).toBe("operate");
    expect(productionNavGroupIdForSurface("settings")).toBe("management");
    expect(productionNavGroupIdForSurface("rights")).toBe("management");
    expect(productionNavGroupIdForSurface("overview")).toBeNull();
  });

  it("opens the current stage group first, then the active surface's group, else plan", () => {
    expect(productionNavInitialOpenGroup("art", "overview")).toBe("art");
    expect(productionNavInitialOpenGroup("publish", "review")).toBe("publish");
    expect(productionNavInitialOpenGroup(null, "planning")).toBe("plan");
    expect(productionNavInitialOpenGroup(null, "settings")).toBe("management");
    expect(productionNavInitialOpenGroup(null, "overview")).toBe("plan");
    expect(productionNavInitialOpenGroup(null, null)).toBe("plan");
    expect(productionNavInitialOpenGroup(undefined, undefined)).toBe("plan");
  });
});
