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

/** 접근 이름은 "이름 + 설명 + 사용 조건"이라 이름으로 시작하는 링크만 특정한다. */
function itemLink(container: HTMLElement, name: string): HTMLElement {
  return within(container).getByRole("link", {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`),
  });
}

describe("FeaturesOverviewPage", () => {
  it("제목과 규모 수치(작품 정보·플랫폼)를 보여 준다", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "툰스튜디오의 모든 기능을 한눈에." }),
    ).toBeTruthy();
    expect(screen.getByText("60,234")).toBeTruthy();
    expect(screen.getByText("외부 플랫폼 작품 정보")).toBeTruthy();
    expect(screen.getByText("카탈로그에 담긴 플랫폼")).toBeTruthy();
  });

  it("작품 정보 건수는 수집 스냅샷의 웹툰·웹소설 구성으로, 플랫폼은 정의된 수와 카탈로그에 담긴 수로 나눠 밝힌다", () => {
    renderPage();
    // 플랫폼 칸은 정의된 20곳이 아니라 카탈로그에 실제로 담긴 18곳이다.
    const platformTile = screen.getByText("카탈로그에 담긴 플랫폼").parentElement;
    expect(platformTile).not.toBeNull();
    expect(within(platformTile as HTMLElement).getByText("18")).toBeTruthy();
    expect(screen.queryByText("작품을 모으는 플랫폼")).toBeNull();

    const factsSection = screen.getByRole("region", { name: "서비스 규모" });
    const note = within(factsSection).getByText(/수집 스냅샷 기준/u);
    expect(note.textContent).toContain("2026-06-27");
    expect(note.textContent).toContain("웹툰 11,914건");
    expect(note.textContent).toContain("웹소설 48,320건");
    expect(note.textContent).toContain("정의된 플랫폼은 20곳");
    expect(note.textContent).toContain("18곳");
  });

  it("문서 제목을 기능 지도로 정한다", () => {
    renderPage();
    expect(document.title).toContain("전체 기능 한눈에");
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
        const link = itemLink(section as HTMLElement, item.name.ko);
        expect(link.getAttribute("href"), `${category.id} / ${item.href}`).toBe(item.href);
      }
    }
  });

  it("리다이렉트 별칭 대신 정본 경로로 이어지고 같은 화면의 카드가 둘로 나뉘지 않는다", () => {
    const { container } = renderPage();
    for (const alias of ["/shaper", "/brush-lab", "/challenges", "/creator-hub"]) {
      expect(container.querySelector(`a[href="${alias}"]`), alias).toBeNull();
    }
    expect(container.querySelectorAll('a[href="/studio/assets/characters/new"]')).toHaveLength(1);
    expect(container.querySelector('a[href="/studio/assets/brushes/new"]')).not.toBeNull();
    expect(container.querySelector('a[href="/showcase/challenges"]')).not.toBeNull();
  });

  it("실험·베타·데스크톱 권장·로그인 필요를 라우트 메타데이터에서 읽어 카드에 표시한다", () => {
    const { container } = renderPage();
    const badgeTexts = (name: string): string[] =>
      [...itemLink(container, name).querySelectorAll("small")].map((badge) => badge.textContent ?? "");

    expect(badgeTexts("AI 크리에이티브 디렉터")).toEqual(["실험"]);
    expect(badgeTexts("포즈 스튜디오")).toEqual(["베타", "데스크톱 권장"]);
    expect(badgeTexts("2D→3D 리프트")).toEqual(["실험", "데스크톱 권장"]);
    expect(badgeTexts("세계관 랩")).toEqual(["베타"]);
    expect(badgeTexts("API 키 허브")).toEqual(["로그인 필요"]);
    expect(badgeTexts("연재 센터")).toEqual(["로그인 필요"]);
    // 안정 공개 기능에는 배지를 붙이지 않는다.
    expect(badgeTexts("드로잉 캔버스")).toEqual([]);
    expect(badgeTexts("PDF 워크벤치")).toEqual([]);
  });

  it("영역 바로가기 앵커가 모든 카테고리를 가리킨다", () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "영역 바로가기" });
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      const anchor = within(nav).getByRole("link", { name: category.title.ko });
      expect(anchor.getAttribute("href")).toBe(`#features-${category.id}`);
    }
  });

  it("안내 영역이 제작 과정·기술과 신뢰·제품 원칙·홍보영상으로 이어진다", () => {
    const { container } = renderPage();
    const guide = container.querySelector("#features-guide");
    expect(guide).toBeTruthy();
    for (const href of ["/about", "/product-tour", "/brand-film", "/about/workflow", "/about/technology", "/about/principles"]) {
      expect(guide?.querySelector(`a[href="${href}"]`), href).not.toBeNull();
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
