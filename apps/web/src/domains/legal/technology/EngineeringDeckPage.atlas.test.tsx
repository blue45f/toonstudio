// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineeringDeckPage } from "./EngineeringDeckPage";
import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { FIXTURE_ATLAS_BUDGET, FIXTURE_ATLAS_OPFS } from "./engineering-atlas.fixtures";
import { TALK_SLIDES } from "./engineering-talk-deck";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { useI18n } from "@/shared/lib/i18n-core";

/**
 * 부록 트랙·카드 이동·발표자 패널의 도감 연결·빈 도감·트랙별 문구를 페이지 수준에서 검사한다.
 * 도감 집계 모듈과 발표 원본의 일부를 테스트용으로 대체해 콘텐츠가 바뀌어도 엔진 검사가 흔들리지 않게 한다.
 */

const mocked = vi.hoisted(() => ({ entries: [] as EngineeringAtlasEntry[] }));

vi.mock("./engineering-atlas-content", () => ({
  ENGINEERING_ATLAS_ENTRIES: mocked.entries,
  findAtlasEntry: (id: string) => mocked.entries.find((entry) => entry.id === id),
  atlasEntriesForCategory: () => [],
  atlasEntriesForChapter: () => [],
}));

// 3번째 발표 슬라이드에 "질문이 나오면 열 도감 카드"를 붙인다.
vi.mock("./engineering-talk-deck", async (importOriginal) => {
  const original = await importOriginal<typeof import("./engineering-talk-deck")>();
  const slides = original.TALK_SLIDES.map((slide) => (slide.id === "talk-problem" ? { ...slide, relatedAtlasIds: ["fixture-opfs", "no-such-card"] } : slide));
  return { ...original, TALK_SLIDES: slides };
});

// 예상 질문 둘에 도감 카드 id 를 붙인다(하나는 없는 카드).
vi.mock("./engineering-seminar-prep-content", async (importOriginal) => {
  const original = await importOriginal<typeof import("./engineering-seminar-prep-content")>();
  const questions = original.SEMINAR_PREP_QUESTIONS.map((question, index) => {
    if (index === 0) return { ...question, atlasId: "fixture-opfs" };
    if (index === 1) return { ...question, atlasId: "no-such-card" };
    return question;
  });
  return { ...original, SEMINAR_PREP_QUESTIONS: questions };
});

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

beforeEach(() => {
  useI18n.getState().setLang("ko");
  mocked.entries.splice(0, mocked.entries.length, FIXTURE_ATLAS_OPFS, FIXTURE_ATLAS_BUDGET);
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderDeck(path = "/about/technology/deck?track=atlas") {
  window.history.replaceState(null, "", path);
  const url = new URL(path, "http://localhost");
  return render(
    <MemoryRouter initialEntries={[`${url.pathname}${url.search}`]}>
      <EngineeringDeckPage />
    </MemoryRouter>,
  );
}

function stageSlideId(): string | null | undefined {
  return document.querySelector('[data-engineering-deck-shell] [data-deck-stage] [data-deck-slide]')?.getAttribute("data-slide-id");
}

function shell(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-engineering-deck-shell]");
  if (!element) throw new Error("deck shell is missing");
  return element;
}

/** 페이지 조작 막대의 카드 선택(발표자 패널에도 같은 선택이 하나 더 있다). */
function cardSelect(): HTMLSelectElement {
  const select = within(shell()).getAllByRole("combobox", { name: /도감 카드 선택|Select atlas card/u })[0];
  if (!(select instanceof HTMLSelectElement)) throw new Error("card select is missing");
  return select;
}

function key(value: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document, { key: value, ...init });
}

