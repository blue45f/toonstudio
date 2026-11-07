// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { useEngagement } from "./engagement-store";
import { NotificationCenterPage } from "./NotificationCenterPage";

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
  useMetaRobots: () => undefined,
}));
vi.mock("./use-role-notification-settings", () => ({
  useRoleNotificationSettings: () => ({ settings: null }),
}));

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  useEngagement.getState().resetEngagementData();
  useEngagement.getState().upsertNotifications([{
    id: "interaction-notice", category: "system", title: "작업 알림", body: "알림 본문",
    href: "/", createdAt: "2026-09-29T12:00:00.000Z", readAt: null,
    archivedAt: null, snoozedUntil: null, sourceKey: "test:interaction",
  }]);
});

function renderPage() {
  return render(<MemoryRouter><NotificationCenterPage /></MemoryRouter>);
}

async function openMenu() {
  const trigger = screen.getByRole("button", { name: "알림 옵션" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const menu = await screen.findByRole("menu", { name: "알림 옵션" });
  await waitFor(() => expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[0]));
  return { trigger, menu };
}

describe("알림 센터 조작과 모바일 레이아웃", () => {
  it("모든 필터를 줄바꿈하고 입력 장치와 무관하게 44px 조작 영역을 확보한다", () => {
    renderPage();
    const filters = screen.getByRole("group", { name: "알림 필터" });
    expect(filters.classList.contains("flex-wrap")).toBe(true);
    expect(filters.classList.contains("overflow-x-auto")).toBe(false);
    expect(within(filters).getAllByRole("button")).toHaveLength(8);
    for (const button of within(filters).getAllByRole("button")) {
      expect(button.classList.contains("min-h-11")).toBe(true);
      expect(button.style.minBlockSize).toBe("var(--site-control-size, 2.75rem)");
    }
    expect(screen.getByRole("button", { name: "알림 옵션" }).classList.contains("size-11")).toBe(true);
  });

  it("긴 제목과 본문을 생략하지 않고 카드 폭 안에서 줄바꿈한다", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "작업 알림" }).classList.contains("[overflow-wrap:anywhere]")).toBe(true);
    expect(screen.getByText("알림 본문").classList.contains("[overflow-wrap:anywhere]")).toBe(true);
    expect(screen.getByRole("img", { name: "읽지 않음" })).toBeTruthy();
  });

  it("키보드로 열고 화살표·Home·End로 이동한 뒤 Escape로 초점을 돌린다", async () => {
    renderPage();
    const { trigger, menu } = await openMenu();
    const items = within(menu).getAllByRole("menuitem");
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(items[1]));
    fireEvent.keyDown(items[1], { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(items[2]));
    fireEvent.keyDown(items[2], { key: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    fireEvent.keyDown(items[0], { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("읽음 변경 후 메뉴를 닫고 다시 열어 안 읽음으로 되돌린다", async () => {
    renderPage();
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "읽음으로" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(useEngagement.getState().notifications[0]?.readAt).toBeTruthy();
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "안 읽음으로" }));
    expect(useEngagement.getState().notifications[0]?.readAt).toBeNull();
  });

  it("보관 동작과 보관함의 읽음 동작을 유지한다", async () => {
    renderPage();
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "보관" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "작업 알림" })).toBeNull());
    expect(useEngagement.getState().notifications[0]?.archivedAt).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "보관 1" }));
    expect(screen.getByRole("article", { name: "작업 알림" })).toBeTruthy();
    const { menu } = await openMenu();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.queryByRole("menuitem", { name: "보관" })).toBeNull();
  });

  it("하루 뒤 알림은 목록에서 숨기되 저장된 알림을 지우지 않는다", async () => {
    renderPage();
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "하루 뒤" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "작업 알림" })).toBeNull());
    const notification = useEngagement.getState().notifications[0];
    expect(notification?.snoozedUntil).toBeTruthy();
    expect(notification?.archivedAt).toBeNull();
    expect(useEngagement.getState().notifications).toHaveLength(1);
  });
});
