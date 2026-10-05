// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringLicensesPage } from "./EngineeringLicensesPage";
import { ENGINEERING_LICENSE_GROUPS } from "./engineering-story-content";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

function renderLicenses() {
  return render(
    <MemoryRouter initialEntries={["/about/technology/licenses"]}>
      <EngineeringLicensesPage />
    </MemoryRouter>,
  );
}

function familiesSection(): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name: /종류별 기본 의무|Baseline obligations/u });
  const section = heading.closest("section");
  if (!section) throw new Error("license families section is missing");
  return section;
}

describe("라이선스 이름 검색", () => {
  it("검색 전에는 여섯 종류를 모두 보여주고 개수를 알린다", () => {
    renderLicenses();
    const section = familiesSection();
    for (const group of ENGINEERING_LICENSE_GROUPS) {
      expect(within(section).getByRole("heading", { level: 3, name: group.title.ko })).toBeTruthy();
    }
    expect(within(section).getByRole("status").textContent).toContain(
      `${String(ENGINEERING_LICENSE_GROUPS.length)}개 / 전체 ${String(ENGINEERING_LICENSE_GROUPS.length)}개 종류`,
    );
  });

  it("이름으로 검색하면 맞는 종류만 남는다", () => {
    renderLicenses();
    const section = familiesSection();
    const search = within(section).getByLabelText(/라이선스 이름 검색|Search by license name/u);
    fireEvent.change(search, { target: { value: "MIT" } });

    expect(within(section).getByRole("heading", { level: 3, name: "MIT · BSD · ISC" })).toBeTruthy();
    expect(within(section).queryByRole("heading", { level: 3, name: "Apache-2.0" })).toBeNull();
    expect(within(section).queryByRole("heading", { level: 3, name: /GPL/u })).toBeNull();
    expect(within(section).getByRole("status").textContent).toContain("1개 / 전체 6개 종류");
  });

  it("예시에 든 이름으로도 찾을 수 있다", () => {
    renderLicenses();
    const section = familiesSection();
    const search = within(section).getByLabelText(/라이선스 이름 검색|Search by license name/u);
    fireEvent.change(search, { target: { value: "fonts" } });

    expect(within(section).getByRole("heading", { level: 3, name: /Creative Commons/u })).toBeTruthy();
    expect(within(section).getByRole("status").textContent).toContain("1개 / 전체 6개 종류");
  });

  it("결과가 없으면 빈 상태를 보여주고 초기화로 전체를 되돌린다", () => {
    renderLicenses();
    const section = familiesSection();
    const search = within(section).getByLabelText(/라이선스 이름 검색|Search by license name/u);
    fireEvent.change(search, { target: { value: "없는라이선스이름" } });

    expect(within(section).getByText(/검색과 일치하는 라이선스 종류가 없습니다|No license family matches/u)).toBeTruthy();
    expect(within(section).queryByRole("heading", { level: 3 })).toBeNull();
    expect(within(section).getByRole("status").textContent).toContain("0개 / 전체 6개 종류");

    fireEvent.click(within(section).getByRole("button", { name: /검색 초기화|Reset search/u }));
    for (const group of ENGINEERING_LICENSE_GROUPS) {
      expect(within(section).getByRole("heading", { level: 3, name: group.title.ko })).toBeTruthy();
    }
  });

  it("마지막 글이라 다음 글 자리에는 기술 허브 카드가 온다", () => {
    renderLicenses();
    const pager = screen.getByRole("navigation", { name: /기술 문서 이어보기|Continue through/u });
    expect(within(pager).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about/technology/glossary",
      "/about/technology",
    ]);
    expect(within(pager).getByRole("link", { name: /이전 글.*용어집|Previous article.*Glossary/u })).toBeTruthy();
  });
});
