// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageBubble, MessageDayDivider } from "./MessageBubble";

import type { MessagingMessage, MessagingThreadSummary } from "@/platform/messaging-client";

const OTHER: MessagingThreadSummary["otherUser"] = {
  id: "u2",
  name: "김작가",
  image: "https://example.com/avatar.png",
  avatar: null,
};

const BASE: MessagingMessage = {
  id: "m1",
  threadId: "t1",
  senderId: "u2",
  type: "text",
  body: "안녕하세요!",
  metadata: {},
  createdAt: "2026-10-02T00:00:00.000Z",
  deletedAt: null,
  mine: false,
  readByOther: false,
};

function renderBubble(message: MessagingMessage) {
  return render(
    <MemoryRouter>
      <MessageBubble message={message} otherUser={OTHER} onReport={vi.fn()} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("메시지 말풍선", () => {
  it("상대 메시지 옆에 상대의 실물 아바타를 보여준다", () => {
    const { container } = renderBubble(BASE);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/avatar.png");
    expect(screen.getByText("안녕하세요!")).toBeTruthy();
  });

  it("내 메시지는 아바타 없이 렌더링한다", () => {
    const { container } = renderBubble({ ...BASE, mine: true, senderId: "me" });
    expect(container.querySelector("img")).toBeNull();
  });

  it("삭제된 메시지는 원문 대신 삭제 안내로 가린다", () => {
    renderBubble({ ...BASE, body: "지워진 원문", deletedAt: "2026-10-02T01:00:00.000Z" });
    expect(screen.getByText("삭제된 메시지입니다.")).toBeTruthy();
    expect(screen.queryByText("지워진 원문")).toBeNull();
    // 삭제된 메시지에는 신고 행동을 붙이지 않는다
    expect(screen.queryByRole("button", { name: "메시지 신고" })).toBeNull();
  });

  it("시스템 메시지는 말풍선이 아닌 안내로 렌더링한다", () => {
    renderBubble({ ...BASE, type: "system", body: "김작가 님이 요청을 수락했습니다." });
    expect(screen.getByText("김작가 님이 요청을 수락했습니다.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "메시지 신고" })).toBeNull();
  });

  it("작품 카드 메시지는 연결된 작품 라벨을 링크로 보여준다", () => {
    renderBubble({
      ...BASE,
      type: "work_card",
      body: "이 작품 어때요?",
      metadata: { context: { label: "달빛 소녀", href: "/works/w1" } },
    });
    const link = screen.getByRole("link", { name: "달빛 소녀" });
    expect(link.getAttribute("href")).toBe("/works/w1");
  });
});

describe("날짜 구분선", () => {
  it("라벨을 separator 역할로 제공한다", () => {
    render(<MessageDayDivider label="오늘" />);
    expect(screen.getByRole("separator", { name: "오늘" })).toBeTruthy();
  });
});