describe("도감 부록 트랙", () => {
  it("?track=atlas 로 열면 카드마다 도식 → 코드 → 사용처 슬라이드를 보여주고 주소창에 슬라이드 id 를 쓴다", () => {
    renderDeck();
    expect(stageSlideId()).toBe("atlas-fixture-opfs-diagram");
    expect(window.location.search).toBe("?track=atlas");
    expect(window.location.hash).toBe("#slide-atlas-fixture-opfs-diagram");

    fireEvent.click(within(shell()).getByRole("button", { name: /^다음$|^Next$/u }));
    expect(stageSlideId()).toBe("atlas-fixture-opfs-code-1");
    fireEvent.click(within(shell()).getByRole("button", { name: /^다음$|^Next$/u }));
    expect(stageSlideId()).toBe("atlas-fixture-opfs-usage");
    expect(window.location.hash).toBe("#slide-atlas-fixture-opfs-usage");
    key("End");
    expect(stageSlideId()).toBe("atlas-fixture-free-budget-usage");
    key("Home");
    expect(stageSlideId()).toBe("atlas-fixture-opfs-diagram");
  });

  it("카드 선택은 카테고리별 optgroup 이고 고르면 그 카드의 첫 슬라이드로 이동한다", () => {
    renderDeck();
    const select = cardSelect();
    const groups = [...select.querySelectorAll("optgroup")];
    expect(groups.map((group) => group.label)).toEqual(["로컬 우선·저장 (1)", "AI·추론 (1)"]);
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "OPFS · 브라우저 안의 비공개 파일 시스템",
      "Quota ledger · 무료 한도 원장",
    ]);
    expect(select.value).toBe("0");
    fireEvent.change(select, { target: { value: "3" } });
    expect(stageSlideId()).toBe("atlas-fixture-free-budget-diagram");
    expect(cardSelect().value).toBe("3");
  });

  it("[ ] 키는 카드 단위로 이동하고 처음·끝에서는 멈추며, 선택 상자에 초점이 있으면 가로채지 않는다", () => {
    renderDeck();
    key("]");
    expect(stageSlideId()).toBe("atlas-fixture-free-budget-diagram");
    key("]");
    expect(stageSlideId()).toBe("atlas-fixture-free-budget-diagram");
    key("ArrowRight");
    expect(stageSlideId()).toBe("atlas-fixture-free-budget-code-1");
    key("[");
    expect(stageSlideId()).toBe("atlas-fixture-opfs-diagram");
    key("[");
    expect(stageSlideId()).toBe("atlas-fixture-opfs-diagram");

    const select = cardSelect();
    select.focus();
    fireEvent.keyDown(select, { key: "]" });
    expect(stageSlideId()).toBe("atlas-fixture-opfs-diagram");
    // 카드 이전·다음 단추도 같은 이동이다.
    fireEvent.click(within(shell()).getByRole("button", { name: /^다음 카드$|^Next card$/u }));
    expect(stageSlideId()).toBe("atlas-fixture-free-budget-diagram");
    fireEvent.click(within(shell()).getByRole("button", { name: /^이전 카드$|^Previous card$/u }));
    expect(stageSlideId()).toBe("atlas-fixture-opfs-diagram");
  });

  it("카드가 없는 트랙에서 [ ] 키는 아무 일도 하지 않고 이벤트를 가로채지 않는다", () => {
    renderDeck("/about/technology/deck?track=talk#slide-3");
    const event = new KeyboardEvent("keydown", { key: "]", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(stageSlideId()).toBe(TALK_SLIDES[2]?.id);
  });

  it("#slide-<id> 딥링크는 그 슬라이드를 열고, 번호 해시도 그대로 동작한다", () => {
    renderDeck("/about/technology/deck?track=atlas#slide-atlas-fixture-free-budget-code-1");
    expect(stageSlideId()).toBe("atlas-fixture-free-budget-code-1");
    cleanup();
    renderDeck("/about/technology/deck?track=atlas#slide-2");
    expect(stageSlideId()).toBe("atlas-fixture-opfs-code-1");
    cleanup();
    renderDeck("/about/technology/deck?track=talk#slide-talk-problem");
    expect(stageSlideId()).toBe("talk-problem");
    expect(window.location.hash).toBe("#slide-3");
  });

  it("시간 배정이 없어 경과 시간만 보여주고 페이스·구간 예산은 숨긴다", () => {
    renderDeck();
    const panel = screen.getByRole("region", { name: /발표자 도구|Presenter tools/u });
    expect(within(panel).getByRole("timer", { name: /발표 경과 시간|Talk elapsed time/u }).textContent).toContain("00:00");
    expect(panel.textContent).toContain("시간 배정이 없습니다");
    expect(panel.textContent).not.toMatch(/예산|Budget|예정|ahead of plan|behind plan|구간 남은 시간/u);
    expect(panel.textContent).toMatch(/\[ \] 키로 이전·다음 카드로 이동합니다/u);
    // 구간 시간표(준비실)는 세미나 트랙에만 있다.
    expect(screen.queryByRole("heading", { name: /리허설에 필요한 세 가지|Three things to rehearse/u })).toBeNull();
  });

  it("발표자 패널에서 같은 카드의 도식·코드·쓰인 곳 슬라이드로 바로 이동한다", () => {
    renderDeck();
    const panel = screen.getByRole("region", { name: /발표자 도구|Presenter tools/u });
    const views = within(panel).getByRole("group", { name: /카드 안에서 이동|Move within the card/u });
    fireEvent.click(within(views).getByRole("button", { name: "코드" }));
    expect(stageSlideId()).toBe("atlas-fixture-opfs-code-1");
    fireEvent.click(within(views).getByRole("button", { name: "쓰인 곳" }));
    expect(stageSlideId()).toBe("atlas-fixture-opfs-usage");
    expect(within(views).getByRole("button", { name: "쓰인 곳" }).getAttribute("aria-pressed")).toBe("true");
    // 발표자 노트에는 카드의 질문·답변이 있다.
    expect(panel.textContent).toContain("브라우저 저장소를 지우면요?");
  });

  it("트랙 버튼은 네 개이고 부록은 시간이 아니라 장수만 보여준다", () => {
    renderDeck();
    const group = screen.getByRole("group", { name: /발표 트랙|Presentation track/u });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    const atlas = within(group).getByRole("button", { name: /기술 도감 부록|Tech atlas appendix/u });
    expect(atlas.getAttribute("aria-pressed")).toBe("true");
    expect(atlas.textContent).toContain("부록");
    expect(atlas.textContent).toContain("6장");
    expect(atlas.textContent).not.toMatch(/분/u);
  });
});

