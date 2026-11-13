// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionContext } from "@/domains/auth/public/session/auth-session-store";
import type { ProductionProjectSummary } from "@/domains/creator/public/production-projects";
import { useI18n } from "@/shared/lib/i18n";
import { useApp } from "@/shared/lib/store";
import { useUi } from "@/shared/lib/ui-store";
import { completeUserAiTextDetailed, UserAiTransportError, type CompletedUserAiText } from "@/shared/ai/user-ai-transport";
import { ReferenceCreatorDashboard } from "./ReferenceCreatorDashboard";
import { HOME_CORE_STUDIOS, HOME_LEARN_MORE, HOME_LUNA_SUGGESTIONS } from "./reference-home-content";

vi.mock("@/shared/ai/user-ai-transport", () => {
  class MockUserAiTransportError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    UserAiTransportError: MockUserAiTransportError,
    completeUserAiTextDetailed: vi.fn(),
    isUserAiQuotaExhaustion: (error: unknown) => error instanceof MockUserAiTransportError && error.code === "quota-exceeded",
  };
});

const projectsApi = vi.hoisted(() => ({
  listProductionProjects: vi.fn(),
}));

vi.mock("@/domains/creator/public/production-projects", () => ({
  listProductionProjects: projectsApi.listProductionProjects,
}));

const listProjects = projectsApi.listProductionProjects;

function projectSummary(overrides: Partial<ProductionProjectSummary>): ProductionProjectSummary {
  return {
    projectId: "project-1",
    workId: "work-1",
    title: "별빛 항해자",
    coverImageUrl: null,
    collaborationModel: "solo",
    revision: 1,
    updatedAt: "2026-10-06T00:00:00.000Z",
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    healthScore: 80,
    activeEpisodeCount: 2,
    readyBufferCount: 1,
    criticalRiskCount: 0,
    overdueTaskCount: 0,
    blockedTaskCount: 0,
    unassignedTaskCount: 0,
    reviewTaskCount: 0,
    nextReleaseAt: null,
    forecastFinishAt: null,
    scheduleConfidencePercent: null,
    ...overrides,
  };
}

const completeAi = vi.mocked(completeUserAiTextDetailed);
const completedText = (content: string): CompletedUserAiText => ({
  content,
  connection: {} as CompletedUserAiText["connection"],
  attemptedConnectionIds: [],
  attemptedRouteIds: [],
  truncated: false,
});

const initialLanguage = useI18n.getState().lang;

beforeEach(() => {
  completeAi.mockReset();
  // 기본값은 목록 읽기 실패 — HomeNowCard가 기존 개인 스트립으로 폴백하는 상태다.
  listProjects.mockReset();
  listProjects.mockRejectedValue(new Error("작품 목록을 불러오지 못했습니다."));
  useApp.setState({ userId: null, sessionToken: null });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
  useApp.setState({ userId: null, sessionToken: null });
  useUi.getState().closeCommandPalette();
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="현재 URL">{location.pathname}{location.search}</output>;
}

async function dashboard(language = "ko") {
  useI18n.setState({ lang: language });
  const observedNavigation: { href: string; prevented: boolean }[] = [];
  await act(async () => {
    render(<MemoryRouter><div role="presentation" onClick={(event) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor) return;
      // Studio 진입의 네이티브 문서 전환을 관찰한 뒤 jsdom의 실제 페이지 이동만 막는다.
      observedNavigation.push({ href: anchor.getAttribute("href") ?? "", prevented: event.defaultPrevented });
      event.preventDefault();
    }}><ReferenceCreatorDashboard /></div><LocationProbe /></MemoryRouter>);
  });
  return observedNavigation;
}

/** ④ 더 알아보기 밴드는 기본 접힘이므로, 접힌 구역을 검증하는 테스트는 먼저 펼친다. */
function openMoreBand() {
  const details = document.querySelector<HTMLDetailsElement>("details.rd-more");
  if (details && !details.open) {
    fireEvent.click(details.querySelector("summary") as HTMLElement);
  }
}

function openLunaHelp(language: "ko" | "en" = "ko") {
  const summary = screen.getByText(language === "ko" ? "시작이 막막한가요?" : "Need help getting started?").closest("summary");
  if (!summary) throw new Error("Luna 안내를 여는 summary가 필요합니다.");
  const details = summary.closest("details");
  if (!details) throw new Error("Luna 안내의 접이식 메뉴가 필요합니다.");
  if (!details.open) fireEvent.click(summary);
  expect(details.open).toBe(true);
}

