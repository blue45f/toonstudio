// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18n } from "@/shared/lib/i18n-core";
import { TracePracticePage } from "./TracePracticePage";
import { LearnPage } from "./LearnPage";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(cleanup);

describe("trace practice", () => {
  it("starts the real Studio canvas with an explicit trace-practice query", () => {
    render(<MemoryRouter><TracePracticePage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /참고 이미지는 가이드로/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /따라 그리기 시작/ }).getAttribute("href"))
      .toBe("/studio/canvas?practice=trace");
    expect(screen.getAllByText(/이 이미지로 따라 그리기/)).toHaveLength(3); // 히어로 + 단계 다이어그램 + 상세 단계
    expect(screen.getByText(/타임랩스에서 제외/)).toBeTruthy();
    expect(screen.getByText(/화면 공유 중이라면/)).toBeTruthy();
  });

  it("renders interactive REA gesture timer & onion-skin guide simulator", () => {
    render(<MemoryRouter><TracePracticePage /></MemoryRouter>);
    expect(screen.getByTestId("trace-practice-rea-drill-bar")).toBeTruthy();

    const defaultDrill = screen.getByTestId("trace-practice-rea-drill-posemaniacs-30s-gesture");
    const anatomyDrill = screen.getByTestId("trace-practice-rea-drill-lineofaction-2m-anatomy");
    const defaultOpacity = screen.getByTestId("trace-practice-rea-opacity-50pct-onion");
    const ghostOpacity = screen.getByTestId("trace-practice-rea-opacity-25pct-ghost");

    expect(defaultDrill.getAttribute("aria-pressed")).toBe("true");
    expect(anatomyDrill.getAttribute("aria-pressed")).toBe("false");
    expect(defaultOpacity.getAttribute("aria-pressed")).toBe("true");
    expect(ghostOpacity.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("trace-practice-rea-drill-status");
    expect(status.textContent).toContain("posemaniacs-30s-gesture");
    expect(status.textContent).toContain("50pct-onion");
    expect(status.textContent).toContain("Posemaniacs");
    expect(status.textContent).toContain("Clip Studio Paint");

    fireEvent.click(anatomyDrill);
    fireEvent.click(ghostOpacity);

    expect(defaultDrill.getAttribute("aria-pressed")).toBe("false");
    expect(anatomyDrill.getAttribute("aria-pressed")).toBe("true");
    expect(defaultOpacity.getAttribute("aria-pressed")).toBe("false");
    expect(ghostOpacity.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("lineofaction-2m-anatomy");
    expect(status.textContent).toContain("25pct-ghost");
  });

  it("is reachable from the existing /learn wildcard without a duplicate router", async () => {
    render(<MemoryRouter initialEntries={["/learn/trace"]}><LearnPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /참고 이미지는 가이드로/ })).toBeTruthy();
    // 섹션 내비(공용 SectionNav)는 목적지를 드롭다운 없이 펼쳐 보이고 현재 위치를 링크에 표시한다.
    expect((await screen.findByRole("link", { name: "따라 그리기" })).getAttribute("aria-current")).toBe("page");
  });
});
