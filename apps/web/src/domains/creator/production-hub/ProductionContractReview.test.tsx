// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionProjectPage } from "./ProductionHubPage";
import { resetProductionDemoSession } from "./production-demo-adapter";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetProductionDemoSession();
});

describe("제작 관리 계약·정산 화면의 계약서 검토 체크리스트", () => {
  it("계약·정산 단계 안에 체크리스트를 카드로 싣고, 답은 학습 화면과 같은 저장소에 남긴다", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/rights"]}>
        <Routes>
          <Route path="/production/projects/:projectId/rights" element={<ProductionProjectPage surface="rights" />} />
        </Routes>
      </MemoryRouter>,
    );
    const heading = await screen.findByRole("heading", { level: 2, name: "계약서 검토 체크리스트" }, { timeout: 15_000 });
    const card = heading.closest("section");
    expect(card).not.toBeNull();

    // 카드 제목이 h2 이므로 체크리스트 안 구획은 h3, 항목은 h4 다.
    const group = await within(card as HTMLElement).findByRole("radiogroup", { name: /지체상금/u }, { timeout: 15_000 });
    expect(within(card as HTMLElement).getByRole("heading", { level: 3, name: "일정과 분량" })).toBeTruthy();
    expect(within(card as HTMLElement).getByRole("note").textContent).toContain("법률 자문이 아니에요");

    fireEvent.click(within(group).getByRole("radio", { name: "있어요" }));
    expect(JSON.parse(window.localStorage.getItem("toonstudio:contract-review:v1") ?? "null")).toEqual({
      version: 1,
      answers: { "delay-penalty": "present" },
    });
    // 같은 화면의 기존 카드(공개 크레딧·권리·보상)는 그대로 있다.
    expect(screen.getByRole("heading", { level: 2, name: "공개 크레딧" })).toBeTruthy();
  });
});
