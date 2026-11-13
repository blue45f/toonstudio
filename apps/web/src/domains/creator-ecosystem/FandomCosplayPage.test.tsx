// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FandomCosplayPage } from "./FandomCosplayPage";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

vi.mock("@/domains/community/public/fan-cafe-panel", () => ({
  FanCafePanel: () => <div data-testid="fan-cafe-panel" />,
}));

function renderPage(entry = "/ecosystem/fandom") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <FandomCosplayPage />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("팬덤 · 코스프레 허브 페이지", () => {
  it("안전 가이드와 팬 피드를 함께 렌더링한다", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "팬덤 · 코스프레 허브" })).toBeTruthy();
    expect(screen.getByText("팬덤 문화를 지키는 세 가지 약속")).toBeTruthy();
    expect(screen.getByText("촬영 동의 우선")).toBeTruthy();
    expect(screen.getByText("개인정보 · 미성년자 보호")).toBeTruthy();
    expect(screen.getByTestId("fan-cafe-panel")).toBeTruthy();
  });

  it("행사 글 모아보기는 커뮤니티로 연결된다", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /행사 글 모아보기/ });
    expect(link.getAttribute("href")).toBe("/community");
  });
});


it("실제 팬 피드를 참여 가이드·행사 안내보다 먼저 보여 주고 안내를 명시적으로 연다", () => {
  renderPage();
  const feed = screen.getByTestId("fan-cafe-panel");
  const summary = screen.getByText("참여 안내 · 촬영 동의 · 행사", { selector: "summary strong" }).closest("summary");
  if (!summary) throw new Error("팬덤 참여 안내 누락");
  expect(feed.closest("details")).toBeNull();
  expect(feed.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(summary.closest("details")?.open).toBe(false);
  fireEvent.click(summary);
  expect(summary.closest("details")?.open).toBe(true);
  expect(screen.getByRole("heading", { name: "촬영 동의 우선" })).toBeTruthy();
});

it("기존 #fandom-guide 주소는 가이드를 펼친 상태로 열어 숨겨진 앵커를 만들지 않는다", () => {
  const { container } = renderPage("/ecosystem/fandom#fandom-guide");
  expect(container.querySelector<HTMLDetailsElement>("#fandom-guide")?.open).toBe(true);
  expect(container.querySelectorAll("#fandom-guide")).toHaveLength(1);
});
