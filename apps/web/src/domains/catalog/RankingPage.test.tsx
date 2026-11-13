// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { RANK_AXES } from "@/shared/lib/ranking";

import { RankingPage } from "./RankingPage";

vi.mock("@/shared/components/ranking-board", () => ({ RankingBoard: ({ initialAxis, initialPlatform }: { initialAxis: string; initialPlatform: string }) => <div data-testid="ranking-board" data-axis={initialAxis} data-platform={initialPlatform} /> }));
vi.mock("@/shared/components/ranking-method", () => ({ RankingMethod: () => <p>산식 본문</p> }));
vi.mock("@/shared/components/share-page-button", () => ({ SharePageButton: () => <button type="button">랭킹 공유</button> }));

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

function renderPage(entry = "/ranking") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <RankingPage />
    </MemoryRouter>,
  );
}

describe("통합 랭킹 페이지", () => {
  it("순위 보드 다음에 탐색·비교·커뮤니티로 이어지는 행동을 보여 준다", () => {
    renderPage();
    const next = screen.getByRole("navigation", { name: /랭킹 다음 행동/u });
    const hrefs = within(next).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/explore", "/compare", "/community"]);
    const board = screen.getByTestId("ranking-board");
    expect(board.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("보드 뒤의 보조 도구에서 44px 창작 시작 정본 브리지(/create)를 제공한다", () => {
    renderPage();
    const createBridge = screen.getByTestId("ranking-create-bridge");
    const tools = createBridge.closest("details");
    expect(tools?.open).toBe(false);
    const summary = tools?.querySelector("summary");
    if (!summary) throw new Error("카탈로그 보조 메뉴 누락");
    fireEvent.click(summary);
    expect(tools?.open).toBe(true);
    expect(createBridge.getAttribute("href")).toBe("/create");
    fireEvent.click(summary);
    expect(tools?.open).toBe(false);
    expect(createBridge.className).toContain("min-h-11");
  });

  it("산식 설명은 접어 두고, 접힌 줄에 관점 수를 알려 준다", () => {
    const { container } = renderPage();
    const details = container.querySelector<HTMLDetailsElement>("details[data-site-disclosure]");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(within(details as HTMLElement).getByText(new RegExp(`${RANK_AXES.length}가지 관점`, "u"))).toBeTruthy();
    expect(within(details as HTMLElement).getByText("산식 본문")).toBeTruthy();
  });

  it("주소의 기준을 보드에 전달하고 짧은 제목과 설명을 목록 앞에 둔다", () => {
    renderPage("/ranking?axis=rating");
    const label = RANK_AXES.find((axis) => axis.key === "rating")?.label ?? "";
    expect(label).not.toBe("");
    const board = screen.getByTestId("ranking-board");
    expect(board.getAttribute("data-axis")).toBe("rating");
    const heading = screen.getByRole("heading", { level: 1, name: "통합 랭킹" });
    expect(heading.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("여덟 가지 관점으로 작품을 찾아보세요.")).toBeTruthy();
    expect(screen.queryByText("현재 축:")).toBeNull();
    expect(screen.getByTestId("ranking-quick-axes")).toBeTruthy();
    expect(screen.getByTestId("ranking-rea-formula-simulator-bar")).toBeTruthy();
    expect(screen.getByTestId("ranking-rea-formula-status").textContent).toContain("Score = 0.55×ΔViews");
  });

  it("영어 로케일(en)에서 스트림·빠른 관점·산식 시뮬레이터에 한글이 누수되지 않고 44px 최소 높이를 지킨다", () => {
    useI18n.setState({ lang: "en" });
    renderPage();

    const streamModes = screen.getByTestId("ranking-rea-stream-modes");
    const quickAxes = screen.getByTestId("ranking-quick-axes");
    const simulator = screen.getByTestId("ranking-rea-formula-simulator-bar");

    expect(streamModes.textContent).not.toMatch(/[가-힣]/u);
    expect(quickAxes.textContent).not.toMatch(/[가-힣]/u);
    expect(simulator.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("ranking-create-bridge").textContent).not.toMatch(/[가-힣]/u);

    for (const axisLink of within(quickAxes).getAllByRole("link")) {
      expect(axisLink.className).toContain("min-h-11");
      expect(axisLink.className).not.toContain("min-h-8");
    }
    for (const btn of within(simulator).getAllByRole("button")) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});


it("보드 뒤에 스트림과 산식 도구를 접어 두고 기존 도구를 유지한다", () => {
  renderPage();
  const board = screen.getByTestId("ranking-board");
  const tools = screen.getByTestId("ranking-rea-formula-simulator-bar");
  const disclosure = tools.closest("details");
  expect(disclosure?.open).toBe(false);
  expect(board.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(tools.querySelectorAll('[data-testid^="ranking-rea-engine-"]')).toHaveLength(4);
  expect(tools.querySelectorAll('[data-testid^="ranking-rea-window-"]')).toHaveLength(3);
  expect(screen.getByTestId("ranking-rea-stream-modes").querySelectorAll("a")).toHaveLength(4);
});

it("다음 행동은 카드 대신 간결한 링크로 제공하고 상세 설명을 접근성 이름에 보존한다", () => {
  renderPage();
  const next = screen.getByRole("navigation", { name: /랭킹 다음 행동/u });
  expect(next.classList.contains("ranking-page-next-actions")).toBe(true);
  expect(next.querySelector("[data-site-link-card]")).toBeNull();
  const links = within(next).getAllByRole("link");
  expect(links).toHaveLength(3);
  for (const link of links) {
    expect(link.classList.contains("ranking-page-next-link")).toBe(true);
    expect(link.querySelector(".sr-only")?.textContent).toBeTruthy();
  }
  expect(within(next).getByRole("link", { name: /조건으로 탐색.*장르·태그·상태/u })).toBeTruthy();
});