describe("트랙별 문서 제목·소개 문구", () => {
  const talkDescription = /30분 세미나 슬라이드와 발표자 도구/u;

  it("세미나 발표만 30분 세미나 문구를 쓰고 나머지 트랙은 자기 문구를 쓴다", () => {
    const expectations: readonly (readonly [string, RegExp, RegExp | null])[] = [
      ["talk", /30분 세미나/u, talkDescription],
      ["brief", /핵심 요약/u, /핵심 요약 슬라이드/u],
      ["lecture", /심화 강의/u, /심화 강의 슬라이드/u],
      ["atlas", /기술 도감 부록/u, /기술 도감 부록/u],
    ];
    for (const [track, titlePattern, descriptionPattern] of expectations) {
      cleanup();
      vi.mocked(useDocumentTitle).mockClear();
      renderDeck(`/about/technology/deck?track=${track}`);
      const titles = vi.mocked(useDocumentTitle).mock.calls.map((call) => String(call[0]));
      expect(titles.at(-1), track).toMatch(titlePattern);
      if (track !== "talk") expect(titles.at(-1), track).not.toMatch(/30분 세미나/u);
      const intro = document.querySelector("main")?.textContent ?? document.body.textContent ?? "";
      if (descriptionPattern) expect(intro, track).toMatch(descriptionPattern);
      if (track !== "talk") expect(intro.includes("30분 세미나 슬라이드와 발표자 도구입니다"), track).toBe(false);
    }
  });

  it("영어 화면도 트랙별 제목을 쓴다", () => {
    useI18n.getState().setLang("en");
    renderDeck("/about/technology/deck?track=brief");
    expect(String(vi.mocked(useDocumentTitle).mock.calls.at(-1)?.[0])).toMatch(/executive brief/u);
    expect(String(vi.mocked(useDocumentTitle).mock.calls.at(-1)?.[0])).not.toMatch(/30-minute/u);
  });
});

