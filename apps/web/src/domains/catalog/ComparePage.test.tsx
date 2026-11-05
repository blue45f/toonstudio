// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComparePage } from "./ComparePage";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("@/shared/components/compare-view", () => ({
  CompareView: () => <div data-testid="mock-compare-view" />,
}));

describe("ComparePage REA multi-axis comparison & cohort retention simulator", () => {
  beforeEach(() => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the multi-axis simulator and switches comparison lenses and cohort windows in ko and en", () => {
    render(
      <MemoryRouter initialEntries={["/compare"]}>
        <ComparePage />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("compare-rea-multi-axis-bar");
    expect(bar).toBeTruthy();

    const defaultLens = screen.getByTestId("compare-rea-lens-retention-completion");
    const defaultCohort = screen.getByTestId("compare-rea-cohort-ep1-to-ep3");
    expect(defaultLens.getAttribute("aria-pressed")).toBe("true");
    expect(defaultCohort.getAttribute("aria-pressed")).toBe("true");

    const status = screen.getByTestId("compare-rea-multi-axis-status");
    expect(status.textContent).toContain("Naver Webtoon");
    expect(status.textContent).toContain("KakaoPage");
    expect(status.textContent).toContain("Piccoma");
    expect(status.textContent).toContain("AniList");
    expect(status.textContent).toContain("MangaUpdates");
    expect(status.textContent).toContain("Tapas");

    fireEvent.click(screen.getByTestId("compare-rea-lens-global-simulrelease"));
    expect(screen.getByTestId("compare-rea-lens-global-simulrelease").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("compare-rea-lens-retention-completion").getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("AniList·MangaUpdates");

    fireEvent.click(screen.getByTestId("compare-rea-cohort-ep10-lock-in"));
    expect(screen.getByTestId("compare-rea-cohort-ep10-lock-in").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("compare-rea-cohort-ep1-to-ep3").getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("10화 유료 전환 락인");

    act(() => {
      useI18n.getState().setLang("en");
    });

    expect(status.textContent).toContain("Global Simulrelease & DB Rating Delta");
    expect(status.textContent).toContain("Ep 10 Paid Lock-In Window");
    expect(bar.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
  });
});
