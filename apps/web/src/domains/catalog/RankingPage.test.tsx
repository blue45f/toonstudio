// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RANK_AXES } from "@/shared/lib/ranking";

import { RankingPage } from "./RankingPage";

vi.mock("@/shared/components/ranking-board", () => ({ RankingBoard: ({ initialAxis, initialPlatform }: { initialAxis: string; initialPlatform: string }) => <div data-testid="ranking-board" data-axis={initialAxis} data-platform={initialPlatform} /> }));
vi.mock("@/shared/components/ranking-method", () => ({ RankingMethod: () => <p>산식 본문</p> }));
vi.mock("@/shared/components/share-page-button", () => ({ SharePageButton: () => <button type="button">랭킹 공유</button> }));

afterEach(cleanup);

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
