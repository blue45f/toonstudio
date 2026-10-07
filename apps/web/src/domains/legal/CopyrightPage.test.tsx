// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyrightPage } from "./CopyrightPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("CopyrightPage 읽기 도구", () => {
  it("목차 앵커가 본문 섹션과 1:1로 맞물린다", () => {
    render(
      <MemoryRouter>
        <CopyrightPage />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: /문서 목차|Document outline/u });
    const hrefs = within(nav).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const href of hrefs) {
      expect(document.getElementById(href?.slice(1) ?? "")).toBeTruthy();
    }
  });

  it("읽기 진행률과 관련 문서 이동을 제공한다", () => {
    render(
      <MemoryRouter>
        <CopyrightPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("progressbar", { name: /문서 읽기 진행률|Document reading progress/u })).toBeTruthy();

    const section = screen.getByRole("heading", { name: /관련 문서|Related documents/u }).closest("section");
    const hrefs = within(section as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/copyright");
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/about/crawler");
  });
});
