// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { PromoVideoLibraryPage } from "./PromoVideoLibraryPage";

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("PromoVideoLibraryPage — 20종 REA 3-Mode 뷰 스위처·필터·허브 서브탭·6단계 파이프라인", () => {
  it("204개 원본과 쇼츠 49개를 유지하며 명시적 재생 전에는 미디어를 선로딩하지 않는다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/promo-library"]}><PromoVideoLibraryPage /></MemoryRouter>);
    const videos = Array.from(container.querySelectorAll("video"));
    expect(videos).toHaveLength(204);
    expect(container.querySelectorAll("#promo-category-shorts [data-promo-video]")).toHaveLength(49);
    expect(videos.every((video) => video.preload === "none" && !video.hasAttribute("src"))).toBe(true);
    expect(container.querySelectorAll('a[download][href$=".mp4"]')).toHaveLength(204);
  });

  it("맥락형 서브탭과 3-Mode 뷰 스위처(card, poster, list), 화면 비율 필터, 20종 REA 기준표 및 6단계 창작 동선을 렌더링한다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/promo-library"]}>
        <PromoVideoLibraryPage />
      </MemoryRouter>,
    );

    const subnav = screen.getByRole("navigation", {
      name: "영상 · 홍보 · 컷츠 허브",
    });
    expect(subnav).toBeTruthy();

    const root = container.querySelector(".promo-library");
    expect(root?.getAttribute("data-view-mode")).toBe("card");

    const reaItems = container.querySelectorAll("[data-rea-platform]");
    expect(reaItems).toHaveLength(28);

    const pipelineNav = screen.getByRole("navigation", {
      name: "창작·예고편·배포 6단계 통합 동선",
    });
    expect(pipelineNav).toBeTruthy();

    const presetNav = screen.getByRole("navigation", {
      name: "경쟁사 표준 탐색·랭킹 바로가기",
    });
    expect(presetNav).toBeTruthy();

    const posterBtn = screen.getByRole("button", {
      name: "포스터·쇼츠 그리드",
    });
    fireEvent.click(posterBtn);
    expect(root?.getAttribute("data-view-mode")).toBe("poster");
    expect(posterBtn.getAttribute("aria-pressed")).toBe("true");

    const listBtn = screen.getByRole("button", { name: "컴팩트 리스트" });
    fireEvent.click(listBtn);
    expect(root?.getAttribute("data-view-mode")).toBe("list");

    const verticalBtn = screen.getByRole("button", {
      name: "세로 9:16 쇼츠",
    });
    fireEvent.click(verticalBtn);
    expect(verticalBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeTruthy();
  });
});
