// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelapseGalleryPage } from "./TimelapseGalleryPage";

const mockClips = vi.hoisted(() => [
  {
    id: "clip-1",
    title: "초장문 한국어 타임랩스 제목 — 배경 투시도 러프부터 셀 채색·조명 합성까지의 전 과정 기록",
    description: "클립 설명 텍스트",
    authorName: "작가하나",
    ownerKey: "guest:guest-1",
    visibility: "public" as const,
    createdAt: "2026-11-07T00:00:00.000Z",
    updatedAt: "2026-11-07T00:00:00.000Z",
    durationMs: 12000,
    strokeCount: 420,
    width: 1080,
    height: 1440,
    likes: 12,
    views: 95,
    frames: [],
  },
  {
    id: "clip-2",
    title: "캐릭터 선화 드로잉",
    description: "펜선 연습",
    authorName: "작가둘",
    ownerKey: "user:other-user",
    visibility: "public" as const,
    createdAt: "2026-11-06T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
    durationMs: 8000,
    strokeCount: 210,
    width: 1080,
    height: 1440,
    likes: 5,
    views: 40,
    frames: [],
  },
]);

vi.mock("@/domains/creator/public/timelapse", () => ({
  TIMELAPSE_CLIP_SORT_OPTIONS: [
    { id: "latest", ko: "최신순", en: "Latest" },
    { id: "popular", ko: "인기순", en: "Popular" },
  ],
  TimelapseClipCard: ({ clip }: { readonly clip: { readonly id: string; readonly title: string } }) => (
    <article data-testid={`timelapse-clip-${clip.id}`}>{clip.title}</article>
  ),
  parseTimelapseClipSort: (raw: string | null) => (raw === "popular" ? "popular" : "latest"),
  sortTimelapseClips: <T,>(list: readonly T[]) => [...list],
  useTimelapseShareHydrated: () => true,
  useTimelapseShareStore: (selector: (state: { clips: typeof mockClips }) => unknown) =>
    selector({ clips: mockClips }),
  visibleTimelapseClips: <T,>(list: readonly T[]) => [...list],
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

vi.mock("@/domains/auth/public/session/guest-session", () => ({
  useGuestSession: () => ({ guest: { id: "guest-1" } }),
}));

afterEach(() => {
  cleanup();
});

describe("TimelapseGalleryPage (GAP-R4-05 Round 5 touch target & filter group accessibility)", () => {
  it("필터 컨트롤 그룹과 텔레메트리 분석 모드·배속 그룹에 role='group' 및 44px(min-h-11) 터치 타깃, 320px 간격(gap-2), 긴 한국어 줄바꿈 클래스를 부여한다", () => {
    render(
      <MemoryRouter initialEntries={["/community/timelapses"]}>
        <TimelapseGalleryPage />
      </MemoryRouter>,
    );

    const filterControlsGroup = screen.getByRole("group", {
      name: /타임랩스 목록 필터 및 검색|Timelapse list filters and search/i,
    });
    expect(filterControlsGroup).toBeTruthy();
    expect(filterControlsGroup.className).toContain("gap-2");

    const modeGroup = screen.getByRole("group", {
      name: /타임랩스 분석 모드|Timelapse inspection mode/i,
    });
    expect(modeGroup.className).toContain("gap-2");

    const speedGroup = screen.getByRole("group", {
      name: /리플레이 배속|Replay speed/i,
    });
    expect(speedGroup.className).toContain("gap-2");

    const modeButtons = within(modeGroup).getAllByRole("button");
    expect(modeButtons).toHaveLength(3);
    for (const btn of modeButtons) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.className).toContain("min-w-11");
      expect(btn.className).toContain("focus-visible:outline");
      expect(btn.className).toContain("[overflow-wrap:anywhere]");
    }

    const speedButtons = within(speedGroup).getAllByRole("button");
    expect(speedButtons).toHaveLength(3);
    for (const btn of speedButtons) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.className).toContain("min-w-11");
      expect(btn.className).toContain("focus-visible:outline");
    }

    const mineChip = screen.getByTestId("timelapse-filter-mine-chip");
    expect(mineChip.className).toContain("min-h-11");
    expect(mineChip.className).toContain("focus-within:outline");

    const searchInput = screen.getByRole("searchbox");
    expect(searchInput.className).toContain("min-h-11");
  });

  it("필터 칩 클릭 시 aria-pressed·data-state 선택 상태와 텔레메트리 요약 및 내 클립 필터가 정확히 갱신된다", () => {
    render(
      <MemoryRouter initialEntries={["/community/timelapses"]}>
        <TimelapseGalleryPage />
      </MemoryRouter>,
    );

    const heatmapBtn = screen.getByTestId("timelapse-rea-mode-stroke-heatmap");
    const chronologyBtn = screen.getByTestId("timelapse-rea-mode-layer-chronology");
    const c2paBtn = screen.getByTestId("timelapse-rea-mode-c2pa-human-proof");

    expect(heatmapBtn.getAttribute("aria-pressed")).toBe("true");
    expect(heatmapBtn.getAttribute("data-state")).toBe("active");
    expect(chronologyBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chronologyBtn);
    expect(chronologyBtn.getAttribute("aria-pressed")).toBe("true");
    expect(chronologyBtn.getAttribute("data-state")).toBe("active");
    expect(heatmapBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("timelapse-rea-telemetry-status").textContent).toMatch(/5단계|5-stage/i);

    fireEvent.click(c2paBtn);
    expect(c2paBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("timelapse-rea-telemetry-status").textContent).toMatch(/C2PA/);

    const speed16Btn = screen.getByTestId("timelapse-rea-speed-16x");
    const speed4Btn = screen.getByTestId("timelapse-rea-speed-4x");
    expect(speed4Btn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(speed16Btn);
    expect(speed16Btn.getAttribute("aria-pressed")).toBe("true");
    expect(speed4Btn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("timelapse-rea-telemetry-status").textContent).toContain("16x");

    expect(screen.getByTestId("timelapse-clip-clip-1")).toBeTruthy();
    expect(screen.getByTestId("timelapse-clip-clip-2")).toBeTruthy();

    const mineCheckbox = screen.getByRole("checkbox");
    fireEvent.click(mineCheckbox);
    expect(screen.getByTestId("timelapse-filter-mine-chip").getAttribute("data-state")).toBe("active");
    expect(screen.getByTestId("timelapse-clip-clip-1")).toBeTruthy();
    expect(screen.queryByTestId("timelapse-clip-clip-2")).toBeNull();
  });

  it("필터 칩 그룹 내부에서 키보드 화살표(ArrowRight/ArrowLeft/Home/End)로 포커스가 순환 이동한다", () => {
    render(
      <MemoryRouter initialEntries={["/community/timelapses"]}>
        <TimelapseGalleryPage />
      </MemoryRouter>,
    );

    const heatmapBtn = screen.getByTestId("timelapse-rea-mode-stroke-heatmap");
    const chronologyBtn = screen.getByTestId("timelapse-rea-mode-layer-chronology");
    const c2paBtn = screen.getByTestId("timelapse-rea-mode-c2pa-human-proof");

    heatmapBtn.focus();
    expect(document.activeElement).toBe(heatmapBtn);

    fireEvent.keyDown(heatmapBtn, { key: "ArrowRight" });
    expect(document.activeElement).toBe(chronologyBtn);

    fireEvent.keyDown(chronologyBtn, { key: "End" });
    expect(document.activeElement).toBe(c2paBtn);

    fireEvent.keyDown(c2paBtn, { key: "ArrowRight" });
    expect(document.activeElement).toBe(heatmapBtn);

    fireEvent.keyDown(heatmapBtn, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(c2paBtn);

    fireEvent.keyDown(c2paBtn, { key: "Home" });
    expect(document.activeElement).toBe(heatmapBtn);
  });
});


it("공유 클립을 분석 예시보다 먼저 보여 주고 분석 조작을 명시 영역에 보존한다", () => {
  render(<MemoryRouter initialEntries={["/community/timelapses"]}><TimelapseGalleryPage /></MemoryRouter>);
  const clip = screen.getByTestId("timelapse-clip-clip-1");
  const tools = screen.getByTestId("timelapse-rea-telemetry-bar");
  const details = tools.closest("details");
  expect(clip.closest("details")).toBeNull();
  expect(clip.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(details?.open).toBe(false);
  const summary = details?.querySelector("summary");
  if (!summary) throw new Error("영상 분석 도구 누락");
  fireEvent.click(summary);
  fireEvent.click(screen.getByTestId("timelapse-rea-mode-layer-chronology"));
  expect(screen.getByTestId("timelapse-rea-telemetry-status").textContent).toMatch(/5단계|5-stage/i);
  fireEvent.click(summary);
  fireEvent.click(summary);
  expect(screen.getByTestId("timelapse-rea-mode-layer-chronology").getAttribute("aria-pressed")).toBe("true");
});
