// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ENGINEERING_PAGES, type EngineeringPageId } from "./engineering-tech-pages";
import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";

afterEach(cleanup);

function renderIntro(pageId: EngineeringPageId) {
  return render(
    <MemoryRouter initialEntries={["/about/technology"]}>
      <EngineeringPageIntro pageId={pageId} eyebrow="EYEBROW" title="제목" description="설명" />
    </MemoryRouter>,
  );
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

describe("EngineeringPageFrame 이어보기", () => {
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
    // 단계 번호가 있는 글은 "이전 글" 과 이름 사이에 번호가 끼므로 둘을 따로 확인한다.
    if (previous) for (const text of ["이전 글", previous.label.ko]) expect(links[0]?.textContent, text).toContain(text);
    if (next) for (const text of ["다음 글", next.label.ko]) expect(links[1]?.textContent, text).toContain(text);
  });

  it("읽기 순서는 큰 그림 두 해설로 시작해 라이선스로 끝난다", () => {
    expect(ENGINEERING_PAGES.map((page) => page.id).slice(0, 3)).toEqual(["architecture", "libraries", "story"]);
    expect(ENGINEERING_PAGES.at(-1)?.id).toBe("licenses");
  });
});
