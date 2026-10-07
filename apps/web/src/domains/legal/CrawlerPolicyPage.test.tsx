// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CrawlerPolicyPage } from "./CrawlerPolicyPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("CrawlerPolicyPage 읽기 도구", () => {
  it("목차의 모든 앵커가 실제 섹션으로 연결된다", () => {
    render(
      <MemoryRouter>
        <CrawlerPolicyPage />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: /문서 목차|Document outline/u });
    const hrefs = within(nav).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    for (const href of hrefs) {
      expect(href?.startsWith("#")).toBe(true);
      expect(document.getElementById(href?.slice(1) ?? "")).toBeTruthy();
    }
  });

  it("각 섹션 제목에 그 섹션으로 연결되는 앵커 링크가 있다", () => {
    render(
      <MemoryRouter>
        <CrawlerPolicyPage />
      </MemoryRouter>,
    );

    const anchorLinks = screen.getAllByRole("link", { name: /섹션 링크|Link to section/u });
    expect(anchorLinks.length).toBeGreaterThanOrEqual(6);
    for (const link of anchorLinks) {
      const href = link.getAttribute("href");
      expect(document.getElementById(href?.slice(1) ?? "")).toBeTruthy();
    }
  });

  it("관련 문서에서 자기 자신을 빼고 약관·저작권 안내로 이어진다", () => {
    render(
      <MemoryRouter>
        <CrawlerPolicyPage />
      </MemoryRouter>,
    );

    const section = screen.getByRole("heading", { name: /관련 문서|Related documents/u }).closest("section");
    const hrefs = within(section as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/about/crawler");
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/copyright");
  });
});
