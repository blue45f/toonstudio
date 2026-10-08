// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringArchitecturePage } from "./EngineeringArchitecturePage";
import { ARCHITECTURE_GUIDE_SECTIONS } from "./engineering-architecture-guide-content";
import { ARCHITECTURE_GUIDE_OVERVIEW } from "./engineering-architecture-guide-overview";
import { ARCHITECTURE_GUIDE_GROUPS } from "./engineering-architecture-guide-types";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

import { useI18n } from "@/shared/lib/i18n-core";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
// 도감 데이터는 수백 KB 라서 링크 줄이 렌더 뒤에 동적으로 불러온다. 화면 시험에서는 구간이 가리키는 카드마다 이름만 있는 픽스처로 바꾼다
// (카드가 실제로 있는지는 계약 시험 `engineering-architecture-guide-content.test.ts` 가 따로 확인한다).
vi.mock("./engineering-atlas-content", async () => {
  const { ARCHITECTURE_GUIDE_SECTIONS: sections } = await import("./engineering-architecture-guide-content");
  const ids = [...new Set(sections.flatMap((section) => section.atlasIds))];
  return { ENGINEERING_ATLAS_ENTRIES: ids.map((id) => ({ id, name: `Atlas card ${id}` })) };
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/about/technology/architecture"]}>
      <EngineeringArchitecturePage />
    </MemoryRouter>,
  );
}

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
/** 용어집·챕터 데이터는 렌더 뒤에 처음 불러오므로(변환 시간 포함) 이름이 풀릴 때까지 넉넉히 기다린다. */
const SLOW_IMPORT = { timeout: 20_000 } as const;

