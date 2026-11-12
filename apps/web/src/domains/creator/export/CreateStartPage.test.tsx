// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioProject,
  readStudioProjectLibrary,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
} from "../studio-project-library-store";
import { CreateStartPage } from "../CreateStartPage";

import { useI18n } from "@/shared/lib/i18n";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function HistoryBack() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>테스트 이전 주소</button>;
}

function renderStartSheet(initialEntry: string, extra?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CreateStartPage />
      <LocationProbe />
      {extra}
    </MemoryRouter>,
  );
}

function openMoreStartMethods() {
  fireEvent.click(screen.getByText("다른 시작 방법 · 기획, 콘티, 템플릿, 파일"));
}

function openMoreTopics() {
  fireEvent.click(screen.getByText("주제별 질문과 제작 도구 더 보기"));
}

/** 두 작품을 만들고 연 시각을 고정해 최근 순서를 결정적으로 만든다. */
function seedTwoProjects() {
  createStudioProject(window.localStorage, { id: "older", title: "오래된 작품", kind: "webtoon" });
  createStudioProject(window.localStorage, { id: "newer", title: "최근 작품", kind: "webtoon" });
  const state = readStudioProjectLibrary(window.localStorage);
  const next = {
    ...state,
    projects: state.projects.map((project) => ({
      ...project,
      lastOpenedAt: project.id === "newer" ? "2026-10-05T00:00:00.000Z" : "2026-10-01T00:00:00.000Z",
    })),
  };
  window.localStorage.setItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(next));
}

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CreateStartPage (작품 시작 시트)", () => {
  it("추가 방법을 펼치면 기존 시작 레인 5개와 이어가기를 모두 사용할 수 있다", () => {
    renderStartSheet("/create");
    openMoreStartMethods();

    expect(screen.getByRole("heading", { name: "어떻게 시작할까요?" })).toBeTruthy();
    // 추천 시작을 보여 주거나 보조 방법을 펼쳐도 생성은 명시 클릭 전까지 실행하지 않는다.
    expect(screen.getByRole("button", { name: "캔버스 열기" })).toBeTruthy();
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
    expect(screen.getByRole("link", { name: /템플릿으로 시작하기/ }).getAttribute("href")).toBe("/studio/templates");
    // 콘티 레인은 레인을 명시해 넘긴다(S2-7) — 양식 시작점 초기값은 storyboard, 생성 뒤 에디터에 착지한다.
    expect(screen.getByRole("link", { name: /콘티부터 시작하기/ }).getAttribute("href")).toBe("/studio/new?lane=storyboard&start=storyboard");
    // 이야기 레인도 레인을 명시한다 — 시작점 초기값은 아이디어, 생성 뒤 기획 섹션에 착지한다.
    expect(screen.getByRole("link", { name: /이야기부터 시작하기/ }).getAttribute("href")).toBe("/studio/new?lane=idea&start=idea");
    // 빈 캔버스 레인 — 구조 선택을 강제하지 않는 시작점이 관문에 있어야 하고(F3.2),
    // bare /studio/new(레인 없는 딥링크)와 구분되도록 ?lane=blank로 명시한다(S2-7).
    expect(screen.getByRole("link", { name: /빈 캔버스로 시작하기/ }).getAttribute("href")).toBe("/studio/new?lane=blank");
    // 가져오기 레인 — 가진 파일로 이어 시작하는 길도 관문의 레인 중 하나다.
    expect(screen.getByRole("link", { name: /가져와서 시작하기/ }).getAttribute("href")).toBe("/studio/import");
    fireEvent.click(screen.getByTestId("create-start-section-continue"));
    expect(screen.getByRole("heading", { name: "이어서 작업하기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /새 작품 만들기/ }).getAttribute("href")).toBe("/studio/new?lane=blank");
  });

  it("최근 작품이 없으면 비어 있음을 알리고 새 작품 만들기로 먼저 안내한다", () => {
    renderStartSheet("/create?section=continue");

    expect(screen.getByText(/아직 작업한 작품이 없어요/)).toBeTruthy();
    // 빈 상태의 주 행동은 첫 작품 만들기다. 둘러보기는 보조로 남는다.
    const continueCard = screen.getByRole("heading", { name: "이어서 작업하기" }).closest("section");
    expect(continueCard).not.toBeNull();
    const cardLinks = within(continueCard as HTMLElement).getAllByRole("link");
    expect(cardLinks[0]?.getAttribute("href")).toBe("/studio/new?lane=blank");
    expect(screen.getByRole("link", { name: /작업실 둘러보기/ }).getAttribute("href")).toBe("/studio");
    expect(screen.queryByRole("link", { name: /모든 작품 보기/ })).toBeNull();
    // 게스트에게는 저장 범위를 정직하게 알린다.
    expect(screen.getByText(/지금은 이 기기에만 저장돼요/)).toBeTruthy();
  });

  it("최근 작품은 최근에 연 순서로 작품 화면 링크와 함께 보여 준다", () => {
    seedTwoProjects();
    renderStartSheet("/create?section=continue");

    const newer = screen.getByRole("link", { name: /최근 작품 이어서 작업/ });
    const older = screen.getByRole("link", { name: /오래된 작품 이어서 작업/ });
    expect(newer.getAttribute("href")).toContain("/studio/p/newer");
    expect(older.getAttribute("href")).toContain("/studio/p/older");
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /모든 작품 보기/ }).getAttribute("href")).toBe("/studio");
  });

  it("최근 작품에 기록된 썸네일이 있으면 표지로 보여 주고, 없으면 제목 첫 글자로 돌아간다", () => {
    createStudioProject(window.localStorage, { id: "with-thumb", title: "표지 있는 작품", kind: "webtoon" });
    createStudioProject(window.localStorage, { id: "no-thumb", title: "표지 없는 작품", kind: "webtoon" });
    const state = readStudioProjectLibrary(window.localStorage);
    const next = {
      ...state,
      projects: state.projects.map((project) => ({
        ...project,
        thumbnailUrl: project.id === "with-thumb" ? "https://example.test/cover.webp" : null,
        lastOpenedAt: project.id === "with-thumb" ? "2026-10-05T00:00:00.000Z" : "2026-10-01T00:00:00.000Z",
      })),
    };
    window.localStorage.setItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(next));
    renderStartSheet("/create?section=continue");

    const withThumb = screen.getByRole("link", { name: /표지 있는 작품 이어서 작업/ });
    expect(withThumb.querySelector("img")?.getAttribute("src")).toBe("https://example.test/cover.webp");
    const noThumb = screen.getByRole("link", { name: /표지 없는 작품 이어서 작업/ });
    expect(noThumb.querySelector("img")).toBeNull();
    expect(noThumb.textContent).toContain("표");
  });

  it("갤러리는 /showcase와 창작자 갤러리로 안내만 하고 본문을 중복하지 않는다", () => {
    renderStartSheet("/create?section=continue");

    expect(screen.getByRole("link", { name: /창작 갤러리/ }).getAttribute("href")).toBe("/showcase");
    expect(screen.getByRole("link", { name: /창작자 커리어 갤러리/ }).getAttribute("href")).toBe("/collaborate/gallery");
  });

  it("갤러리 보기 조건을 단 옛 주소는 같은 조건으로 /showcase에 넘긴다", () => {
    renderStartSheet("/create?tab=works&sort=popular&tag=%EC%95%A1%EC%85%98");

    expect(screen.getByTestId("location").textContent).toBe(
      "/showcase?tab=works&sort=popular&tag=%EC%95%A1%EC%85%98",
    );
    expect(screen.queryByRole("heading", { name: "어떻게 시작할까요?" })).toBeNull();
  });

  it("갤러리와 무관한 조건만 있으면 시작 시트를 그대로 연다", () => {
    renderStartSheet("/create?from=home");

    expect(screen.getByTestId("location").textContent).toBe("/create?from=home");
    expect(screen.getByRole("heading", { name: "어떻게 시작할까요?" })).toBeTruthy();
  });

  it("큰 이미지 두 선택을 먼저 보여 주고 제작 도구는 접어 둔다", () => {
    renderStartSheet("/create");
    const guide = screen.getByTestId("create-start-persona-guide");
    expect(within(guide).getByRole("heading", { name: "이야기부터 시작" })).toBeTruthy();
    expect(within(guide).getByRole("heading", { name: "바로 그리기" })).toBeTruthy();
    expect(within(guide).getAllByRole("link")).toHaveLength(1);
    expect(within(guide).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("다른 시작 방법 · 기획, 콘티, 템플릿, 파일").closest("details")?.open).toBe(false);
    expect(screen.getByText("주제별 질문과 제작 도구 더 보기").closest("details")?.open).toBe(false);
    expect(within(guide).getByRole("link", { name: "이야기 시작하기" }).getAttribute("href")).toBe("/create?intent=my-story");
    expect(within(guide).getByRole("button", { name: "캔버스 열기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "템플릿 고르기" }).getAttribute("href")).toBe("/studio/templates");
    expect(screen.getByRole("link", { name: "파일 가져오기" }).getAttribute("href")).toBe("/studio/import");
    expect(screen.queryByText(/가입 없이 이 기기에 자동 저장/)).toBeNull();
  });

  it("영어 로케일에서 두 시작 선택과 별도 제작 도구 화면에 한글이 누수되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    renderStartSheet("/create");
    const guide = screen.getByTestId("create-start-persona-guide");
    expect(guide.textContent).not.toMatch(/[가-힣]/u);
    fireEvent.click(screen.getByTestId("create-start-section-pipeline"));
    const pipeline = screen.getByTestId("create-rea-story-pipeline");
    expect(pipeline.textContent).not.toMatch(/[가-힣]/u);
    for (const step of ["1 · Plan", "2 · New work", "3 · Edit", "4 · Finish"]) {
      expect(within(pipeline).getByText(step)).toBeTruthy();
    }
    const publishStep = within(pipeline).getByRole("link", { name: /Open episode publishing settings/ });
    expect(publishStep.getAttribute("href")).toBe("/studio/publish");
    expect(publishStep.textContent).toContain("Preparing files does not publish them externally");
    expect(publishStep.textContent).toContain("upload and schedule in the destination channel");
    expect(screen.queryByTestId("create-start-persona-guide")).toBeNull();
    for (const stepLink of within(pipeline).getAllByRole("link")) {
      expect(stepLink.className).toContain("min-h-11");
    }
  });

  it("GAP-R6-04: 시작 화면 구역 전환 토글이 48px 최소 타깃·명시적 포커스 링·선택 상태·방향키 이동 계약을 충족한다", () => {
    renderStartSheet("/create");
    const group = screen.getByRole("group", { name: "시작 화면 구역 보기 전환" });
    expect(group.getAttribute("data-testid")).toBe("create-start-section-group");
    expect(group.style.gap).toBe("8px");

    const buttons = within(group).getAllByRole("button");
    expect(buttons.length).toBe(4);
    for (const button of buttons) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("min-w-11");
      expect(button.className).toContain("focus-visible:outline");
      expect(button.className).toContain("scroll-my-24");
      expect(button.className).toContain("break-words");
      expect(button.className).toContain("[overflow-wrap:anywhere]");
      expect(button.style.minHeight).toBe("48px");
      expect(button.style.minWidth).toBe("48px");
    }

    const allBtn = screen.getByTestId("create-start-section-all");
    const lanesBtn = screen.getByTestId("create-start-section-lanes");
    const pipelineBtn = screen.getByTestId("create-start-section-pipeline");
    const continueBtn = screen.getByTestId("create-start-section-continue");

    expect(allBtn.getAttribute("aria-pressed")).toBe("true");
    expect(allBtn.getAttribute("data-state")).toBe("active");
    expect(lanesBtn.getAttribute("aria-pressed")).toBe("false");
    expect(lanesBtn.getAttribute("data-state")).toBe("inactive");

    allBtn.focus();
    fireEvent.keyDown(allBtn, { key: "ArrowRight" });
    expect(document.activeElement).toBe(lanesBtn);
    fireEvent.keyDown(lanesBtn, { key: "End" });
    expect(document.activeElement).toBe(continueBtn);
    fireEvent.keyDown(continueBtn, { key: "Home" });
    expect(document.activeElement).toBe(allBtn);
    fireEvent.keyDown(allBtn, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(continueBtn);

    fireEvent.click(pipelineBtn);
    expect(pipelineBtn.getAttribute("aria-pressed")).toBe("true");
    expect(pipelineBtn.getAttribute("data-state")).toBe("active");
    expect(allBtn.getAttribute("aria-pressed")).toBe("false");
    expect(allBtn.getAttribute("data-state")).toBe("inactive");
    expect(screen.getByTestId("location").textContent).toBe("/create?section=pipeline");
    expect(screen.getByRole("link", { name: /회차 게시 설정 열기/ }).textContent)
      .toContain("게시용 파일 준비는 외부 게시 완료와 달라요");
  });

  it("기본 화면은 실제 최근 작업 한 건을 먼저 보여 주고 전체 이어가기는 별도 화면에서 찾는다", () => {
    seedTwoProjects();
    renderStartSheet("/create");
    expect(screen.getByRole("link", { name: "최근 작품 이어서 작업" }).getAttribute("href")).toContain("/studio/p/newer");
    expect(screen.queryByRole("link", { name: "오래된 작품 이어서 작업" })).toBeNull();
    fireEvent.click(screen.getByTestId("create-start-section-continue"));
    expect(screen.getByRole("link", { name: "오래된 작품 이어서 작업" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/create?section=continue");
  });

  it("최근 작업 이미지가 열리지 않아도 제목과 이어가기 경로를 유지한다", () => {
    seedTwoProjects();
    const state = readStudioProjectLibrary(window.localStorage);
    window.localStorage.setItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify({
      ...state,
      projects: state.projects.map((project) => ({ ...project, thumbnailUrl: "/missing-cover.webp" })),
    }));
    renderStartSheet("/create");
    const recent = screen.getByRole("link", { name: "최근 작품 이어서 작업" });
    const image = recent.querySelector("img");
    expect(image).not.toBeNull();
    if (!image) throw new Error("최근 작품 이미지가 없습니다.");
    fireEvent.error(image);
    expect(recent.querySelector("img")).toBeNull();
    expect(recent.textContent).toContain("최근 작품");
    expect(recent.getAttribute("href")).toContain("/studio/p/newer");
  });

  it.each(["/create", "/create?section=continue"])("%s에서 목록 읽기 실패를 빈 상태로 표시하지 않고 재시도 후 원래 작품을 복원한다", (route) => {
    seedTwoProjects();
    const original = readStudioProjectLibrary(window.localStorage);
    const getItem = Storage.prototype.getItem;
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === STUDIO_PROJECT_LIBRARY_STORAGE_KEY) throw new DOMException("Storage denied", "SecurityError");
      return getItem.call(this, key);
    });
    renderStartSheet(route);
    expect(screen.getByRole("alert").textContent).toBe("최근 작업을 확인하지 못했어요.");
    expect(screen.queryByText(/아직 작업한 작품이 없어요/)).toBeNull();
    expect(screen.getByRole("link", { name: "내 작업 보기" }).getAttribute("href")).toBe("/studio");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(screen.getByRole("alert").textContent).toContain("확인하지 못했어요");
    expect(screen.queryByText(/아직 작업한 작품이 없어요/)).toBeNull();
    read.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "최근 작품 이어서 작업" }).getAttribute("href")).toContain("/studio/p/newer");
    expect(screen.getByTestId("location").textContent).toBe(route);
    expect(readStudioProjectLibrary(window.localStorage)).toEqual(original);
  });

  it.each(["lanes", "pipeline", "continue"])("%s에서 추천 시작으로 돌아오면 목적 제목으로 초점을 복원한다", (section) => {
    renderStartSheet(`/create?from=home&section=${section}`);
    const back = screen.getByRole("button", { name: "추천 시작으로" });
    back.focus();
    expect(document.activeElement).toBe(back);

    fireEvent.click(back);

    const heading = screen.getByRole("heading", { level: 1, name: "어떻게 시작할까요?" });
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole("button", { name: "추천 시작으로" })).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/create?from=home");
  });

  it("첫 진입과 일반 구역 전환에서는 제목으로 초점을 옮기지 않는다", () => {
    renderStartSheet("/create");
    const heading = screen.getByRole("heading", { level: 1, name: "어떻게 시작할까요?" });
    expect(document.activeElement).not.toBe(heading);

    const pipeline = screen.getByTestId("create-start-section-pipeline");
    pipeline.focus();
    fireEvent.click(pipeline);
    expect(document.activeElement).toBe(pipeline);

    const recommended = screen.getByTestId("create-start-section-all");
    recommended.focus();
    fireEvent.click(recommended);
    expect(screen.getByRole("heading", { level: 1, name: "어떻게 시작할까요?" })).toBe(heading);
    expect(document.activeElement).toBe(recommended);
  });

  it("구역 이동 뒤 브라우저 Back으로 추천 시작과 URL을 함께 복원한다", async () => {
    renderStartSheet("/create?from=home", <HistoryBack />);
    fireEvent.click(screen.getByTestId("create-start-section-pipeline"));
    expect(screen.getByTestId("location").textContent).toBe("/create?from=home&section=pipeline");
    expect(screen.queryByTestId("create-start-persona-guide")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "테스트 이전 주소" }));
    expect(await screen.findByTestId("create-start-persona-guide")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/create?from=home");
    expect(screen.getByTestId("create-start-section-all").getAttribute("aria-pressed")).toBe("true");
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("기본 이야기 선택은 전달받은 아이디어와 주제를 잃지 않는다", () => {
    const idea = "달에서 길 잃은 로봇";
    renderStartSheet(`/create?topic=free-story&idea=${encodeURIComponent(idea)}`);
    const href = screen.getByRole("link", { name: "이야기 시작하기" }).getAttribute("href");
    const query = new URL(href ?? "", "http://localhost").searchParams;
    expect(query.get("intent")).toBe("my-story");
    expect(query.get("topic")).toBe("free-story");
    expect(query.get("idea")).toBe(idea);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

});

/** 지연 로딩된 질문형 인터뷰를 기다리는 시간 — 부하가 큰 CI에서 첫 로딩이 기본 1초를 넘길 수 있다. */
const LAZY_FLOW_WAIT = { timeout: 10_000 } as const;

describe("CreateStartPage — 내 이야기 의도 카드", () => {
  // 질문형 인터뷰는 지연 로딩이다. 모듈 그래프를 먼저 데워 두어 첫 로딩 시간이 개별 테스트에 섞이지 않게 한다.
  beforeAll(async () => {
    await import("../my-story/MyStoryStartFlow");
  }, 60_000);

  it("주제를 펼치면 자유로운 이야기와 기존 주제 6종의 바로가기가 있다", () => {
    renderStartSheet("/create");
    openMoreTopics();
    openMoreStartMethods();

    const card = screen.getByRole("heading", { name: "내 이야기로 시작하기" }).closest("section");
    expect(card).not.toBeNull();
    const cta = within(card as HTMLElement).getByRole("link", { name: /내 이야기 풀어내기/ });
    expect(cta.getAttribute("href")).toBe("/create?intent=my-story");
    const topics = within(within(card as HTMLElement).getByRole("list", { name: "이야기 주제 바로 고르기" })).getAllByRole("link");
    expect(topics.map((link) => link.textContent)).toEqual(["자유로운 이야기", "회고", "가족", "동네", "경력", "안전 수칙", "금융 상식"]);
    expect(topics.map((link) => link.getAttribute("href"))).toEqual([
      "/create?intent=my-story&topic=free-story",
      "/create?intent=my-story&topic=retrospective",
      "/create?intent=my-story&topic=family",
      "/create?intent=my-story&topic=neighborhood",
      "/create?intent=my-story&topic=career",
      "/create?intent=my-story&topic=safety",
      "/create?intent=my-story&topic=finance",
    ]);
    // 개인 정보 안심 문구: 이 기기에만 임시 저장.
    expect(within(card as HTMLElement).getByText(/이 기기에만 임시 저장돼요/)).toBeTruthy();
    // 카드가 기존 다섯 레인을 대신하지 않는다.
    expect(screen.getByRole("link", { name: /이야기부터 시작하기/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /가져와서 시작하기/ })).toBeTruthy();
  });

  it("?intent=my-story면 레인 대신 질문형 인터뷰를 열고 돌아가는 링크를 둔다", async () => {
    renderStartSheet("/create?intent=my-story");

    expect(await screen.findByRole("heading", { level: 1, name: "내 이야기를 웹툰으로" }, LAZY_FLOW_WAIT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "다른 시작 방법 보기" }).getAttribute("href")).toBe("/create");
    expect(screen.queryByRole("heading", { name: "어떻게 시작할까요?" })).toBeNull();
    expect(screen.queryByRole("link", { name: /콘티부터 시작하기/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "어떤 이야기를 남기고 싶나요?" })).toBeTruthy();
  });

  it("topic을 알려 주면 그 주제의 첫 질문으로 바로 시작한다", async () => {
    renderStartSheet("/create?intent=my-story&topic=safety");

    expect(await screen.findByText("질문 1 / 6", undefined, LAZY_FLOW_WAIT)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /어떤 장소나 상황에서 일어나는 일인가요/ })).toBeTruthy();
  });

  it("홈 아이디어 쿼리를 첫 질문의 답변으로 전달한다", async () => {
    const idea = "달에서 길 잃은 로봇";
    renderStartSheet(`/create?intent=my-story&topic=free-story&idea=${encodeURIComponent(idea)}`);
    const input = await screen.findByRole("textbox", { name: "어떤 이야기를 만들고 싶나요?" }, LAZY_FLOW_WAIT);
    expect((input as HTMLTextAreaElement).value).toBe(idea);
    const returnHref = screen.getByRole("link", { name: "다른 시작 방법 보기" }).getAttribute("href");
    const returnQuery = new URL(returnHref ?? "", "http://localhost").searchParams;
    expect(returnQuery.get("idea")).toBe(idea);
    expect(returnQuery.get("topic")).toBe("free-story");
    expect(returnQuery.has("intent")).toBe(false);
  });

  it("기존 구역 바로가기는 해당 도구를 펼친 상태로 연다", () => {
    renderStartSheet("/create?section=lanes");
    expect(screen.getByText("다른 시작 방법 · 기획, 콘티, 템플릿, 파일").closest("details")?.open).toBe(true);
    expect(screen.getByRole("link", { name: /콘티부터 시작하기/ })).toBeTruthy();
  });

  it("모르는 topic은 무시하고 주제 선택 화면을 보여 준다", async () => {
    renderStartSheet("/create?intent=my-story&topic=nope");

    expect(await screen.findByRole("heading", { name: "어떤 이야기를 남기고 싶나요?" }, LAZY_FLOW_WAIT)).toBeTruthy();
  });

  it("모르는 intent 값은 일반 시작 시트로 취급한다", () => {
    renderStartSheet("/create?intent=other");

    expect(screen.getByRole("heading", { name: "어떻게 시작할까요?" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "내 이야기를 웹툰으로" })).toBeNull();
  });
});
