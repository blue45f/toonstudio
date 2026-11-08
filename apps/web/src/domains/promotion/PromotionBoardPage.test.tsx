// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromotionBoardPage } from "./PromotionBoardPage";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("./use-promotion-feed", () => ({
  usePromotionFeed: () => ({
    page: { items: [], hasMore: false, canModerate: false },
    loading: false,
    moreLoading: false,
    error: null,
    refresh: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

describe("PromotionBoardPage REA launch trailer & conversion funnel simulator", () => {
  beforeEach(() => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the launch funnel bar and switches promo channels and hook windows in ko and en", () => {
    render(
      <MemoryRouter initialEntries={["/community/promote"]}>
        <PromotionBoardPage />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("promotion-rea-launch-funnel-bar");
    expect(bar).toBeTruthy();

    expect(screen.getByTestId("promotion-rea-channel-canvas-first-ep-hook").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("promotion-rea-hook-3sec-thumb-stop").getAttribute("aria-pressed")).toBe("true");

    const status = screen.getByTestId("promotion-rea-launch-funnel-status");
    expect(status.textContent).toContain("Pixiv Comic");
    expect(status.textContent).toContain("Webtoon Canvas");
    expect(status.textContent).toContain("Tapas");
    expect(status.textContent).toContain("Comipo");

    fireEvent.click(screen.getByTestId("promotion-rea-channel-pixiv-comic-pv-reel"));
    expect(screen.getByTestId("promotion-rea-channel-pixiv-comic-pv-reel").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("promotion-rea-channel-canvas-first-ep-hook").getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("Pixiv Comic 성우·모션 PV 릴스");

    fireEvent.click(screen.getByTestId("promotion-rea-hook-15sec-cliffhanger"));
    expect(screen.getByTestId("promotion-rea-hook-15sec-cliffhanger").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("promotion-rea-hook-3sec-thumb-stop").getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("15초 클리프행어 대사");

    act(() => {
      useI18n.getState().setLang("en");
    });

    expect(status.textContent).toContain("Pixiv Comic Voice & Motion PV Reel");
    expect(status.textContent).toContain("15-Sec Cliffhanger Hook");
    expect(bar.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
  });

  it("maintains contrast (text-on-accent), group semantics (role=group), and 44px target (min-h-11 / data-own-control-size)", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/community/promote"]}>
        <PromotionBoardPage />
      </MemoryRouter>,
    );

    const shell = container.querySelector(".pc-shell");
    expect(shell?.hasAttribute("data-own-control-size")).toBe(true);

    const bar = screen.getByTestId("promotion-rea-launch-funnel-bar");
    expect(bar.hasAttribute("data-own-control-size")).toBe(true);

    expect(screen.getByRole("group", { name: "런칭 홍보 채널" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "트레일러 훅 윈도우" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "게시물 유형" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "탐색 상세 필터" })).toBeTruthy();

    const activeChannelBtn = screen.getByTestId("promotion-rea-channel-canvas-first-ep-hook");
    expect(activeChannelBtn.className).toContain("text-on-accent");
    expect(activeChannelBtn.className).not.toContain("text-white");
    expect(activeChannelBtn.className).toContain("min-h-11");

    const activeHookBtn = screen.getByTestId("promotion-rea-hook-3sec-thumb-stop");
    expect(activeHookBtn.className).toContain("text-on-accent");
    expect(activeHookBtn.className).not.toContain("text-white");
    expect(activeHookBtn.className).toContain("min-h-11");
  });
});
