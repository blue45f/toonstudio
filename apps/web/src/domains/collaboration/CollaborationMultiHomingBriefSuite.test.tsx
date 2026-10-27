// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateMultiHomingBriefSync } from "./collaboration-multi-homing-brief-model";
import { CollaborationMultiHomingBriefSuite } from "./CollaborationMultiHomingBriefSuite";

afterEach(() => {
  cleanup();
});

describe("evaluateMultiHomingBriefSync", () => {
  it("computes 100 readiness score when all 4 multi-homed boards and synced blocks are active", () => {
    const result = evaluateMultiHomingBriefSync({
      postId: "post-101",
      roleKey: "coloring_shading",
      syncedBoards: {
        "board-public-gig": true,
        "board-recruiting-slot": true,
        "board-production-stage": true,
        "board-studio-layer-seat": true,
      },
      includeCharacterSheetBlock: true,
      includeEpisodeCutRangeBlock: true,
      enforcePrivateManuscriptIsolation: true,
    });

    expect(result.syncedBoardCount).toBe(4);
    expect(result.readinessScore).toBe(100);
    expect(result.isolationSafe).toBe(true);
    expect(result.boards[3]?.permissionBoundaryKo).toContain("layer:p1:coloring_shading");
  });

  it("warns when private manuscript isolation is disabled and reduces readiness score when boards are unlinked", () => {
    const result = evaluateMultiHomingBriefSync({
      postId: "post-102",
      roleKey: "background",
      syncedBoards: {
        "board-public-gig": true,
        "board-recruiting-slot": true,
        "board-production-stage": false,
        "board-studio-layer-seat": false,
      },
      includeCharacterSheetBlock: true,
      includeEpisodeCutRangeBlock: false,
      enforcePrivateManuscriptIsolation: false,
    });

    expect(result.syncedBoardCount).toBe(2);
    expect(result.readinessScore).toBe(45);
    expect(result.isolationSafe).toBe(false);
    expect(result.statusSummaryKo).toContain("경고: 비공개 원고 전체 접근 차단");
  });
});

describe("CollaborationMultiHomingBriefSuite", () => {
  it("renders multi-homing brief suite and updates board sync and manuscript isolation states interactively", () => {
    render(
      <MemoryRouter>
        <CollaborationMultiHomingBriefSuite postId="post-77" roleKey="coloring_shading" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("collaboration-multi-homing-brief-suite")).toBeDefined();
    expect(screen.getByTestId("multi-homing-score-badge").textContent).toContain("4/4");
    expect(screen.getByTestId("multi-homing-score-badge").textContent).toContain("100");

    fireEvent.click(screen.getByTestId("toggle-multi-home-board-studio-layer-seat"));
    expect(screen.getByTestId("multi-homing-score-badge").textContent).toContain("3/4");

    fireEvent.click(screen.getByTestId("toggle-manuscript-isolation"));
    expect(screen.getByTestId("multi-homing-status-banner").textContent).toContain("경고");
  });
});
