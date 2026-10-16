// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearnPage } from "./LearnPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("웹툰 계약서 검토 체크리스트 학습 화면", () => {
  it("/learn/contract-checklist 는 학습 셸 안에서 열리고 내비의 현재 위치가 계약서 검토 하나다", async () => {
    render(<MemoryRouter initialEntries={["/learn/contract-checklist"]}><LearnPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "웹툰 계약서 검토 체크리스트" })).toBeTruthy();

    const navigation = screen.getByRole("navigation", { name: "배우기 영역" });
    const currents = within(navigation).getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(currents.map((link) => link.getAttribute("href"))).toEqual(["/learn/contract-checklist"]);
    expect(currents[0]?.textContent).toContain("계약서 검토");

    // 본문은 화면에 들어올 때 불러온다 — 불러오는 동안 상태를 알리고, 이후 질문 목록이 나타난다.
    expect(await screen.findByRole("radiogroup", { name: /지체상금/u }, { timeout: 15_000 })).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("법률 자문이 아니에요");
    // 학습 화면의 큰 구획 제목은 h2, 항목 제목은 h3 이다.
    expect(screen.getByRole("heading", { level: 2, name: "대가와 정산" })).toBeTruthy();
  });

  it("학습 내비의 ‘계약서 검토’ 링크로 들어갈 수 있고 제작 프로젝트로 가는 안내가 있다", async () => {
    render(<MemoryRouter initialEntries={["/learn"]}><LearnPage /></MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name: "배우기 영역" });
    fireEvent.click(within(navigation).getByRole("link", { name: /계약서 검토/u }));
    expect(screen.getByRole("heading", { level: 1, name: "웹툰 계약서 검토 체크리스트" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "제작 프로젝트 보기" }).getAttribute("href")).toBe("/production/projects");
    expect(await screen.findByRole("radiogroup", { name: /수익 배분/u }, { timeout: 15_000 })).toBeTruthy();
  });
});
