// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { CommunityEventsPage } from "./CommunityEventsPage";

// 레이아웃 검증은 게시물의 서버 권한이나 실제 작성 성공을 대신하지 않는다.
vi.mock("./components/community-events-board", () => ({ CommunityEventsBoard: () => <div data-testid="event-board">행사 일정</div> }));
vi.mock("./components/fan-cafe-panel", () => ({ FanCafePanel: ({ scope, targetId, initialKind }: { scope: string; targetId: string; initialKind: string }) => <div data-testid="event-feed" data-scope={scope} data-target={targetId} data-kind={initialKind}>행사 게시물</div> }));

afterEach(cleanup);

it("일정과 게시물을 긴 채널 비교·이용 안내보다 먼저 보여 준다", () => {
  render(<MemoryRouter initialEntries={["/community/events"]}><CommunityEventsPage /></MemoryRouter>);
  const feed = screen.getByTestId("event-feed");
  expect(feed.dataset).toMatchObject({ scope: "pencafe", target: "community-events", kind: "event" });
  expect(feed.closest("details")).toBeNull();
  const summary = screen.getByText("게시판 이용 안내 · 다른 행사 찾기", { selector: "summary strong" }).closest("summary");
  if (!summary) throw new Error("게시판 이용 안내 누락");
  const details = summary.closest("details");
  expect(details?.open).toBe(false);
  expect(screen.getByTestId("event-board").compareDocumentPosition(feed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(feed.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(summary);
  expect(details?.open).toBe(true);
  if (!details) throw new Error("게시판 보조 영역 누락");
  expect(within(details).getByRole("link", { name: "공식 이벤트 보기" }).getAttribute("href")).toBe("/events");
  expect(within(details).getByRole("link", { name: "첫 이벤트 글 쓰기" }).getAttribute("href")).toBe("/community/events#fan-cafe-composer");
  expect(within(details).getByRole("link", { name: "팬덤 · 코스프레 허브" }).getAttribute("href")).toBe("/ecosystem/fandom");
});