function openIdeaHelp(language: "ko" | "en" = "ko") {
  const summary = screen.getByText(language === "ko" ? "아이디어 쓰기 · 작품 찾기" : "Write an idea · Find a story").closest("summary");
  const details = summary?.closest("details");
  if (!summary || !details) throw new Error("아이디어·검색 입력을 여는 메뉴가 필요합니다.");
  if (!details.open) fireEvent.click(summary);
  expect(details.open).toBe(true);
  return { summary, details };
}

function expectBefore(earlier: Element | null, later: Element | null) {
  if (!earlier || !later) throw new Error("순서를 확인할 두 화면 요소가 필요합니다.");
  expect(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
}

describe("참조 디자인 크리에이터 홈의 실제 동선", () => {
  it("작품 시작과 둘러보기를 먼저 보여 주고 아이디어 입력의 실제 시작 동선을 보존한다", async () => {
    await dashboard();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("상상한 장면을,나의 작품으로.");
    expect(screen.queryByRole("banner")).toBeNull();
    const hero = screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." });
    expect(within(hero).getByRole("link", { name: "작품 시작하기" }).getAttribute("href")).toBe("/create");
    expect(within(hero).getByRole("link", { name: "둘러보기" }).getAttribute("href")).toBe("/discover");
    expect(hero.querySelector("form")).toBeNull();
    // 전역 검색과 헤더는 기존 공통 셸이 맡는다.
    expect(screen.queryByRole("button", { name: "작품·도구·소재, 필요한 것을 찾아보세요" })).toBeNull();
    // 게스트에게는 개인 스트립이 없다.
    expect(screen.queryByRole("region", { name: "내 작업 이어가기" })).toBeNull();
    openIdeaHelp();
    const idea = screen.getByRole("textbox", { name: "아이디어 입력" });
    fireEvent.change(idea, { target: { value: "비 오는 날의 첫사랑" } });
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe(`/create?intent=my-story&topic=free-story&idea=${encodeURIComponent("비 오는 날의 첫사랑")}`);
    expect(useUi.getState().commandPaletteOpen).toBe(false);
  });

  it("빈 아이디어로 시작하면 이야기 주제를 고르는 화면으로 이동한다", async () => {
    await dashboard();
    openIdeaHelp();
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/create?intent=my-story");
  });

  it("아이디어 입력 없이도 첫 행동에서 작품 시작 화면으로 이동한다", async () => {
    await dashboard();
    const hero = screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." });
    fireEvent.click(within(hero).getByRole("link", { name: "작품 시작하기" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/create");
    expect(document.querySelector<HTMLDetailsElement>(".rd-idea-help")?.open).toBe(false);
    expect(completeAi).not.toHaveBeenCalled();
  });

  it("여섯 시작 동선이 시작 시트와 실제 작업으로 이동한다", async () => {
    const observedNavigation = await dashboard();
    openMoreBand();
    const start = screen.getByRole("navigation", { name: "무엇부터 시작할까요?" });
    const links = within(start).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      // 작품 시작은 시작 시트(/create)로 수렴한다 — 새 작품·템플릿·이어가기를 한 화면에서 고른다.
      "/create",
      "/story-lab",
      "/studio/assets/characters/new",
      "/studio/bg3d",
      "/studio/canvas",
      // 웨이브 C 발견 동선 실측: 1차 시작 카드에 제작 허브가 없던 구멍을 메웠다.
      "/production",
    ]);
    fireEvent.click(within(start).getByRole("link", { name: /빈 캔버스/u }));
    expect(observedNavigation).toEqual([{ href: "/studio/canvas", prevented: false }]);
    fireEvent.click(within(start).getByRole("link", { name: /스토리 만들기/u }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/story-lab");
  });

  it("기능 목록 그리드는 홈에 쌓지 않고 예시와 편집기 콘셉트를 실제 프로젝트와 구분한다", async () => {
    await dashboard();
    openMoreBand();
    expect(screen.queryByRole("region", { name: "모든 이야기가 연결되는 곳" })).toBeNull();
    expect(screen.getByRole("link", { name: "내 프로젝트" }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("figure", { name: /편집기 콘셉트/u }).textContent).toContain("예시는 저장되지 않아요");
    expect(screen.getByRole("region", { name: "예시 작품" })).toBeTruthy();
    expect(screen.getByText("12화 · 어제 업데이트")).toBeTruthy();
    expect(screen.getByText("8화 · 3일 전")).toBeTruthy();
    expect(screen.queryByText("최설의 도시")).toBeNull();
    expect(screen.queryByText(/2024\.11/u)).toBeNull();
  });

  it("로그인하면 홈은 그대로이고 개인 스트립으로 내 홈에 이어진다", async () => {
    useI18n.setState({ lang: "ko" });
    await act(async () => {
      render(<MemoryRouter><SessionContext.Provider value={{ data: { user: { name: "연우" } }, ready: true, status: "authenticated", update: async () => null }}><ReferenceCreatorDashboard /></SessionContext.Provider></MemoryRouter>);
    });
    const strip = screen.getByRole("region", { name: "내 작업 이어가기" });
    expect(within(strip).getByText("연우님, 다시 오셨네요")).toBeTruthy();
    expect(within(strip).getByRole("link", { name: /내 홈 열기/u }).getAttribute("href")).toBe("/home");
    expect(within(strip).getByRole("link", { name: "내 프로젝트" }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("상상한 장면을,나의 작품으로.");
    expectBefore(screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." }), strip);
  });

  it("로그인하고 작품 목록을 읽으면 개인 스트립 대신 지금 할 일 카드가 이어하기를 지목한다", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "token" });
    listProjects.mockResolvedValue({ projects: [projectSummary({})] });
    await act(async () => {
      render(<MemoryRouter><SessionContext.Provider value={{ data: { user: { name: "연우" } }, ready: true, status: "authenticated", update: async () => null }}><ReferenceCreatorDashboard /></SessionContext.Provider></MemoryRouter>);
    });
    expect(await screen.findByText("하던 작업 이어하기")).toBeTruthy();
    const card = document.querySelector("[data-now-card]");
    expect(card).toBeTruthy();
    expect(within(card as HTMLElement).getByText(/별빛 항해자 · 진행 중 회차 2개/u)).toBeTruthy();
    expect(within(card as HTMLElement).getByRole("link", { name: /이어서 작업/u }).getAttribute("href")).toBe("/production/projects/project-1/episodes");
    expectBefore(card, screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." }));
    expect(document.querySelectorAll("[data-now-card]")).toHaveLength(1);
    // 카드가 뜨면 같은 자리의 개인 스트립은 중복으로 남지 않는다.
    expect(screen.queryByText("연우님, 다시 오셨네요")).toBeNull();
  });

  it("로그인했지만 작품이 없으면 지금 할 일 카드가 첫 작품 시작을 지목한다", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "token" });
    listProjects.mockResolvedValue({ projects: [] });
    await act(async () => {
      render(<MemoryRouter><SessionContext.Provider value={{ data: { user: { name: "연우" } }, ready: true, status: "authenticated", update: async () => null }}><ReferenceCreatorDashboard /></SessionContext.Provider></MemoryRouter>);
    });
    expect(await screen.findByText("첫 작품을 시작해 보세요")).toBeTruthy();
    const card = document.querySelector("[data-now-card]");
    expect(within(card as HTMLElement).getByRole("link", { name: /새 작품 만들기/u }).getAttribute("href")).toBe("/create");
    expectBefore(screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." }), card);
  });

  it("실제 가까운 일정은 소개보다 먼저, 할 일을 마친 상태는 소개 다음에 놓는다", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "token" });
    listProjects.mockResolvedValue({ projects: [projectSummary({ activeEpisodeCount: 0, nextReleaseAt: new Date(Date.now() + 86_400_000).toISOString() })] });
    const renderSignedIn = () => render(<MemoryRouter><SessionContext.Provider value={{ data: { user: { name: "연우" } }, ready: true, status: "authenticated", update: async () => null }}><ReferenceCreatorDashboard /></SessionContext.Provider></MemoryRouter>);
    await act(async () => { renderSignedIn(); });
    const deadline = document.querySelector<HTMLElement>("[data-now-card]");
    if (!deadline) throw new Error("실제 가까운 일정 카드가 필요합니다.");
    expect(within(deadline).getByRole("link", { name: "일정 확인하기" }).getAttribute("href")).toBe("/production/projects/project-1/episodes");
    expectBefore(deadline, screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." }));
    cleanup();
    listProjects.mockResolvedValue({ projects: [projectSummary({ activeEpisodeCount: 0 })] });
    await act(async () => { renderSignedIn(); });
    const allClear = document.querySelector("[data-now-card]");
    expect(allClear).not.toBeNull();
    expectBefore(screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." }), allClear);
  });

  it("비동기 이어하기 응답이 소개 앞으로 와도 입력과 Luna의 DOM·값·초점을 보존하고 재요청하지 않는다", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "token" });
    let resolveProjects: ((result: { projects: ProductionProjectSummary[] }) => void) | undefined;
    listProjects.mockImplementation(() => new Promise<{ projects: ProductionProjectSummary[] }>((resolve) => { resolveProjects = resolve; }));
    await act(async () => {
      render(<MemoryRouter><SessionContext.Provider value={{ data: { user: { name: "연우" } }, ready: true, status: "authenticated", update: async () => null }}><ReferenceCreatorDashboard /></SessionContext.Provider></MemoryRouter>);
    });
    openIdeaHelp();
    openLunaHelp();
    const idea = screen.getByRole("textbox", { name: "아이디어 입력" });
    const luna = screen.getByRole("textbox", { name: "Luna에게 물어보기" });
    fireEvent.change(idea, { target: { value: "돌아오는 계절" } });
    fireEvent.change(luna, { target: { value: "인물의 첫 장면을 고민 중이에요" } });
    idea.focus();
    expect(listProjects).toHaveBeenCalledTimes(1);
    if (!resolveProjects) throw new Error("작품 목록 요청이 시작되어야 합니다.");
    await act(async () => { resolveProjects?.({ projects: [projectSummary({})] }); });
    expect(await screen.findByText("하던 작업 이어하기")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "아이디어 입력" })).toBe(idea);
    expect(screen.getByRole("textbox", { name: "Luna에게 물어보기" })).toBe(luna);
    expect(idea.getAttribute("value")).toBe("돌아오는 계절");
    expect(luna.getAttribute("value")).toBe("인물의 첫 장면을 고민 중이에요");
    expect(document.activeElement).toBe(idea);
    expect(listProjects).toHaveBeenCalledTimes(1);
  });

  it("영어 선택 시 모든 홈 동선과 접근성 이름을 영어로 제공한다", async () => {
    await dashboard("en");
    openMoreBand();
    openLunaHelp("en");
    openIdeaHelp("en");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Imagine a scene.Make it your story.");
    expect(screen.getByRole("textbox", { name: "Idea input" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Ask Luna" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Where would you like to start?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My projects" }).getAttribute("href")).toBe("/studio");
    const root = document.querySelector("[data-reference-dashboard]");
    expect(root?.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByRole("textbox", { name: "Edit sample dialogue" }).getAttribute("value")).toBe("…This story isn't over.");
    for (const element of root?.querySelectorAll("[aria-label], [alt]") ?? []) {
      expect(`${element.getAttribute("aria-label") ?? ""}${element.getAttribute("alt") ?? ""}`).not.toMatch(/[가-힣]/u);
    }
  });

  it("추가 도구는 기본 접힘이며 펼치면 44px 동선 4개를 정본 경로로 연결한다", async () => {
    await dashboard();
    const launchpad = screen.getByTestId("home-v2-spectrum-launchpad");
    const details = launchpad.closest("details");
    expect(details?.open).toBe(false);
    expect(launchpad.textContent).not.toMatch(/1초|1S|WEBGPU|WEBXR|Rights BOM/u);
    const hero = screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." });
    expect(within(hero).getByRole("link", { name: "작품 시작하기" }).closest("details")).toBeNull();
    expect(screen.getByRole("region", { name: "예시 작품" }).closest("details")).toBeNull();
    const summary = screen.getByText("다른 시작 방법 보기").closest("summary");
    if (!summary) throw new Error("추가 도구를 여는 summary가 필요합니다.");
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    const links = within(launchpad).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/studio/new?lane=blank",
      "/studio/bg3d",
      "/discover",
      "/read/spatial",
    ]);
    for (const link of links) {
      expect(link.className).toContain("min-h-11");
    }
    fireEvent.click(summary);
    expect(details?.open).toBe(false);
  });

  it("예시 컷을 고르면 로컬 미리보기만 바뀌고 편집기로 이동하거나 검색을 실행하지 않는다", async () => {
    const observedNavigation = await dashboard();
    openMoreBand();
    const frames = screen.getByRole("group", { name: "예시 컷 선택" });
    fireEvent.click(within(frames).getByRole("button", { name: "예시 컷 3 선택" }));
    expect(within(frames).getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(within(frames).getByRole("button", { name: "예시 컷 3 선택" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: "예시 컷 3" }).getAttribute("src")).toBe("/brand/illustrated-20260928/character-blue-640.webp");
    expect(screen.getByRole("img", { name: "예시 컷 3" }).getAttribute("srcset")).toContain("character-blue-320.webp 320w");
    expect(observedNavigation).toEqual([]);
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/");
    expect(useUi.getState().commandPaletteOpen).toBe(false);
  });

  it("예시 대사를 편집하면 말풍선이 바뀌고 다시 홈을 열 때 저장된 작품으로 남지 않는다", async () => {
    await dashboard();
    openMoreBand();
    fireEvent.change(screen.getByRole("textbox", { name: "예시 대사 편집" }), { target: { value: "우리의 다음 장면" } });
    expect(screen.getByText("우리의 다음 장면").className).toBe("rd-editor-bubble");
    expect(screen.getByRole("textbox", { name: "예시 대사 편집" }).getAttribute("maxlength")).toBe("60");
    cleanup();
    await dashboard();
    openMoreBand();
    expect(screen.queryByText("우리의 다음 장면")).toBeNull();
    expect(screen.getByRole("textbox", { name: "예시 대사 편집" }).getAttribute("value")).toBe("…아직 끝나지 않았어.");
  });

  it("모든 이미지 경로는 제공된 삽화 계약과 배경 스튜디오 보조 소재만 사용한다", async () => {
    await dashboard();
    const root = document.querySelector("[data-reference-dashboard]");
    const coreArt = new Set(HOME_CORE_STUDIOS.map((studio) => studio.image));
    for (const img of root?.querySelectorAll("img") ?? []) {
      const src = img.getAttribute("src") ?? "";
      if (img.closest(".rd-core-studios")) {
        expect(coreArt.has(src), src).toBe(true);
      } else if (src.startsWith("/assets/studio/scene-assistant/")) {
        expect(img.closest(".rd-mini-workspace--background")).not.toBeNull();
      } else if (src === "/brand/workflow-20260928/create-640.webp") {
        expect(img.closest(".rd-clarity-art")).not.toBeNull();
      } else {
        expect(src).toMatch(/^\/brand\/illustrated-20260928\/(?:(hero|canvas-noir|luna|character-pink|character-blue|background-city|project-romance|project-crimson|blank-canvas|storyboard|materials|background-classroom)-(320|640)\.webp|(hero|luna)\.webp)$/u);
      }
    }
    // 브랜드 원고 아트는 실제 사용자의 저장 작품으로 표시하지 않는다.
    const artwork = screen.getByRole("figure", { name: "선화에서 완성작으로 이어지는 브랜드 예시 원고" });
    expect(within(artwork).getAllByRole("img")).toHaveLength(1);
    expect(artwork.textContent).toBe("ToonStudio 브랜드 아트");
    expect(artwork.textContent).not.toMatch(/저장됨|이어서 작업/u);
  });

  it("드로잉·3D·협업·가상 스튜디오 입구를 더 알아보기 밴드에서 실제 작업실로 연결한다", async () => {
    await dashboard();
    openMoreBand();
    const core = screen.getByRole("region", { name: "핵심 작업실, 바로 들어가기" });
    const cards = within(core).getAllByRole("listitem");
    expect(cards.map((card) => card.getAttribute("data-core-studio"))).toEqual(["drawing", "three-d", "collaboration", "virtual-studio"]);
    expect(within(core).getByRole("link", { name: "가상 스튜디오 입장" }).getAttribute("href")).toBe("/studio/space");
    expect(within(core).getByRole("link", { name: "제작 관리 열기" }).getAttribute("href")).toBe("/production");
    expect(within(core).getByRole("link", { name: "3D 캐릭터 만들기" }).getAttribute("href")).toBe("/studio/assets/characters/new");
    expect(within(core).getByRole("link", { name: "3D 배경 스튜디오" }).getAttribute("href")).toBe("/studio/bg3d");
    expect(HOME_CORE_STUDIOS.every((studio) => studio.secondary.href !== studio.href)).toBe(true);
  });

  it("Luna는 실제 도구로 가는 제안 칩과 직접 물을 수 있는 입력창을 함께 제공한다", async () => {
    await dashboard();
    openLunaHelp();
    const luna = screen.getByRole("complementary", { name: "Luna 창작 안내" });
    expect(within(luna).getByText("안녕하세요! 어떤 이야기를 함께 만들어 볼까요?")).toBeTruthy();
    expect(within(luna).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(HOME_LUNA_SUGGESTIONS.map((item) => item.href));
    expect(within(luna).getByRole("textbox", { name: "Luna에게 물어보기" })).toBeTruthy();
  });

  it("Luna에게 물으면 사용자 AI 전송으로 답하고, 연결이 없으면 키 등록 동선을 안내한다", async () => {
    completeAi.mockResolvedValueOnce(completedText("가제를 정했다면 스토리 연구실에서 인물의 욕망부터 적어 보세요."));
    await dashboard();
    openLunaHelp();
    const luna = screen.getByRole("complementary", { name: "Luna 창작 안내" });
    fireEvent.change(within(luna).getByRole("textbox", { name: "Luna에게 물어보기" }), { target: { value: "뭐부터 시작해?" } });
    fireEvent.click(within(luna).getByRole("button", { name: "Luna에게 보내기" }));
    expect(await within(luna).findByText("가제를 정했다면 스토리 연구실에서 인물의 욕망부터 적어 보세요.")).toBeTruthy();
    expect(completeAi).toHaveBeenCalledTimes(1);

    completeAi.mockRejectedValueOnce(new UserAiTransportError("not-configured", "AI 연결이 설정되지 않았습니다"));
    fireEvent.change(within(luna).getByRole("textbox", { name: "Luna에게 물어보기" }), { target: { value: "캐릭터는 어떻게 만들어?" } });
    fireEvent.click(within(luna).getByRole("button", { name: "Luna에게 보내기" }));
    expect(await within(luna).findByText(/AI 연결이 설정되지 않아/u)).toBeTruthy();
    expect(within(luna).getByRole("link", { name: /AI 키 등록하기/u }).getAttribute("href")).toBe("/settings/ai");
  });

  it("홈 하단에서 서비스 소개·영상·제작 과정·원칙으로 이어진다", async () => {
    await dashboard();
    openMoreBand();
    const more = screen.getByRole("navigation", { name: "서비스 더 알아보기" });
    expect(within(more).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(HOME_LEARN_MORE.map((link) => link.href));
  });

  it("작품 찾기로 바꾸면 입력한 문장이 카탈로그 검색으로 이동한다", async () => {
    await dashboard();
    openIdeaHelp();
    fireEvent.click(screen.getByRole("button", { name: "작품 찾기" }));
    expect(screen.getByRole("button", { name: "작품 찾기" }).getAttribute("aria-pressed")).toBe("true");
    const search = screen.getByRole("textbox", { name: "작품 검색" });
    fireEvent.change(search, { target: { value: "회색의 도시" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe(`/search?q=${encodeURIComponent("회색의 도시")}`);
  });

  it("작품 찾기에서 빈 문장으로 제출하면 검색 홈으로 이동한다", async () => {
    await dashboard();
    openIdeaHelp();
    fireEvent.click(screen.getByRole("button", { name: "작품 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/search");
  });

  it("Luna와 아이디어 입력은 이름 있는 메뉴에서 펼치고 작품 시작은 바로 제공한다", async () => {
    await dashboard();
    const hero = document.querySelector('[data-home-band="hero"]');
    const luna = screen.getByRole("complementary", { name: "Luna 창작 안내" });
    expect(hero?.contains(luna)).toBe(true);
    const details = luna.closest("details");
    expect(details?.open).toBe(false);
    expect(document.querySelector<HTMLDetailsElement>(".rd-idea-help")?.open).toBe(false);
    expect(screen.getByRole("region", { name: "상상한 장면을,나의 작품으로." }).querySelector("a")?.closest("details")).toBeNull();
    openLunaHelp();
    openIdeaHelp();
    expect(details?.open).toBe(true);
    // 중간 섹션으로 따로 서 있지 않다.
    expect(document.querySelector(".rd-luna-section")).toBeNull();
    const forms = document.querySelectorAll("form.rd-idea");
    expect(forms).toHaveLength(1);
    const form = forms[0];
    expect(form?.contains(screen.getByRole("group", { name: "입력 모드" }))).toBe(true);
    expect(form?.contains(screen.getByRole("textbox", { name: "아이디어 입력" }))).toBe(true);
    expect(form?.contains(screen.getByRole("button", { name: "시작하기" }))).toBe(true);
  });

  it("홈은 상태별 히어로·예시/다른 시작·작품 발견·더 알아보기 4밴드 순서이고 더 알아보기는 기본 접힘이다", async () => {
    await dashboard();
    const root = document.querySelector("[data-reference-dashboard]");
    const bands = [...(root?.querySelectorAll("[data-home-band]") ?? [])].map((element) => element.getAttribute("data-home-band"));
    expect(bands).toEqual(["hero", "continue", "discover", "more"]);
    const more = document.querySelector<HTMLDetailsElement>("details.rd-more");
    expect(more?.open).toBe(false);
    // 시작 카드·핵심 작업실·에디터 미리보기·챕터 링크는 접힌 밴드 아래로 내려가 있다.
    expect(more?.querySelector(".rd-quick")).not.toBeNull();
    expect(more?.querySelector(".rd-core-studios")).not.toBeNull();
    expect(more?.querySelector(".rd-editor")).not.toBeNull();
    expect(more?.querySelector(".rd-chapters")).not.toBeNull();
    // 예시 작품 선반은 접힌 밴드 밖, 발견 미리보기보다 위에 있다.
    expect(more?.querySelector(".rd-examples")).toBeNull();
    expect(more?.querySelector(".rd-discover")).toBeNull();
  });

  it("모드를 오가도 입력한 문장은 유지되고 만들기로 제출하면 입력한 아이디어와 함께 질문 흐름으로 간다", async () => {
    await dashboard();
    openIdeaHelp();
    const idea = screen.getByRole("textbox", { name: "아이디어 입력" });
    fireEvent.change(idea, { target: { value: "비 오는 날의 첫사랑" } });
    fireEvent.click(screen.getByRole("button", { name: "작품 찾기" }));
    expect((screen.getByRole("textbox", { name: "작품 검색" }) as HTMLInputElement).value).toBe("비 오는 날의 첫사랑");
    fireEvent.click(screen.getByRole("button", { name: "이야기 만들기" }));
    expect((screen.getByRole("textbox", { name: "아이디어 입력" }) as HTMLInputElement).value).toBe("비 오는 날의 첫사랑");
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe(`/create?intent=my-story&topic=free-story&idea=${encodeURIComponent("비 오는 날의 첫사랑")}`);
  });

  it("입력 영역을 Escape로 닫으면 메뉴로 초점을 돌리고 다시 열어도 모드와 문장을 유지한다", async () => {
    await dashboard();
    const { summary, details } = openIdeaHelp();
    fireEvent.change(screen.getByRole("textbox", { name: "아이디어 입력" }), { target: { value: "밤하늘의 도서관" } });
    fireEvent.click(screen.getByRole("button", { name: "작품 찾기" }));
    const input = screen.getByRole("textbox", { name: "작품 검색" });
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    openIdeaHelp();
    expect(screen.getByRole("button", { name: "작품 찾기" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("textbox", { name: "작품 검색" }).getAttribute("value")).toBe("밤하늘의 도서관");
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe(`/search?q=${encodeURIComponent("밤하늘의 도서관")}`);
  });

  it("준비·그리기·완성은 실제 시작·원고·내보내기 화면으로 이어진다", async () => {
    const observedNavigation = await dashboard();
    const steps = screen.getByRole("navigation", { name: "작품을 만드는 순서" });
    expect(within(steps).getByRole("list").tagName).toBe("OL");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    const links = within(steps).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/create?intent=my-story", "/studio/new?lane=blank", "/studio?view=exports"]);
    fireEvent.click(within(steps).getByRole("link", { name: /원고 그리기/u }));
    expect(observedNavigation).toEqual([{ href: "/studio/new?lane=blank", prevented: false }]);
  });
});
