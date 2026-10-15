// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT } from "../studio-project-diagnostic-source-store";
import {
  STUDIO_PROJECT_READINESS_UPDATED_EVENT,
  writeStudioProjectReadinessSnapshot,
  type StudioProjectReadinessSnapshot,
} from "../studio-project-readiness-store";
import {
  STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE,
  plausibilitySummaryKey,
  resetPlausibilitySummaryStoreForTests,
  writePlausibilitySummary,
  type PlausibilitySummarySnapshot,
} from "../storyworld/plausibility/studio-story-plausibility-summary";
import { StudioProjectReadinessPanel } from "./StudioProjectReadinessPanel";

// 개연성 점검 요약은 공용 SQLite 저장소에서 읽는다. 테스트에서는 이름 공간 저장소를 메모리로 대신한다.
const runtime = vi.hoisted(() => ({ rows: new Map<string, string>(), failOpen: false }));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => {
    if (runtime.failOpen) throw new Error("저장소를 열 수 없어요");
    return {
      asAsyncKeyValueStore: (namespace: string) => ({
        get: async (key: string) => runtime.rows.get(`${namespace}:${key}`) ?? null,
        set: async (key: string, value: string) => { runtime.rows.set(`${namespace}:${key}`, value); },
      }),
    };
  },
}));
const summaryRow = (projectId: string) => `${STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE}:${plausibilitySummaryKey(projectId)}`;
const runtimeStore = {
  get: async (key: string) => runtime.rows.get(`${STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE}:${key}`) ?? null,
  set: async (key: string, value: string) => { runtime.rows.set(`${STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE}:${key}`, value); },
};

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

beforeEach(() => {
  runtime.rows.clear();
  runtime.failOpen = false;
  resetPlausibilitySummaryStoreForTests();
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
    const CHECKED: PlausibilitySummarySnapshot = {
      version: 1, checkedAtIso: "2026-10-15T09:30:00.000Z", errorCount: 2, warningCount: 5, suggestionCount: 1,
      coveragePercent: 62, sceneCount: 12, partial: false,
    };
    const renderWithSnapshot = () => {
      writeStudioProjectReadinessSnapshot(window.localStorage, SNAPSHOT);
      render(
        <MemoryRouter>
          <StudioProjectReadinessPanel projectId="project-1" locale="ko" />
        </MemoryRouter>,
      );
    };
    const note = () => screen.getByText(/^개연성 점검/u);

    it("읽는 동안에는 점검했는지 단정하지 않고, 점검한 적이 없으면 권장 안내와 점검 허브 링크를 보여 주며 출시를 막지 않는다고 밝힌다", async () => {
      renderWithSnapshot();
      expect(note().textContent).not.toContain("아직 점검하지 않았어요");
      await waitFor(() => expect(note().textContent).toContain("개연성 점검 · 아직 점검하지 않았어요"));
      expect(note().textContent).toContain("출시를 막지 않아요");
      expect(note().closest("a")?.getAttribute("href")).toBe("/studio/work/project-1/storyworld?view=plausibility");
    });

    it("마지막 점검 시각·오류·경고·커버리지를 한 줄로 보여 준다", async () => {
      runtime.rows.set(summaryRow("project-1"), JSON.stringify(CHECKED));
      renderWithSnapshot();
      await waitFor(() => expect(note().textContent).toMatch(/마지막 점검 .+ · 오류 2 · 경고 5 · 커버리지 62%/u));
    });

    it("점검이 끝나 요약이 바뀌면 새로고침 없이 갱신된다", async () => {
      renderWithSnapshot();
      await waitFor(() => expect(note().textContent).toContain("아직 점검하지 않았어요"));
      await act(async () => {
        await writePlausibilitySummary(runtimeStore, "project-1", { ...CHECKED, errorCount: 0, warningCount: 3, coveragePercent: 100, partial: true }, window);
      });
      expect(note().textContent).toContain("경고 3");
      expect(note().textContent).toContain("일부 장면만 점검");
    });

    it("다른 작품의 점검이 끝났다는 알림은 무시한다", async () => {
      renderWithSnapshot();
      await waitFor(() => expect(note().textContent).toContain("아직 점검하지 않았어요"));
      await act(async () => { await writePlausibilitySummary(runtimeStore, "project-2", CHECKED, window); });
      expect(note().textContent).toContain("아직 점검하지 않았어요");
    });

    it("저장소를 읽지 못하면 '아직 점검하지 않았어요'라고 단정하지 않는다", async () => {
      runtime.failOpen = true;
      renderWithSnapshot();
      await act(async () => { await Promise.resolve(); });
      await waitFor(() => expect(screen.getByText("프로젝트 준비도 50%")).toBeTruthy());
      expect(note().textContent).not.toContain("아직 점검하지 않았어요");
      expect(note().textContent).toContain("출시를 막지 않아요");
    });

    it("준비도의 막힘·확인 필요 건수와 상태에는 영향을 주지 않는다", async () => {
      runtime.rows.set(summaryRow("project-1"), JSON.stringify({ ...CHECKED, errorCount: 9, warningCount: 9, suggestionCount: 9, coveragePercent: 10 }));
      renderWithSnapshot();
      await waitFor(() => expect(note().textContent).toContain("오류 9"));
      expect(screen.getByText("프로젝트 준비도 50%")).toBeTruthy();
      expect(screen.getByText(/해결 필요 1건 · 확인 필요 1건/u)).toBeTruthy();
    });

    it("다른 작품의 요약은 보여 주지 않는다", async () => {
      runtime.rows.set(summaryRow("project-2"), JSON.stringify({ ...CHECKED, errorCount: 9 }));
      renderWithSnapshot();
      await waitFor(() => expect(note().textContent).toContain("아직 점검하지 않았어요"));
      expect(note().textContent).not.toContain("오류 9");
    });

    it("브라우저 KV에는 아무것도 남기지 않는다", async () => {
      runtime.rows.set(summaryRow("project-1"), JSON.stringify(CHECKED));
      renderWithSnapshot();
      await waitFor(() => expect(note().textContent).toContain("오류 2"));
      expect(Object.keys(window.localStorage).filter((key) => key.includes("plausibility"))).toEqual([]);
    });
  });
});
