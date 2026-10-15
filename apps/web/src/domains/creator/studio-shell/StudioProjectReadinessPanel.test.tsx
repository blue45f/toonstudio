// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT } from "../studio-project-diagnostic-source-store";
import {
  STUDIO_PROJECT_READINESS_UPDATED_EVENT,
  writeStudioProjectReadinessSnapshot,
  type StudioProjectReadinessSnapshot,
} from "../studio-project-readiness-store";
import {
  STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT,
  writePlausibilitySummary,
} from "../storyworld/plausibility/studio-story-plausibility-summary";
import { StudioProjectReadinessPanel } from "./StudioProjectReadinessPanel";

const SNAPSHOT: StudioProjectReadinessSnapshot = Object.freeze<StudioProjectReadinessSnapshot>({
  schemaVersion: 1,
  projectId: "project-1",
  updatedAt: "2026-09-11T00:00:00.000Z",
  report: {
    status: "blocked",
    completion: 0.5,
    blockingCount: 1,
    warningCount: 1,
    sections: [
      { id: "story", status: "blocked", completion: 0.4, blockingCount: 1, warningCount: 0 },
      { id: "production", status: "warning", completion: 0.6, blockingCount: 0, warningCount: 1 },
      { id: "assets", status: "ready", completion: 1, blockingCount: 0, warningCount: 0 },
      { id: "review", status: "ready", completion: 1, blockingCount: 0, warningCount: 0 },
      { id: "localization", status: "ready", completion: 0, blockingCount: 0, warningCount: 0 },
      { id: "export", status: "ready", completion: 0, blockingCount: 0, warningCount: 0 },
    ],
    actions: [{
      id: "resolve-continuity",
      section: "story",
      priority: "high",
      messageKo: "설명되지 않은 연속성 오류를 해결하세요.",
      messageEn: "Resolve unexplained continuity errors.",
    }],
  },
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectReadinessPanel", () => {
  it("does not fabricate a ready state when no project snapshot exists", () => {
    render(
      <MemoryRouter>
        <StudioProjectReadinessPanel projectId="project-1" locale="ko" />
      </MemoryRouter>,
    );
    expect(screen.getByText("프로젝트 준비도 · 검사 전")).toBeTruthy();
    expect(screen.queryByText(/프로젝트 준비도 100%/u)).toBeNull();
  });

  it("shows a missing diagnostic source instead of silently keeping the pre-check state", () => {
    render(
      <MemoryRouter>
        <StudioProjectReadinessPanel projectId="project-1" locale="ko" />
      </MemoryRouter>,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT, {
        detail: {
          projectId: "project-1",
          code: "source-missing",
          message: "Project diagnostic data has not been collected yet.",
        },
      }));
    });

    expect(screen.getByText("프로젝트 준비도 · 연결 데이터 없음")).toBeTruthy();
    expect(screen.getByText(/source-missing/u)).toBeTruthy();
    expect(screen.queryByText(/프로젝트 준비도 100%/u)).toBeNull();
  });

  it("reacts to a persisted readiness update", () => {
    render(
      <MemoryRouter>
        <StudioProjectReadinessPanel projectId="project-1" locale="ko" />
      </MemoryRouter>,
    );
    writeStudioProjectReadinessSnapshot(window.localStorage, SNAPSHOT);
    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_READINESS_UPDATED_EVENT, {
        detail: SNAPSHOT,
      }));
    });
    expect(screen.getByText("프로젝트 준비도 50%")).toBeTruthy();
    expect(screen.getByText("설명되지 않은 연속성 오류를 해결하세요.")).toBeTruthy();
    expect(screen.getAllByText("해결 필요").length).toBeGreaterThan(0);
  });

  describe("개연성 점검 권장 안내", () => {
    const renderWithSnapshot = () => {
      writeStudioProjectReadinessSnapshot(window.localStorage, SNAPSHOT);
      render(
        <MemoryRouter>
          <StudioProjectReadinessPanel projectId="project-1" locale="ko" />
        </MemoryRouter>,
      );
    };

    it("점검한 적이 없으면 권장 안내와 점검 허브 링크를 보여 주고, 출시를 막지 않는다고 밝힌다", () => {
      renderWithSnapshot();
      const note = screen.getByText(/개연성 점검 · 아직 점검하지 않았어요/u);
      expect(note.textContent).toContain("출시를 막지 않아요");
      const link = note.closest("a");
      expect(link?.getAttribute("href")).toBe("/studio/work/project-1/storyworld?view=plausibility");
    });

    it("마지막 점검 시각·오류·경고·커버리지를 한 줄로 보여 준다", () => {
      writePlausibilitySummary(window.localStorage, "project-1", {
        version: 1, checkedAtIso: "2026-10-15T09:30:00.000Z", errorCount: 2, warningCount: 5, suggestionCount: 1,
        coveragePercent: 62, sceneCount: 12, partial: false,
      });
      renderWithSnapshot();
      const note = screen.getByText(/개연성 점검 요약/u);
      expect(note.textContent).toMatch(/마지막 점검 .+ · 오류 2 · 경고 5 · 커버리지 62%/u);
    });

    it("점검이 끝나 요약이 바뀌면 새로 고침 없이 갱신된다", () => {
      renderWithSnapshot();
      expect(screen.getByText(/아직 점검하지 않았어요/u)).toBeTruthy();
      act(() => {
        writePlausibilitySummary(window.localStorage, "project-1", {
          version: 1, checkedAtIso: "2026-10-15T09:30:00.000Z", errorCount: 0, warningCount: 3, suggestionCount: 0,
          coveragePercent: 100, sceneCount: 4, partial: true,
        }, window);
      });
      expect(window.localStorage.getItem("toonspectrum:story-plausibility-summary:v1:project-1")).not.toBeNull();
      const note = screen.getByText(/개연성 점검 요약/u);
      expect(note.textContent).toContain("경고 3");
      expect(note.textContent).toContain("일부 장면만 점검");
      expect(STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT).toContain("plausibility");
    });

    it("준비도의 막힘·확인 필요 건수와 상태에는 영향을 주지 않는다", () => {
      writePlausibilitySummary(window.localStorage, "project-1", {
        version: 1, checkedAtIso: "2026-10-15T09:30:00.000Z", errorCount: 9, warningCount: 9, suggestionCount: 9,
        coveragePercent: 10, sceneCount: 12, partial: false,
      });
      renderWithSnapshot();
      expect(screen.getByText("프로젝트 준비도 50%")).toBeTruthy();
      expect(screen.getByText(/해결 필요 1건 · 확인 필요 1건/u)).toBeTruthy();
    });

    it("다른 작품의 요약은 보여 주지 않는다", () => {
      writePlausibilitySummary(window.localStorage, "project-2", {
        version: 1, checkedAtIso: "2026-10-15T09:30:00.000Z", errorCount: 9, warningCount: 9, suggestionCount: 9,
        coveragePercent: 10, sceneCount: 12, partial: false,
      });
      renderWithSnapshot();
      expect(screen.getByText(/아직 점검하지 않았어요/u)).toBeTruthy();
    });
  });
});
