import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import type {
  SupportConversationDetail,
  SupportMessageRole,
} from "@toonstudio/contracts/customer-support";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "상담 검증 사용자",
  email: "support-qa@example.invalid",
  image: null,
  role: "admin",
};
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";
const SUBJECT = "브러시 저장 문의";
const DATE = "2026-10-30T00:00:00.000Z";

// 실제 로그인·Claude 호출을 대신하는 HTTP 경계 fixture다.
async function mockSupport(page: Page, existing = false) {
  const detail: SupportConversationDetail = {
    conversation: { id: CONVERSATION_ID, subject: SUBJECT, status: existing ? "waiting" : "ai", createdAt: DATE, updatedAt: DATE },
    messages: [],
  };
  const state = { created: existing, failSend: false, denyAdmin: false, sentIds: [] as string[] };
  const append = (role: SupportMessageRole, content: string) => {
    detail.messages.push({ id: randomUUID(), conversationId: CONVERSATION_ID, role, content, createdAt: DATE });
  };
  if (existing) append("user", "저장 문제를 확인해 주세요.");
  await page.addInitScript((user) => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    localStorage.setItem("toonstudio-auth-session", JSON.stringify({ user }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  }, USER);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: true, user: USER } });
    if (path === "/api/support/status") return route.fulfill({ json: { ai: { available: true, reason: "configured" } } });
    if (path === "/api/support/conversations" && method === "POST") {
      state.created = true;
      return route.fulfill({ json: detail });
    }
    if (path === "/api/support/conversations") return route.fulfill({ json: { items: state.created ? [detail.conversation] : [], total: Number(state.created) } });
    if (path === `/api/support/conversations/${CONVERSATION_ID}`) return route.fulfill({ json: detail });
    if (path === `/api/support/conversations/${CONVERSATION_ID}/messages`) {
      const body = request.postDataJSON() as { content: string; clientMessageId: string };
      state.sentIds.push(body.clientMessageId);
      if (state.failSend) {
        state.failSend = false;
        return route.fulfill({ status: 503, json: { message: "검증용 전송 장애" } });
      }
      append("user", body.content);
      if (detail.conversation.status === "ai") append("assistant", "저장 메뉴에서 버전을 확인해 주세요.");
      return route.fulfill({ json: detail });
    }
    if (path === `/api/support/conversations/${CONVERSATION_ID}/escalate`) {
      detail.conversation.status = "waiting";
      return route.fulfill({ json: detail });
    }
    if (path === `/api/support/conversations/${CONVERSATION_ID}/close`) {
      detail.conversation.status = "closed";
      return route.fulfill({ json: detail });
    }
    if (path === "/api/admin/me") return route.fulfill({ json: USER });
    if (path === "/api/admin/support/conversations") {
      return state.denyAdmin
        ? route.fulfill({ status: 403, json: { message: "검증용 권한 해제" } })
        : route.fulfill({ json: { items: [detail.conversation], total: 1 } });
    }
    if (path === `/api/admin/support/conversations/${CONVERSATION_ID}`) return route.fulfill({ json: detail });
    if (path === `/api/admin/support/conversations/${CONVERSATION_ID}/messages`) {
      const body = request.postDataJSON() as { content: string };
      append("admin", body.content);
      detail.conversation.status = "open";
      return route.fulfill({ json: detail });
    }
    if (path === "/api/admin/business-inquiries" || path.includes("business-verifications")) return route.fulfill({ json: { items: [], total: 0 } });
    return route.fulfill({ status: 503, json: { message: "로컬 고객상담 브라우저 검증" } });
  });
  return { state, append };
}

async function expectAccessibleChat(page: Page, selector: string) {
  const viewport = page.viewportSize();
  if (viewport) await page.setViewportSize({ width: viewport.width, height: Math.max(1600, viewport.height) });
  // 긴 대화 전체를 보여 고정 헤더와 화면 경계에 잘린 버튼을 크기 오류로 세지 않는다.
  await page.locator(selector).evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  // 화면 밖 reduced-motion 전환이 대기 중이어도 각 테마의 최종 색을 검사한다.
  const staticPalette = await page.addStyleTag({ content: `${selector}, ${selector} * { animation: none !important; transition: none !important; }` });
  for (const theme of ["light", "contrast", "dark", "starlight"]) {
    // 테마 저장소가 적용하는 HTML 속성과 동일한 CSS 계약으로 각 팔레트를 검사한다.
    await page.evaluate((value) => {
      const root = document.documentElement;
      root.dataset.theme = value === "light" ? "light" : "dark";
      root.dataset.designTheme = value;
      root.dataset.contrast = value === "contrast" ? "more" : "standard";
      root.style.colorScheme = value === "light" ? "light" : "dark";
    }, theme);
    // 기존 접근성 스모크처럼 테마 전환의 중간 색을 평가하지 않는다.
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const finite = document.getAnimations().filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? 1));
      await Promise.race([
        Promise.allSettled(finite.map((animation) => animation.finished)),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
    });
    const result = await new AxeBuilder({ page }).include(selector)
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({ theme, id: violation.id, nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
  }
  await staticPalette.evaluate((element) => element.remove());
  if (viewport) await page.setViewportSize(viewport);
}

test.use({ reducedMotion: "reduce" });