describe("인쇄와 오프라인 내보내기는 현재 구간만", () => {
  it("부록 트랙의 인쇄 영역은 현재 카테고리의 슬라이드만 담고, 구간을 옮기면 그 구간으로 바뀐다", () => {
    renderDeck();
    const printed = (): string[] => [...document.querySelectorAll("[data-engineering-print-deck] [data-deck-slide]")].map((node) => node.getAttribute("data-slide-id") ?? "");
    expect(printed()).toEqual(["atlas-fixture-opfs-diagram", "atlas-fixture-opfs-code-1", "atlas-fixture-opfs-usage"]);
    expect(document.querySelector("[data-engineering-print-deck]")?.getAttribute("aria-hidden")).toBe("true");
    // 인쇄본의 쪽 번호는 트랙 안의 위치다(구간 안의 번호가 아님).
    key("]");
    expect(printed()).toEqual(["atlas-fixture-free-budget-diagram", "atlas-fixture-free-budget-code-1", "atlas-fixture-free-budget-usage"]);
    expect(document.querySelector("[data-engineering-print-deck] [data-deck-slide]")?.getAttribute("aria-label")).toBeNull();
    expect(screen.getByText(/인쇄·오프라인 발표본은 현재 구간 “AI·추론” 3장만 담습니다/u)).toBeTruthy();
  });

  it("오프라인 발표본은 현재 구간만 코드·도식 글·쓰인 곳을 담은 한 파일로 내려받는다", async () => {
    let blob: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob) => {
        blob = value;
        return "blob:atlas";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    let downloaded = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function recordDownload(this: HTMLAnchorElement) {
      downloaded = this.download;
    });

    renderDeck("/about/technology/deck?track=atlas#slide-atlas-fixture-free-budget-diagram");
    fireEvent.click(screen.getByRole("button", { name: /오프라인 발표본|Offline deck/u }));
    expect(downloaded).toBe("toonstudio-atlas-ai-deck.html");
    if (!blob) throw new Error("offline deck was not created");
    const html = await blob.text();
    expect(html.match(/<article data-slide/gu)).toHaveLength(3);
    expect(html).toContain("예산 가드");
    expect(html).toContain("canSpend");
    expect(html).toContain("AI·추론");
    expect(html).not.toContain("편집 명령 → Worker");
    expect(html).toContain("이 파일은 도감 부록의 “AI·추론” 구간 3장만 담고 있습니다.");
    expect(html.match(/<script\b[^>]*>/giu)).toHaveLength(1);
    expect(screen.getByText(/AI·추론 3장만 포함/u)).toBeTruthy();
  });
});

describe("슬라이드 링크 복사", () => {
  it("번호가 아니라 슬라이드 id 링크를 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderDeck("/about/technology/deck?track=talk#slide-3");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /슬라이드 링크|Slide link/u }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/about/technology/deck?track=talk#slide-${TALK_SLIDES[2]?.id ?? ""}`);
  });
});

