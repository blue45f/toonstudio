// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearnPage } from "./LearnPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("공통 학습 탐색", () => {
  it("섹션 내비는 공용 SectionNav 하나로 전체 목적지를 펼쳐 보인다", () => {
    render(<MemoryRouter initialEntries={["/learn"]}><LearnPage /></MemoryRouter>);
    const navigation = screen.getAllByRole("navigation", { name: "배우기 영역" });
    expect(navigation).toHaveLength(1);
    const menu = within(navigation[0]);
    // 목적지는 기존 자체 내비가 보존하던 13곳에 제작 레시피를 더한 14곳이다 —
    // 지우지도, 드롭다운 뒤에 숨기지도 않는다(레시피 편입 사유는 LearnSectionShell 주석).
    expect(menu.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/learn", "/learn/resources", "/learn/classroom", "/learn/classes", "/learn#learning-paths",
      "/learn/trace", "/learn/recipes", "/learn/studio", "/learn/glossary", "/learn/process", "/learn/careers",
      "/learn/education", "/learn/records", "/research",
    ]);
    // 이름은 다른 표면의 정본과 맞춘다(클래스룸·교육 안내 등).
    expect(menu.getByRole("link", { name: /클래스룸/u })).toBeTruthy();
    expect(menu.getByRole("link", { name: /교육 안내/u })).toBeTruthy();
    // 현재 위치는 학습 홈 하나만 표시한다.
    const currents = menu.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(currents.map((link) => link.getAttribute("href"))).toEqual(["/learn"]);
  });

  it("학습 경로 상세에서는 학습 경로 항목이 현재 위치가 되고, 앵커 착지는 경로 탭을 연다", async () => {
    render(<MemoryRouter initialEntries={["/learn#learning-paths"]}><LearnPage /></MemoryRouter>);
    // 앵커의 실제 계약: 학습 홈이 경로 탭을 열어 보인다(홈의 앵커 처리가 주소를 ?view=paths로
    // 교체하며 hash를 소비하므로, 내비 현재 표시는 학습 홈으로 settled 된다 — 구 내비와 같은 동작).
    const pathsTab = await screen.findByRole("tab", { name: /학습 경로/u });
    expect(pathsTab.getAttribute("aria-selected")).toBe("true");
    cleanup();

    render(<MemoryRouter initialEntries={["/learn/paths/first-three-panels"]}><LearnPage /></MemoryRouter>);
    const detailNavigation = screen.getByRole("navigation", { name: "배우기 영역" });
    const detailCurrents = within(detailNavigation).getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(detailCurrents.map((link) => link.getAttribute("href"))).toEqual(["/learn#learning-paths"]);
  });

  it("내비로 다른 학습 화면에 이동하면 선택 상태가 따라간다", async () => {
    render(<MemoryRouter initialEntries={["/learn"]}><LearnPage /></MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name: "배우기 영역" });
    fireEvent.click(within(navigation).getByRole("link", { name: /따라 그리기/u }));
    expect(screen.getByRole("heading", { name: /참고 이미지는 가이드로/u })).toBeTruthy();
    expect(screen.getAllByRole("navigation", { name: "배우기 영역" })).toHaveLength(1);
    const currentNavigation = screen.getByRole("navigation", { name: "배우기 영역" });
    expect(within(currentNavigation).getByRole("link", { name: /따라 그리기/u })
      .getAttribute("aria-current")).toBe("page");
    expect(within(currentNavigation).getByRole("link", { name: /학습 홈/u })
      .getAttribute("aria-current")).toBeNull();
  });

  it("학습 기록 화면도 같은 내비를 사용하며 백업 기능을 유지한다", () => {
    render(<MemoryRouter initialEntries={["/learn/records"]}><LearnPage /></MemoryRouter>);
    expect(screen.getAllByRole("navigation", { name: "배우기 영역" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: /배운 과정도/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "내 학습 기록 보관" })).toBeTruthy();
  });

  it("자체 진행 표시가 없는 하위 화면에만 셸 진행 스트립을 얹는다", async () => {
    const trace = render(<MemoryRouter initialEntries={["/learn/trace"]}><LearnPage /></MemoryRouter>);
    const strip = screen.getByRole("region", { name: "내 학습 진행" });
    expect(within(strip).getByRole("progressbar", { name: "내 학습 진행" })).toBeTruthy();
    expect(within(strip).getByRole("link", { name: "내 학습 기록" }).getAttribute("href")).toBe("/learn/records");
    trace.unmount();

    render(<MemoryRouter initialEntries={["/learn/process"]}><LearnPage /></MemoryRouter>);
    const processStrip = screen.getByRole("region", { name: "내 학습 진행" });
    expect(processStrip).toBeTruthy();
    // 레퍼런스 화면에서는 진행 스트립이 히어로보다 아래에 있어 첫 화면을 차지하지 않는다.
    const heroTitle = screen.getByRole("heading", { name: "기획부터 계약·제작·연재 운영까지" });
    expect(heroTitle.compareDocumentPosition(processStrip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    render(<MemoryRouter initialEntries={["/learn"]}><LearnPage /></MemoryRouter>);
    expect(screen.queryByRole("region", { name: "내 학습 진행" })).toBeNull();
    cleanup();

    render(<MemoryRouter initialEntries={["/learn/records"]}><LearnPage /></MemoryRouter>);
    expect(screen.queryByRole("region", { name: "내 학습 진행" })).toBeNull();
  });
});
