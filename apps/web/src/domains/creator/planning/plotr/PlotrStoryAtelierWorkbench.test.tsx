// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioEpisodeStoryPage } from "../StudioEpisodeStoryPage";
import { StudioPlotlineTimeline } from "../StudioPlotlineTimeline";
import { StudioProjectMoodboard } from "../StudioProjectMoodboard";
import { createInitialStudioProjectPlanning } from "../studio-planning-store";
import { defaultPlotlineTracks } from "../studio-plotline-timeline";
import { clearPlotrMemoryStoreForTest } from "./plotr-device-store";
import { PlotrStoryAtelierWorkbench } from "./PlotrStoryAtelierWorkbench";

vi.mock("../../studio-local-database-runtime", () => {
  const store = new Map<string, string>();
  return {
    resetFailedStudioLocalDatabaseOwnership: async () => false,
    acquireStudioLocalDatabase: async () => ({
      asAsyncKeyValueStore: (ns: string) => ({
        get: async (key: string) => store.get(`${ns}/${key}`) ?? null,
        set: async (key: string, value: string) => {
          store.set(`${ns}/${key}`, value);
        },
      }),
    }),
  };
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearPlotrMemoryStoreForTest();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PlotrStoryAtelierWorkbench — 실마운트 · 초보자 플로우 · #227 3대 엔진 통합", () => {
  it("StudioEpisodeStoryPage에서 지연 마운트되어 1클릭 로판 샘플→컷 조립→말풍선→회차 반영까지 동작한다", async () => {
    const planning = createInitialStudioProjectPlanning("proj-plotr-ep");
    const onSavePlan = vi.fn(() => true);

    render(
      <MemoryRouter>
        <StudioEpisodeStoryPage
          season={planning.season}
          plans={planning.plans}
          onSavePlan={onSavePlan}
          storyboardHrefForEpisode={() => "/studio/p/proj-plotr-ep/doc-1?workspace=storyboard"}
        />
      </MemoryRouter>,
    );

    // 초기에는 간편하게 접혀 있어 첫 화면 복잡도를 늘리지 않는다.
    expect(screen.queryByTestId("plotr-story-atelier-workbench")).toBeNull();
    fireEvent.click(screen.getByTestId("episode-story-plotr-atelier-toggle"));

    const atelier = await screen.findByTestId("plotr-story-atelier-workbench");
    expect(atelier.getAttribute("data-mode")).toBe("simple");

    // 1클릭 로판 샘플 시작
    fireEvent.click(within(atelier).getByTestId("plotr-template-rofan"));
    expect(within(atelier).getByTestId("plotr-cut-strip-list").children.length).toBeGreaterThanOrEqual(4);

    // 빈 컷 일괄 조립 + 말풍선 올리기 + 대사 직접 수정 후 삭제→재적용 보존
    fireEvent.click(within(atelier).getByTestId("plotr-batch-assemble-btn"));
    fireEvent.click(within(atelier).getByTestId("plotr-batch-bubbles-btn"));
    const firstDialogueInput = within(atelier).getAllByTestId(/^plotr-dialogue-input-/)[0] as HTMLInputElement;
    fireEvent.change(firstDialogueInput, { target: { value: "내가 고친 파혼 선언 대사" } });
    fireEvent.click(within(atelier).getByTestId("plotr-clear-bubbles-btn"));
    fireEvent.click(within(atelier).getByTestId("plotr-batch-bubbles-btn"));
    expect((within(atelier).getAllByTestId(/^plotr-dialogue-input-/)[0] as HTMLInputElement).value).toBe(
      "내가 고친 파혼 선언 대사",
    );

    // 글콘티 TXT 내보내기 & 회차 줄거리에 반영
    fireEvent.click(within(atelier).getByTestId("plotr-export-conti-btn"));
    expect(within(atelier).getByTestId("plotr-text-conti-preview").textContent).toContain("유리시계 공작가의 계약");
    fireEvent.click(within(atelier).getByTestId("plotr-apply-episode-plan-btn"));
    expect(onSavePlan).toHaveBeenCalledTimes(1);
    expect(onSavePlan.mock.calls[0]?.[0]?.turningPoints.length).toBeGreaterThanOrEqual(4);
  });

  it("재마운트 시 작업본이 복원되고, 전문가 모드에서 연속 대본·스냅샷 Diff·폐기 설정 경고가 실시간 동작한다", async () => {
    const projectId = "proj-plotr-persist";
    const { unmount } = render(
      <MemoryRouter>
        <PlotrStoryAtelierWorkbench projectId={projectId} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("plotr-template-rofan"));
    await waitFor(() => {
      expect(screen.getByTestId("plotr-cut-strip-list").children.length).toBeGreaterThanOrEqual(4);
    });
    unmount();

    // 재마운트 후에도 같은 작품의 대본과 컷이 그대로 복원되어야 한다.
    render(
      <MemoryRouter>
        <PlotrStoryAtelierWorkbench projectId={projectId} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect((screen.getByTestId("plotr-script-textarea") as HTMLTextAreaElement).value).toContain("세레나");
    });

    // 전문가 모드 → 연속 대본 · 스냅샷 · Codex 탐지
    fireEvent.click(screen.getByTestId("plotr-toggle-expert-mode"));
    fireEvent.click(screen.getByTestId("plotr-expert-tab-scrivenings"));
    const scrivenings = await screen.findByTestId("plotr-scrivenings-codex-view");

    // 스냅샷 찍고 폐기된 설정('붉은 저주') 언급 시 즉시 경고 발생 + 단어 Diff 표시
    fireEvent.click(within(scrivenings).getByTestId("capture-scene-snapshot-btn"));
    const textarea = within(scrivenings).getByTestId("scrivenings-composite-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: `${textarea.value}\n붉은 저주 문장이 추가되었다.` },
    });
    expect(within(scrivenings).getByTestId("codex-retired-warning").textContent).toContain("폐기된 설정");
    fireEvent.click(within(scrivenings).getByRole("button", { name: "연속 대본 반영하기" }));
    expect(within(scrivenings).getByTestId("scrivenings-word-diff").textContent).toContain("+");
  });

  it("StudioPlotlineTimeline에서 이중 지하철 타임라인·지도(#227)를 실마운트해 연재순↔작중순 전환과 JSON Canvas를 실행한다", async () => {
    const planning = createInitialStudioProjectPlanning("proj-subway-mount");
    const tracks = defaultPlotlineTracks([]);
    render(
      <StudioPlotlineTimeline
        season={planning.season}
        plans={planning.plans}
        tracks={tracks}
        cards={[]}
        locations={[{ id: "loc-1", name: "유리온실" }]}
        onCardsChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("plotline-switch-dual-subway"));
    const subway = await screen.findByTestId("plotr-dual-subway-timeline");
    fireEvent.click(within(subway).getByTestId("subway-axis-chronological"));
    expect(
      within(subway).getByTestId("subway-axis-chronological").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("StudioProjectMoodboard에서 자유 공간 스토리보드(#227)를 실마운트해 카드 추가와 하위 보드를 조작한다", async () => {
    render(<StudioProjectMoodboard projectId="proj-spatial-mount" />);
    await screen.findByText("이 기기에 저장됨");

    fireEvent.click(screen.getByTestId("moodboard-toggle-spatial-view"));
    const spatial = await screen.findByTestId("plotr-spatial-board-view");
    fireEvent.change(within(spatial).getByLabelText("공간 카드 제목"), {
      target: { value: "엔딩 반전 컷" },
    });
    fireEvent.click(within(spatial).getByRole("button", { name: "카드 놓기" }));
    expect(spatial.textContent).toContain("엔딩 반전 컷");
  });

  it("신규 Plotr 모듈 전부 800줄 이하 · OKLCH · 무스피너 · 무금지패턴 · 모션 폴백 가드레일을 준수한다", () => {
    const tsFiles = [
      "plotr-types.ts",
      "plotr-genre-template-presets.ts",
      "plotr-genre-template-presets-extra.ts",
      "plotr-genre-templates.ts",
      "plotr-script-cut-engine.ts",
      "plotr-consistency-and-batch.ts",
      "plotr-device-store.ts",
      "PlotrConsistencyAssetStrip.tsx",
      "PlotrTensionAndStylePanel.tsx",
      "PlotrDualSubwayTimelineView.tsx",
      "PlotrSpatialBoardView.tsx",
      "PlotrScriveningsCodexView.tsx",
      "PlotrCutStripAndAssetsPane.tsx",
      "PlotrStoryAtelierWorkbench.tsx",
    ];
    for (const name of tsFiles) {
      const src = readFileSync(resolve(__dirname, name), "utf8");
      expect(src.split("\n").length, name).toBeLessThanOrEqual(800);
      expect(src, name).not.toContain("@ts-nocheck");
      expect(src, name).not.toContain("@ts-ignore");
      expect(src, name).not.toContain("eslint-disable");
      expect(src, name).not.toContain("transition-all");
      expect(src, name).not.toContain("animate-spin");
      expect(src, name).not.toContain("bg-white");
      expect(src, name).not.toContain("font-black");
      expect(src, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src, name).not.toMatch(/\brgb\s*\(/u);
    }
    const css = readFileSync(resolve(__dirname, "plotr-story-atelier.css"), "utf8");
    expect(css).toContain("color-mix(in oklch");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain("forced-colors: active");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgb\s*\(/u);
  });
});
