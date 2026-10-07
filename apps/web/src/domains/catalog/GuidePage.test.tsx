// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GuidePage } from "./GuidePage";
import { useI18n } from "@/shared/lib/i18n";

const initial = useI18n.getState();

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState(initial);
});

function renderGuide() {
  return render(
    <MemoryRouter>
      <GuidePage />
    </MemoryRouter>,
  );
}

describe("GuidePage i18n", () => {
  it("한국어에서는 기존 한국어 문구가 그대로 렌더된다", () => {
    renderGuide();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("랭킹은 이렇게 매겨집니다");
    expect(screen.getByText("순위를 떠받치는 4가지 장치")).toBeTruthy();
    expect(screen.getByText("실시간 인기")).toBeTruthy();
    expect(screen.getByText("기대 신작")).toBeTruthy();
    expect(screen.getAllByText("산식 보기").length).toBe(4);
  });

  it("첫 화면에 목차 앵커와 산식 규모 요약이 있다", () => {
    renderGuide();
    const nav = screen.getByRole("navigation", { name: "이 페이지에서 확인하는 것" });
    const hrefs = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#guide-honesty", "#guide-how", "#guide-reach", "#guide-axes", "#guide-example"]);
    // 요약 수치는 본문이 읽는 단일 출처(lib/ranking.ts)와 같은 값이어야 한다.
    expect(screen.getByText("순위를 떠받치는 장치")).toBeTruthy();
    expect(screen.getByText("도달 가중을 매기는 플랫폼")).toBeTruthy();
    const header = screen.getByRole("heading", { level: 1 }).closest("header");
    expect(header?.textContent).toContain("통합 랭킹 보러가기");
  });

  it("영어에서는 사전의 영어 문구로 렌더되고 한국어가 남지 않는다", () => {
    useI18n.setState({ lang: "en" });
    const { container } = renderGuide();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("How rankings are calculated");
    expect(screen.getByText("The four mechanisms behind the rankings")).toBeTruthy();
    expect(screen.getByText("Real-time popular")).toBeTruthy();
    expect(screen.getByText("Promising rookies")).toBeTruthy();
    expect(screen.getAllByText("View formula").length).toBe(4);
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeTruthy();
    expect(container.textContent).not.toContain("랭킹은 이렇게");
    expect(container.textContent).not.toContain("산식 보기");
    expect(container.textContent).not.toContain("이 페이지에서 확인하는 것");
  });
});
