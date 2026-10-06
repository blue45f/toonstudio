// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { OpenDataLabPage } from "./OpenDataLabPage";

function mount() {
  return render(
    <MemoryRouter initialEntries={["/research/open-data"]}>
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
    // 아트가 맞는 소스(ambientCG)는 실제 일러스트를 마크로 쓴다.
    const ambient = container.querySelector("article.research-source--ambientcg");
    expect(ambient?.querySelector("img")?.getAttribute("src")).toBe("/brand/illustrated-20260928/materials.webp");
    // 아트가 없는 소스(NASA)는 타이포 표지 마크와 한 줄 정체성을 단다.
    const nasa = container.querySelector("article.research-source--nasa");
    expect(nasa?.querySelector(".resource-source-cover")).toBeTruthy();
    expect(screen.getByText(/NASA가 공개한 행성·성운·우주선 이미지 자료실입니다/u)).toBeTruthy();
    expect(screen.getByText(/국가유산청이 공개하는 문화유산 지정·관리 기록을 찾습니다/u)).toBeTruthy();
  });

  it("keeps direct import narrower than reference previews", () => {
    mount();
    expect(screen.getByText(/Studio 직접 가져오기는 CC0가 확인된 ambientCG에만 허용/u)).toBeTruthy();
    expect(screen.getByText(/NASA·V&A는 안전한 미리보기를 레퍼런스 전용/u)).toBeTruthy();
  });
});