describe("EngineeringArchitecturePage", () => {
  it("한 장 지도·원칙·읽는 법과 모든 구간을 번호 순서대로 그린다", () => {
    const { container } = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/한 장으로 보는 ToonStudio 구조/u);

    const overview = container.querySelector("#architecture-overview") as HTMLElement;
    expect(overview).toBeTruthy();
    expect(overview.querySelector(`figure[data-diagram="${ARCHITECTURE_GUIDE_OVERVIEW.diagram.id}"]`)).toBeTruthy();
    const principles = within(overview).getByRole("heading", { level: 3, name: /원칙/u }).parentElement as HTMLElement;
    expect(principles.querySelectorAll("li")).toHaveLength(ARCHITECTURE_GUIDE_OVERVIEW.principles.length);
    expect(overview.querySelector(".eng-legend")).toBeTruthy();

    const rendered = [...container.querySelectorAll<HTMLElement>("#engineering-architecture-body section[id]")].map((element) => element.id);
    expect(rendered).toEqual(ARCHITECTURE_GUIDE_SECTIONS.map((section) => section.id));
  });

  it("구간마다 번호·제목·질문·한 줄 요약·쉬운 비유·도식·흐름 단계를 같은 순서로 보여 준다", () => {
    const { container } = renderPage();
    for (const section of ARCHITECTURE_GUIDE_SECTIONS) {
      const element = container.querySelector(`#${section.id}`) as HTMLElement;
      expect(element, section.id).toBeTruthy();
      expect(element.getAttribute("aria-labelledby")).toBe(`${section.id}-title`);
      const heading = element.querySelector(`#${section.id}-title`) as HTMLElement;
      expect(heading.tagName, section.id).toBe("H3");
      expect(heading.textContent).toContain(section.title.ko);
      expect(heading.textContent).toContain(String(section.number));
      for (const text of [section.question.ko, section.oneLine.ko, section.easy.ko]) expect(element.textContent, section.id).toContain(text);

      const figure = element.querySelector(`figure[data-diagram="${section.diagram.id}"]`) as HTMLElement;
      expect(figure, section.id).toBeTruthy();
      // 스크린 리더·좁은 화면용 글 대체가 도식마다 있다.
      expect(figure.querySelector(".eng-dia__list-alt")?.textContent, section.id).toBe(section.diagram.alt.ko);
      const steps = element.querySelectorAll("ol.grid > li");
      expect(steps.length, section.id).toBe(section.steps.length);
      if (section.pitfall) expect(element.textContent, section.id).toContain(section.pitfall.ko);
    }
  });

  it("접힌 상세를 펼치면 배경 지식·쓰인 곳(파일 경로)·선택과 대가·확인한 수치가 나온다", () => {
    const { container } = renderPage();
    const first = ARCHITECTURE_GUIDE_SECTIONS[0];
    if (!first) throw new Error("구간이 없음");
    const element = container.querySelector(`#${first.id}`) as HTMLElement;
    const details = [...element.querySelectorAll<HTMLDetailsElement>("details[data-eng-disclosure]")];
    expect(details).toHaveLength(3);
    expect(details.every((item) => !item.open)).toBe(true);
    for (const item of details) item.open = true;

    for (const paragraph of first.background) expect(element.textContent).toContain(paragraph.ko);
    for (const use of first.inService) {
      expect(element.textContent).toContain(use.what.ko);
      for (const path of use.paths) expect(within(element).getAllByText(path).length).toBeGreaterThan(0);
    }
    for (const decision of first.decisions) {
      expect(element.textContent).toContain(decision.choice.ko);
      expect(element.textContent).toContain(decision.because.ko);
      expect(element.textContent).toContain(decision.cost.ko);
    }
    for (const fact of first.facts ?? []) {
      expect(element.textContent).toContain(fact.value);
      expect(within(element).getAllByText(fact.source).length).toBeGreaterThan(0);
    }
  });

  it("도감·챕터·용어 링크는 렌더 뒤에 이름으로 풀리고 올바른 주소로 이어진다", { timeout: 40_000 }, async () => {
    const { container } = renderPage();
    const first = ARCHITECTURE_GUIDE_SECTIONS[0];
    if (!first) throw new Error("구간이 없음");
    const atlasId = first.atlasIds[0] as string;
    const chapterId = first.chapterIds[0] as string;
    const termId = first.glossaryIds[0] as string;

    await waitFor(() => {
      const atlas = container.querySelector(`#${first.id} [data-atlas-id="${atlasId}"]`);
      expect(atlas?.textContent).toBe(`Atlas card ${atlasId}`);
    }, SLOW_IMPORT);
    const atlas = container.querySelector(`#${first.id} [data-atlas-id="${atlasId}"]`) as HTMLAnchorElement;
    expect(atlas.getAttribute("href")).toBe(`/about/technology/atlas#${atlasId}`);

    await waitFor(() => {
      const title = PUBLISHED_ENGINEERING_CHAPTERS.find((item) => item.id === chapterId)?.title.ko;
      expect(container.querySelector(`#${first.id} [data-chapter-id="${chapterId}"]`)?.textContent).toBe(title);
    }, SLOW_IMPORT);
    const chapter = container.querySelector(`#${first.id} [data-chapter-id="${chapterId}"]`) as HTMLAnchorElement;
    expect(chapter.getAttribute("href")).toBe(`/about/technology/story#${chapterId}`);

    // 용어집 이름도 따로 불러오므로 풀릴 때까지 기다린다(불러오는 동안에는 자리만 잡는다).
    await waitFor(() => {
      const term = container.querySelector(`#${first.id} [data-glossary-id="${termId}"]`);
      expect(term).toBeTruthy();
      expect(term?.textContent).not.toBe(termId);
    }, SLOW_IMPORT);
    const term = container.querySelector(`#${first.id} [data-glossary-id="${termId}"]`) as HTMLAnchorElement;
    expect(term.getAttribute("href")).toBe(`/about/technology/glossary#glossary-${termId}`);
  });

  it("구간 이동 띠는 구간마다 링크를 두고, 모두 펼치기·접기가 접힌 상세를 한꺼번에 바꾼다", () => {
    const { container } = renderPage();
    const strip = screen.getByRole("navigation", { name: "구간 이동" });
    const links = within(strip).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(ARCHITECTURE_GUIDE_SECTIONS.map((section) => `#${section.id}`));
    for (const [index, link] of links.entries()) {
      const section = ARCHITECTURE_GUIDE_SECTIONS[index];
      expect(link.getAttribute("aria-label")).toBe(`${section?.number}. ${section?.title.ko}`);
    }

    const all = () => [...container.querySelectorAll<HTMLDetailsElement>("#engineering-architecture-body details[data-eng-disclosure]")];
    expect(all().length).toBe(ARCHITECTURE_GUIDE_SECTIONS.length * 3);
    fireEvent.click(within(strip).getByRole("button", { name: "모두 펼치기" }));
    expect(all().every((item) => item.open)).toBe(true);
    fireEvent.click(within(strip).getByRole("button", { name: "모두 접기" }));
    expect(all().every((item) => !item.open)).toBe(true);
  });

  it("구간마다 있는 '더 깊이 보기' 내비게이션은 이름이 서로 달라 랜드마크 목록에서 구분된다", () => {
    const { container } = renderPage();
    const names = [...container.querySelectorAll("nav[aria-label$='더 깊이 보기']")].map((nav) => nav.getAttribute("aria-label"));
    expect(names).toHaveLength(ARCHITECTURE_GUIDE_SECTIONS.length);
    expect(new Set(names).size).toBe(names.length);
    for (const section of ARCHITECTURE_GUIDE_SECTIONS) {
      expect(container.querySelector(`#${section.id} nav[aria-label="${section.title.ko} — 더 깊이 보기"]`), section.id).toBeTruthy();
    }
  });

  it("구간 바로가기 목록은 묶음 이름과 구간의 질문을 보여 준다", () => {
    renderPage();
    const map = screen.getAllByRole("navigation", { name: "구간 바로가기" })[0] as HTMLElement;
    for (const group of ARCHITECTURE_GUIDE_GROUPS) {
      if (ARCHITECTURE_GUIDE_SECTIONS.some((section) => section.group === group.id)) expect(map.textContent).toContain(group.label.ko);
    }
    for (const section of ARCHITECTURE_GUIDE_SECTIONS) {
      const link = map.querySelector(`a[href="#${section.id}"]`) as HTMLElement;
      expect(link, section.id).toBeTruthy();
      expect(link.textContent).toContain(section.title.ko);
      expect(link.textContent).toContain(section.question.ko);
    }
  });

  it("인쇄 직전에 접힌 상세를 모두 펼치고 인쇄 뒤에는 원래대로 되돌린다", () => {
    const { container } = renderPage();
    const all = () => [...container.querySelectorAll<HTMLDetailsElement>("#engineering-architecture-body details[data-eng-disclosure]")];
    const second = all()[1] as HTMLDetailsElement;
    second.open = true; // 사용자가 직접 펼쳐 둔 것은 인쇄 뒤에도 펼친 채로 남는다.
    window.dispatchEvent(new Event("beforeprint"));
    expect(all().every((item) => item.open)).toBe(true);
    window.dispatchEvent(new Event("afterprint"));
    expect(all().filter((item) => item.open)).toEqual([second]);
  });

  it("영어 화면에서는 본문(한 장 지도와 모든 구간)에 한글이 섞이지 않는다", { timeout: 40_000 }, async () => {
    useI18n.getState().setLang("en");
    const { container } = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/ToonStudio's structure on one page/u);
    for (const element of container.querySelectorAll<HTMLElement>("#architecture-overview, #engineering-architecture-body")) {
      for (const details of element.querySelectorAll<HTMLDetailsElement>("details[data-eng-disclosure]")) details.open = true;
    }
    // 이름이 풀리는 링크 줄은 도감·챕터·용어 이름이 영어로 바뀐 뒤에 확인한다.
    await waitFor(() => {
      const chapter = container.querySelector("#browser-studio [data-chapter-id]") as HTMLElement;
      expect(chapter.textContent).not.toBe(chapter.getAttribute("data-chapter-id"));
    }, SLOW_IMPORT);
    for (const element of container.querySelectorAll<HTMLElement>("#architecture-overview, #engineering-architecture-body")) {
      const hangul = (element.textContent ?? "").match(HANGUL);
      expect(hangul, `${element.id || "body"}: 한글 "${hangul?.[0]}"`).toBeNull();
    }
    expect(container.querySelector("#browser-studio-title")?.textContent).toContain("The studio inside your browser");
  });
});
