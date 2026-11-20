// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioFreshIdeasV2WorkbenchCard } from "./StudioFreshIdeasV2WorkbenchCard";

describe("StudioFreshIdeasV2WorkbenchCard (@unslop 9-pass UI v2.2)", () => {
  it("renders 100/100 badge, runs streaming draft, saves Idea Bank, toggles Cross-Labs, and emits zero emoji slop", async () => {
    const onStatusChange = vi.fn();
    render(
      <StudioFreshIdeasV2WorkbenchCard
        sourceTitle="로판 연회 × 던전 귀환 3D 룩데브"
        sourceSummaryKo="주간 70컷 중 45%를 3D 배경으로 처리하며 선굵기 락인으로 검수 반려율을 줄인다."
        sourceMetricsSummaryKo="주당 19.9시간 절감 · 대비율 2.45:1"
        onStatusChange={onStatusChange}
      />,
    );

    const badge = screen.getByTestId("fresh-ideas-v2-capability-badge");
    expect(badge.textContent).toContain("100/100 규격");
    expect(badge.textContent).toContain("Unslop 100점");

    const root = screen.getByTestId("studio-fresh-ideas-v2-workbench");
    expect(root.textContent).not.toMatch(/[🔥📖📊✅🎯💡✨]/u);

    // Toggle Cross-Labs unified remix
    fireEvent.click(screen.getByTestId("fresh-ideas-toggle-cross-labs"));
    expect(screen.getByTestId("fresh-ideas-mode-a-panel").textContent).toContain("3대 랩스 통합 리믹스");
    fireEvent.click(screen.getByTestId("fresh-ideas-toggle-cross-labs"));

    // Toggle extended lens
    fireEvent.click(screen.getByTestId("fresh-ideas-toggle-extended-lens"));
    expect(screen.getByTestId("fresh-ideas-v2-lens-10")).toBeTruthy();

    // Switch to Mode B, select 60s Shorts, and run live streaming draft
    fireEvent.click(screen.getByTestId("fresh-ideas-mode-mode-b-channel-draft"));
    fireEvent.click(screen.getByTestId("fresh-ideas-channel-shorts-reels-60s"));
    fireEvent.click(screen.getByTestId("fresh-ideas-stream-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("fresh-ideas-stream-output").textContent).toContain("100%");
    });

    // Switch to Mode C and save 5 rows to persistent Idea Bank + export CSV/Docs
    fireEvent.click(screen.getByTestId("fresh-ideas-mode-mode-c-ecosystem"));
    fireEvent.click(screen.getByTestId("fresh-ideas-save-bank-btn"));
    expect(screen.getByTestId("fresh-ideas-bank-count").textContent).toContain("5건");
    fireEvent.click(screen.getByTestId("fresh-ideas-export-csv-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("fresh-ideas-export-notice").textContent).toContain("CSV");
    });
    expect(onStatusChange).toHaveBeenCalled();
  });
});
