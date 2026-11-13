// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ENGINEERING_PAGES, type EngineeringPageId } from "./engineering-tech-pages";
import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";

afterEach(cleanup);

function renderIntro(pageId: EngineeringPageId) {
  const result = render(
    <MemoryRouter initialEntries={["/about/technology"]}>
      <EngineeringPageIntro pageId={pageId} eyebrow="EYEBROW" title="제목" description="설명" />
    </MemoryRouter>,
  );
  const guide = result.container.querySelector<HTMLDetailsElement>("header details");
  expect(guide?.open).toBe(false);
  const summary = guide?.querySelector("summary");
  if (summary) fireEvent.click(summary);
  return result;
}

describe("EngineeringPageIntro 정체성 칩", () => {
  it("발표 동선이 없는 자료 페이지는 그룹과 문서 이름을 칩으로 보여준다", () => {
    renderIntro("licenses");

    expect(screen.getByText(/자료 · 라이선스|Resources · Licenses/u)).toBeTruthy();
    expect(screen.queryByText(/발표 동선|Talk path/u)).toBeNull();
  });

  it("발표 동선 페이지는 기존 단계 배지를 유지하고 그룹 칩을 겹치지 않는다", () => {
    renderIntro("story");

    expect(screen.getByText(/발표 동선 1\/5|Talk path 1\/5/u)).toBeTruthy();
    expect(screen.queryByText(/핵심 · 제작 스토리|Core · Story/u)).toBeNull();
  });
});

