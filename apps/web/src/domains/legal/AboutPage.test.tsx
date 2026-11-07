// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AboutPage } from "./AboutPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

function renderPage() {
  return render(<MemoryRouter initialEntries={["/about"]}><AboutPage /></MemoryRouter>);
}

describe("서비스 소개의 반응형 안내 동선", () => {
  it("바로가기 네 개가 초점을 받을 수 있는 실제 섹션 제목을 가리킨다", () => {
    renderPage();
    const jumps = within(screen.getByRole("navigation", { name: "이 페이지 바로가기" })).getAllByRole("link");
    expect(jumps).toHaveLength(4);
    for (const link of jumps) {
      const target = document.querySelector(link.getAttribute("href") ?? "");
      expect(target?.tagName).toBe("H2");
      expect(target?.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("기획부터 발행까지 네 단계와 역할별 진입점을 빠짐없이 유지한다", () => {
    renderPage();
    const steps = within(screen.getByRole("list", { name: "작품이 지나는 네 단계" })).getAllByRole("link");
    expect(steps.map((link) => link.getAttribute("href"))).toEqual(["/story-lab", "/studio/new", "/production", "/studio/publish"]);
    expect(screen.getByRole("list", { name: "작품이 지나는 네 단계" }).tagName).toBe("OL");
    expect(within(screen.getByRole("list", { name: "역할별 시작점" })).getAllByRole("link")).toHaveLength(4);
    expect(within(screen.getByRole("list", { name: "소개 영상" })).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/product-tour", "/brand-film"]);
  });

  it("다섯 기능 탭을 반복 전환해도 해당 작업공간 연결을 보존한다", () => {
    renderPage();
    const tabs = within(screen.getByRole("tablist", { name: "핵심 기능" }));
    const expected = [["3D", "3D 캐릭터 만들기", "/studio/assets/characters/new"], ["협업", "제작 관리 열기", "/production"], ["AI 보조", "AI 도구 보기", "/studio/ai-lab"], ["드로잉", "캔버스 열기", "/studio/canvas"]] as const;
    for (const [tab, label, href] of expected) {
      fireEvent.click(tabs.getByRole("tab", { name: tab }));
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
      expect(tabs.getByRole("tab", { name: tab }).getAttribute("aria-selected")).toBe("true");
    }
  });

  it("보조 자료는 기본 닫힌 네이티브 펼침 안에 기존 링크 열한 개를 보존한다", () => {
    const { container } = renderPage();
    const details = container.querySelector("details.about-overview__resources");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toContain("더 알아보기");
    expect(details?.querySelectorAll("a")).toHaveLength(11);
    expect(details?.querySelector('a[href="/help"]')).toBeTruthy();
    expect(details?.querySelector('a[href="/ir"]')).toBeTruthy();
  });
});