describe("발표 슬라이드에서 도감 카드 열기", () => {
  it("발표자 패널의 관련 도감 카드 단추가 같은 탭의 부록 카드 첫 슬라이드로 이동하고 돌아올 수 있다", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderDeck("/about/technology/deck?track=talk#slide-3");
    const panel = screen.getByRole("region", { name: /발표자 도구|Presenter tools/u });
    // 없는 카드(no-such-card)는 단추를 만들지 않는다.
    const buttons = within(panel).getAllByRole("button", { name: /도감 카드 열기|Open atlas card/u });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);

    expect(open).not.toHaveBeenCalled();
    expect(stageSlideId()).toBe("atlas-fixture-opfs-diagram");
    expect(window.location.search).toBe("?track=atlas");
    expect(window.location.hash).toBe("#slide-atlas-fixture-opfs-diagram");
    const back = within(screen.getByRole("region", { name: /발표자 도구|Presenter tools/u })).getByRole("button", { name: /발표로 돌아가기 · 3\/19/u });
    fireEvent.click(back);
    expect(stageSlideId()).toBe("talk-problem");
    expect(window.location.search).toBe("?track=talk");
    expect(window.location.hash).toBe("#slide-3");
  });

  it("예상 질문 카드에 연결된 도감 카드는 열기 단추와 도감 페이지 링크를 보여주고 없는 카드는 숨긴다", () => {
    renderDeck("/about/technology/deck?track=talk");
    const prep = screen.getByRole("heading", { name: /리허설에 필요한 세 가지|Three things to rehearse/u }).closest("section");
    if (!prep) throw new Error("prep section is missing");
    const openButtons = within(prep).getAllByRole("button", { name: /도감 카드 열기: OPFS|Open atlas card: OPFS/u });
    expect(openButtons).toHaveLength(1);
    const pageLinks = within(prep).getAllByRole("link", { name: /도감 페이지에서 읽기|Read it on the atlas page/u });
    expect(pageLinks).toHaveLength(1);
    expect(pageLinks[0]?.getAttribute("href")).toBe("/about/technology/atlas#fixture-opfs");
    expect(pageLinks[0]?.getAttribute("target")).toBe("_blank");

    fireEvent.click(openButtons[0] as HTMLElement);
    expect(stageSlideId()).toBe("atlas-fixture-opfs-diagram");
    // 준비실은 세미나 트랙에만 있다.
    expect(screen.queryByRole("heading", { name: /리허설에 필요한 세 가지|Three things to rehearse/u })).toBeNull();
  });
});

describe("개요 썸네일 지연 렌더링", () => {
  class FakeObserver {
    static readonly instances: FakeObserver[] = [];
    readonly nodes: Element[] = [];
    constructor(readonly callback: IntersectionObserverCallback) {
      FakeObserver.instances.push(this);
    }

    observe(node: Element): void {
      this.nodes.push(node);
    }

    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  it("화면에 보일 때만 슬라이드를 그리고 한 번 그린 썸네일은 유지한다", () => {
    FakeObserver.instances.length = 0;
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    renderDeck();
    key("o");
    const overview = screen.getByRole("region", { name: /슬라이드 개요|Slide overview/u });
    const thumbs = (): HTMLElement[] => [...overview.querySelectorAll<HTMLElement>(".deck-overview__thumb")];
    expect(thumbs()).toHaveLength(6);
    expect(thumbs().every((thumb) => thumb.getAttribute("data-rendered") === "false")).toBe(true);
    expect(overview.querySelectorAll("[data-deck-slide]")).toHaveLength(0);
    // 자리는 잡혀 있고 제목은 보인다.
    expect(thumbs()[0]?.textContent).toContain("OPFS");

    const target = thumbs()[2];
    const observer = FakeObserver.instances.find((instance) => instance.nodes.includes(target as Element));
    if (!target || !observer) throw new Error("observer for the third thumbnail is missing");
    act(() => observer.callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], observer as unknown as IntersectionObserver));
    expect(thumbs()[2]?.getAttribute("data-rendered")).toBe("true");
    expect(overview.querySelectorAll("[data-deck-slide]")).toHaveLength(1);
    expect(overview.querySelector("[data-deck-slide]")?.getAttribute("data-slide-id")).toBe("atlas-fixture-opfs-usage");
    expect(thumbs().filter((thumb) => thumb.getAttribute("data-rendered") === "true")).toHaveLength(1);
  });

  it("구간 제목 옆에는 시간이 아니라 슬라이드 수를 보여준다", () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    renderDeck();
    key("o");
    const overview = screen.getByRole("region", { name: /슬라이드 개요|Slide overview/u });
    const headings = [...overview.querySelectorAll("h3")].map((heading) => heading.textContent);
    expect(headings).toEqual(["01로컬 우선·저장3장", "02AI·추론3장"]);
  });
});

