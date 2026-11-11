// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { OpenDataLabPage } from "./OpenDataLabPage";

afterEach(cleanup);

function mount(initialEntry = "/research/open-data") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <OpenDataLabPage />
    </MemoryRouter>,
  );
}

describe("OpenDataLabPage", () => {
  it("exposes all domestic and international creation workflows", () => {
    mount();
    expect(screen.getByRole("heading", { name: "공개 데이터 창작실" })).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "검색 도구 열기" })).toHaveLength(14);
    expect(screen.getAllByText(/국가유산청/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/NEIS/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TourAPI/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/표준국어대사전/u).length).toBeGreaterThan(0);
  });

  it("gives every provider card its source identity (scope · mark · tagline)", () => {
    const { container } = mount();
    expect(container.querySelectorAll("article.research-source")).toHaveLength(14);
    const ambient = container.querySelector("article.research-source--ambientcg");
    expect(ambient?.querySelector("img")?.getAttribute("src")).toBe("/brand/research-sources-20261008/ambientcg.webp");
    const nasa = container.querySelector("article.research-source--nasa");
    expect(nasa?.querySelector("img")?.getAttribute("src")).toBe("/brand/research-sources-20261008/nasa.webp");
    for (const card of container.querySelectorAll("article.research-source")) {
      expect(card.querySelector("img")).toBeTruthy();
      expect(card.querySelector(".resource-source-cover")).toBeNull();
    }
    expect(screen.getByText(/NASA가 공개한 행성·성운·우주선 이미지 자료실입니다/u)).toBeTruthy();
    expect(screen.getByText(/국가유산청이 공개하는 문화유산 지정·관리 기록을 찾습니다/u)).toBeTruthy();
  });

  it("keeps direct import narrower than reference previews", () => {
    mount();
    expect(screen.getByText(/Studio 직접 가져오기는 CC0가 확인된 ambientCG에만 허용/u)).toBeTruthy();
    expect(screen.getByText(/NASA·V&A는 안전한 미리보기를 레퍼런스 전용/u)).toBeTruthy();
  });

  it("filters providers by creative purpose and keyword with one-click reset", () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: "가입·키 없음 즉시" }));
    expect(container.querySelectorAll("article.research-source")).toHaveLength(8);

    const filterInput = screen.getByRole("searchbox", { name: "제공처·고증 키워드 필터" });
    fireEvent.change(filterInput, { target: { value: "ambientCG" } });
    expect(container.querySelectorAll("article.research-source")).toHaveLength(1);

    fireEvent.change(filterInput, { target: { value: "존재하지않는제공처999" } });
    expect(screen.getByText("조건에 맞는 공개 데이터 제공처가 없습니다.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "전체 14개 제공처 다시 보기" }));
    expect(container.querySelectorAll("article.research-source")).toHaveLength(14);
  });
});