describe("EngineeringPageIntro 안내 줄", () => {
  it.each(ENGINEERING_PAGES.map((page) => page.id))("%s 머리말은 질문·대상·다음에 읽을 것을 레지스트리에서 보여준다", (pageId) => {
    const index = ENGINEERING_PAGES.findIndex((page) => page.id === pageId);
    const page = ENGINEERING_PAGES[index];
    const next = ENGINEERING_PAGES[index + 1];
    renderIntro(pageId);

    const guide = document.querySelector("dl");
    if (!guide || !page) throw new Error(`guide strip missing for ${pageId}`);
    const scope = within(guide);
    expect(scope.getByText("이 페이지가 답하는 질문").nextElementSibling?.textContent).toBe(page.question?.ko);
    expect(scope.getByText("이런 분께").nextElementSibling?.textContent).toBe(page.audience?.ko);

    // 다음에 읽을 것은 하단 이어보기와 같은 순서(레지스트리 순서)다. 마지막 페이지만 기술 허브로 돌아간다.
    const link = scope.getByRole("link");
    expect(link.getAttribute("href")).toBe(next ? next.href : "/about/technology");
    expect(link.textContent).toBe(next ? next.label.ko : "기술 허브로 돌아가 다른 길 고르기");
  });

  it("안내 줄은 머리말 설명 바로 뒤, 읽기 시간 줄 앞에 있다", () => {
    renderIntro("story");
    const description = screen.getByText("설명");
    const guide = document.querySelector("dl");
    expect(description.compareDocumentPosition(guide as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/읽기 약 \d+분/u).compareDocumentPosition(guide as Node) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe("EngineeringPageFrame 이어보기 및 시안 P 좌측 고정·모바일 아틀라스 목차", () => {
  it.each(ENGINEERING_PAGES.map((page) => page.id))("%s 의 이전·다음 글은 레지스트리 순서와 같고 기술 허브 카드는 처음과 끝에만 온다", (pageId) => {
    const index = ENGINEERING_PAGES.findIndex((page) => page.id === pageId);
    const previous = ENGINEERING_PAGES[index - 1];
    const next = ENGINEERING_PAGES[index + 1];
    render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <EngineeringPageFrame pageId={pageId}>
          <p>본문</p>
        </EngineeringPageFrame>
      </MemoryRouter>,
    );

    const pager = screen.getByRole("navigation", { name: /기술 문서 이어보기|Continue through/u });
    const links = within(pager).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([previous ? previous.href : "/about/technology", next ? next.href : "/about/technology"]);

    // 순서의 맨 앞 글(아키텍처 해설)에는 이전 글 대신, 맨 끝 글(라이선스)에는 다음 글 대신 기술 허브 카드가 온다.
    const hubCards = links.filter((link) => link.getAttribute("href") === "/about/technology");
    expect(hubCards).toHaveLength(previous && next ? 0 : 1);
    for (const hub of hubCards) expect(hub.textContent).toContain("읽는 길 한눈에 보기");
    if (previous) for (const text of ["이전 글", previous.label.ko]) expect(links[0]?.textContent, text).toContain(text);
    if (next) for (const text of ["다음 글", next.label.ko]) expect(links[1]?.textContent, text).toContain(text);

    const menu = document.querySelector<HTMLDetailsElement>("[data-engineering-catalog-menu]");
    expect(menu?.open).toBe(false);
    const summary = menu?.querySelector("summary");
    if (!summary || !menu) throw new Error("단일 문서 메뉴가 필요합니다.");
    fireEvent.click(summary);
    const indexNav = within(menu).getByRole("navigation", { name: /기술 문서 목차|Engineering document index/u });
    expect(within(indexNav).getAllByRole("link")).toHaveLength(ENGINEERING_PAGES.length);
    expect(indexNav.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe(ENGINEERING_PAGES[index]?.href);
    expect(screen.queryByTestId("engineering-atlas-sticky-toc")).toBeNull();
    expect(screen.queryByTestId("engineering-atlas-mobile-toc")).toBeNull();
  });

  it("읽기 순서는 큰 그림 두 해설로 시작해 라이선스로 끝난다", () => {
    expect(ENGINEERING_PAGES.map((page) => page.id).slice(0, 3)).toEqual(["architecture", "libraries", "story"]);
    expect(ENGINEERING_PAGES.at(-1)?.id).toBe("licenses");
  });
});


describe("도감 전용 간결한 문서 틀", () => {
  const menuName = /기술 문서 메뉴·목차|Documents & index/u;
  function catalogFrame() {
    return render(<MemoryRouter initialEntries={["/about/technology/atlas"]}>
      <EngineeringPageFrame pageId="atlas" variant="catalog"><p>도감 본문</p></EngineeringPageFrame>
    </MemoryRouter>);
  }

  it("기본 틀의 모든 유일한 소개·문서·이어보기 링크와 현재 선택을 한 메뉴로 보존한다", () => {
    const original = render(<MemoryRouter initialEntries={["/about/technology/atlas"]}>
      <EngineeringPageFrame pageId="atlas"><p>도감 본문</p></EngineeringPageFrame>
    </MemoryRouter>);
    const hrefs = (container: HTMLElement) => [...new Set([...container.querySelectorAll("a[href]")].map((link) => link.getAttribute("href")))].sort();
    const before = hrefs(original.container);
    original.unmount();
    const { container } = catalogFrame();
    expect(hrefs(container)).toEqual(before);
    const menu = container.querySelector<HTMLDetailsElement>("[data-engineering-catalog-menu]");
    expect(menu?.open).toBe(false);
    const summary = menu?.querySelector("summary");
    expect(summary?.textContent).toMatch(menuName);
    expect(summary?.classList.contains("min-h-11")).toBe(true);
    expect(menu?.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/about/technology/atlas");
    expect(menu?.querySelector('[aria-current="location"]')?.getAttribute("href")).toBe("/about/technology");
    expect(container.querySelectorAll('a[href="/about/technology/atlas"]')).toHaveLength(1);
    expect(screen.queryByTestId("engineering-atlas-sticky-toc")).toBeNull();
    expect(screen.queryByTestId("engineering-atlas-mobile-toc")).toBeNull();
    expect(screen.getByRole("navigation", { name: /기술 문서 이어보기|Continue through/u })).toBeTruthy();
  });

  it("네이티브 summary 활성화를 유지하고 긴 목차 안 Escape는 메뉴를 닫아 초점을 돌린다", () => {
    const { container } = catalogFrame();
    const menu = container.querySelector<HTMLDetailsElement>("[data-engineering-catalog-menu]");
    const summary = menu?.querySelector("summary");
    if (!menu || !summary) throw new Error("도감 메뉴와 네이티브 summary가 필요합니다.");
    expect(summary.hasAttribute("role")).toBe(false);
    for (const key of ["Enter", " "]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      // JSDOM은 summary의 키보드 기본 동작을 구현하지 않으므로 기본 동작을 취소하지 않는 계약만 검사한다.
      expect(summary.dispatchEvent(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    }
    fireEvent.click(summary);
    expect(menu.open).toBe(true);
    const index = within(menu).getByRole("navigation", { name: /기술 문서 목차|Engineering document index/u });
    const links = within(index).getAllByRole("link");
    expect(links).toHaveLength(ENGINEERING_PAGES.length);
    const last = links[links.length - 1];
    if (!last) throw new Error("마지막 목차 링크가 필요합니다.");
    last.focus();
    fireEvent.keyDown(last, { key: "Escape" });
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(menu.querySelector("div")?.className).toContain("overflow-y-auto");
    expect(menu.querySelector("div")?.className).toContain("max-h-[min(65dvh,28rem)]");
    const closedEscape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    expect(summary.dispatchEvent(closedEscape)).toBe(true);
  });

  it("도감 머리말의 제목·인쇄를 같은 행에 놓고 설명을 유지하며 다른 문서는 안내를 다시 펼칠 수 있다", () => {
    const compact = render(<MemoryRouter><EngineeringPageIntro variant="catalog" eyebrow="TECH ATLAS" title="기술 도감" description="검색 안내" aside={<button>전체 인쇄</button>} /></MemoryRouter>);
    const heading = screen.getByRole("heading", { level: 1, name: "기술 도감" });
    const header = heading.closest("header");
    expect(header?.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(header?.className).toContain("py-4");
    expect(within(header as HTMLElement).getByRole("button", { name: "전체 인쇄" })).toBeTruthy();
    expect(screen.getByText("검색 안내")).toBeTruthy();
    compact.unmount();
    render(<MemoryRouter><EngineeringPageIntro variant="catalog" pageId="story" eyebrow="STORY" title="제목" description="설명" /></MemoryRouter>);
    expect(screen.getByText("이 페이지가 답하는 질문")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).closest("header")?.className).toContain("py-5");
  });
});
