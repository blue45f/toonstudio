// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MessagingThreadSummary } from "@/platform/messaging-client";
import { useI18n } from "@/shared/lib/i18n";

import { MessagesConversationHeader } from "./MessagesConversationHeader";
import { MessagesInboxTabs } from "./MessagesInboxTabs";
import { MESSAGES_INBOX_PANEL_ID } from "./messages-inbox-navigation";
import type { InboxTab } from "./MessagesThreadList";

const THREAD: MessagingThreadSummary = {
  id: "thread-1", state: "active", category: "collaboration",
  context: { type: "work", id: "work-1", label: "함께 만드는 긴 이야기의 작업 맥락", href: "/works/work-1" },
  otherUser: { id: "creator/id", name: "긴이름을사용하는창작자", image: null, avatar: null },
  createdByMe: false, incomingRequest: false, canReply: true, blocked: false,
  archivedAt: null, mutedUntil: null, unreadCount: 0, lastMessage: null,
  createdAt: "2026-11-07T00:00:00Z", updatedAt: "2026-11-07T00:00:00Z", lastMessageAt: "2026-11-07T00:00:00Z",
};

beforeEach(() => useI18n.setState({ lang: "ko" }));

function renderHeader(options: { tab?: InboxTab; busy?: boolean; thread?: MessagingThreadSummary } = {}) {
  const actions = { onToggleMute: vi.fn(), onToggleArchive: vi.fn(), onBlock: vi.fn() };
  render(<MemoryRouter><MessagesConversationHeader thread={options.thread ?? THREAD} tab={options.tab ?? "active"} busy={options.busy ?? false} {...actions} /></MemoryRouter>);
  return actions;
}

async function openMenu() {
  const trigger = screen.getByRole("button", { name: "대화 메뉴" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const menu = await screen.findByRole("menu", { name: "대화 메뉴" });
  return { trigger, menu };
}

describe("메시지함 탭", () => {
  it("선택한 탭만 Tab 순서에 두고 실제 목록 패널을 가리킨다", () => {
    render(<MessagesInboxTabs tab="requests" onChange={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    for (const tab of tabs) {
      expect(tab.getAttribute("aria-controls")).toBe(MESSAGES_INBOX_PANEL_ID);
      expect(tab.style.minBlockSize).toBe("var(--site-control-size, 2.75rem)");
    }
  });

  it("방향키·Home·End는 초점만 옮기고 목록 요청을 자동 실행하지 않는다", () => {
    const change = vi.fn();
    render(<MessagesInboxTabs tab="active" onChange={change} />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(tabs[1]);
    expect(change).toHaveBeenCalledWith("requests");
  });
});

describe("대화 머리글", () => {
  it.each(["requests", "archived"] as const)("%s 목록으로 돌아갈 때 선택한 메시지함을 보존한다", (tab) => {
    renderHeader({ tab });
    expect(screen.getByRole("link", { name: "대화 목록으로" }).getAttribute("href")).toBe(`/messages?tab=${tab}`);
  });

  it("이름과 작품 맥락을 생략하지 않고 기존 목적지로 연결한다", () => {
    renderHeader();
    const profile = screen.getByRole("link", { name: THREAD.otherUser.name });
    expect(profile.getAttribute("href")).toBe("/u/creator%2Fid");
    expect(profile.classList.contains("[overflow-wrap:anywhere]")).toBe(true);
    expect(screen.getByRole("link", { name: THREAD.context.label }).getAttribute("href")).toBe(THREAD.context.href);
    expect(screen.getByRole("button", { name: "대화 메뉴" }).classList.contains("size-11")).toBe(true);
  });

  it("키보드로 메뉴 항목을 탐색하고 Escape 후 머리글 버튼으로 돌아온다", async () => {
    renderHeader();
    const { trigger, menu } = await openMenu();
    const mute = within(menu).getByRole("menuitem", { name: "8시간 알림 끄기" });
    await waitFor(() => expect(document.activeElement).toBe(mute));
    fireEvent.keyDown(mute, { key: "End" });
    const block = within(menu).getByRole("menuitem", { name: "회원 차단" });
    await waitFor(() => expect(document.activeElement).toBe(block));
    fireEvent.keyDown(block, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("모바일 메뉴에서도 알림·보관·차단 동작을 그대로 호출한다", async () => {
    const actions = renderHeader();
    for (const [label, action] of [["8시간 알림 끄기", actions.onToggleMute], ["대화 보관", actions.onToggleArchive], ["회원 차단", actions.onBlock]] as const) {
      const { trigger, menu } = await openMenu();
      fireEvent.click(within(menu).getByRole("menuitem", { name: label }));
      expect(action).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    }
  });

  it("처리 중에는 중복 행동을 막고 이미 차단한 회원은 다시 차단하지 않는다", async () => {
    const actions = renderHeader({ busy: true, thread: { ...THREAD, blocked: true } });
    const { menu } = await openMenu();
    for (const item of within(menu).getAllByRole("menuitem")) {
      expect(item.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(item);
    }
    expect(within(menu).getByRole("menuitem", { name: "차단됨" })).toBeTruthy();
    expect(actions.onToggleMute).not.toHaveBeenCalled();
    expect(actions.onToggleArchive).not.toHaveBeenCalled();
    expect(actions.onBlock).not.toHaveBeenCalled();
  });

  it("보관·알림 상태에 따라 되돌리는 행동을 표시한다", async () => {
    renderHeader({ thread: { ...THREAD, archivedAt: "2026-11-07T00:00:00Z", mutedUntil: "2026-11-08T00:00:00Z" } });
    const { menu } = await openMenu();
    expect(within(menu).getByRole("menuitem", { name: "알림 켜기" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "보관 해제" })).toBeTruthy();
  });
});
