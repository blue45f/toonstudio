// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HelpCenterPage } from "./HelpCenterPage";

import { useI18n } from "@/shared/lib/i18n-core";

vi.mock("./BrowserReadinessDiagnostics", () => ({ BrowserReadinessDiagnostics: () => <div data-testid="diagnostics" /> }));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/shared/components/site-experience/WorkflowIllustration", () => ({
  WorkflowIllustration: () => <span data-testid="workflow-illustration" />,
}));

function renderHelp() {
  return render(
    <MemoryRouter initialEntries={["/help"]}>
      <HelpCenterPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

function topicLinks() {
  return screen.getAllByRole("link", { name: /관련 화면 열기/ });
}

describe("HelpCenterPage", () => {
  it("lists every help topic, including a path to the full site directory", () => {
    renderHelp();
    expect(screen.getByRole("heading", { level: 1, name: "막힌 곳을 풀고, 다음 컷으로." })).toBeTruthy();
    expect(topicLinks()).toHaveLength(8);
    expect(screen.getByRole("link", { name: /전체 기능 찾기/ }).getAttribute("href")).toBe("/sitemap");
    expect(screen.getByRole("link", { name: /처음 시작하기/ }).getAttribute("href")).toBe("/studio/new");
  });

  it("filters topics by Korean or English keywords and from the popular chips", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "라이선스" } });
    expect(topicLinks().map((link) => link.getAttribute("href"))).toEqual(["/market"]);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "backup" } });
    expect(topicLinks().map((link) => link.getAttribute("href"))).toEqual(["/studio"]);

    fireEvent.click(screen.getByRole("button", { name: "말풍선" }));
    expect(screen.getByRole("button", { name: "말풍선" }).getAttribute("aria-pressed")).toBe("true");
    expect(topicLinks().map((link) => link.getAttribute("href"))).toEqual(["/studio/manual"]);
  });

  it.each([
    ["저장이 안 돼요", "/studio"],
    ["말풍선", "/studio/manual"],
    ["에셋 라이선스", "/market"],
  ])("returns results for the search box example %j", (query, href) => {
    renderHelp();
    const searchbox = screen.getByRole("searchbox");
    // 입력칸 예시 문구가 실제로 검색 결과를 낸다.
    expect(searchbox.getAttribute("placeholder")).toContain(query);
    fireEvent.change(searchbox, { target: { value: query } });
    expect(topicLinks().map((link) => link.getAttribute("href"))).toContain(href);
    expect(screen.queryByText("일치하는 주제를 찾지 못했습니다.")).toBeNull();
  });

  it.each([
    ["로그인이 안 돼요", "/settings"],
    ["브러시가 안 보여요", "/studio/manual"],
    ["speech balloon", "/studio/manual"],
  ])("understands problem sentences such as %j", (query, href) => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: query } });
    expect(topicLinks()[0]?.getAttribute("href")).toBe(href);
  });

  it("searches the FAQ too and expands the matching questions", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "로그인이 안 돼요" } });
    const question = screen.getByText("로그인이 안 되면 어떻게 하나요?").closest("details");
    expect(question?.hasAttribute("open")).toBe(true);
    expect(screen.queryByText("웹툰 작업은 어디서 시작하나요?")).toBeNull();
  });

  it("adds related screens from the site directory without repeating topic cards", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "서비스 상태" } });
    const heading = screen.getByRole("heading", { level: 3, name: "관련 화면" });
    const cards = heading.parentElement?.querySelectorAll("a[data-site-link-card]") ?? [];
    const hrefs = [...cards].map((card) => card.getAttribute("href"));
    expect(hrefs).toContain("/status");
    const topicHrefs = screen.queryAllByRole("link", { name: /관련 화면 열기/ }).map((link) => link.getAttribute("href"));
    expect(hrefs.some((href) => topicHrefs.includes(href))).toBe(false);
    // 주제가 하나도 맞지 않아도 막다른 빈 상태 대신 관련 화면으로 안내한다.
    expect(screen.queryByText("일치하는 주제를 찾지 못했습니다.")).toBeNull();
  });

  it("offers a way out when nothing matches", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "존재하지않는주제" } });
    expect(screen.getByText("일치하는 주제를 찾지 못했습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(topicLinks()).toHaveLength(8);
  });

  it("includes manual articles in help search results (S2-9 arrival point)", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "밑색" } });
    const heading = screen.getByRole("heading", { level: 3, name: "매뉴얼 문서" });
    const cards = heading.parentElement?.querySelectorAll("a[data-site-link-card]") ?? [];
    const hrefs = [...cards].map((card) => card.getAttribute("href"));
    // learn §2.16의 예시 질문("밑색이 새요")이 닿아야 할 바로 그 문서가 결과에 있다.
    expect(hrefs).toContain("/studio/manual/selection-fill");
    expect(screen.queryByText("일치하는 주제를 찾지 못했습니다.")).toBeNull();
  });

  it("reaches manual articles from a problem sentence too", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "저장이 안 돼요" } });
    const heading = screen.getByRole("heading", { level: 3, name: "매뉴얼 문서" });
    const cards = heading.parentElement?.querySelectorAll("a[data-site-link-card]") ?? [];
    const hrefs = [...cards].map((card) => card.getAttribute("href"));
    expect(hrefs).toContain("/studio/manual/save-recovery");
  });

  it("includes courses in help search results (unified search aggregation)", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "콘티" } });
    const heading = screen.getByRole("heading", { level: 3, name: "강좌" });
    const cards = heading.parentElement?.querySelectorAll("a[data-site-link-card]") ?? [];
    const hrefs = [...cards].map((card) => card.getAttribute("href"));
    // /learn 강좌 검색(matchesSearch)이 닿는 바로 그 강좌가 도움말 결과에도 있다.
    expect(hrefs).toContain("/learn/lessons/story-board");
    expect(screen.queryByText("일치하는 주제를 찾지 못했습니다.")).toBeNull();
  });

  it("does not show the empty state when only a course matches", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "소실점" } });
    const heading = screen.getByRole("heading", { level: 3, name: "강좌" });
    const cards = heading.parentElement?.querySelectorAll("a[data-site-link-card]") ?? [];
    const hrefs = [...cards].map((card) => card.getAttribute("href"));
    expect(hrefs).toContain("/learn/lessons/camera-perspective");
    expect(screen.queryByText("일치하는 주제를 찾지 못했습니다.")).toBeNull();
  });

  it("shows the topics as icon-and-name tiles and keeps the self-diagnostics after the FAQ", () => {
    renderHelp();
    const tiles = document.querySelectorAll('a[data-site-link-card="tile"]');
    expect(tiles).toHaveLength(8);
    const faq = screen.getByText("작업을 시작하기 전에");
    const diagnostics = screen.getByTestId("diagnostics");
    expect(faq.compareDocumentPosition(diagnostics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("enforces 44px touch targets on help filter chips, 320px single-column topic grid reflow, and FAQ reduced-motion classes (GAP-R4-05)", () => {
    renderHelp();
    const filterGroup = screen.getByRole("group", { name: "자주 찾는 도움말" });
    const chips = filterGroup.querySelectorAll("button");
    expect(chips.length).toBeGreaterThanOrEqual(4);
    for (const chip of chips) {
      expect(chip.className).toContain("min-h-11");
      expect(chip.className).toContain("min-w-11");
      expect(chip.className).toContain("motion-reduce:transition-none");
    }

    const firstTile = document.querySelector('a[data-site-link-card="tile"]');
    const topicGrid = firstTile?.parentElement;
    expect(topicGrid?.className).toContain("grid-cols-1");
    expect(topicGrid?.className).toContain("min-[380px]:grid-cols-2");

    const faqSummary = screen.getByText("웹툰 작업은 어디서 시작하나요?").closest("summary");
    expect(faqSummary?.className).toContain("min-h-11");
    const chevron = faqSummary?.querySelector('span[aria-hidden="true"]');
    expect(chevron?.className).toContain("motion-reduce:transition-none");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "존재하지않는주제" } });
    const clearButton = screen.getByRole("button", { name: "검색어 지우기" });
    expect(clearButton.className).toContain("min-h-11");
    expect(clearButton.className).toContain("min-w-11");
  });

  it("restores focus to searchbox when clearing 0-result search, provides an inline 44px clear button, and toggles active popular chips off on second tap (Round 6)", () => {
    renderHelp();
    const searchbox = screen.getByRole("searchbox") as HTMLInputElement;

    // 1) Active popular chip toggles on and off when tapped twice
    const brushChip = screen.getByRole("button", { name: "브러시" });
    expect(brushChip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(brushChip);
    expect(brushChip.getAttribute("aria-pressed")).toBe("true");
    expect(searchbox.value).toBe("브러시");
    fireEvent.click(brushChip);
    expect(brushChip.getAttribute("aria-pressed")).toBe("false");
    expect(searchbox.value).toBe("");

    // 2) Long unbroken 0-result query renders inline 44px clear button and restores focus to searchbox on empty-state clear
    fireEvent.change(searchbox, {
      target: {
        value: "초장문검색어결과없음_LongUnbrokenQueryWithoutMatches_20261107",
      },
    });
    const inlineClear = screen.getByRole("button", { name: "검색어 초기화" });
    expect(inlineClear.className).toContain("min-h-11");
    expect(inlineClear.className).toContain("min-w-11");

    const emptyClear = screen.getByRole("button", { name: "검색어 지우기" });
    fireEvent.click(emptyClear);
    expect(searchbox.value).toBe("");
    expect(document.activeElement).toBe(searchbox);

    // 3) Escape key inside searchbox clears query
    fireEvent.change(searchbox, { target: { value: "말풍선" } });
    expect(searchbox.value).toBe("말풍선");
    fireEvent.keyDown(searchbox, { key: "Escape" });
    expect(searchbox.value).toBe("");
  });

  it("검색 결과가 있는 분류만 개수와 함께 보여 주고 초기화하면 빠른 이동을 숨긴다", () => {
    renderHelp();
    expect(screen.queryByRole("navigation", { name: "검색 결과 바로가기" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "소실점" } });
    expect(screen.getByRole("searchbox", { name: "도움말 검색" })).toBeTruthy();
    const navigation = screen.getByRole("navigation", { name: "검색 결과 바로가기" });
    const buttons = within(navigation).getAllByRole("button");
    expect(within(navigation).getByRole("button", { name: /강좌 \d+/ })).toBeTruthy();
    expect(within(navigation).queryByRole("button", { name: /도움말 주제/ })).toBeNull();
    expect(within(navigation).queryByRole("button", { name: /자주 묻는 질문/ })).toBeNull();
    for (const button of buttons) {
      const target = document.getElementById(button.getAttribute("aria-controls") ?? "");
      expect(target).toBeTruthy();
      expect(target?.getAttribute("tabindex")).toBe("-1");
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("motion-reduce:transition-none");
    }
    fireEvent.click(screen.getByRole("button", { name: "검색어 초기화" }));
    expect(screen.queryByRole("navigation", { name: "검색 결과 바로가기" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  it("결과 분류로 반복 이동해도 검색어를 유지하고 대상 제목으로 포커스를 옮긴다", () => {
    const scrollIntoView = vi.fn();
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      renderHelp();
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "저장이 안 돼요" } });
      const navigation = screen.getByRole("navigation", { name: "검색 결과 바로가기" });
      const buttons = within(navigation).getAllByRole("button");
      expect(within(navigation).getByRole("button", { name: /자주 묻는 질문/ })).toBeTruthy();
      for (const button of [...buttons, ...buttons]) {
        fireEvent.click(button);
        expect(document.activeElement?.id).toBe(button.getAttribute("aria-controls"));
        expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start", behavior: "instant" });
        expect(screen.getByRole("searchbox").getAttribute("value")).toBe("저장이 안 돼요");
      }
      expect(scrollIntoView).toHaveBeenCalledTimes(buttons.length * 2);
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScroll;
    }
  });

  it("결과가 없는 검색과 공백 검색에서는 존재하지 않는 빠른 이동을 노출하지 않는다", () => {
    renderHelp();
    for (const query of ["없는결과_20261108", "   ", ""]) {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: query } });
      expect(screen.queryByRole("navigation", { name: "검색 결과 바로가기" })).toBeNull();
    }
  });


  it("영어에서도 결과 분류와 이동 버튼의 접근 가능한 이름을 제공한다", () => {
    useI18n.getState().setLang("en");
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), { target: { value: "save" } });
    const navigation = screen.getByRole("navigation", { name: "Jump to search results" });
    expect(within(navigation).getByRole("button", { name: /Manual articles \d+/ })).toBeTruthy();
    expect(within(navigation).getByRole("button", { name: /Help topics \d+/ })).toBeTruthy();
    expect(navigation.textContent).not.toContain("legacyUi.");
  });

});