describe("도감이 비어 있을 때", () => {
  beforeEach(() => {
    mocked.entries.splice(0, mocked.entries.length);
  });

  it("부록 트랙은 빈 상태 안내를 보여주고 발표 시작 같은 조작은 막는다", () => {
    renderDeck();
    expect(screen.getByText("도감 카드가 아직 없습니다")).toBeTruthy();
    const group = screen.getByRole("group", { name: /발표 트랙|Presentation track/u });
    expect(within(group).getAllByRole("button")).toHaveLength(4);
    expect(within(group).getByRole("button", { name: /기술 도감 부록/u }).textContent).toContain("0장");
    expect(document.querySelector("[data-deck-slide]")).toBeNull();
    for (const name of [/발표 시작|Start presenting/u, /발표자 창 열기|Open presenter window/u, /슬라이드 링크|Slide link/u, /인쇄·PDF|Print/u, /오프라인 발표본|Offline deck/u]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled"), String(name)).toBe(true);
    }
    // F 키로도 발표 화면이 열리지 않고 페이지가 inert 로 잠기지 않는다.
    key("f");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect([...document.body.children].some((element) => element instanceof HTMLElement && element.inert)).toBe(false);
    // 키 입력도 안전하다.
    key("ArrowRight");
    key("End");
    key("]");
    key("o");
    expect(screen.queryByRole("region", { name: /슬라이드 개요|Slide overview/u })).toBeNull();
  });

  it("빈 상태에서 세미나 발표로 갈 수 있다", () => {
    renderDeck();
    fireEvent.click(screen.getByRole("button", { name: /세미나 발표로 가기|Go to the seminar talk/u }));
    expect(stageSlideId()).toBe(TALK_SLIDES[0]?.id);
    expect(window.location.search).toBe("?track=talk");
  });

  it("?view=presenter 로 열어도 빈 도감은 빈 화면이 아니라 페이지 안내를 보여준다", () => {
    renderDeck("/about/technology/deck?track=atlas&view=presenter");
    expect(screen.getByText("도감 카드가 아직 없습니다")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /발표자 화면|Presenter view/u })).toBeNull();
  });

  it("도감이 비어 있어도 세미나 발표(기존 슬라이드)는 그대로 열린다", () => {
    renderDeck("/about/technology/deck?track=talk");
    expect(stageSlideId()).toBe(TALK_SLIDES[0]?.id);
  });
});

describe("발표 화면과 발표자 창의 부록 조작", () => {
  it("발표 화면(F)에서 [ ] 로 카드를 옮기고 HUD 카드 선택이 있다", () => {
    renderDeck();
    fireEvent.click(screen.getByRole("button", { name: /발표 시작|Start presenting/u }));
    const dialog = screen.getByRole("dialog", { name: /기술 발표 화면|Engineering presentation/u });
    expect(dialog.querySelector(".deck-present__stage [data-deck-slide]")?.getAttribute("data-slide-id")).toBe("atlas-fixture-opfs-diagram");
    expect(within(dialog).getByRole("combobox", { name: /도감 카드 선택|Select atlas card/u })).toBeTruthy();
    key("]");
    expect(dialog.querySelector(".deck-present__stage [data-deck-slide]")?.getAttribute("data-slide-id")).toBe("atlas-fixture-free-budget-diagram");
    // HUD 타이머는 경과 시간만 보여준다.
    expect(dialog.querySelector(".deck-present__hud")?.textContent).not.toMatch(/\/ \d\d:\d\d/u);
    key("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("발표자 창(?view=presenter)도 카드 선택과 노트를 보여준다", () => {
    renderDeck("/about/technology/deck?track=atlas&view=presenter#slide-atlas-fixture-free-budget-usage");
    const presenter = screen.getByRole("dialog", { name: /발표자 화면|Presenter view/u });
    expect(presenter.querySelector(".deck-present__stage [data-deck-slide]")?.getAttribute("data-slide-id")).toBe("atlas-fixture-free-budget-usage");
    expect(within(presenter).getAllByRole("combobox", { name: /도감 카드 선택|Select atlas card/u }).length).toBeGreaterThan(0);
    expect(within(presenter).getByRole("timer", { name: /발표 경과 시간|Talk elapsed time/u })).toBeTruthy();
    expect(window.location.search).toBe("?track=atlas&view=presenter");
    expect(window.location.hash).toBe("#slide-atlas-fixture-free-budget-usage");
  });
});
