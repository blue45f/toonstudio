// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { CommunityEventsBoard } from "./community-events-board";

// 카탈로그의 베타 오픈 이벤트(2026-09-18 시작, 종료일 없음)가 "진행 중"인 시점으로 고정한다.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-06T12:00:00+09:00"));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function renderBoard() {
  return render(
    <MemoryRouter>
      <CommunityEventsBoard />
    </MemoryRouter>,
  );
}

describe("CommunityEventsBoard", () => {
  it("진행 중 이벤트를 히어로 카드로 보여주고 참여 버튼이 상세로 이동한다", () => {
    renderBoard();

    // 히어로 + 진행 중 탭 그리드에 같은 이벤트가 카드로도 함께 뜬다
    expect(screen.getAllByText("지금 가입하면, 최대 1년 동안 전부 무료.").length).toBeGreaterThanOrEqual(2);
    // 종료일이 없는 진행 중 이벤트는 D-day 대신 상시 표기를 쓴다
    expect(screen.getAllByText("종료일 추후 안내").length).toBeGreaterThan(0);

    const cta = screen.getByRole("link", { name: /가입하고 6개월 무료 받기/ });
    expect(cta.getAttribute("href")).toBe("/events/beta-open");
  });

  it("상태 탭에 건수를 표시하고 빈 상태는 성공 빈 상태로 보여준다", () => {
    renderBoard();

    const activeTab = screen.getByRole("tab", { name: /진행 중/ });
    expect(activeTab.getAttribute("aria-selected")).toBe("true");
    expect(activeTab.textContent).toContain("1");

    fireEvent.click(screen.getByRole("tab", { name: /예정/ }));
    expect(screen.getByText("예정된 이벤트가 없어요.")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /종료/ }));
    expect(screen.getByText("종료된 이벤트가 아직 없어요.")).toBeTruthy();
  });
});
