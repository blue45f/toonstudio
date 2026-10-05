// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { PRODUCT_START_DESTINATIONS } from "@/shared/lib/product-identity";

import { CreatorHomeExperience } from "./CreatorHomeExperience";
import { STUDIO_DEPTH_LINKS, STUDIO_REGIONS, STUDIO_SUPPORT_TILES } from "./studio-tour-content";

vi.mock("./use-creator-home-section-navigation", () => ({ useCreatorHomeSectionNavigation: () => undefined }));
vi.mock("@/shared/lib/i18n-runtime-translation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/i18n-runtime-translation")>();
  return { ...actual, loadRuntimeTranslationBundle: vi.fn(async () => false) };
});

const initial = useI18n.getState();

beforeEach(() => {
  useI18n.setState({ lang: "ko", translationBundleRevision: 0 });
});
afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initial.lang, translationBundleRevision: initial.translationBundleRevision });
});

async function renderAt(entry: string) {
  await act(async () => {
    render(<MemoryRouter initialEntries={[entry]}><CreatorHomeExperience /></MemoryRouter>);
  });
}

const hrefs = (root: ParentNode) => [...root.querySelectorAll("a")].map((link) => link.getAttribute("href"));

describe("/about/studio 소개 서사", () => {
  it.each(["/about/studio", "/about/studio/", "/ABOUT/STUDIO"])("%s는 소개 서사 루트를 그리고 옛 래퍼 클래스를 쓰지 않는다", async (entry) => {
    await renderAt(entry);
    const root = document.querySelector('[data-home-view="introduction"]');
    expect(root).not.toBeNull();
    expect(root?.classList.contains("creator-experience")).toBe(false);
    expect(root?.classList.contains("creator-flagship")).toBe(false);
    expect(document.querySelector("[data-reference-dashboard]")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("기획부터 연재까지, 웹툰 제작의 모든 것을 한곳에서.");
    // 탭으로 나누지 않고 한 번에 읽히는 서사다.
    expect(screen.queryByRole("tablist")).toBeNull();
    const hero = document.querySelector(".cf-hero");
    expect(hrefs(hero ?? document)).toEqual(["/studio/new", "/studio"]);
    // 히어로 아트 아래에 마감 카피 1줄이 붙는다.
    expect(hero?.querySelector("figcaption")?.textContent).toContain("작은 아이디어가 하나의 세계가 될 때까지.");
  });

  it("서사 섹션이 순서대로 모두 있다: 시작 → 흐름 → 브리지 → 둘러보기 → 지원 → 마감", async () => {
    await renderAt("/about/studio");
    const order = ["creator-start", "creator-flow", "creator-bridge", "creator-tour", "creator-support"];
    for (const id of order) expect(document.getElementById(id)).not.toBeNull();
    for (let index = 1; index < order.length; index += 1) {
      const previous = document.getElementById(order[index - 1] ?? "");
      const next = document.getElementById(order[index] ?? "");
      expect(previous && next && (previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    }
    expect(document.getElementById("creator-closing-title")).not.toBeNull();
    // 제작 흐름 단계 카드 6개.
    expect(document.querySelectorAll("#creator-flow ol > li")).toHaveLength(6);
    // 기능 브리지 5개에는 기능별 브랜드 아트 썸네일이 붙는다.
    const bridgeArts = [...document.querySelectorAll("#creator-bridge li img")].map((img) => img.getAttribute("src"));
    expect(bridgeArts).toEqual([
      "/brand/illustrated-20260928/canvas-noir-640.webp",
      "/brand/illustrated-20260928/character-blue-640.webp",
      "/brand/atelier-process-640.webp",
      "/brand/illustrated-20260928/background-classroom-640.webp",
      "/brand/illustrated-20260928/luna-640.webp",
    ]);
  });

  it("화면 구성 둘러보기는 서사 아래에 바로 보이고, 번호 버튼·핀·설명이 같은 선택을 따른다", async () => {
    await renderAt("/about/studio");
    const tour = document.querySelector("#creator-tour") as HTMLElement;
    expect(tour).not.toBeNull();
    const group = within(tour).getByRole("group", { name: "작업실 영역 고르기" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(STUDIO_REGIONS.length);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    const first = STUDIO_REGIONS[0];
    expect(within(tour).getByRole("heading", { level: 3 }).textContent).toBe(first?.ko.title);
    expect(tour.querySelector("article a")?.getAttribute("href")).toBe(first?.href);

    // 번호 버튼으로 고르기
    fireEvent.click(buttons[1] as HTMLElement);
    const second = STUDIO_REGIONS[1];
    expect(within(tour).getByRole("heading", { level: 3 }).textContent).toBe(second?.ko.title);
    expect(tour.querySelector("article a")?.getAttribute("href")).toBe(second?.href);
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");

    // 예시 화면의 핀으로 고르기(마우스·터치용 — 키보드는 위 번호 버튼)
    const pins = [...document.querySelectorAll<HTMLButtonElement>(".isw-pin")];
    // 핀은 예시 화면의 배치 순서로 놓이므로 번호는 정렬해서 확인한다.
    expect(pins.map((pin) => pin.textContent).sort()).toEqual(["1", "2", "3", "4", "5"]);
    fireEvent.click(pins.find((pin) => pin.textContent === "3") as HTMLElement);
    expect(within(tour).getByRole("heading", { level: 3 }).textContent).toBe(STUDIO_REGIONS[2]?.ko.title);
    expect(document.querySelectorAll(".isw [data-active]")).toHaveLength(1);
    // 장식 그림은 보조기술에서 숨기고, 핀은 키보드 순서에 넣지 않는다.
    expect(document.querySelector(".isw-window")?.getAttribute("aria-hidden")).toBe("true");
    expect(pins.every((pin) => pin.tabIndex === -1)).toBe(true);
  });

  it("바로 시작 섹션은 시작 선택기를 한 번만 그리고 모든 시작점으로 이어진다", async () => {
    await renderAt("/about/studio");
    const nav = document.querySelector("#creator-start .cf-intent-visual-nav");
    expect(nav?.querySelectorAll("a")).toHaveLength(PRODUCT_START_DESTINATIONS.length);
    for (const destination of PRODUCT_START_DESTINATIONS) {
      expect(nav?.querySelector(`a[href="${destination.href}"]`)?.textContent).toContain(destination.label.ko);
    }
    expect(document.querySelectorAll("#creator-toolkit-title")).toHaveLength(1);
  });

  it("재료·협업·도움 섹션은 세 입구와 더 깊이 읽을 소개 페이지를 건다", async () => {
    await renderAt("/about/studio");
    const section = document.querySelector("#creator-support") as HTMLElement;
    expect(section).not.toBeNull();
    expect(hrefs(section)).toEqual([...STUDIO_SUPPORT_TILES.map((tile) => tile.href), ...STUDIO_DEPTH_LINKS.map((link) => link.href)]);
  });

  it("예전 섹션 앵커가 가리키는 섹션이 탭 뒤에 숨지 않고 실제로 존재한다", async () => {
    await renderAt("/about/studio#creator-support");
    for (const id of ["creator-start", "creator-bridge", "creator-bridge-title", "creator-flow", "creator-process-title", "creator-support", "creator-support-title"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("끝에서 정본 순서의 이전·다음 소개로 이어진다", async () => {
    await renderAt("/about/studio");
    const pager = screen.getByRole("navigation", { name: "소개 페이지 이어 읽기" });
    expect(pager.querySelector('a[rel="prev"]')?.getAttribute("href")).toBe("/about");
    expect(pager.querySelector('a[rel="next"]')?.getAttribute("href")).toBe("/about/workflow");
  });

  it("영어 선택 시 제목·마감 카피·영역 설명을 영어로 보여 준다", async () => {
    useI18n.setState({ lang: "en" });
    await renderAt("/about/studio");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("From planning to publishing, make the whole webtoon in one place.");
    expect(document.querySelector(".cf-hero figcaption")?.textContent).toContain("From a Small Idea to a World of Your Own.");
    const tour = document.querySelector("#creator-tour") as HTMLElement;
    expect(within(tour).getByRole("heading", { level: 3 }).textContent).toBe(STUDIO_REGIONS[0]?.en.title);
    expect(document.querySelector('[data-home-view="introduction"]')?.getAttribute("lang")).toBe("en");
  });
});

describe("/ 공개 홈", () => {
  it("참고 보드형 대시보드를 그리고 끝에 '처음 둘러보는 순서'의 다음 버튼(서비스 소개)을 둔다", async () => {
    await renderAt("/");
    const root = document.querySelector('[data-home-view="dashboard"]');
    expect(root?.classList.contains("creator-experience")).toBe(true);
    expect(root?.querySelector("[data-reference-dashboard]")).not.toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    const flow = document.querySelector('nav[data-service-flow="home"]');
    expect(flow).not.toBeNull();
    expect(flow?.querySelector('a[aria-current="step"]')?.getAttribute("href")).toBe("/");
    const next = [...(flow?.querySelectorAll("a") ?? [])].find((link) => link.textContent?.startsWith("다음"));
    expect(next?.getAttribute("href")).toBe("/about");
    for (const sectionId of ["creator-flow", "creator-principles", "creator-support", "creator-bridge"]) {
      expect(document.getElementById(sectionId)).toBeNull();
    }
  });
});
