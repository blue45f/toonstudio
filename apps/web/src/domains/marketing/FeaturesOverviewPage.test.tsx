// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { FeaturesOverviewPage } from "./FeaturesOverviewPage";
import { FEATURE_OVERVIEW_CATEGORIES } from "./features-overview-data";

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <FeaturesOverviewPage />
    </MemoryRouter>,
  );
}

describe("FeaturesOverviewPage", () => {
  it("제목과 규모 수치(작품 정보·플랫폼)를 보여 준다", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "툰스튜디오의 모든 기능을 한눈에." }),
    ).toBeTruthy();
    expect(screen.getByText("60,234")).toBeTruthy();
    expect(screen.getByText("외부 플랫폼 작품 정보")).toBeTruthy();
    expect(screen.getByText("작품을 모으는 플랫폼")).toBeTruthy();
  });

  it("모든 카테고리 섹션과 항목 링크가 데이터 그대로 렌더된다", () => {
    const { container } = renderPage();
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      const section = container.querySelector(`#features-${category.id}`);
      expect(section, category.id).toBeTruthy();
      expect(
        within(section as HTMLElement).getByRole("heading", { name: category.title.ko }),
      ).toBeTruthy();
      for (const item of category.items) {
        const link = within(section as HTMLElement).getByRole("link", {
          // 접근 이름은 "이름 + 설명"이라 이름으로 시작하는 링크만 특정한다.
          name: new RegExp(`^${item.name.ko.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`),
        });
        expect(link.getAttribute("href"), `${category.id} / ${item.href}`).toBe(item.href);
      }
    }
  });

  it("영역 바로가기 앵커가 모든 카테고리를 가리킨다", () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "영역 바로가기" });
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      const anchor = within(nav).getByRole("link", { name: category.title.ko });
      expect(anchor.getAttribute("href")).toBe(`#features-${category.id}`);
    }
  });

  it("전체 목록은 사이트맵으로 위임하는 하단 안내가 있다", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "찾는 기능이 여기 없나요?" }),
    ).toBeTruthy();
    const cta = screen.getByRole("link", { name: /사이트맵에서 전체 찾기/u });
    expect(cta.getAttribute("href")).toBe("/sitemap");
  });
});
