import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/non-studio-test";

import type { MessagingThreadDetail } from "../apps/web/src/platform/messaging-client";
import type { Page } from "@playwright/test";



const USER = { id: "11111111-1111-4111-8111-111111111111", name: "메시지 검증 사용자", email: "messages-qa@example.invalid", image: null, role: "user" };
const THREAD_ID = "22222222-2222-4222-8222-222222222222";
const LONG_NAME = "함께 만드는 창작자".repeat(4);
const CONTEXT = "https://example.invalid/" + "collaboration-context-".repeat(5);
const DATE = "2026-11-07T00:00:00.000Z";

// 실제 계정·메시지에는 접근하지 않는 브라우저 HTTP 경계 fixture다.
async function mockMessages(page: Page, theme: string) {
  const detail: MessagingThreadDetail = {
    thread: {
      id: THREAD_ID, state: "active", category: "collaboration",
      context: { type: "work", id: "work-fixture", label: CONTEXT, href: "/works/work-fixture" },
      otherUser: { id: "creator-fixture", name: LONG_NAME, image: null, avatar: null },
      createdByMe: false, incomingRequest: false, canReply: true, blocked: false,
      archivedAt: null, mutedUntil: null, unreadCount: 0, lastMessage: null,
      createdAt: DATE, updatedAt: DATE, lastMessageAt: DATE,
    },
    messages: [], nextBefore: null,
  };
  const state = { muted: 0, archived: 0, blocked: 0, sent: [] as string[] };
  await page.addInitScript(({ user, theme }) => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    localStorage.setItem("toonstudio-auth-session", JSON.stringify({ user }));
    localStorage.setItem("toonstudio-theme", JSON.stringify({ state: { preference: theme, studioPreference: "inherit" }, version: 0 }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  }, { user: USER, theme });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const base = `/api/messages/threads/${THREAD_ID}`;
    if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: true, user: USER } });
    if (path === "/api/messages/threads") return route.fulfill({ json: { items: [detail.thread] } });
    if (path === base) return route.fulfill({ json: detail });
    if (path === "/api/messages/unread-count") return route.fulfill({ json: { messages: 0, requests: 0, total: 0 } });
    if (path === `${base}/read`) return route.fulfill({ json: { threadId: THREAD_ID, messageId: null, readAt: DATE } });
    if (path === `${base}/mute`) {
      state.muted += 1;
      detail.thread.mutedUntil = (request.postDataJSON() as { until: string | null }).until;
      return route.fulfill({ json: { threadId: THREAD_ID, mutedUntil: detail.thread.mutedUntil } });
    }
    if (path === `${base}/archive`) {
      state.archived += 1;
      detail.thread.archivedAt = (request.postDataJSON() as { archived: boolean }).archived ? DATE : null;
      return route.fulfill({ json: { threadId: THREAD_ID, archivedAt: detail.thread.archivedAt } });
    }
    if (path.startsWith("/api/messages/blocks/")) {
      state.blocked += 1;
      return route.fulfill({ json: { blocked: true, userId: detail.thread.otherUser.id } });
    }
    if (path === `${base}/messages`) {
      const { text } = request.postDataJSON() as { text: string };
      state.sent.push(text);
      const message = { id: `message-${state.sent.length}`, threadId: THREAD_ID, senderId: USER.id, type: "text" as const, body: text, metadata: {}, createdAt: DATE, deletedAt: null, mine: true, readByOther: false };
      detail.messages.push(message);
      return route.fulfill({ json: message });
    }
    return route.fulfill({ status: 503, json: { message: "로컬 메시지함 검증: 서버 미연결" } });
  });
  return state;
}

