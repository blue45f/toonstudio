// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LEGAL_DOCUMENTS } from "./legal-documents";
import { DocumentReadingProgress, LegalDocOutline, LegalRelatedDocs } from "./LegalDocTools";

afterEach(cleanup);

describe("LegalRelatedDocs", () => {
  it("현재 문서를 빼고 문서군의 나머지를 전부 연결한다", () => {
    render(<LegalRelatedDocs currentHref="/terms" />);

    const section = screen.getByRole("heading", { name: /관련 문서|Related documents/u }).closest("section");
    expect(section).toBeTruthy();
    const links = within(section as HTMLElement).getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));

    expect(hrefs).not.toContain("/terms");
    expect(hrefs).toEqual(
      expect.arrayContaining(LEGAL_DOCUMENTS.filter((doc) => doc.href !== "/terms").map((doc) => doc.href)),
    );
    expect(links).toHaveLength(LEGAL_DOCUMENTS.length - 1);
  });

  it("문서 목록의 모든 목적지는 법무·신뢰 문서군 안에서만 고른다", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.href.startsWith("/")).toBe(true);
      expect(doc.name.ko.length).toBeGreaterThan(0);
      expect(doc.summary.ko.length).toBeGreaterThan(0);
    }
  });
});

describe("LegalDocOutline", () => {
  it("섹션을 번호 앵커로 연결하고 인쇄 행동을 제공한다", () => {
    render(
      <LegalDocOutline
        sections={[
          { id: "doc-section-1", label: "첫째" },
          { id: "doc-section-2", label: "둘째" },
        ]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: /문서 목차|Document outline/u });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#doc-section-1", "#doc-section-2"]);
    expect(within(nav).getByRole("button", { name: /인쇄|Print/u })).toBeTruthy();
  });
});

describe("DocumentReadingProgress", () => {
  it("읽기 진행률을 progressbar로 노출한다", () => {
    render(<DocumentReadingProgress />);
    const bar = screen.getByRole("progressbar", { name: /문서 읽기 진행률|Document reading progress/u });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });
});