test("AI 상담을 재전송하고 같은 대화로 상담원 답변을 받는다", async ({ page }) => {
  const { state, append } = await mockSupport(page);
  await page.goto("/support", { waitUntil: "domcontentloaded" });
  const chat = page.locator("#support-chat");
  await chat.getByLabel("문의 제목", { exact: true }).fill(SUBJECT);
  await chat.getByRole("button", { name: "상담 시작", exact: true }).click();
  await expect(chat.getByRole("heading", { name: SUBJECT, exact: true })).toBeVisible();
  await chat.getByLabel("문의 내용", { exact: true }).fill("브러시 설정을 저장하려면 어떻게 하나요?");
  await chat.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await expect(chat.getByRole("log")).toContainText("저장 메뉴에서 버전을 확인해 주세요.");

  state.failSend = true;
  await chat.getByLabel("문의 내용", { exact: true }).fill("추가 질문입니다.");
  await chat.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await expect(chat.getByRole("alert")).toContainText("전송 결과를 확인하지 못했어요");
  await expect(chat.getByLabel("문의 내용", { exact: true })).toHaveValue("추가 질문입니다.");
  await chat.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  await expect(chat.getByLabel("문의 내용", { exact: true })).toHaveValue("");
  expect(state.sentIds.at(-1)).toBe(state.sentIds.at(-2));

  await chat.getByRole("button", { name: "이 대화로 운영자 연결", exact: true }).click();
  await expect(chat.locator(".customer-support__badge")).toHaveText("운영자 답변 대기");
  // 긴 대화로 실제 스크롤 영역과 키보드 접근성을 확인한다.
  for (let index = 0; index < 8; index += 1) append("admin", `이전 상담원 안내 ${index + 1}`);
  append("admin", "상담원이 저장 내역을 확인했습니다.");
  await expect(chat.getByRole("log")).toContainText("상담원이 저장 내역을 확인했습니다.", { timeout: 16_000 });
  await chat.getByLabel("문의 내용", { exact: true }).fill("접근성 확인을 위한 작성 중 초안");
  await expectAccessibleChat(page, "#support-chat");
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await chat.evaluate((element) => ({ right: element.getBoundingClientRect().right, width: window.innerWidth, scroll: element.scrollWidth, client: element.clientWidth }));
  expect(overflow.right).toBeLessThanOrEqual(overflow.width);
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
  await chat.getByRole("button", { name: "문의 종료", exact: true }).click();
  await expect(chat.locator(".customer-support__badge")).toHaveText("종료");
  await expect(chat.getByLabel("문의 내용", { exact: true })).toHaveCount(0);
});

test("관리자가 답변하고 권한이 해제되면 비공개 대화를 지운다", async ({ page }) => {
  const { state, append } = await mockSupport(page, true);
  for (let index = 0; index < 8; index += 1) append("user", `추가 확인 요청 ${index + 1}`);
  await page.goto("/admin/growth/inquiries", { waitUntil: "domcontentloaded" });
  const chat = page.locator("section[aria-labelledby='customer-support-title']");
  await chat.getByRole("button", { name: new RegExp(SUBJECT, "u") }).click();
  await expect(chat.getByRole("log")).toContainText("저장 문제를 확인해 주세요.");
  await chat.getByLabel("상담원 답변", { exact: true }).fill("문의하신 저장 문제를 확인했습니다.");
  await chat.getByRole("button", { name: "답변 보내기", exact: true }).click();
  await expect(chat.getByRole("log")).toContainText("문의하신 저장 문제를 확인했습니다.");
  await chat.getByLabel("상담원 답변", { exact: true }).fill("접근성 확인을 위한 작성 중 초안");
  await expectAccessibleChat(page, "section[aria-labelledby='customer-support-title']");
  state.denyAdmin = true;
  await chat.getByRole("button", { name: "고객 상담 새로고침", exact: true }).click();
  await expect(chat.getByRole("alert")).toContainText("관리자 권한을 확인할 수 없습니다");
  await expect(chat.getByRole("log")).toHaveCount(0);
  await expect(chat.getByLabel("상담원 답변", { exact: true })).toHaveCount(0);
});

test("모바일에서 과거 문의 페이지를 바꿔도 작성 중인 답변을 유지한다", async ({ page }) => {
  await mockSupport(page, true);
  const items = Array.from({ length: 51 }, (_, index) => ({
    id: index === 0 ? CONVERSATION_ID : randomUUID(),
    subject: index === 0 ? SUBJECT : `과거 문의 ${index + 1}`,
    status: "waiting",
    createdAt: DATE,
    updatedAt: DATE,
  }));
  await page.route("**/api/support/conversations?*", async (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? 0);
    return route.fulfill({ json: { items: items.slice(offset, offset + 50), total: items.length } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support", { waitUntil: "domcontentloaded" });
  const chat = page.locator("#support-chat");
  await chat.getByRole("button", { name: new RegExp(SUBJECT, "u") }).click();
  await chat.getByLabel("문의 내용", { exact: true }).fill("작성 중인 추가 질문");
  await chat.getByRole("button", { name: "다음 문의", exact: true }).click();
  await expect(chat.getByRole("button", { name: /과거 문의 51/u })).toBeVisible();
  await expect(chat.getByRole("button", { name: "다음 문의", exact: true })).toBeDisabled();
  await expect(chat.getByLabel("문의 내용", { exact: true })).toHaveValue("작성 중인 추가 질문");
  const nav = chat.getByRole("navigation", { name: "문의 내역 페이지", exact: true });
  const bounds = await nav.evaluate((element) => ({ right: element.getBoundingClientRect().right, width: innerWidth }));
  expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  await chat.getByRole("button", { name: "이전 문의", exact: true }).click();
  await expect(chat.getByRole("button", { name: new RegExp(SUBJECT, "u") })).toBeVisible();
  await expect(chat.getByLabel("문의 내용", { exact: true })).toHaveValue("작성 중인 추가 질문");
});
