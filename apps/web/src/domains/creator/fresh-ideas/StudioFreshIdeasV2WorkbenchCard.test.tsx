// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioFreshIdeasV2WorkbenchCard } from "./StudioFreshIdeasV2WorkbenchCard";

const { database } = vi.hoisted(() => {
  let value: string | null = null;
  return {
    database: {
      kvGet: vi.fn(async () => value),
      kvSet: vi.fn(async (_namespace: string, _key: string, raw: string) => { value = raw; }),
      reset: () => { value = null; },
    },
  };
});
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => database }));
beforeEach(() => {
  window.localStorage.clear();
  database.reset();
  database.kvSet.mockClear();
});

afterEach(cleanup);

describe("StudioFreshIdeasV2WorkbenchCard (@unslop 9-pass UI v2.2)", () => {
  it("renders 100/100 badge, supports cold-start/multi-source drawer, contrarian modes, 9 extended lenses, streaming, OSMU, and Idea Bank status switching", async () => {
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

    // Open multi-source & pre-lens deconstruction drawer, test Cold-Start & trigger router
    fireEvent.click(screen.getByTestId("fresh-ideas-source-drawer-toggle"));
    expect(screen.getByTestId("fresh-ideas-deconstruction-summary")).toBeTruthy();
    fireEvent.change(screen.getByTestId("fresh-ideas-trigger-input"), {
      target: { value: "이 문서 TL;DR 요약만 해줘" },
    });
    expect(screen.getByTestId("fresh-ideas-trigger-route-readout").textContent).toContain(
      "일반 요약 라우팅",
    );
    fireEvent.click(screen.getByTestId("fresh-ideas-cold-start-workspace-doc"));
    fireEvent.click(screen.getByTestId("fresh-ideas-blindspot-legal-ip-risk"));

    // Contrarian 3-mode switcher on Lens 01
    fireEvent.click(screen.getByTestId("fresh-ideas-contrarian-conditional-nuance"));
    expect(screen.getByTestId("fresh-ideas-mode-a-panel").textContent).toContain("경계선");

    // Toggle Cross-Labs unified remix
    fireEvent.click(screen.getByTestId("fresh-ideas-toggle-cross-labs"));
    expect(screen.getByTestId("fresh-ideas-mode-a-panel").textContent).toContain(
      "3대 랩스 통합 리믹스",
    );
    fireEvent.click(screen.getByTestId("fresh-ideas-toggle-cross-labs"));

    // Select an extended lens (07 failure-autopsy) and append/swap
    fireEvent.change(screen.getByTestId("fresh-ideas-extended-lens-select"), {
      target: { value: "failure-autopsy" },
    });
    fireEvent.click(screen.getByTestId("fresh-ideas-toggle-extended-lens"));
    expect(screen.getByTestId("fresh-ideas-v2-lens-07")).toBeTruthy();

    // Switch to Mode B, test speech register lock, dual preview 3-line cut, 60s Shorts, and streaming
    fireEvent.click(screen.getByTestId("fresh-ideas-mode-mode-b-channel-draft"));
    fireEvent.change(screen.getByTestId("fresh-ideas-register-select"), {
      target: { value: "haera" },
    });
    fireEvent.click(screen.getByTestId("fresh-ideas-channel-default-dual-preview"));
    expect(screen.getByTestId("fresh-ideas-dual-three-line-cut")).toBeTruthy();
    fireEvent.click(screen.getByTestId("fresh-ideas-channel-shorts-reels-60s"));
    fireEvent.click(screen.getByTestId("fresh-ideas-stream-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("fresh-ideas-stream-output").textContent).toContain("100%");
    });

    // Switch to Mode C, test OSMU tabs, save 5 rows to Idea Bank, update status, and export CSV
    fireEvent.click(screen.getByTestId("fresh-ideas-mode-mode-c-ecosystem"));
    fireEvent.click(screen.getByTestId("fresh-ideas-osmu-newsletter"));
    fireEvent.click(screen.getByTestId("fresh-ideas-save-bank-btn"));
    await waitFor(() => expect(screen.getByTestId("fresh-ideas-bank-count").textContent).toContain("5건"));

    const statusSelects = screen.getAllByLabelText(/진행 상태/u);
    expect(statusSelects.length).toBeGreaterThanOrEqual(1);
    fireEvent.change(statusSelects[0]!, { target: { value: "Published" } });
    await waitFor(() => expect((statusSelects[0] as HTMLSelectElement).value).toBe("Published"));

    fireEvent.click(screen.getByTestId("fresh-ideas-export-csv-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("fresh-ideas-export-notice").textContent).toContain("CSV");
    });
    expect(onStatusChange).toHaveBeenCalled();
  });

  it("shows [측정 필요] without fabricating mock scores when crossLabsEnvelope is omitted, and uses real telemetry when injected", async () => {
    const onExportStorySeed = vi.fn();
    const { rerender } = render(
      <StudioFreshIdeasV2WorkbenchCard
        sourceTitle="침수 도서관 1화 기획"
        sourceSummaryKo="서연이 침수 도서관 문턱에서 편지를 줍고 등불지기 길드의 규칙과 충돌한다."
        onExportStorySeed={onExportStorySeed}
      />,
    );

    // Without crossLabsEnvelope: toggling cross-labs shows [측정 필요] and no fake scores
    fireEvent.click(screen.getByTestId("fresh-ideas-toggle-cross-labs"));
    expect(screen.getByTestId("fresh-ideas-cross-labs-status-badge").textContent).toContain(
      "[측정 필요]",
    );
    expect(screen.getByTestId("fresh-ideas-cross-labs-measurement-needed").textContent).toContain(
      "임의 점수를 생성하지 않았습니다",
    );
    expect(screen.getByTestId("fresh-ideas-mode-a-panel").textContent).not.toContain("94.2");
    expect(screen.getByTestId("fresh-ideas-mode-a-panel").textContent).not.toContain("97.3");
    expect(screen.getByTestId("fresh-ideas-mode-a-panel").textContent).not.toContain("96.9");
    expect(screen.getByTestId("fresh-ideas-v2-capability-badge").textContent).toContain(
      "Unslop 100점",
    );

    // With real crossLabsEnvelope injected: synthesizes from measured telemetry
    rerender(
      <StudioFreshIdeasV2WorkbenchCard
        sourceTitle="침수 도서관 1화 기획"
        sourceSummaryKo="서연이 침수 도서관 문턱에서 편지를 줍고 등불지기 길드의 규칙과 충돌한다."
        crossLabsEnvelope={{
          schemaVersion: 2,
          episodeTitleKo: "침수 도서관 실측 통합",
          bg3d: {
            overallScore100: 88.0,
            weeklyHoursSaved: 12.0,
            contrastRatio: 2.1,
            lineThicknessPx: 1.2,
          },
          brushLab: {
            overallScore100: 91.0,
            taperSharpness100: 90.0,
            averageStrokePx: 3.8,
            presetNameKo: "정밀 잉크펜",
          },
          characterLab: {
            overallScore100: 89.0,
            turnaroundScore100: 88.5,
            faceSdfScore100: 92.0,
            outlineWidthMm: 2.8,
          },
        }}
        onExportStorySeed={onExportStorySeed}
      />,
    );

    expect(screen.queryByTestId("fresh-ideas-cross-labs-measurement-needed")).toBeNull();
    expect(screen.getByTestId("fresh-ideas-mode-a-panel").textContent).toContain("89.3점");

    // Mode C: export story cut seed button invokes callback and updates notice
    fireEvent.click(screen.getByTestId("fresh-ideas-mode-mode-c-ecosystem"));
    const exportBtn = screen.getByTestId("fresh-ideas-export-story-seed-btn");
    expect(exportBtn.className).toContain("min-h-11");
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(onExportStorySeed).toHaveBeenCalledTimes(1);
    });
    const exported = onExportStorySeed.mock.calls[0]?.[0];
    expect(exported.cutSeed.cuts.length).toBeGreaterThanOrEqual(4);
    expect(exported.livingSpecSeed.goalKo.length).toBeGreaterThan(5);
    expect(screen.getByTestId("fresh-ideas-export-notice").textContent).toContain(
      "스토리 컷 시드",
    );
  });

  it("저장 실패를 완료로 표시하거나 저장 건수를 늘리지 않는다", async () => {
    database.kvSet.mockRejectedValueOnce(new Error("디스크 쓰기 거부"));
    const onStatusChange = vi.fn();
    render(<StudioFreshIdeasV2WorkbenchCard sourceTitle="작업 소재" sourceSummaryKo="새 초안" onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByTestId("fresh-ideas-mode-mode-c-ecosystem"));
    fireEvent.click(screen.getByTestId("fresh-ideas-save-bank-btn"));
    expect(await screen.findByText(/아이디어 뱅크에 저장하지 못했습니다/u)).toBeTruthy();
    expect(screen.getByTestId("fresh-ideas-bank-count").textContent).toContain("0건");
    expect(onStatusChange.mock.calls.flat()).not.toContainEqual(expect.stringContaining("뱅크 저장 완료"));
  });
});
