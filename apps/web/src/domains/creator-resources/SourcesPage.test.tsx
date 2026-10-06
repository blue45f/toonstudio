// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SourcesPage } from "./SourcesPage";
import { RESOURCE_SOURCES } from "./sources";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/insights/resources"]}>
      <SourcesPage />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("resource source cost visibility", () => {
  it("shows explicit free labels on cards", () => {
    renderPage();
    const google = screen.getByRole("heading", { name: "Google Books" }).closest("article");
    const commons = screen.getByRole("heading", { name: "Wikidata·Wikimedia" }).closest("article");
    const kmas = screen.getByRole("heading", { name: "만화규장각 KMAS" }).closest("article");
    expect(google).not.toBeNull();
    expect(commons).not.toBeNull();
    expect(kmas).not.toBeNull();
    expect(within(google!).getByText("무료 · 키/신청 필요")).toBeTruthy();
    expect(within(commons!).getByText("무료 · 키 없음")).toBeTruthy();
    expect(within(kmas!).getByText("무료 · 키/신청 필요")).toBeTruthy();
  });

  it("binds source identity by product route, not by name", () => {
    const { container } = renderPage();
    // 기능 경로 바인딩이 있는 17개 행만 소스 정체성(스코프·마크)을 단다.
    expect(container.querySelectorAll("article.research-source")).toHaveLength(17);
    // 경로를 가진 행은 그 경로의 제공처로 확정된다 — 이름이 비슷한
    // "Wikidata·Wikimedia" 행이 아니라 "Wikimedia Analytics" 행이다.
    const wikimedia = screen.getByRole("heading", { name: "Wikimedia Analytics" }).closest("article");
    expect(wikimedia?.classList.contains("research-source--wikimedia")).toBe(true);
    expect(wikimedia?.querySelector(".resource-source-cover")).toBeTruthy();
    const ambient = container.querySelector("article.research-source--ambientcg");
    expect(ambient?.querySelector("img")?.getAttribute("src")).toBe("/brand/illustrated-20260928/materials.webp");
    // 경로가 없는 Google Books는 제공처가 실재해도 정체성을 추정해 붙이지 않는다.
    const google = screen.getByRole("heading", { name: "Google Books" }).closest("article");
    expect(google?.classList.contains("research-source")).toBe(false);
  });

  it("filters free providers separately from keyless providers", () => {
    renderPage();
    fireEvent.click(screen.getByRole("checkbox", { name: "무료 제공처만 보기" }));
    expect(screen.getByRole("heading", { name: "Google Books" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "만화규장각 KMAS" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "TMDB" })).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "가입·키 없는 제공처만 보기" }));
    expect(screen.queryByRole("heading", { name: "Google Books" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Wikidata·Wikimedia" })).toBeTruthy();
  });

  it("finds sources by the free cost label", () => {    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "제공처·분야·비용·상업 준비 상태 필터" }), {
      target: { value: "무료 · 키/신청 필요" },
    });
    expect(screen.getByRole("heading", { name: "Google Books" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "The Met" })).toBeNull();
  });

  it("실제 경로(/about/data)에서는 형제 리서치 페이지처럼 마스트헤드 아트를 보여 준다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/about/data"]}>
        <SourcesPage />
      </MemoryRouter>,
    );
    const art = container.querySelector<HTMLImageElement>(".resource-masthead-image");
    expect(art?.getAttribute("src")).toBe("/brand/illustrated-20260928/materials.webp");
  });

  it("머리말에서 제공처 규모와 수집-판정-활용 흐름을 먼저 읽을 수 있다", () => {
    const { container } = renderPage();
    const masthead = container.querySelector(".resource-masthead");
    expect(masthead).not.toBeNull();
    const scoped = within(masthead as HTMLElement);
    expect(scoped.getByText(new RegExp(`제공처 ${RESOURCE_SOURCES.length}곳`))).toBeTruthy();
    expect(scoped.getByRole("heading", { name: "모으기" })).toBeTruthy();
    expect(scoped.getByRole("heading", { name: "판정하기" })).toBeTruthy();
    expect(scoped.getByRole("heading", { name: "쓰기" })).toBeTruthy();
    expect(scoped.getByRole("link", { name: "수집 정책" }).getAttribute("href")).toBe("/about/crawler");
  });

  it("필터와 결과 목록이 설명 섹션보다 먼저 나온다", () => {
    renderPage();
    const filter = screen.getByRole("searchbox", { name: "제공처·분야·비용·상업 준비 상태 필터" });
    const featureMap = screen.getByRole("heading", { name: "추가 콘텐츠가 실제 제작 흐름으로 이어지는 위치" });
    expect(filter.compareDocumentPosition(featureMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const firstCard = screen.getByRole("heading", { name: "Google Books" });
    expect(firstCard.compareDocumentPosition(featureMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
