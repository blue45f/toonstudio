// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import {
  applyMyReviewTriageFiltersToSearch,
  buildMyReviewTargetCutHref,
  deriveMyReviewTriageQueue,
  parseMyReviewTriageFilters,
} from "./production-my-review-triage-model";
import { ProductionMyReviewTriageSection } from "./ProductionMyReviewTriageSection";
import { ProductionReviewSurface } from "./ProductionReviewSurface";

function BackButtonProbe() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div>
      <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>
      <button type="button" data-testid="go-back" onClick={() => navigate(-1)}>
        뒤로 가기
      </button>
    </div>
  );
}

describe("production-my-review-triage (Item 24)", () => {
  const bt = (ko: string) => ko;

  it("classifies changes-requested, resubmitted, and awaiting-approval items and filters by status + assignee", () => {
    const aggregate = createProductionDemoProject();
    const fullQueue = deriveMyReviewTriageQueue({
      aggregates: [aggregate],
      filters: { status: "all", assignee: "all" },
      roleLens: "art",
      now: new Date("2026-09-17T00:00:00.000Z"),
      bt,
    });

    expect(fullQueue.countsByStatus["changes-requested"]).toBeGreaterThanOrEqual(1);
    expect(fullQueue.countsByStatus.resubmitted).toBeGreaterThanOrEqual(1);
    expect(fullQueue.countsByStatus["awaiting-approval"]).toBeGreaterThanOrEqual(1);

    const resubmittedArt = deriveMyReviewTriageQueue({
      aggregates: [aggregate],
      filters: { status: "resubmitted", assignee: "assignment-art" },
      roleLens: "art",
      now: new Date("2026-09-17T00:00:00.000Z"),
      bt,
    });
    expect(resubmittedArt.filteredItems.length).toBe(1);
    expect(resubmittedArt.filteredItems[0]?.submissionId).toBe("submission-thumbnail-12-r2");
    expect(resubmittedArt.filteredItems[0]?.cutId).toBe("cut-12-001");

    const changesStory = deriveMyReviewTriageQueue({
      aggregates: [aggregate],
      filters: { status: "changes-requested", assignee: "assignment-story" },
      roleLens: "story",
      now: new Date("2026-09-17T00:00:00.000Z"),
      bt,
    });
    expect(changesStory.filteredItems.length).toBe(1);
    expect(changesStory.filteredItems[0]?.cutId).toBe("cut-12-002");
  });

  it("round-trips status and assignee filters in URL search params and builds pinned target-cut hrefs", () => {
    const updated = applyMyReviewTriageFiltersToSearch(new URLSearchParams("foo=bar"), {
      status: "changes-requested",
      assignee: "assignment-story",
    });
    expect(updated.get("foo")).toBe("bar");
    expect(parseMyReviewTriageFilters(updated)).toEqual({
      status: "changes-requested",
      assignee: "assignment-story",
    });

    const href = buildMyReviewTargetCutHref(
      {
        projectId: "sample-project",
        taskId: null,
        episodeId: "episode-12",
        cutId: "cut-12-002",
        submissionId: "submission-thumbnail-12-r2",
        revisionId: "thumbnail-episode-12-r2",
      },
      { status: "changes-requested", assignee: "assignment-story" },
    );
    expect(href).toContain("/production/projects/sample-project/review?");
    expect(href).toContain("cut=cut-12-002");
    expect(href).toContain("reviewStatus=changes-requested");
    expect(href).toContain("reviewAssignee=assignment-story");
  });

  it("navigates from filtered triage queue to exact target cut and preserves status + assignee filters on history back", () => {
    const aggregate = createProductionDemoProject();

    const { container } = render(
      <MemoryRouter initialEntries={["/production"]}>
        <BackButtonProbe />
        <Routes>
          <Route
            path="/production"
            element={<ProductionMyReviewTriageSection aggregates={[aggregate]} roleLens="art" showProjectTitle />}
          />
          <Route
            path="/production/projects/:projectId/review"
            element={
              <ProductionReviewSurface
                aggregate={aggregate}
                execute={async () => undefined}
                canEdit
                isDemo
                roleLens="art"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(container.querySelector('[data-triage-status-btn="changes-requested"]')!);
    fireEvent.change(screen.getByLabelText("검수 담당자 필터"), {
      target: { value: "assignment-story" },
    });

    expect(screen.getByTestId("current-location").textContent).toBe(
      "/production?reviewStatus=changes-requested&reviewAssignee=assignment-story",
    );

    const targetLink = container.querySelector<HTMLAnchorElement>('[data-triage-target-cut="cut-12-002"]');
    expect(targetLink).not.toBeNull();
    fireEvent.click(targetLink!);

    const workspace = container.querySelector("[data-production-review-workspace]");
    expect(workspace?.getAttribute("data-review-cut-id")).toBe("cut-12-002");

    fireEvent.click(screen.getByTestId("go-back"));
    expect(screen.getByTestId("current-location").textContent).toBe(
      "/production?reviewStatus=changes-requested&reviewAssignee=assignment-story",
    );

    const triageSection = container.querySelector("[data-my-review-triage]");
    expect(triageSection?.getAttribute("data-triage-status")).toBe("changes-requested");
    expect(triageSection?.getAttribute("data-triage-assignee")).toBe("assignment-story");
  });
});