for (const width of [320, 390, 768, 1440]) {
  for (const theme of ["starlight", "light", "contrast"]) {
    test(`${width}px ${theme}: 메시지함 탐색·대화 메뉴·기존 동작`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const state = await mockMessages(page, theme);
      await page.goto("/messages?tab=requests", { waitUntil: "domcontentloaded" });
      const tabs = page.getByRole("tablist", { name: "메시지함" });
      const requests = tabs.getByRole("tab", { name: "메시지 요청", exact: true });
      await expect(requests).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("html")).toHaveAttribute("data-design-theme", theme);
      const panel = page.getByRole("tabpanel", { name: "메시지 요청" });
      const threadLink = panel.getByRole("link").first();
      await expect(threadLink).toBeVisible();
      for (const tab of await tabs.getByRole("tab").all()) {
        const bounds = await tab.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        expect(bounds?.x).toBeGreaterThanOrEqual(0);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
      }
      await requests.focus();
      await requests.press("ArrowRight");
      await expect(tabs.getByRole("tab", { name: "보관함", exact: true })).toBeFocused();
      await expect(requests).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Home");
      await expect(tabs.getByRole("tab", { name: "대화", exact: true })).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(requests).toHaveAttribute("aria-selected", "true");
      expect((await new AxeBuilder({ page }).include('[role="tablist"]').include("#messages-inbox-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await tabs.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("inbox-tabs.png") });
      await threadLink.click();
      const header = page.locator("[data-messages-conversation-header]");
      await expect(header.getByRole("link", { name: LONG_NAME, exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: CONTEXT, exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: CONTEXT, exact: true })).toHaveAttribute("href", "/works/work-fixture");
      expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      const back = header.getByRole("link", { name: "대화 목록으로" });
      if (width < 1024) {
        await expect(back).toBeVisible();
        await expect(back).toHaveAttribute("href", "/messages?tab=requests");
      } else await expect(back).toBeHidden();
      const quickMute = header.getByRole("button", { name: "8시간 알림 끄기" });
      if (width < 640) await expect(quickMute).toBeHidden();
      else await expect(quickMute).toBeVisible();
      const trigger = header.getByRole("button", { name: "대화 메뉴", exact: true });
      expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await header.scrollIntoViewIfNeeded();
      await trigger.focus();
      await trigger.press("ArrowDown");
      const menu = page.getByRole("menu", { name: "대화 메뉴", exact: true });
      await expect(menu.getByRole("menuitem", { name: "8시간 알림 끄기" })).toBeFocused();
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitem", { name: "회원 차단" })).toBeFocused();
      const bounds = await menu.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(1100);
      await page.screenshot({ path: testInfo.outputPath("conversation-menu.png") });
      expect((await new AxeBuilder({ page }).include("[data-messages-conversation-header]").include('[role="menu"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();

      await trigger.press("ArrowDown");
      await menu.getByRole("menuitem", { name: "8시간 알림 끄기" }).press("Enter");
      await expect.poll(() => state.muted).toBe(1);
      await expect(trigger).toBeFocused();
      await trigger.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "알림 켜기" })).toBeEnabled();
      page.once("dialog", (dialog) => void dialog.dismiss());
      await menu.getByRole("menuitem", { name: "회원 차단" }).click();
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(state.blocked).toBe(0);
      const composer = page.getByPlaceholder("메시지를 입력하세요.");
      await composer.fill("기존 메시지 보내기 동작 검증");
      await page.getByRole("button", { name: "메시지 보내기", exact: true }).click();
      await expect.poll(() => state.sent).toEqual(["기존 메시지 보내기 동작 검증"]);
      await expect(composer).toHaveValue("");
      await expect(page.getByText("기존 메시지 보내기 동작 검증", { exact: true })).toBeVisible();
      if (width < 1024) {
        await back.click();
        await expect(page).toHaveURL(/\/messages\?tab=requests$/);
        await expect(panel).toBeVisible();
        await threadLink.click();
      }
      await trigger.focus();
      await trigger.press("ArrowDown");
      await menu.getByRole("menuitem", { name: "대화 보관", exact: true }).click();
      await expect.poll(() => state.archived).toBe(1);
      await expect(page).toHaveURL(/\/messages$/);
      expect(errors).toEqual([]);
    });
  }
}
